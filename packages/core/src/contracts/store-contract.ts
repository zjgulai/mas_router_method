import { describe, expect, it } from 'vitest';
import type { BrandStore, RecipeStore, ReferenceStore } from '../tools/brand.js';
import type { RunStore } from '../run-store.js';
import type { BrandProfile, Run } from '@mas/shared';

/**
 * One contract, run against every store implementation.
 *
 * ADR 0009 promised this suite and it did not exist, which is how the eval fake
 * drifted into being *more permissive* than production: its `list()` returned an
 * empty array, so `analyze_reference_video` — which resolves a reference id
 * through that list — failed on every eval run while passing every unit test.
 * A fake that cannot fail the same way production fails is not a fixture, it is a
 * second implementation with different behaviour.
 *
 * The suite lives in `core` because `core` owns the ports. Both the SQLite adapter
 * and the eval fake import it from here, so neither can quietly diverge.
 */

export interface StoreFixture {
  /** Name used in test titles, e.g. "sqlite" or "eval fake". */
  name: string;
  /** A fresh, isolated store. Called once per test. */
  create(): Promise<StoreFixtureHandle>;
}

export interface StoreFixtureHandle {
  brands: BrandStore;
  references: ReferenceStore;
  recipes: RecipeStore;
  runs: RunStore;
  /** Seeds the brand fixtures this suite asserts against. */
  seedBrands(): Promise<void>;
  close(): Promise<void>;
}

const BRAND_A = 'brd_00000000000001';
const BRAND_B = 'brd_00000000000002';
const URL = 'https://www.tiktok.com/@x/video/7300000000000000006';

const DRAFT = {
  referenceId: 'ref_000000000001',
  title: 'Contract recipe',
  abstractionDistance: 0.6,
  exclusions: [{ element: 'the reference audio', reason: 'rights are not reusable' }],
  hook: { text: 'Hook', durationSec: 2, pattern: 'problem-agitation' },
  beats: [
    { kind: 'problem', durationSec: 8, script: 'Script one', visual: 'Shot one' },
    { kind: 'cta', durationSec: 8, script: 'Script two', visual: 'Shot two' },
  ],
  caption: 'Caption',
  hashtags: [],
  audio: { direction: 'Original voiceover', rights: 'original' },
} as const;

const ANALYSIS = {
  hook: { pattern: 'problem-agitation', text: 'x', durationSec: 2, whyItWorks: 'y' },
  beats: [
    { name: 'problem', startSec: 2, endSec: 8, purpose: 'p' },
    { name: 'proof', startSec: 8, endSec: 16, purpose: 'q' },
  ],
  shots: [{ index: 0, kind: 'a-roll', startSec: 0, endSec: 8, action: 'a', reuse: 'reshoot-required' }],
  voiceover: [],
  audio: { source: 'original', rights: 'unknown' },
  captionFormula: { template: 't', example: 'e', hashtagStrategy: 'h' },
  callToAction: { text: 'c', mechanism: 'm' },
  transferability: { score: 0.5, blockers: [] },
} as const;

function runFor(brandId: string): Run {
  return {
    id: 'run_000000000001',
    brandId,
    trigger: 'eval',
    workflow: { name: 'contract', version: 'v0' },
    status: 'succeeded',
    steps: [],
    usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.01 },
    outcome: { reason: 'ok', retryable: false },
    startedAt: '2026-10-24T00:00:00.000Z',
  };
}

function brandFor(id: string): BrandProfile {
  return {
    id,
    name: `Brand ${id.slice(-2)}`,
    market: { primaryLocale: 'en-US', additionalLocales: [], currency: 'USD' },
    category: 'test',
    audience: { description: 'a', contexts: [], objections: [] },
    voice: { tone: ['plain'], banned: [], catchphrases: [] },
    guardrails: { regulatedClaims: [], prohibitedTopics: [], requiredDisclaimers: {} },
    successCriteria: [],
  };
}

