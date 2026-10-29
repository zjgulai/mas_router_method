import {
  Recipe,
  Run as RunSchema,
  type BrandProfile,
  type ReferenceAnalysis,
  type Recipe as RecipeType,
  type Run,
} from '@mas/shared';
import { BRAND_IDS, recipeFromDraft, seedBrand } from '@mas/core';
import type { BrandStore, RecipeStore, ReferenceStore, RunStore, VisionAnalyzer } from '@mas/core';
import type { CaseArtifact } from './rules.js';
import type { EvalCase } from './types.js';

/**
 * Brands come from `@mas/core`, not from a second table here.
 *
 * One definition serves the SQLite seeder, `try-one`, and the eval harness. Two
 * copies would drift the moment a guardrail changes — and the guardrail is the
 * thing the `should_fail` cases are built on (ADR 0002).
 */
export { BRAND_IDS, allSeedBrands, seedBrand } from '@mas/core';

/** Brand fixture for a case. Delegates so there is exactly one brand table. */
export const makeBrand: (id: string) => BrandProfile = seedBrand;

export function makeAnalysis(options: { silent?: boolean; restrictedAudio?: boolean } = {}): ReferenceAnalysis {
  const silent = options.silent === true;
  return {
    hook: {
      pattern: 'problem-agitation',
      text: silent ? 'A close-up of a tired face, no speech' : 'Tired of routines that take an hour?',
      durationSec: 2,
      whyItWorks: 'Names a pain the viewer already feels.',
    },
    beats: [
      { name: 'problem', startSec: 2, endSec: 8, purpose: 'Agitate the pain' },
      { name: 'mechanism', startSec: 8, endSec: 16, purpose: 'Show a simpler way' },
      { name: 'proof', startSec: 16, endSec: 24, purpose: 'Show the result' },
    ],
    shots: [
      { index: 0, kind: 'a-roll', startSec: 0, endSec: 8, action: 'Person at a mirror', reuse: 'reshoot-required' },
      { index: 1, kind: 'product-closeup', startSec: 8, endSec: 16, action: 'Product on a counter', reuse: 'reshoot-required' },
    ],
    voiceover: silent
      ? []
      : // The line stays in its spoken language on purpose: a zh-market reference must
        // carry the language signal the agent needs to decide translations are due.
        [{ startSec: 2, endSec: 8, line: '以前 routines 要一个小时。', translation: 'It used to take an hour.' }],
    audio: {
      // A silent reference must not claim an original voiceover it does not have;
      // that string is what the model reads when deciding whether to write dialogue.
      source: options.restrictedAudio === true
        ? 'trending sound'
        : silent
          ? 'music and on-screen text only, no speech'
          : 'original voiceover',
      rights: options.restrictedAudio === true ? 'not-reusable' : 'clearable',
    },
    captionFormula: {
      template: '<pain>? <simple fix>',
      example: 'Tired of long routines? Try one step.',
      hashtagStrategy: 'category + outcome',
    },
    callToAction: { text: 'Try it tonight', mechanism: 'Low effort, visible result' },
    transferability: { score: 0.8, blockers: [] },
  };
}

export function analysisForUrl(url: string): ReferenceAnalysis {
  return makeAnalysis({
    silent: url.includes('0006'),
    restrictedAudio: url.includes('0003') || url.includes('0012'),
  });
}

export interface FakeEnv {
  brands: BrandStore;
  references: ReferenceStore;
  recipes: RecipeStore;
  vision: VisionAnalyzer;
  runs: RunStore;
  drafts: RecipeType[];
  savedRuns: Run[];
}

