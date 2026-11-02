/**
 * The async recipe pipeline: ack immediately, run behind the per-chat queue,
 * then deliver the outcome — success or failure. A recipe run takes minutes
 * and costs real money; making the user wait on the reply path would trigger
 * Feishu retries and duplicate spend.
 *
 * The runtime dependency is deliberately narrow (one method). The handler
 * wires createRuntime().run behind it in ticket 04; tests use fakes.
 */
import type { Recipe } from '@mas/shared';
import { formatRecipeResult } from './feishu/recipe-format.js';
import type { MessagePayload } from './feishu/client.js';
export type RecipeRunOutcome =
  | {
      status: 'succeeded';
      recipeId: string;
      summary: string;
      costUsd: number;
      /** The saved draft. Absent only when the store lookup failed post-save. */
      recipe?: Recipe;
    }
  | { status: 'failed'; reason: string; retryable: boolean };

export interface RecipeRuntime {
  run(request: { brandId: string; prompt: string; actorId: string }): Promise<RecipeRunOutcome>;
}

export interface RecipeSubmission {
  chatId: string;
  brandId: string;
  prompt: string;
  actorId?: string;
  ack: (text: string) => Promise<void>;
  deliver: (payloads: [MessagePayload, ...MessagePayload[]]) => Promise<void>;
}

export class RecipeRunner {
  private readonly chains = new Map<string, Promise<void>>();

  constructor(
    private readonly deps: { runtime: RecipeRuntime; maxQueueDepth: number },
  ) {}

  submit(submission: RecipeSubmission): Promise<void> {
    const depth = this.chains.get(submission.chatId) === undefined ? 0 : 1;
    const ackText =
      depth === 0
        ? '收到，开始拆解这条视频（约 2–4 分钟，完成后发结果）。'
        : `收到，已排队（前面还有 ${depth} 单），完成后按顺序发结果。`;

    const task = async (): Promise<void> => {
      await submission.ack(ackText);
      let outcome: RecipeRunOutcome;
      try {
        outcome = await this.deps.runtime.run({
          brandId: submission.brandId,
          prompt: submission.prompt,
          actorId: submission.actorId ?? 'feishu-user',
        });
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        await submission.deliver([
          {
            msgType: 'text',
            content: JSON.stringify({ text: `拆解没跑完：${reason}\n请稍后重试，或换一条参考视频。` }),
          },
        ]);
        return;
      }

      if (outcome.status === 'succeeded') {
        await submission.deliver(
          formatRecipeResult(outcome.recipe, {
            costUsd: outcome.costUsd,
            fallbackSummary: outcome.summary,
            recipeId: outcome.recipeId,
          }),
        );
      } else {
        const hint = outcome.retryable ? '可以重试。' : '这条不建议重试，换一条参考。';
        await submission.deliver([
          {
            msgType: 'text',
            content: JSON.stringify({ text: `拆解失败：${outcome.reason}\n${hint}` }),
          },
        ]);
      }
    };

    const previous = this.chains.get(submission.chatId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.chains.set(submission.chatId, next);
    void next.finally(() => {
      if (this.chains.get(submission.chatId) === next) this.chains.delete(submission.chatId);
    });
    return next;
  }
}
