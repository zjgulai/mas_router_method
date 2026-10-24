import { Run as RunSchema, type Run } from '@mas/shared';
import type { AgentRunRequest, AgentRunResult } from './run-agent.js';

/**
 * Build the persisted `Run` from one execution. Kept pure and separate from
 * `createRuntime` so the mapping is testable without a model call, and so the
 * runtime loop stays about the loop (see `run-agent.ts`).
 */
export function buildRunRecord(input: {
  id: string;
  startedAt: string;
  endedAt: string;
  request: AgentRunRequest;
  result: AgentRunResult;
}): Run {
  const { id, startedAt, endedAt, request, result } = input;
  return RunSchema.parse({
    id,
    brandId: request.brandId,
    trigger: request.trigger,
    ...(request.actor === undefined ? {} : { actor: request.actor }),
    workflow: request.workflow,
    status: result.status,
    steps: result.steps,
    usage: result.usage,
    outcome: result.outcome,
    startedAt,
    endedAt,
  });
}
