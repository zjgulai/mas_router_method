#!/usr/bin/env node
/**
 * Tests for the §七 kill switch and the panel fit.
 *
 * These two gates decide whether the product ships at all, so the tests are about
 * the *verdict*, not the arithmetic: does a failing input actually fail, does an
 * unanswerable input refuse to answer, and does a crossing interval refuse to be
 * called a weak effect.
 *
 * The panel-fit tests use the demo panel, whose true β is planted. That is the
 * only way to check the estimator rather than check that it ran — a regression that
 * returns a plausible number for the wrong reason looks identical from the outside.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pearson, ci95, ols, tQuantile, tCdf } from './stats.mjs';
import { writeAndConfirm } from './test-fs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (script, args) => promisify(execFile)(process.execPath, [join(ROOT, `scripts/${script}`), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

async function withCsv(rows, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'panel-'));
  const path = join(dir, 'data.csv');
  try {
    await writeAndConfirm(path, rows.join('\n') + '\n');
    return await fn(path);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

// ── stats ────────────────────────────────────────────────────────────────────

test('pearson is NaN on a flat series, not 0', () => {
  // 0 would describe a region with no variation as the region whose variation is
  // independent — i.e. as the one that saves the design.
  assert.ok(Number.isNaN(pearson([1, 1, 1, 1], [1, 2, 3, 4])));
  assert.ok(Number.isNaN(pearson([1, 2, 3], [5, 5, 5])));
  assert.equal(pearson([1, 2, 3], [2, 4, 6]).toFixed(6), '1.000000');
  assert.equal(pearson([1, 2, 3], [6, 4, 2]).toFixed(6), '-1.000000');
});

test('t quantiles match the table at the degrees of freedom this product uses', () => {
  // df 10 is the panel fit's actual residual df at 2×12 with fixed effects.
  assert.ok(Math.abs(tQuantile(0.975, 10) - 2.228) < 0.001, `got ${tQuantile(0.975, 10)}`);
  assert.ok(Math.abs(tQuantile(0.975, 30) - 2.042) < 0.001);
  assert.ok(Math.abs(tCdf(2.228, 10) - 0.975) < 0.0005);
});

test('ci95 contains the estimate and widens as df falls', () => {
  const wide = ci95(0.5, 0.1, 5);
  const narrow = ci95(0.5, 0.1, 100);
  assert.ok(wide[0] < 0.5 && wide[1] > 0.5);
  assert.ok(wide[1] - wide[0] > narrow[1] - narrow[0]);
});

test('ols recovers a known slope and refuses a singular design', () => {
  const X = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5]];
  const y = [2, 4, 6, 8, 10];
  const fit = ols(X, y);
  assert.ok(Math.abs(fit.beta[1] - 2) < 1e-9);
  assert.ok(Math.abs(fit.r2 - 1) < 1e-9);
  assert.throws(() => ols([[1, 2], [1, 2], [1, 2]], [1, 2, 3]), /singular/);
});

// ── §七 ──────────────────────────────────────────────────────────────────────

test('§七 fails when regions move together — and the demo says so', async () => {
  const { code, out } = await run('region-corr.mjs', ['--demo']);
  assert.equal(code, 1, out);
  assert.match(out, /识别不成立/);
  assert.match(out, /max \|r\|/);
});

test('§七 passes on independently varying regions', async () => {
  /*
   * Hand-chosen cycles, not a random draw.
   *
   * The first version drew pseudo-random numbers and landed at max |r| = 0.537 —
   * the boundary band — so the test was asserting something about the seed, not
   * about the verdict. The second used phase-shifted sines over 16 weeks, and at a
   * period of one and a half weeks those are anticorrelated at -0.5 by construction:
   * a short cycle sampled weekly produces swings, not independence.
   *
   * Three cycles of different and coprime lengths (5, 7, 11) sample independently
   * over 16 weeks. Verified: pairwise |r| ≈ 0.27 / 0.13 / 0.38.
   */
  const rows = ['week,region,value'];
  const shape = {
    US: (w) => 100 + (w % 5) * 10,
    DE: (w) => 100 + ((w * 3) % 7) * 9,
    JP: (w) => 100 + ((w * 5) % 11) * 7,
  };
  for (let w = 0; w < 16; w++) {
    for (const [r, fn] of Object.entries(shape)) {
      rows.push(`2025-W${String(w + 1).padStart(2, '0')},${r},${fn(w)}`);
    }
  }
  const { code, out } = await withCsv(rows, (p) => run('region-corr.mjs', [p]));
  assert.equal(code, 0, out);
  assert.match(out, /面板识别成立/);
});

