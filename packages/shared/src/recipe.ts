import { z } from 'zod';

/**
 * A Recipe is the product's core artifact: a *cloneable* abstraction of a viral
 * video, bound to one brand. It is not a copy of the source video - copyright
 * aside, a literal copy transfers badly. The recipe captures what did the work
 * (hook pattern, beat skeleton, pacing, caption formula) and re-skins it with
 * the brand's product, audience, and voice.
 */
export const RecipeStatus = z.enum([
  'draft', // agent produced, not human-reviewed
  'reviewed', // a human signed off on the abstraction
  'approved', // cleared for production
  'retired', // superseded or performed badly
]);
export type RecipeStatus = z.infer<typeof RecipeStatus>;

export const BeatKind = z.enum([
  'hook',
  'context',
  'problem',
  'mechanism',
  'proof',
  'objection-handling',
  'cta',
]);
export type BeatKind = z.infer<typeof BeatKind>;

/**
 * A production beat is the unit a shooter or an editor acts on. It carries both
 * what is *said* and what is *shown*, because in short form the two are written
 * together.
 */
export const ProductionBeat = z.object({
  kind: BeatKind,
  /** Target duration. Sum of beats should land inside the platform window. */
  durationSec: z.number().positive(),
  script: z.string().min(1),
  /** Only set when the spoken language differs from the brand's primary locale. */
  translation: z.string().optional(),
  visual: z.string().min(1),
  onScreenText: z.string().optional(),
  /** Which reference shot this beat inherits its grammar from, if any. */
  derivedFromShotIndex: z.number().int().nonnegative().optional(),
});
export type ProductionBeat = z.infer<typeof ProductionBeat>;

/**
 * Provenance is what makes the recipe auditable. Every recipe declares which
 * reference it came from and how far it strayed - a reviewer can always answer
 * "why does this look like that?" without re-deriving the chain.
 */
export const Provenance = z.object({
  referenceId: z.string().min(1),
  /** 0 = literal copy, 1 = only the abstract pattern survived. */
  abstractionDistance: z.number().min(0).max(1),
  /** Elements deliberately NOT carried over, and why. */
  exclusions: z.array(z.object({ element: z.string(), reason: z.string() })).default([]),
});
export type Provenance = z.infer<typeof Provenance>;

export const Recipe = z.object({
  id: z.string(),
  brandId: z.string(),
  title: z.string().min(1),
  status: RecipeStatus.default('draft'),
  provenance: Provenance,
  /** The hook, restated for this brand. Kept outside beats for easy A/B testing. */
  hook: z.object({
    text: z.string().min(1),
    onScreenText: z.string().optional(),
    durationSec: z.number().positive().max(5),
    /** Which reference hook pattern this reuses. */
    pattern: z.string().min(1),
  }),
  beats: z.array(ProductionBeat).min(2),
  caption: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
  audio: z.object({
    direction: z.string().min(1),
    rights: z.enum(['original', 'platform-library', 'licensed', 'unknown']),
  }),
  /** Self-assessment from the generating agent. Never trusted alone - the eval gate decides. */
  selfCheck: z
    .object({
      brandVoiceMatch: z.number().min(0).max(1),
      hookStrength: z.number().min(0).max(1),
      claimsSubstantiated: z.boolean(),
      notes: z.string().optional(),
    })
    .optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Recipe = z.infer<typeof Recipe>;

/** Total runtime, derived rather than stored, so it can never drift. */
export function recipeDurationSec(recipe: Pick<Recipe, 'hook' | 'beats'>): number {
  return recipe.hook.durationSec + recipe.beats.reduce((sum, b) => sum + b.durationSec, 0);
}

/**
 * TikTok's in-feed sweet spot. Not a hard platform rule - a product opinion,
 * expressed once here so every prompt and every eval cites the same number.
 */
export const TARGET_DURATION_SEC = { min: 15, max: 45 } as const;