export function createFakeEnv(): FakeEnv {
  const brandCache = new Map<string, BrandProfile>();
  const drafts: RecipeType[] = [];
  const savedRuns: Run[] = [];

  const brands: BrandStore = {
    /**
     * Only seeded brands exist. Returning a fabricated profile for any id is how
     * a typo in a case silently becomes "another skincare brief" instead of a
     * test that fails loudly.
     */
    async get(brandId: string): Promise<BrandProfile | null> {
      const cached = brandCache.get(brandId);
      if (cached !== undefined) return cached;
      const seeded = (Object.values(BRAND_IDS) as string[]).includes(brandId);
      if (!seeded) return null;
      const created = seedBrand(brandId);
      brandCache.set(brandId, created);
      return created;
    },
    async listForUser(): Promise<BrandProfile[]> {
      return [...brandCache.values()];
    },
  };

  /**
   * Stateful, brand-scoped references.
   *
   * This used to return `[]` from `list()` and `null` from `getAnalysis()` for
   * everything, which made it *more permissive* than SQLite: `analyze_reference_video`
   * resolves a reference id through `list()`, so on every eval run the first
   * analysis call failed with "No reference ... for this brand". The eval measured
   * the fixture, not the agent.
   */
  interface FakeReference {
    referenceId: string;
    brandId: string;
    url: string;
    analysis: unknown | null;
  }
  const referenceRows: FakeReference[] = [];

  const references: ReferenceStore = {
    async save(brandId, input): Promise<{ referenceId: string }> {
      // Mint a fresh id per save, like the SQL adapter. Deriving the id from the
      // URL made two brands pointing at the same video collide on one id, and made
      // saving the same URL twice silently a no-op — neither happens in production.
      const referenceId = `ref_${String(referenceRows.length + 1).padStart(12, '0')}`;
      referenceRows.push({ referenceId, brandId, url: input.url, analysis: null });
      return { referenceId };
    },
    async list(brandId): Promise<{ referenceId: string; url: string; analysed: boolean }[]> {
      return referenceRows
        .filter((r) => r.brandId === brandId)
        .slice()
        .reverse()
        .map((r) => ({ referenceId: r.referenceId, url: r.url, analysed: r.analysis !== null }));
    },
    async saveAnalysis(brandId, referenceId, analysis): Promise<void> {
      const row = referenceRows.find((r) => r.brandId === brandId && r.referenceId === referenceId);
      // Same failure mode as the SQL adapter: a mismatched brand is a loud error,
      // not a silent no-op.
      if (row === undefined) throw new Error(`No reference ${referenceId} for brand ${brandId}`);
      row.analysis = analysis;
    },
    async getAnalysis(brandId, referenceId): Promise<unknown | null> {
      const row = referenceRows.find((r) => r.brandId === brandId && r.referenceId === referenceId);
      return row?.analysis ?? null;
    },
  };

  interface FakeRecipe {
    brandId: string;
    referenceId: string;
    recipe: RecipeType;
  }
  const recipeRows: FakeRecipe[] = [];

  const recipes: RecipeStore = {
    async saveDraft(input): Promise<{ recipeId: string }> {
      const now = new Date().toISOString();
      // `recipeFromDraft` runs `Recipe.parse`, so an invalid draft throws here
      // exactly as it does against SQLite.
      const parsed = recipeFromDraft(
        input.brandId,
        input.recipe,
        `rec_${String(recipeRows.length + 1).padStart(12, '0')}`,
        now,
      );
      recipeRows.push({ brandId: input.brandId, referenceId: input.referenceId, recipe: parsed });
      drafts.push(parsed);
      return { recipeId: parsed.id };
    },
    async getRecipe(brandId: string, recipeId: string): Promise<unknown | null> {
      return (
        recipeRows.find((r) => r.brandId === brandId && r.recipe.id === recipeId)?.recipe ?? null
      );
    },
    async listRecipes(brandId: string, limit = 10): Promise<RecipeType[]> {
      return recipeRows
        .filter((r) => r.brandId === brandId)
        .slice(-limit)
        .reverse()
        .map((r) => r.recipe);
    },
  };

  const vision: VisionAnalyzer = {
    async analyze(input): Promise<unknown> {
      return analysisForUrl(input.url);
    },
  };

  const runs: RunStore = {
    async saveRun(run: Run): Promise<void> {
      // Validate like the SQL adapter does; an unvalidated fake accepts runs that
      // production rejects (a 2006-character step summary, for instance).
      savedRuns.push(RunSchema.parse(run));
    },
    async getRun(brandId: string, runId: string): Promise<Run | null> {
      return savedRuns.find((run) => run.brandId === brandId && run.id === runId) ?? null;
    },
    async listRunsByBrand(brandId: string, limit = 20): Promise<Run[]> {
      return savedRuns.filter((run) => run.brandId === brandId).slice(-limit).reverse();
    },
  };

  return { brands, references, recipes, vision, runs, drafts, savedRuns };
}

