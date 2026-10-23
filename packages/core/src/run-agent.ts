import {
  query,
  type Options,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type { RunStatus, RunStep, RunTrigger } from '@mas/shared';
import { createStepRecorder, type StepRecorder } from './tools/result.js';

/**
 * The agent runtime is one file on purpose. Everything an agent product needs to
 * get right - budget, cancellation, attribution, structured output - happens in
 * *one* loop, and splitting that loop across modules is how the budget check ends
 * up not running on the path that matters.
 */

export interface AgentRunRequest {
  /** The user's actual ask. For a Feishu message this is the message text. */
  prompt: string;
  /** Which workflow this run executes. Versioned so old runs stay interpretable. */
  workflow: { name: string; version: string };
  trigger: RunTrigger;
  /** Brand scope. Every tool call inherits it. */
  brandId: string;
  actor?: { kind: 'user' | 'feishu-user' | 'system'; id: string; displayName?: string };
}

export interface AgentRunResult {
  status: RunStatus;
  /** Present only on success. */
  output?: string;
  steps: RunStep[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
  /** Why the run stopped. Always populated on a terminal status. */
  outcome: { reason: string; retryable: boolean };
  /** SDK session id, so a human can resume the conversation later. */
  sessionId?: string;
}

export interface RunAgentOptions {
  model: string;
  maxCostUsd: number;
  maxTurns: number;
  systemPrompt: string;
  /** MCP servers to expose, keyed by the name their tool prefixes use. */
  mcpServers: NonNullable<Options['mcpServers']>;
  /** Fully-qualified tool names the run may call without a permission prompt. */
  allowedTools: string[];
  cwd: string;
}

/**
 * One turn of input, as an async iterable so the run can later be upgraded to
 * multi-turn without changing the call site.
 */
async function* singleTurn(prompt: string): AsyncGenerator<SDKUserMessage> {
  yield {
    type: 'user',
    message: { role: 'user', content: prompt },
    parent_tool_use_id: null,
  };
}

function truncate(text: string, max = 2000): string {
  return text.length <= max ? text : `${text.slice(0, max)}... [${text.length - max} chars truncated]`;
}

/**
 * Maps one SDK message to zero or more displayable steps.
 *
 * Kept pure and exported so it can be unit-tested against captured transcripts:
 * this mapping is where observability bugs hide, and they stay invisible in
 * production until someone cannot explain a failed run.
 */
export function messageToSteps(msg: SDKMessage, recorder: StepRecorder): void {
  switch (msg.type) {
    case 'assistant': {
      const content = msg.message.content;
      if (!Array.isArray(content)) break;
      for (const block of content) {
        if (block.type === 'text' && block.text.trim().length > 0) {
          recorder.record({ kind: 'assistant-text', summary: truncate(block.text) });
        } else if (block.type === 'tool_use') {
          recorder.record({
            kind: 'tool-call',
            tool: block.name,
            summary: truncate(JSON.stringify(block.input)),
          });
        }
      }
      break;
    }
    case 'user': {
      // Tool results come back as user messages. Render them so the timeline reads
      // as a conversation rather than a list of mysterious tool names.
      const content = msg.message.content;
      if (!Array.isArray(content)) break;
      for (const block of content) {
        if (typeof block !== 'object' || block === null || !('type' in block)) continue;
        if (block.type !== 'tool_result') continue;
        const raw = block.content;
        const text =
          typeof raw === 'string'
            ? raw
            : Array.isArray(raw)
              ? raw
                  .map((c) => ('text' in c && typeof c.text === 'string' ? c.text : ''))
                  .join('\n')
              : '';
        recorder.record({ kind: 'tool-result', summary: truncate(text) });
      }
      break;
    }
    default:
      break;
  }
}

export async function runAgent(
  req: AgentRunRequest,
  opts: RunAgentOptions,
  deps: { signal?: AbortSignal } = {},
): Promise<AgentRunResult> {
  const recorder = createStepRecorder();
  const abort = new AbortController();
  const onOuterAbort = () => abort.abort();
  deps.signal?.addEventListener('abort', onOuterAbort, { once: true });

  const q = query({
    prompt: singleTurn(req.prompt),
    options: {
      model: opts.model,
      maxTurns: opts.maxTurns,
      // Defence in depth: the SDK enforces this too, but a run that trips the SDK
      // limit still pays for the turn that crossed it. Our own check below stops earlier.
      maxBudgetUsd: opts.maxCostUsd,
      systemPrompt: { type: 'custom', prompt: opts.systemPrompt },
      mcpServers: opts.mcpServers,
      allowedTools: opts.allowedTools,
      /**
       * `dontAsk` rather than `bypassPermissions`: tools that are not on the
       * allow-list are denied outright instead of prompting. A headless bot has
       * nobody to prompt, and a silent hang is worse than a clean denial.
       */
      permissionMode: 'dontAsk',
      // The SDK default is `[]`, meaning no CLAUDE.md and no project settings are
      // loaded. That is what we want here: the workflow prompt is the whole brief,
      // and ambient repo config leaking into a customer-facing bot is a hazard.
      settingSources: [],
      cwd: opts.cwd,
      abortController: abort,
    },
  });

  let output = '';
  let sessionId: string | undefined;
  let costUsd = 0;
  let status: RunStatus = 'running';
  let outcome: { reason: string; retryable: boolean } | undefined;
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  try {
    for await (const msg of q) {
      messageToSteps(msg, recorder);

      if (msg.type === 'system' && msg.subtype === 'init') {
        sessionId = msg.session_id;
      }

      if (msg.type === 'result') {
        sessionId ??= msg.session_id;
        costUsd = msg.total_cost_usd;
        // `usage` on the result is main-loop-only; `modelUsage` is the cumulative,
        // per-model truth (it includes subagents and compaction). Accounting reads
        // modelUsage, exactly as the SDK docs instruct.
        for (const m of Object.values(msg.modelUsage)) {
          usage.inputTokens += m.inputTokens + m.cacheReadInputTokens + m.cacheCreationInputTokens;
          usage.outputTokens += m.outputTokens;
        }
        usage.costUsd = costUsd;

        if (msg.subtype === 'success') {
          status = 'succeeded';
          output = msg.result;
          outcome = { reason: 'Workflow completed.', retryable: false };
        } else {
          status = msg.subtype === 'error_max_budget_usd' ? 'budget-exceeded' : 'failed';
          outcome = {
            reason: `${msg.subtype}: ${msg.errors.join('; ') || 'no detail returned'}`,
            retryable:
              msg.subtype === 'error_max_turns' || msg.subtype === 'error_during_execution',
          };
          recorder.record({ kind: 'error', summary: outcome.reason });
        }
      }

      // Stop as soon as spend crosses the ceiling, even if the SDK has not yet
      // emitted its own budget result. Without this, a run that is one expensive
      // turn away from the limit still pays for that turn.
      if (costUsd > opts.maxCostUsd && status === 'running') {
        await q.interrupt();
        status = 'budget-exceeded';
        outcome = {
          reason: `Cost ceiling reached: $${costUsd.toFixed(4)} > $${opts.maxCostUsd.toFixed(4)}.`,
          retryable: true,
        };
      }
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    status = abort.signal.aborted ? 'cancelled' : 'failed';
    outcome = {
      reason: abort.signal.aborted ? 'Run cancelled by caller.' : `Runtime threw: ${message}`,
      retryable: !abort.signal.aborted,
    };
    recorder.record({ kind: 'error', summary: outcome.reason });
  } finally {
    deps.signal?.removeEventListener('abort', onOuterAbort);
  }

  return {
    status,
    ...(status === 'succeeded' ? { output } : {}),
    steps: recorder.all(),
    usage,
    outcome: outcome ?? { reason: 'Run ended without a result message.', retryable: true },
    ...(sessionId !== undefined ? { sessionId } : {}),
  };
}
