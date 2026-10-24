import { Recipe, type Recipe as RecipeType } from '@mas/shared';

/**
 * The `save_recipe_draft` tool receives a flat shape (referenceId, abstractionDistance,
 * exclusions at the top level) because that is easier for a model to produce. The
 * domain object nests them under `provenance`. This is the one place that mapping
 * lives, so the SQLite adapter and the eval fakes cannot drift.
 */
export function recipeFromDraft(
  brandId: string,
  draft: unknown,
  id: string,
  now: string,
): RecipeType {
  const raw = typeof draft === 'object' && draft !== null ? (draft as Record<string, unknown>) : {};
  const referenceId =
    typeof raw['referenceId'] === 'string' ? raw['referenceId'] : undefined;
  if (referenceId === undefined) throw new Error('draft.referenceId is required');

  const { referenceId: _referenceId, abstractionDistance, exclusions, ...rest } = raw;
  return Recipe.parse({
    ...rest,
    id,
    brandId,
    status: 'draft',
    provenance: {
      referenceId,
      abstractionDistance,
      exclusions: Array.isArray(exclusions) ? exclusions : [],
    },
    createdAt: now,
    updatedAt: now,
  });
}
