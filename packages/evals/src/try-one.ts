import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime, loadConfig } from '@mas/core';
import type { AgentRunResult } from '@mas/core';
import { BRAND_IDS, DEFAULT_BRAND_ID } from '@mas/core';
import type { BrandProfile, Recipe } from '@mas/shared';
import { cases } from './cases/index.js';
import { analysisForUrl } from './fixtures.js';
import { evaluateCase, evaluateRule, type CaseArtifact } from './rules.js';
import { createVisionAnalyzer } from './vision.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const DEFAULT_BRAND = DEFAULT_BRAND_ID;

interface Options {
  url?: string;
  brandId: string;
  request?: string;
  evalCase?: string;
  dbPath?: string;
  fakeVision: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Options {
  const value = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const url = value('--url');
  const request = value('--request');
  const evalCase = value('--eval-case');
  const dbPath = value('--db');
  return {
    brandId: value('--brand') ?? DEFAULT_BRAND,
    fakeVision: argv.includes('--fake-vision'),
    help: argv.includes('--help') || argv.includes('-h'),
    ...(url === undefined ? {} : { url }),
    ...(request === undefined ? {} : { request }),
    ...(evalCase === undefined ? {} : { evalCase }),
    ...(dbPath === undefined ? {} : { dbPath }),
  };
}

function usage(): void {
  console.log(`try-one — run one request through the real runtime.

  --url <tiktok-url>        ad-hoc request: "clone this <url>"
  --eval-case <id>          run an eval case through the same path (e.g. baseline-beauty)
  --brand <brand-id>        defaults to ${DEFAULT_BRAND}
                            seeded: ${Object.values(BRAND_IDS).join(', ')}
  --request <text>          override the ad-hoc prompt
  --db <path>               SQLite file; defaults to $TMPDIR/mas-try-one.db
  --fake-vision             use the fixture analyser; a loop rehearsal, not a product result
  --help

Requires ANTHROPIC_API_KEY. Without a vision provider (ADR 0007) or --fake-vision,
the run stops at the first analyze_reference_video call by design.`);
}

function printSteps(result: AgentRunResult): void {
  for (const step of result.steps) {
    const tool = step.tool === undefined ? '' : ` ${step.tool}`;
    console.log(`  [${step.index}] ${step.kind}${tool} — ${step.summary.replace(/\s+/g, ' ').slice(0, 160)}`);
  }
}

function printRecipe(recipe: Recipe): void {
  console.log(`\nRecipe: ${recipe.title}`);
  console.log(`  hook (${recipe.hook.durationSec}s, ${recipe.hook.pattern}): ${recipe.hook.text}`);
  for (const beat of recipe.beats) {
    console.log(`  ${beat.kind} (${beat.durationSec}s): ${beat.script}`);
    console.log(`    visual: ${beat.visual}`);
  }
  console.log(`  caption: ${recipe.caption}`);
  console.log(`  audio: ${recipe.audio.direction} [${recipe.audio.rights}]`);
  const distance = recipe.provenance.abstractionDistance;
  console.log(`  provenance: ${recipe.provenance.referenceId}, distance ${distance.toFixed(2)}`);
  if (recipe.provenance.exclusions.length > 0) {
    for (const exclusion of recipe.provenance.exclusions) {
      console.log(`    excluded: ${exclusion.element} — ${exclusion.reason}`);
    }
  }
  if (recipe.selfCheck !== undefined) {
    console.log(
      `  self-check: voice ${recipe.selfCheck.brandVoiceMatch}, hook ${recipe.selfCheck.hookStrength}, claimsSubstantiated ${recipe.selfCheck.claimsSubstantiated}`,
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (options.url === undefined && options.evalCase === undefined) {
    usage();
    process.exitCode = 1;
    return;
  }

  const evalCase =
    options.evalCase === undefined ? undefined : cases.find((c) => c.id === options.evalCase);
  if (options.evalCase !== undefined && evalCase === undefined) {
    throw new Error(`Unknown eval case: ${options.evalCase}`);
  }

  if (process.env['ANTHROPIC_API_KEY'] === undefined || process.env['ANTHROPIC_API_KEY'] === '') {
    throw new Error('ANTHROPIC_API_KEY is required to run one request.');
  }

  const brandId = evalCase?.input.brandId ?? options.brandId;
  if (!Object.values(BRAND_IDS).includes(brandId as (typeof BRAND_IDS)[keyof typeof BRAND_IDS])) {
    throw new Error(
      `Unknown brand ${brandId}. Seeded brands: ${Object.values(BRAND_IDS).join(', ')}. ` +
        'Add a profile to packages/core/src/seed/brands.ts to introduce another.',
    );
  }

  const vision = createVisionAnalyzer({ fake: options.fakeVision });
  // The project folder is a mounted filesystem; SQLite locking is unreliable there,
  // so the default lives in the OS temp directory and can be overridden with --db.
  const dbPath = options.dbPath ?? process.env['TRY_ONE_DB'] ?? join(tmpdir(), 'mas-try-one.db');
  await mkdir(dirname(dbPath), { recursive: true });
  // Loaded lazily so `--help` and argument errors do not pay the node:sqlite startup.
  const { SqliteStore } = await import('@mas/core/adapters/sqlite');
  const store = new SqliteStore(dbPath);
  store.seedBrands();
  const brand: BrandProfile | null = await store.get(brandId);
  if (brand === null) throw new Error(`Seeded brand ${brandId} missing.`);

  const prompt = evalCase?.input.request ?? options.request ?? `clone this ${options.url ?? ''}`.trim();
  const runtime = createRuntime({
    brands: store,
    references: store,
    recipes: store,
    runs: store,
    vision,
    config: { ...loadConfig(), maxCostUsd: 2 },
    cwd: REPO_ROOT,
  });

  console.log(`Running one request — brand ${brand.name}, vision ${options.fakeVision ? 'FAKE (rehearsal)' : 'real'}`);
  const started = Date.now();
  const result = await runtime.run({
    prompt,
    workflow: { name: 'recipe-tracer', version: 'v0' },
    trigger: evalCase === undefined ? 'workbench' : 'eval',
    brandId,
    actor: { kind: 'system', id: 'try-one' },
  });
  const wallMs = Date.now() - started;

  console.log(`\nStatus: ${result.status} (${wallMs}ms, $${result.usage.costUsd.toFixed(4)})`);
  if (result.runId !== undefined) console.log(`Run: ${result.runId}`);
  printSteps(result);

  const recipes = await store.listRecipes(brandId, 1);
  const recipe = recipes[0];
  if (recipe === undefined) {
    console.log('\nNo recipe was persisted.');
  } else {
    printRecipe(recipe);
  }

  if (result.status !== 'succeeded') {
    console.log(`\nOutcome: ${result.outcome.reason}`);
    process.exitCode = 1;
  }

  if (evalCase !== undefined) {
    const artifact: CaseArtifact = {
      status: result.status,
      outcome: result.outcome,
      output: result.output ?? '',
      steps: result.steps.map((step) => ({
        kind: step.kind,
        summary: step.summary,
        ...(step.tool === undefined ? {} : { tool: step.tool }),
      })),
      recipe,
      analysis: analysisForUrl(options.url ?? ''),
      brand,
      request: prompt,
    };
    const evaluation = evaluateCase(evalCase, artifact, { rubric: false });
    console.log(`\nDeterministic rules for ${evalCase.id}:`);
    for (const expectation of evalCase.expectations) {
      if (expectation.kind === 'rubric') {
        console.log(`  SKIP  ${expectation.dimension} (rubric not implemented)`);
        continue;
      }
      const resultOfRule = evaluateRule(expectation.rule, artifact);
      console.log(`  ${resultOfRule.ok ? 'PASS' : 'FAIL'}  ${expectation.rule} — ${resultOfRule.observed}`);
    }
    for (const skip of evaluation.skipped) {
      console.log(`  SKIP  ${skip.expectation} — ${skip.reason}`);
    }
    if (!evaluation.passed) process.exitCode = 1;
  }

  store.close();
}

if (process.argv[1]?.endsWith('try-one.ts') === true) {
  main().catch((cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
