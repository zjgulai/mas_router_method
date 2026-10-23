import { z } from 'zod';

/**
 * The runtime reads its configuration once, at process start, and fails loudly
 * if anything is missing. Agent products fail in confusing ways when config is
 * half-present (a missing budget cap looks like "the agent is just expensive
 * today"), so we refuse to boot rather than degrade silently.
 */
const Config = z.object({
  anthropicApiKey: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  model: z.string().min(1),
  /**
   * Hard ceiling per run. This is enforced twice: proactively via the SDK's
   * `maxBudgetUsd`, and defensively in the event loop, because a cost estimate
   * that lands between two turns must still stop the run.
   */
  maxCostUsd: z.number().positive(),
  maxTurns: z.number().int().positive(),
  /** Where the SDK persists session transcripts. Must be inside the gitignored area. */
  sessionDir: z.string().min(1),
});

export type RuntimeConfig = z.infer<typeof Config>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return Config.parse({
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    model: env.AGENT_MODEL ?? 'claude-sonnet-4-6',
    maxCostUsd: Number(env.AGENT_MAX_COST_USD ?? 0.5),
    maxTurns: Number(env.AGENT_MAX_TURNS ?? 40),
    sessionDir: env.AGENT_SESSION_DIR ?? '.agent-runs',
  });
}
