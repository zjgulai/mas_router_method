import type { BrandProfile } from '@mas/shared';

/**
 * The tracer's seed brands, defined once.
 *
 * They live in `core` rather than in the eval package because `packages/evals`
 * depends on `core` and not the other way round: the SQLite seeder, the eval
 * harness, and `try-one` all need the same four profiles, and a second copy is
 * exactly the schema-drift bug ADR 0002 exists to prevent.
 *
 * These are **not** one template with a swapped id. Each differs in the dimension
 * the case that uses it tests — category (so "does the mechanism survive a
 * category change" is a real question), regulated claims (so the guardrail cases
 * have something to refuse), and voice (so voice-match has a target). With a
 * single shared template, `baseline-consumer-tech` and `high-abstraction` become
 * self-contradictory: the request says "we sell headphones" while the profile
 * says skincare, and the model can only ignore one of them.
 *
 * Ids are stable: they appear in eval case inputs and in stored runs.
 */
export const BRAND_IDS = {
  /** The baseline: skincare, the category the reference material assumes. */
  beauty: 'brd_00000000000001',
  /** Coffee pods: the cross-category counterpart to the beauty baseline. */
  coffee: 'brd_00000000000002',
  /** Supplements: a category where regulated claims are the whole risk surface. */
  supplements: 'brd_00000000000003',
  /** Consumer hardware: same reference, different mechanism and proof beats. */
  headphones: 'brd_00000000000004',
} as const;

export type SeedBrandKey = keyof typeof BRAND_IDS;

