import { describe, expect, it } from 'vitest';
import type { AgentRunRequest, AgentRunResult } from '@mas/core';
import type { Recipe } from '@mas/shared';
import { createRecipeRuntime } from './recipe-runtime.js';

const recipe = {
  id: 'rec_1',
  title: 'A saved recipe',
} as Recipe;

function runResult(overrides: Partial<AgentRunResult> = {}): AgentRunResult {
  return {
    status: 'succeeded',
    output: 'saved the draft',
    steps: [],
    usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.42 },
    outcome: { reason: 'done', retryable: false },
    ...overrides,
  };
}

describe('createRecipeRuntime', () => {
  it('maps a successful run to the newest saved recipe', async () => {
    const requests: AgentRunRequest[] = [];
    const runtime = createRecipeRuntime({
      run: async (request) => {
        requests.push(request);
        return runResult();
      },
      listRecipes: async () => [recipe],
    });

    const outcome = await runtime.run({
      brandId: 'brd_1',
      prompt: '拆这条视频',
      actorId: 'ou_user',
      chatType: 'group',
    });

    expect(outcome).toMatchObject({
      status: 'succeeded',
      recipeId: 'rec_1',
      summary: 'saved the draft',
      costUsd: 0.42,
    });
    expect(requests[0]).toMatchObject({
      brandId: 'brd_1',
      prompt: '拆这条视频',
      workflow: { name: 'recipe', version: '1' },
      trigger: 'feishu-group',
      actor: { kind: 'feishu-user', id: 'ou_user' },
    });
  });

  it('maps a direct message to the feishu-dm trigger', async () => {
    const triggers: string[] = [];
    const runtime = createRecipeRuntime({
      run: async (request) => {
        triggers.push(request.trigger);
        return runResult();
      },
      listRecipes: async () => [recipe],
    });

    await runtime.run({ brandId: 'b', prompt: 'p', actorId: 'a', chatType: 'p2p' });
    expect(triggers).toEqual(['feishu-dm']);
  });

  it('maps a failed run to a failed outcome with its retry flag', async () => {
    const runtime = createRecipeRuntime({
      run: async () =>
        runResult({
          status: 'failed',
          outcome: { reason: 'budget exhausted', retryable: false },
        }),
      listRecipes: async () => [recipe],
    });

    expect(
      await runtime.run({ brandId: 'b', prompt: 'p', actorId: 'a' }),
    ).toEqual({ status: 'failed', reason: 'budget exhausted', retryable: false });
  });

  it('fails honestly when a successful run saved no recipe', async () => {
    const runtime = createRecipeRuntime({
      run: async () => runResult(),
      listRecipes: async () => [],
    });

    expect(
      await runtime.run({ brandId: 'b', prompt: 'p', actorId: 'a' }),
    ).toEqual({
      status: 'failed',
      reason: 'run finished without saving a recipe',
      retryable: true,
    });
  });
});