test('§七 in the boundary band passes but carries the limitation forward', async () => {
  // r ≈ 0.65: too correlated to ignore, not correlated enough to stop.
  const rows = ['week,region,value'];
  for (let w = 0; w < 12; w++) {
    const common = 100 + w * 5;
    rows.push(`2025-W${String(w + 1).padStart(2, '0')},US,${common}`);
    rows.push(`2025-W${String(w + 1).padStart(2, '0')},DE,${Math.round(common * 0.7 + (w % 3) * 30)}`);
  }
  const { code, out } = await withCsv(rows, (p) => run('region-corr.mjs', [p]));
  assert.equal(code, 0, out);
  assert.match(out, /有效变异有限/);
});

test('§七 is inconclusive on one fetch batch per region — interaction counts grow with post age', async () => {
  const rows = ['week,region,value,batch'];
  for (let w = 0; w < 12; w++) {
    rows.push(`2025-W${String(w + 1).padStart(2, '0')},US,${100 + w * 3},b1`);
    rows.push(`2025-W${String(w + 1).padStart(2, '0')},DE,${90 + w * 2},b2`);
  }
  const { code, out } = await withCsv(rows, (p) => run('region-corr.mjs', [p]));
  assert.equal(code, 2, out);
  assert.match(out, /2 fetch batches/);
});

test('§七 is inconclusive on too few weeks rather than computing a number nobody should trust', async () => {
  const rows = ['week,region,value'];
  for (let w = 0; w < 3; w++) {
    rows.push(`2025-W0${w + 1},US,${100 + w}`);
    rows.push(`2025-W0${w + 1},DE,${90 + w * 7}`);
  }
  const { code, out } = await withCsv(rows, (p) => run('region-corr.mjs', [p]));
  assert.equal(code, 2, out);
  assert.match(out, /at least 8 common weeks/);
});

test('§七 is inconclusive on a flat region, and says why that matters', async () => {
  const rows = ['week,region,value'];
  for (let w = 0; w < 12; w++) {
    rows.push(`2025-W${String(w + 1).padStart(2, '0')},US,${100 + w * 5}`);
    rows.push(`2025-W${String(w + 1).padStart(2, '0')},DE,50`);
  }
  const { code, out } = await withCsv(rows, (p) => run('region-corr.mjs', [p]));
  assert.equal(code, 2, out);
  assert.match(out, /flat series/);
});

// ── panel fit ────────────────────────────────────────────────────────────────

test('panel fit recovers the demo\'s planted β with an interval that excludes 0', async () => {
  const { code, out } = await run('panel-fit.mjs', ['--demo']);
  assert.equal(code, 0, out);
  assert.match(out, /β = 0\.3\d/);
  assert.match(out, /结论成立/);
  assert.match(out, /association between regional variation, not a causal effect/);
});

test('panel fit drops a zero-variance control and says so — a control that never moved controls for nothing', async () => {
  const { code, out } = await run('panel-fit.mjs', ['--demo']);
  assert.equal(code, 0, out);
  assert.match(out, /dropped "promo"/);
  assert.match(out, /no identifying power/);
});

test('a crossing interval is 无结论 with exit 3, never 效应弱', async () => {
  // Volume carries no information about GMV: the slope is 0 up to noise.
  const rows = ['week,region,volume,gmv'];
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let w = 0; w < 12; w++) {
    for (const r of ['US', 'DE']) {
      const volume = Math.round(100 * (1 + rnd()));
      const gmv = Math.round(1000 * (1 + rnd() * 0.4));
      rows.push(`2025-W${String(w + 1).padStart(2, '0')},${r},${volume},${gmv}`);
    }
  }
  const { code, out } = await withCsv(rows, (p) => run('panel-fit.mjs', [p]));
  assert.equal(code, 3, `expected the 无结论 exit code, got ${code}:\n${out}`);
  assert.match(out, /无结论/);
  assert.match(out, /这不是「效应弱」/);
});

test('panel fit is inconclusive when volume does not vary within any week', async () => {
  // The §七 failure arriving as a singular matrix; the message must name the cause.
  const rows = ['week,region,volume,gmv'];
  for (let w = 0; w < 12; w++) {
    rows.push(`2025-W${String(w + 1).padStart(2, '0')},US,${100 + w * 4},${1000 + w * 50}`);
    rows.push(`2025-W${String(w + 1).padStart(2, '0')},DE,${100 + w * 4},${900 + w * 45}`);
  }
  const { code, out } = await withCsv(rows, (p) => run('panel-fit.mjs', [p]));
  assert.equal(code, 2, out);
  assert.match(out, /absorb the whole regressor/);
});