const SEED_BRANDS: Record<string, BrandProfile> = {
  [BRAND_IDS.beauty]: {
    id: BRAND_IDS.beauty,
    name: 'Halcyon Skin',
    market: { primaryLocale: 'en-US', additionalLocales: ['en-GB'], currency: 'USD' },
    category: 'skincare',
    audience: {
      description: 'Adults 25-40 who want a routine short enough to keep on a weekday morning',
      contexts: ['morning routine', 'travel', 'post-gym'],
      objections: ['too many steps', 'takes too long', 'irritates sensitive skin'],
    },
    voice: {
      tone: ['direct', 'warm', 'plain-spoken'],
      banned: ['cures', '#1', 'miracle'],
      catchphrases: ['one step, done'],
    },
    guardrails: {
      regulatedClaims: ['cures acne', 'treats eczema'],
      prohibitedTopics: ['before-and-after weight loss'],
      requiredDisclaimers: {
        'cures acne': 'Not a medical treatment.',
        'treats eczema': 'Not a medical treatment.',
      },
    },
    successCriteria: [
      { name: 'voice-match', rubric: 'Sounds like a knowledgeable friend, never a clinic.', weight: 0.4 },
      { name: 'shootability', rubric: 'Every visual can be shot in a bathroom with one light.', weight: 0.3 },
    ],
  },

  [BRAND_IDS.coffee]: {
    id: BRAND_IDS.coffee,
    name: 'Sunday Press',
    market: { primaryLocale: 'en-US', additionalLocales: [], currency: 'USD' },
    category: 'coffee',
    audience: {
      description: 'Home coffee drinkers who want cafe-adjacent coffee without owning a grinder',
      contexts: ['first ten minutes of the day', 'working from home', 'camping'],
      objections: ['pods taste watery', 'machines are expensive', 'too much cleanup'],
    },
    voice: {
      tone: ['dry', 'unhurried', 'quietly confident'],
      banned: ['barista-grade', 'best coffee in the world'],
      catchphrases: ['no grinder, no ceremony'],
    },
    guardrails: {
      regulatedClaims: [],
      prohibitedTopics: ['health claims about caffeine'],
      requiredDisclaimers: {},
    },
    successCriteria: [
      { name: 'voice-match', rubric: 'Understated. Would never shout about coffee.', weight: 0.4 },
      { name: 'shootability', rubric: 'Shot on a kitchen counter, morning light, no studio.', weight: 0.3 },
    ],
  },

  [BRAND_IDS.supplements]: {
    id: BRAND_IDS.supplements,
    name: 'Northlight Labs',
    market: { primaryLocale: 'en-US', additionalLocales: ['en-CA'], currency: 'USD' },
    category: 'supplements',
    audience: {
      description: 'People who already take a multivitamin and are sceptical of the category',
      contexts: ['after a bad night of sleep', 'winter', 'training blocks'],
      objections: ['supplements are a scam', 'no evidence', 'expensive urine'],
    },
    voice: {
      tone: ['precise', 'measured', 'cites sources'],
      banned: ['cures', '#1', 'doctor recommended', 'clinically proven', 'guaranteed'],
      catchphrases: ['the dose is the claim'],
    },
    guardrails: {
      // Deliberately dense: this is the brand the guardrail cases attack.
      regulatedClaims: ['cures', 'treats', 'prevents', 'doctor recommended', 'clinically proven'],
      prohibitedTopics: ['diagnosing a condition', 'replacing prescribed medication'],
      requiredDisclaimers: {
        cures: 'Not a medical treatment. Not evaluated by the FDA.',
        treats: 'Not a medical treatment. Not evaluated by the FDA.',
        prevents: 'Not a medical treatment. Not evaluated by the FDA.',
      },
    },
    successCriteria: [
      { name: 'voice-match', rubric: 'Makes a smaller claim than it could, and names the study.', weight: 0.5 },
      { name: 'transferability', rubric: 'Mechanism survives even when the claim is weakened.', weight: 0.2 },
    ],
  },

  [BRAND_IDS.headphones]: {
    id: BRAND_IDS.headphones,
    name: 'Aperture Audio',
    market: { primaryLocale: 'en-US', additionalLocales: ['en-GB', 'de-DE'], currency: 'USD' },
    category: 'consumer-electronics',
    audience: {
      description: 'Commuters and open-plan-office workers who care about noise more than bass',
      contexts: ['commute', 'open-plan office', 'late-night flight'],
      objections: ['too expensive', 'uncomfortable after an hour', 'ANC makes me feel pressure'],
    },
    voice: {
      tone: ['technical', 'wry', 'specific'],
      banned: ['#1', 'best in class', 'audiophile-grade'],
      catchphrases: ['measured, not claimed'],
    },
    guardrails: {
      regulatedClaims: ['prevents hearing loss'],
      prohibitedTopics: [],
      requiredDisclaimers: { 'prevents hearing loss': 'Not a hearing-protection device.' },
    },
    successCriteria: [
      { name: 'voice-match', rubric: 'Gives a number where a competitor would give an adjective.', weight: 0.4 },
      { name: 'shootability', rubric: 'Product-in-context shots, not a spec sheet on screen.', weight: 0.3 },
    ],
  },
};

/**
 * Build a seed brand. An unknown id yields a clearly-labelled placeholder rather
 * than another brand's profile, so a typo in a case surfaces as an obviously
 * wrong brief instead of silently reusing skincare.
 */
export function seedBrand(id: string): BrandProfile {
  const known = SEED_BRANDS[id];
  if (known !== undefined) return structuredClone(known);
  return {
    id,
    name: `Unseeded brand ${id}`,
    market: { primaryLocale: 'en-US', additionalLocales: [], currency: 'USD' },
    category: 'unspecified',
    audience: {
      description: 'No seed profile for this id. Add one to core/src/seed/brands.ts.',
      contexts: [],
      objections: [],
    },
    voice: { tone: ['neutral'], banned: [], catchphrases: [] },
    guardrails: { regulatedClaims: [], prohibitedTopics: [], requiredDisclaimers: {} },
    successCriteria: [],
  };
}

/** Every seed brand, in id order. Used by the SQLite seeder and by contract tests. */
export function allSeedBrands(): BrandProfile[] {
  return Object.values(BRAND_IDS).map((id) => seedBrand(id));
}

/** The brand `try-one` and the baseline eval case both default to. */
export const DEFAULT_BRAND_ID: string = BRAND_IDS.beauty;
