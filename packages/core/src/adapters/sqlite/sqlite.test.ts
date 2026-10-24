import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Run } from '@mas/shared';
import { SqliteStore } from './index.js';

const BRAND_A = 'brd_00000000000001';
const BRAND_B = 'brd_00000000000002';

const draft = {
  referenceId: 'ref_000000000001',
  title: 'Test recipe',
  abstractionDistance: 0.5,
  exclusions: [],
  hook: { text: 'Hook', durationSec: 2, pattern: 'problem-agitation' },
  beats: [
    { kind: 'problem', durationSec: 8, script: 'Script one', visual: 'Shot one' },
    { kind: 'cta', durationSec: 8, script: 'Script two', visual: 'Shot two' },
  ],
  caption: 'Caption',
  hashtags: [],
  audio: { direction: 'Original voiceover', rights: 'original' },
} as const;

const run: Run = {
  id: 'run_000000000001',
  brandId: BRAND_A,
  trigger: 'eval',
  workflow: { name: 'recipe-tracer', version: 'v0' },
  status: 'succeeded',
  steps: [],
  usage: { inputTokens: 10, outputTokens: 20, costUsd: 0.01 },
  outcome: { reason: 'ok', retryable: false },
  startedAt: '2026-10-24T00:00:00.000Z',
};

const stores: SqliteStore[] = [];
function open(path = ':memory:'): SqliteStore {
  const store = new SqliteStore(path);
  store.seedDefaultBrand('user-1');
  stores.push(store);
  return store;
}

afterEach(() => {
  while (stores.length > 0) stores.pop()?.close();
});

describe('brand isolation', () => {
  it('returns a brand only to a member, and never across ids', async () => {
    const store = open();
    expect(await store.get(BRAND_A)).not.toBeNull();
    expect(await store.get(BRAND_B)).toBeNull();
    expect(await store.listForUser('user-1')).toHaveLength(1);
    expect(await store.listForUser('user-2')).toHaveLength(0);
  });
});

describe('references', () => {
  it('stores a reference, marks it analysed only after analysis, and refuses cross-brand writes', async () => {
    const store = open();
    const { referenceId } = await store.save(BRAND_A, { url: 'https://example.com/v/1' });
    const listA = await store.list(BRAND_A);
    expect(listA).toEqual([{ referenceId, url: 'https://example.com/v/1', analysed: false }]);
    expect(await store.list(BRAND_B)).toHaveLength(0);

    await store.saveAnalysis(BRAND_A, referenceId, { hook: 'x' });
    expect(await store.getAnalysis(BRAND_A, referenceId)).toEqual({ hook: 'x' });
    expect((await store.list(BRAND_A))[0]?.analysed).toBe(true);
    expect(await store.getAnalysis(BRAND_B, referenceId)).toBeNull();

    await expect(store.saveAnalysis(BRAND_B, referenceId, { hook: 'y' })).rejects.toThrow();
  });
});

describe('recipes', () => {
  it('validates on write and scopes reads by brand', async () => {
    const store = open();
    const { referenceId } = await store.save(BRAND_A, { url: 'https://example.com/v/1' });
    const { recipeId } = await store.saveDraft({ brandId: BRAND_A, referenceId, recipe: draft });

    expect(await store.getRecipe(BRAND_A, recipeId)).not.toBeNull();
    expect(await store.getRecipe(BRAND_B, recipeId)).toBeNull();

    await expect(
      store.saveDraft({ brandId: BRAND_A, referenceId, recipe: { ...draft, beats: [] } }),
    ).rejects.toThrow();
  });
});

describe('runs', () => {
  it('persists a run and scopes history by brand', async () => {
    const store = open();
    await store.saveRun(run);
    expect(await store.getRun(BRAND_A, run.id)).toMatchObject({ id: run.id, status: 'succeeded' });
    expect(await store.getRun(BRAND_B, run.id)).toBeNull();
    expect(await store.listRunsByBrand(BRAND_A)).toHaveLength(1);
    expect(await store.listRunsByBrand(BRAND_B)).toHaveLength(0);
  });
});

describe('persistence', () => {
  it('survives a process restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mas-sqlite-'));
    const path = join(dir, 'store.db');
    try {
      const first = open(path);
      const { referenceId } = await first.save(BRAND_A, { url: 'https://example.com/v/1' });
      const { recipeId } = await first.saveDraft({ brandId: BRAND_A, referenceId, recipe: draft });
      await first.saveRun(run);
      first.close();
      stores.length = 0;

      const second = open(path);
      expect(await second.get(BRAND_A)).not.toBeNull();
      expect(await second.getRecipe(BRAND_A, recipeId)).not.toBeNull();
      expect(await second.getRun(BRAND_A, run.id)).not.toBeNull();
    } finally {
      while (stores.length > 0) stores.pop()?.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
