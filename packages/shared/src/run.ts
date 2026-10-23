import { z } from 'zod';

/**
 * Runs are the unit of observability. Everything the workbench shows, every eval
 * assertion, and every cost ceiling hangs off this shape - so it is defined once,
 * shared by the runtime, the gateway, and the UI.
 */
export const RunStatus = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'budget-exceeded',
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const RunTrigger = z.enum([
  'workbench', // a human clicked something in the UI
  'feishu-dm', // a Feishu direct message
  'feishu-group', // an @-mention in a Feishu group
  'schedule', // a cron-style recurring job
  'eval', // part of an eval suite run
]);
export type RunTrigger = z.infer<typeof RunTrigger>;

/**
 * One step of an agent run. The runtime emits these; the workbench renders them
 * as a timeline. Kept flat and append-only so it can be streamed and tailed.
 */
export const RunStep = z.object({
  index: z.number().int().nonnegative(),
  at: z.string().datetime({ offset: true }),
  kind: z.enum(['assistant-text', 'tool-call', 'tool-result', 'human-input', 'error']),
  /** Tool name when kind is tool-call/tool-result. */
  tool: z.string().optional(),
  /** Truncated, redacted payload for display. Full payloads never leave the server. */
  summary: z.string().max(2000),
  durationMs: z.number().nonnegative().optional(),
  tokens: z
    .object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
      cacheRead: z.number().int().nonnegative().optional(),
      cacheWrite: z.number().int().nonnegative().optional(),
    })
    .optional(),
  costUsd: z.number().nonnegative().optional(),
});
export type RunStep = z.infer<typeof RunStep>;

export const Run = z.object({
  id: z.string(),
  brandId: z.string(),
  trigger: RunTrigger,
  /** Which user or Feishu sender started it. Null for scheduled and eval runs. */
  actor: z
    .object({
      kind: z.enum(['user', 'feishu-user', 'system']),
      id: z.string(),
      displayName: z.string().optional(),
    })
    .optional(),
  /** The versioned workflow this run executed. Lets old runs stay interpretable. */
  workflow: z.object({ name: z.string(), version: z.string() }),
  status: RunStatus,
  /** Set when the run produced a recipe; the artifact is the payoff, not the transcript. */
  recipeId: z.string().optional(),
  steps: z.array(RunStep).default([]),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().default(0),
    outputTokens: z.number().int().nonnegative().default(0),
    costUsd: z.number().nonnegative().default(0),
  }),
  /** Why it stopped. Present on every terminal status, including success. */
  outcome: z
    .object({
      reason: z.string().min(1),
      /** Set on failures so the workbench can offer a retry with context. */
      retryable: z.boolean().default(false),
    })
    .optional(),
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }).optional(),
});
export type Run = z.infer<typeof Run>;
