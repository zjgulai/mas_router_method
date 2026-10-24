import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  Run as RunSchema,
  type BrandProfile,
  type Recipe,
  type Run,
} from '@mas/shared';
import type { BrandStore, RecipeStore, ReferenceStore } from '../../tools/brand.js';
import type { RunStore } from '../../run-store.js';
import { recipeFromDraft } from '../../recipe-draft.js';
import { DEFAULT_BRAND_ID, allSeedBrands, seedBrand } from '../../seed/brands.js';

function mint(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('hex')}`;
}

function parseJson(value: unknown): unknown {
  return typeof value === 'string' ? (JSON.parse(value) as unknown) : null;
}

/**
 * SQLite adapters for every port. The tracer uses this; Postgres replaces it before
 * milestone 2 (ADR 0006). All SQL lives here — a query outside this folder is a bug.
 */
export class SqliteStore implements BrandStore, ReferenceStore, RecipeStore, RunStore {
  private readonly db: DatabaseSync;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  /**
   * `recipes.seq` exists because `created_at` has millisecond resolution: an agent
   * that saves two drafts inside one turn produced a stable-but-wrong list order,
   * so "newest first" silently stopped meaning anything.
   */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY,
        json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS brand_members (
        brand_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY (brand_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS reference_videos (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL,
        url TEXT NOT NULL,
        platform_video_id TEXT,
        metrics_json TEXT,
        analysis_json TEXT,
        analysed_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_references_brand ON reference_videos(brand_id);
      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        status TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        seq INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_recipes_brand ON recipes(brand_id, seq DESC);
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        brand_id TEXT NOT NULL,
        status TEXT NOT NULL,
        model TEXT,
        workflow_name TEXT,
        workflow_version TEXT,
        trigger TEXT,
        cost_usd REAL,
        started_at TEXT,
        ended_at TEXT,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_runs_brand_started ON runs(brand_id, started_at);
    `);
  }

  seed(brand: BrandProfile, userId = 'dev-user'): void {
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT OR REPLACE INTO brands (id, json, updated_at) VALUES (?, ?, ?)')
      .run(brand.id, JSON.stringify(brand), now);
    this.db
      .prepare('INSERT OR IGNORE INTO brand_members (brand_id, user_id) VALUES (?, ?)')
      .run(brand.id, userId);
  }

  /**
   * Seed every brand the eval suite and `try-one` refer to.
   *
   * Seeding all four matters: `try-one --eval-case high-abstraction` names the
   * coffee brand, and a seeder that only knows id 00000000000001 makes that
   * ticket impossible to run against a real database.
   */
  seedBrands(userId = 'dev-user'): BrandProfile[] {
    const brands = allSeedBrands();
    for (const brand of brands) this.seed(brand, userId);
    return brands;
  }

  /** Back-compat for callers that only want the baseline brand. */
  seedDefaultBrand(userId = 'dev-user'): BrandProfile {
    const brand = seedBrand(DEFAULT_BRAND_ID);
    this.seed(brand, userId);
    return brand;
  }

  close(): void {
    this.db.close();
  }

  async get(brandId: string): Promise<BrandProfile | null> {
    const row = this.db.prepare('SELECT json FROM brands WHERE id = ?').get(brandId);
    return row === undefined ? null : (parseJson(row['json']) as BrandProfile);
  }

  async listForUser(userId: string): Promise<BrandProfile[]> {
    const rows = this.db
      .prepare(
        `SELECT b.json FROM brands b
         JOIN brand_members m ON m.brand_id = b.id
         WHERE m.user_id = ? ORDER BY b.id`,
      )
      .all(userId);
    return rows.map((row) => parseJson(row['json']) as BrandProfile);
  }

  async save(
    brandId: string,
    input: {
      url: string;
      platformVideoId?: string;
      metrics?: {
        views?: number | undefined;
        likes?: number | undefined;
        comments?: number | undefined;
        shares?: number | undefined;
      };
    },
  ): Promise<{ referenceId: string }> {
    const referenceId = mint('ref');
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO reference_videos
         (id, brand_id, url, platform_video_id, metrics_json, analysis_json, analysed_at, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
      )
      .run(
        referenceId,
        brandId,
        input.url,
        input.platformVideoId ?? null,
        input.metrics === undefined ? null : JSON.stringify(input.metrics),
        now,
      );
    return { referenceId };
  }

  async list(brandId: string): Promise<{ referenceId: string; url: string; analysed: boolean }[]> {
    const rows = this.db
      .prepare(
        `SELECT id, url, analysis_json FROM reference_videos
         WHERE brand_id = ? ORDER BY created_at DESC`,
      )
      .all(brandId);
    return rows.map((row) => ({
      referenceId: String(row['id']),
      url: String(row['url']),
      analysed: row['analysis_json'] !== null,
    }));
  }

  async saveAnalysis(brandId: string, referenceId: string, analysis: unknown): Promise<void> {
    const result = this.db
      .prepare(
        `UPDATE reference_videos SET analysis_json = ?, analysed_at = ?
         WHERE id = ? AND brand_id = ?`,
      )
      .run(JSON.stringify(analysis), new Date().toISOString(), referenceId, brandId);
    if (Number(result.changes) === 0) {
      throw new Error(`No reference ${referenceId} for brand ${brandId}`);
    }
  }

  async getAnalysis(brandId: string, referenceId: string): Promise<unknown | null> {
    const row = this.db
      .prepare('SELECT analysis_json FROM reference_videos WHERE id = ? AND brand_id = ?')
      .get(referenceId, brandId);
    return row === undefined ? null : parseJson(row['analysis_json']);
  }

  /**
   * Monotonic insert order. Used for "newest first" because a millisecond
   * timestamp ties whenever two drafts are written in the same turn.
   */
  private nextRecipeSeq(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM recipes').get() as
      | { m: number }
      | undefined;
    return Number(row?.m ?? 0) + 1;
  }

  async saveDraft(input: { brandId: string; referenceId: string; recipe: unknown }): Promise<{ recipeId: string }> {
    const now = new Date().toISOString();
    const recipeId = mint('rec');
    const parsed = recipeFromDraft(input.brandId, input.recipe, recipeId, now);
    this.db
      .prepare(
        `INSERT INTO recipes (id, brand_id, reference_id, status, json, created_at, updated_at, seq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        parsed.id,
        parsed.brandId,
        input.referenceId,
        parsed.status,
        JSON.stringify(parsed),
        parsed.createdAt,
        parsed.updatedAt,
        this.nextRecipeSeq(),
      );
    return { recipeId: parsed.id };
  }

  async getRecipe(brandId: string, recipeId: string): Promise<unknown | null> {
    const row = this.db
      .prepare('SELECT json FROM recipes WHERE id = ? AND brand_id = ?')
      .get(recipeId, brandId);
    return row === undefined ? null : parseJson(row['json']);
  }

  async listRecipes(brandId: string, limit = 10): Promise<Recipe[]> {
    const rows = this.db
      .prepare('SELECT json FROM recipes WHERE brand_id = ? ORDER BY seq DESC LIMIT ?')
      .all(brandId, limit);
    return rows.map((row) => parseJson(row['json']) as Recipe);
  }

  async saveRun(run: Run): Promise<void> {
    const parsed = RunSchema.parse(run);
    this.db
      .prepare(
        `INSERT INTO runs
         (id, brand_id, status, model, workflow_name, workflow_version, trigger, cost_usd, started_at, ended_at, json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           cost_usd = excluded.cost_usd,
           ended_at = excluded.ended_at,
           json = excluded.json`,
      )
      .run(
        parsed.id,
        parsed.brandId,
        parsed.status,
        null,
        parsed.workflow.name,
        parsed.workflow.version,
        parsed.trigger,
        parsed.usage.costUsd,
        parsed.startedAt,
        parsed.endedAt ?? null,
        JSON.stringify(parsed),
      );
  }

  async getRun(brandId: string, runId: string): Promise<Run | null> {
    const row = this.db
      .prepare('SELECT json FROM runs WHERE id = ? AND brand_id = ?')
      .get(runId, brandId);
    return row === undefined ? null : (parseJson(row['json']) as Run);
  }

  async listRunsByBrand(brandId: string, limit = 20): Promise<Run[]> {
    const rows = this.db
      .prepare('SELECT json FROM runs WHERE brand_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(brandId, limit);
    return rows.map((row) => parseJson(row['json']) as Run);
  }
}