export function describeStoreContract(fixture: StoreFixture): void {
  describe(`store contract: ${fixture.name}`, () => {
    async function open(): Promise<StoreFixtureHandle> {
      const store = await fixture.create();
      await store.brands.get(BRAND_A); // ensure lazily-created brands exist
      await store.seedBrands();
      return store;
    }

    describe('brands', () => {
      it('returns a seeded brand and never invents one for an unknown id', async () => {
        const store = await open();
        try {
          expect(await store.brands.get(BRAND_A)).not.toBeNull();
          expect(await store.brands.get(BRAND_B)).not.toBeNull();
          expect(await store.brands.get('brd_00000000000099')).toBeNull();
        } finally {
          await store.close();
        }
      });
    });

    describe('references', () => {
      it('round-trips save -> list, and marks a reference analysed only after analysis', async () => {
        const store = await open();
        try {
          const { referenceId } = await store.references.save(BRAND_A, { url: URL });

          // The regression that broke every eval run: a reference that was just
          // saved must be discoverable by id.
          const listed = await store.references.list(BRAND_A);
          const found = listed.find((r) => r.referenceId === referenceId);
          expect(found, 'saved reference must appear in list()').toBeDefined();
          expect(found?.url).toBe(URL);
          expect(found?.analysed).toBe(false);

          await store.references.saveAnalysis(BRAND_A, referenceId, ANALYSIS);
          const after = await store.references.list(BRAND_A);
          expect(after.find((r) => r.referenceId === referenceId)?.analysed).toBe(true);
        } finally {
          await store.close();
        }
      });

      it('returns the stored analysis, and never one belonging to another brand', async () => {
        const store = await open();
        try {
          const { referenceId } = await store.references.save(BRAND_A, { url: URL });
          expect(await store.references.getAnalysis(BRAND_A, referenceId)).toBeNull();

          await store.references.saveAnalysis(BRAND_A, referenceId, ANALYSIS);
          expect(await store.references.getAnalysis(BRAND_A, referenceId)).toEqual(ANALYSIS);

          // Cross-brand read must not resolve.
          expect(await store.references.getAnalysis(BRAND_B, referenceId)).toBeNull();
        } finally {
          await store.close();
        }
      });

      it('refuses to analyse a reference that belongs to another brand', async () => {
        const store = await open();
        try {
          const { referenceId } = await store.references.save(BRAND_A, { url: URL });
          await expect(store.references.saveAnalysis(BRAND_B, referenceId, ANALYSIS)).rejects.toThrow();
        } finally {
          await store.close();
        }
      });

      it('does not leak references across brands when listing', async () => {
        const store = await open();
        try {
          await store.references.save(BRAND_A, { url: URL });
          expect(await store.references.list(BRAND_B)).toHaveLength(0);
        } finally {
          await store.close();
        }
      });
    });

    describe('recipes', () => {
      it('validates on write and scopes reads by brand', async () => {
        const store = await open();
        try {
          const { referenceId } = await store.references.save(BRAND_A, { url: URL });
          const { recipeId } = await store.recipes.saveDraft({
            brandId: BRAND_A,
            referenceId,
            recipe: DRAFT,
          });

          expect(await store.recipes.getRecipe(BRAND_A, recipeId)).not.toBeNull();
          expect(await store.recipes.getRecipe(BRAND_B, recipeId)).toBeNull();

          await expect(
            store.recipes.saveDraft({ brandId: BRAND_A, referenceId, recipe: { ...DRAFT, beats: [] } }),
          ).rejects.toThrow();
        } finally {
          await store.close();
        }
      });

      it('lists newest first and honours the limit', async () => {
        const store = await open();
        try {
          const { referenceId } = await store.references.save(BRAND_A, { url: URL });
          for (const title of ['first', 'second', 'third']) {
            await store.recipes.saveDraft({
              brandId: BRAND_A,
              referenceId,
              recipe: { ...DRAFT, title },
            });
          }
          const listed = await store.recipes.listRecipes(BRAND_A, 2);
          expect(listed).toHaveLength(2);
          expect(listed[0]?.title).toBe('third');
        } finally {
          await store.close();
        }
      });
    });

    describe('runs', () => {
      it('persists a run and scopes history by brand', async () => {
        const store = await open();
        try {
          const run = runFor(BRAND_A);
          await store.runs.saveRun(run);
          expect(await store.runs.getRun(BRAND_A, run.id)).toMatchObject({ id: run.id });
          expect(await store.runs.getRun(BRAND_B, run.id)).toBeNull();
          expect(await store.runs.listRunsByBrand(BRAND_A)).toHaveLength(1);
          expect(await store.runs.listRunsByBrand(BRAND_B)).toHaveLength(0);
        } finally {
          await store.close();
        }
      });

      it('rejects a run that does not satisfy the Run schema', async () => {
        const store = await open();
        try {
          const broken = { ...runFor(BRAND_A), status: 'not-a-status' } as unknown as Run;
          await expect(store.runs.saveRun(broken)).rejects.toThrow();
        } finally {
          await store.close();
        }
      });
    });

    describe('brand scoping is not ambient state', () => {
      it('two brands can hold artifacts with the same logical content without colliding', async () => {
        const store = await open();
        try {
          const a = await store.references.save(BRAND_A, { url: URL });
          const b = await store.references.save(BRAND_B, { url: URL });
          expect(a.referenceId).not.toBe(b.referenceId);
          expect(await store.references.list(BRAND_A)).toHaveLength(1);
          expect(await store.references.list(BRAND_B)).toHaveLength(1);
          expect(await store.brands.get(brandFor(BRAND_A).id)).not.toBeNull();
        } finally {
          await store.close();
        }
      });
    });
  });
}