/** A recipe that satisfies the deterministic rules used by the fast subset. */
export function makeValidRecipe(
  brandId: string,
  options: { exclusions?: boolean; abstractionDistance?: number } = {},
): RecipeType {
  return {
    id: 'rec_000000000001',
    brandId,
    title: 'Morning routine, simplified',
    status: 'draft',
    provenance: {
      referenceId: 'ref_000000000001',
      abstractionDistance: options.abstractionDistance ?? 0.6,
      exclusions:
        options.exclusions === true
          ? [{ element: 'the reference audio', reason: 'rights are not reusable' }]
          : [],
    },
    hook: {
      text: 'Three steps. That is the whole routine.',
      durationSec: 2,
      pattern: 'problem-agitation',
    },
    beats: [
      {
        kind: 'problem',
        durationSec: 8,
        script: 'Most routines take an hour and still feel like work.',
        visual: 'Person at a mirror, frustrated',
      },
      {
        kind: 'mechanism',
        durationSec: 10,
        script: 'This one takes three steps and two minutes.',
        visual: 'Product on a counter, hands using it',
      },
    ],
    caption: 'A routine you will actually keep.',
    hashtags: ['#skincare'],
    audio: { direction: 'Original voiceover over a calm track', rights: 'original' },
    selfCheck: { brandVoiceMatch: 0.8, hookStrength: 0.8, claimsSubstantiated: true },
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
  };
}

/**
 * Self-test artifacts verify the harness plumbing without calling a model. They are
 * labelled as such in the CLI output; they are never a quality result.
 */
export function makeSelfTestArtifact(evalCase: EvalCase): CaseArtifact {
  const brand = makeBrand(evalCase.input.brandId);
  const needsRecipe = evalCase.expectations.some(
    (expectation) => expectation.kind === 'deterministic' && expectation.rule === 'exclusions-non-empty',
  );

  if (evalCase.shouldFail && !needsRecipe) {
    // A refusal is a *completed* run that declined. Emitting `failed` here would
    // reproduce the very bug the harness now guards against: a refusal fixture
    // that looks like an outage.
    return {
      status: 'succeeded',
      outcome: { reason: 'Refused: the requested claim is prohibited for this brand.', retryable: false },
      output: 'I cannot produce that: it breaks a guardrail on this brand.',
      steps: [
        { kind: 'tool-call', summary: 'get_brand_profile', tool: 'get_brand_profile' },
        { kind: 'assistant-text', summary: 'Declined: prohibited claim.' },
      ],
      recipe: undefined,
      analysis: makeAnalysis({ restrictedAudio: true }),
      brand,
      request: evalCase.input.request,
    };
  }

  return {
    status: 'succeeded',
    outcome: { reason: 'Workflow completed.', retryable: false },
    output: 'Chose the first reference because its hook pattern is stronger for this brand.',
    steps: [{ kind: 'tool-call', summary: 'save_recipe_draft', tool: 'save_recipe_draft' }],
    recipe: makeValidRecipe(evalCase.input.brandId, {
      exclusions: needsRecipe,
      abstractionDistance: evalCase.id === 'high-abstraction' ? 0.6 : 0.5,
    }),
    analysis: makeAnalysis({ restrictedAudio: evalCase.id === 'audio-rights' }),
    brand,
    request: evalCase.input.request,
  };
}
