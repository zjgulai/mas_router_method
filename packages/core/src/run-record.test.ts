import { describe, expect, it } from 'vitest';
import { buildRunRecord } from './run-record.js';
import type { AgentRunRequest, AgentRunResult } from './run-agent.js';

const request: AgentRunRequest = {
  prompt: 'make a recipe',
  workflow: { name: 'recipe-tracer', version: 'v0' },
  trigger: 'eval',
  brandId: 'brd_00000000000001',
  actor: { kind: 'system', id: 'eval' },
};

const result: AgentRunResult = {
  status: 'succeeded',
  output: 'done',
  steps: [
    { index: 0, at: '2026-10-24T00:00:00.000Z', kind: 'assistant-text', summary: 'thinking' },
  ],
  usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.01 },
  outcome: { reason: 'Workflow completed.', retryable: false },
};

describe('buildRunRecord', () => {
  it('maps a result onto the persisted Run shape', () => {
    const run = buildRunRecord({
      id: 'run_000000000001',
      startedAt: '2026-10-24T00:00:00.000Z',
      endedAt: '2026-10-24T00:00:05.000Z',
      request,
      result,
    });

    expect(run).toMatchObject({
      id: 'run_000000000001',
      brandId: request.brandId,
      trigger: 'eval',
      workflow: request.workflow,
      status: 'succeeded',
      usage: result.usage,
      startedAt: '2026-10-24T00:00:00.000Z',
      endedAt: '2026-10-24T00:00:05.000Z',
    });
    expect(run.steps).toHaveLength(1);
  });

  it('omits actor when the request has none', () => {
    const { actor: _actor, ...anonymous } = request;
    const run = buildRunRecord({
      id: 'run_000000000002',
      startedAt: '2026-10-24T00:00:00.000Z',
      endedAt: '2026-10-24T00:00:05.000Z',
      request: anonymous,
      result,
    });
    expect(run.actor).toBeUndefined();
  });
});
