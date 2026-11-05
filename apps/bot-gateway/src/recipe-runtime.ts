import type { AgentRunRequest, AgentRunResult } from '@mas/core';
import type { Recipe } from '@mas/shared';
import type { RecipeRunOutcome, RecipeRuntime } from './recipe-runner.js';

/**
 * The one adapter between the gateway's narrow `RecipeRuntime` and
 * `@mas/core`'s `createRuntime().run`.
 *
 * The run result does not carry a recipe id: the agent saves the draft through
 * the `save_recipe_draft` tool, and the store is the source of truth. Reading
 * "newest draft for this brand" after a successful run is the same rule the
 * workbench and the eval harness use.
 */
export interface RecipeRuntimeDeps {
  run(request: AgentRunRequest): Promise<AgentRunResult>;
  listRecipes(brandId: string, limit?: number): Promise<Recipe[]>;
}

export function createRecipeRuntime(deps: RecipeRuntimeDeps): RecipeRuntime {
  return {
    async run({ brandId, prompt, actorId, chatType }): Promise<RecipeRunOutcome> {
      const result = await deps.run({
        brandId,
        prompt,
        workflow: { name: 'recipe', version: '1' },
        trigger: chatType === 'p2p' ? 'feishu-dm' : 'feishu-group',
        actor: { kind: 'feishu-user', id: actorId },
      });

      if (result.status !== 'succeeded') {
        return {
          status: 'failed',
          reason: result.outcome.reason,
          retryable: result.outcome.retryable,
        };
      }

      const [recipe] = await deps.listRecipes(brandId, 1);
      if (recipe === undefined) {
        return {
          status: 'failed',
          reason: 'run finished without saving a recipe',
          retryable: true,
        };
      }

      return {
        status: 'succeeded',
        recipeId: recipe.id,
        summary: result.output?.slice(0, 500) ?? recipe.title,
        costUsd: result.usage.costUsd,
        recipe,
      };
    },
  };
}
