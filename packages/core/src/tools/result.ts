import type { RunStep } from '@mas/shared';

/**
 * A tool result is data, never an exception.
 *
 * The Agent SDK keeps the loop alive when a tool returns `isError: true`, and
 * kills the whole run when a handler throws. Since almost every failure here is
 * *expected* (a TikTok URL that 404s, a brand with no guardrails configured),
 * the tool layer treats throwing as a bug. This module gives that policy one
 * shape so every tool agrees.
 */
export type ToolOk = {
  ok: true;
  /** Human/agent-readable summary. This string goes back into the model's context. */
  text: string;
  /** Machine-readable payload for the workbench and for eval assertions. */
  data?: Record<string, unknown>;
};

export type ToolErr = {
  ok: false;
  text: string;
  /**
   * Whether the agent should try a different approach. `false` means the input
   * itself was wrong and retrying verbatim will fail the same way.
   */
  retryable: boolean;
};

export type ToolOutcome = ToolOk | ToolErr;

/** Convenience constructor so tool bodies read as a value, not as control flow. */
export function ok(text: string, data?: Record<string, unknown>): ToolOk {
  return data === undefined ? { ok: true, text } : { ok: true, text, data };
}

export function err(text: string, retryable = true): ToolErr {
  return { ok: false, text, retryable };
}

/**
 * Adapter to the MCP result shape the SDK expects. Deliberately does not throw:
 * an unexpected exception inside a tool becomes a non-retryable error the agent
 * can see, which is strictly more useful than a dead run.
 */
export function toCallToolResult(outcome: ToolOutcome): {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError: boolean;
} {
  if (outcome.ok) {
    return outcome.data === undefined
      ? { content: [{ type: 'text', text: outcome.text }], isError: false }
      : {
          content: [{ type: 'text', text: outcome.text }],
          structuredContent: outcome.data,
          isError: false,
        };
  }
  return { content: [{ type: 'text', text: outcome.text }], isError: true };
}

/** Wrap a tool body so a thrown Error becomes a visible, non-fatal tool error. */
export async function guard(fn: () => Promise<ToolOutcome>): Promise<ToolOutcome> {
  try {
    return await fn();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(`Tool crashed: ${message}`, false);
  }
}

/**
 * Steps are what the workbench renders and what cost accounting walks over, so
 * their construction is centralised: a step missing a timestamp or a token
 * count is an observability hole, not a cosmetic issue.
 */
export interface StepRecorder {
  record(step: Omit<RunStep, 'index' | 'at'>): RunStep;
  all(): RunStep[];
}

export function createStepRecorder(now: () => Date = () => new Date()): StepRecorder {
  const steps: RunStep[] = [];
  return {
    record(step) {
      const full: RunStep = { ...step, index: steps.length, at: now().toISOString() };
      steps.push(full);
      return full;
    },
    all: () => [...steps],
  };
}
