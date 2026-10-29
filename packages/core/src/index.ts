import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type {
  BrandStore,
  RecipeStore,
  ReferenceStore,
  ToolDeps,
  VisionAnalyzer,
} from './tools/brand.js';
import { brandToolNames, createBrandTools } from './tools/brand.js';
import { runAgent, type AgentRunRequest, type AgentRunResult } from './run-agent.js';
import { loadConfig, type RuntimeConfig } from './config.js';
import { randomBytes } from 'node:crypto';
import type { RunStore } from './run-store.js';
import { buildRunRecord } from './run-record.js';

export * from './config.js';
export * from './run-agent.js';
export * from './tools/result.js';
export * from './tools/brand.js';
export * from './run-store.js';
export * from './recipe-draft.js';
export * from './seed/brands.js';
export * from './contracts/index.js';

/**
 * Composes the pieces into the one thing the apps actually call.
 *
 * The workbench and the Feishu gateway both need "given a brand and a request,
 * run the agent and give me the result" - so that lives here once, and each
 * surface only decides *how* the request arrives and *where* the result goes.
 */
export interface RuntimeDeps {
  brands: BrandStore;
  references: ReferenceStore;
  recipes: RecipeStore;
  vision: VisionAnalyzer;
  /** Every run is recorded here; the workbench, evals, and reports read it. */
  runs: RunStore;
  /** Injected so tests can pin a clock or fake a model. */
  config?: RuntimeConfig;
  /** Absolute path the SDK runs in. Should be the repo root in dev. */
  cwd: string;
}

const SYSTEM_PROMPT = `You are a TikTok brand-content strategist working inside a native-agent product.

Your job: turn a viral reference video into a production-ready recipe that a brand's own team can shoot.

How you work:
- Call get_brand_profile before anything else. Its guardrails bind you; do not restate them in output, just obey them.
- Analyse the reference before writing. A recipe without an analysis behind it is a guess, and guesses are what this product exists to replace.
- Reuse the *pattern*, never the words or the footage. If the reference's content belongs to someone else, say so in exclusions rather than copying it.
- Claims: if a line in the script makes a factual claim, either it traces to something the brand can prove, or it must be softened. Set claimsSubstantiated honestly - a reviewer checks it.
- Write for the ear. The script is read aloud over music; sentences that read well and speak badly are wrong here.
- Match the reference's actual sound. When the analysis shows no voiceover, write on-screen text (set every beat's onScreenText) and put that same text in script — never invent spoken lines for a silent video. When the reference or the request crosses languages (e.g. a zh reference for a US launch), fill translation on every spoken beat.
- Answer terse or comparative briefs with the recipe, not with questions or prose. "Same as last time but for X" means: reuse the most recent reference in context, apply the stated change, state your assumption in the title or exclusions — one clarification round is a lost user. "Which of these two is stronger?" means: pick one, say why in the output, and save the winning recipe.
You are not a general assistant. If the user asks for something outside this workflow, say what you can do instead of improvising.`;

export function createRuntime(deps: RuntimeDeps) {
  const config = deps.config ?? loadConfig();

  function toolsFor(scope: ToolDeps['scope']) {
    return createBrandTools({
      brands: deps.brands,
      references: deps.references,
      recipes: deps.recipes,
      vision: deps.vision,
      scope,
    });
  }

  return {
    config,

    /** Run one request end to end, with tools wired and budget enforced. */
    async run(
      req: AgentRunRequest,
      opts: { signal?: AbortSignal; appendSystemPrompt?: string } = {},
    ): Promise<AgentRunResult> {
      const server = createSdkMcpServer({
        name: 'brand',
        version: '0.1.0',
        tools: toolsFor({ brandId: req.brandId, actorId: req.actor?.id ?? 'system' }),
      });

      const systemPrompt =
        opts.appendSystemPrompt === undefined
          ? SYSTEM_PROMPT
          : `${SYSTEM_PROMPT}\n\n${opts.appendSystemPrompt}`;

      const runId = `run_${randomBytes(9).toString('hex')}`;
      const startedAt = new Date().toISOString();
      const result = await runAgent(
        req,
        {
          model: config.model,
          maxCostUsd: config.maxCostUsd,
          maxTurns: config.maxTurns,
          systemPrompt,
          mcpServers: { brand: server },
          allowedTools: brandToolNames('brand'),
          cwd: deps.cwd,
        },
        opts.signal === undefined ? {} : { signal: opts.signal },
      );
      const endedAt = new Date().toISOString();

      try {
        await deps.runs.saveRun(
          buildRunRecord({ id: runId, startedAt, endedAt, request: req, result }),
        );
      } catch (cause) {
        // A lost run record must not turn a completed run into a failed one for the
        // user, but it must be loud: without the record there is no timeline, no
        // eval history, and no cost trail.
        console.error(
          `[run ${runId}] failed to persist run: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }

      return { ...result, runId };
    },
  };
}

export type Runtime = ReturnType<typeof createRuntime>;
