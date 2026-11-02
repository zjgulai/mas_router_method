import { describe, expect, it } from 'vitest';
import { RecipeRunner, type RecipeRuntime, type RecipeRunOutcome } from './recipe-runner.js';

function ok(recipeId = 'rec_1'): RecipeRunOutcome {
  return { status: 'succeeded', recipeId, summary: 'hook + 4 beats', costUsd: 0.4 };
}

describe('RecipeRunner', () => {
  it('acks before the run starts, then delivers the result', async () => {
    const events: string[] = [];
    const runtime: RecipeRuntime = {
      run: () => {
        events.push('run-start');
        return Promise.resolve(ok());
      },
    };
    const runner = new RecipeRunner({ runtime, maxQueueDepth: 3 });

    const seen: string[] = [];
    const handle = runner.submit({
      chatId: 'oc_1',
      brandId: 'brd_1',
      prompt: '拆一条 https://www.tiktok.com/@x/video/1',
      ack: (text) => {
        seen.push(`ack:${text}`);
        events.push('ack');
        return Promise.resolve();
      },
      deliver: (text) => {
        seen.push(`deliver:${text}`);
        return Promise.resolve();
      },
    });
    await handle;

    expect(events[0]).toBe('ack');
    expect(events[1]).toBe('run-start');
    expect(seen.some((s) => s.includes('rec_1'))).toBe(true);
  });

  it('delivers the failure reason when the run fails, never silently', async () => {
    const runtime: RecipeRuntime = {
      run: () => Promise.resolve({ status: 'failed', reason: 'budget exhausted', retryable: false }),
    };
    const runner = new RecipeRunner({ runtime, maxQueueDepth: 3 });

    const seen: string[] = [];
    await runner.submit({
      chatId: 'oc_1',
      brandId: 'brd_1',
      prompt: '/recipe 拆一条',
      ack: () => Promise.resolve(),
      deliver: (text) => {
        seen.push(text);
        return Promise.resolve();
      },
    });

    expect(seen.some((s) => s.includes('budget exhausted'))).toBe(true);
  });

  it('delivers the error when the runtime throws', async () => {
    const runtime: RecipeRuntime = {
      run: () => Promise.reject(new Error('vod gateway unreachable')),
    };
    const runner = new RecipeRunner({ runtime, maxQueueDepth: 3 });

    const seen: string[] = [];
    await runner.submit({
      chatId: 'oc_1',
      brandId: 'brd_1',
      prompt: '/recipe 拆一条',
      ack: () => Promise.resolve(),
      deliver: (text) => {
        seen.push(text);
        return Promise.resolve();
      },
    });

    expect(seen.some((s) => s.includes('vod gateway unreachable'))).toBe(true);
  });

  it('serialises two submissions in one chat and reports queue depth in the ack', async () => {
    let releaseFirst: () => void = () => undefined;
    const firstRun = new Promise<RecipeRunOutcome>((resolve) => {
      releaseFirst = () => resolve(ok('rec_first'));
    });
    let call = 0;
    const runtime: RecipeRuntime = {
      run: () => {
        call += 1;
        return call === 1 ? firstRun : Promise.resolve(ok('rec_second'));
      },
    };
    const runner = new RecipeRunner({ runtime, maxQueueDepth: 3 });

    const acks: string[] = [];
    const noop = () => Promise.resolve();
    const first = runner.submit({
      chatId: 'oc_1',
      brandId: 'brd_1',
      prompt: '/recipe 第一条',
      ack: (t) => {
        acks.push(t);
        return noop();
      },
      deliver: noop,
    });
    const second = runner.submit({
      chatId: 'oc_1',
      brandId: 'brd_1',
      prompt: '/recipe 第二条',
      ack: (t) => {
        acks.push(t);
        return noop();
      },
      deliver: noop,
    });

    await new Promise((r) => setTimeout(r, 20));
    releaseFirst();
    await Promise.all([first, second]);

    expect(acks[0]).not.toContain('排队');
    expect(acks[1]).toContain('1');
  });
});
