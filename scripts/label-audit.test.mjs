#!/usr/bin/env node
/**
 * Tests for the labelling audit.
 *
 * The failures this file pins are the ones a single accuracy number hides:
 *
 *   · a labeller that answers the majority class gets high accuracy and zero skill;
 *   · a labeller whose high-confidence answers are its worst has an inverted signal,
 *     which quietly breaks every downstream threshold;
 *   · a gold set with one class, or thirty rows, produces a number that looks like a
 *     measurement and is not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeAndConfirm } from './test-fs.mjs';
import { cohenKappa } from './label-audit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/label-audit.mjs'), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

const csv = (rows) => 'id,gold,predicted,confidence\n'
  + rows.map((r, i) => `${r.id ?? 'r' + i},${r.gold},${r.predicted},${r.confidence}`).join('\n') + '\n';

async function audit(rows) {
  const dir = await mkdtemp(join(tmpdir(), 'label-'));
  try {
    const p = join(dir, 'gold.csv');
    await writeAndConfirm(p, csv(rows));
    const { code, out } = await run([p, '--json']);
    return { code, json: JSON.parse(out) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

/** n perfectly-labelled rows, split across two classes, confidence high. */
const clean = (n = 60) => Array.from({ length: n }, (_, i) => ({
  id: 'c' + i, gold: i % 2 ? 'positive' : 'negative',
  predicted: i % 2 ? 'positive' : 'negative', confidence: 0.9,
}));

test('Kappa is 1 for perfect agreement and 0 for chance-level agreement', () => {
  const perfect = [{ gold: 'a', predicted: 'a' }, { gold: 'b', predicted: 'b' }];
  assert.equal(cohenKappa(perfect).toFixed(6), '1.000000');
  // Symmetric disagreement: agreement equals what chance would give.
  const chance = [
    { gold: 'a', predicted: 'a' }, { gold: 'a', predicted: 'b' },
    { gold: 'b', predicted: 'a' }, { gold: 'b', predicted: 'b' },
  ];
  assert.equal(cohenKappa(chance).toFixed(6), '0.000000');
});

test('Kappa is NaN, not 0, when it is undefined — 0 is a finding, undefined is not', () => {
  assert.ok(Number.isNaN(cohenKappa([{ gold: 'a', predicted: 'a' }, { gold: 'a', predicted: 'a' }])),
    'one class on both sides makes Kappa undefined');
  assert.ok(Number.isNaN(cohenKappa([])));
});

test('a clean set passes', async () => {
  const { code, json } = await audit(clean());
  assert.equal(json.verdict, 'passed', JSON.stringify(json, null, 2));
  assert.equal(code, 0);
});

test('always answering the majority class gets high accuracy and near-zero Kappa', async () => {
  // 80% one class: accuracy 80%, Kappa 0. This is the case a naive report calls fine.
  const rows = Array.from({ length: 100 }, (_, i) => ({
    gold: i % 5 === 0 ? 'negative' : 'positive',
    predicted: 'positive', confidence: 0.9,
  }));
  const { code, json } = await audit(rows);
  assert.ok(json.accuracy >= 0.7, `accuracy ${json.accuracy} should look fine`);
  assert.ok(json.kappa < 0.6, `Kappa ${json.kappa} must expose it`);
  assert.equal(json.verdict, 'failed');
  assert.equal(code, 1);
});

test('inverted confidence fails even when accuracy and Kappa are fine', async () => {
  // 40 rows: low band all correct, high band all wrong. Accuracy 50%… we need accuracy
  // and Kappa above their floors, so make the low band large enough to carry it.
  const rows = [];
  for (let i = 0; i < 120; i++) {
    const gold = i % 2 ? 'positive' : 'negative';
    rows.push({ id: 'lo' + i, gold, predicted: gold, confidence: 0.4 });
  }
  for (let i = 0; i < 20; i++) {
    const gold = i % 2 ? 'positive' : 'negative';
    rows.push({ id: 'hi' + i, gold, predicted: gold === 'positive' ? 'negative' : 'positive', confidence: 0.95 });
  }
  const { code, json } = await audit(rows);
  assert.ok(json.accuracy >= 0.7, `accuracy ${json.accuracy}`);
  assert.ok(json.kappa >= 0.6, `Kappa ${json.kappa}`);
  assert.equal(json.confidenceInverted, true);
  assert.equal(json.verdict, 'failed', 'a set that is otherwise fine must still fail on inversion');
  assert.equal(code, 1);
  assert.match(json.failures.join('\n'), /inverted/);
});

test('a single-class gold set is inconclusive, not failed and not passed', async () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    gold: 'positive', predicted: i % 3 ? 'positive' : 'negative', confidence: 0.9,
  }));
  const { code, json } = await audit(rows);
  assert.equal(json.verdict, 'inconclusive', JSON.stringify(json.blockers, null, 2));
  assert.equal(code, 2);
  assert.match(json.blockers.join('\n'), /single class/);
});

test('too few rows is inconclusive — twenty rows cannot carry two decimals', async () => {
  const { code, json } = await audit(clean(20));
  assert.equal(json.verdict, 'inconclusive');
  assert.equal(code, 2);
  assert.match(json.blockers.join('\n'), /below 30/);
});

test('a gold set below the design\'s 200 is computed but flagged, and still exits 0 when clean', async () => {
  const { code, json } = await audit(clean(60));
  assert.equal(code, 0);
  assert.equal(json.recommendedRows, 200);
  assert.ok(json.n < json.recommendedRows);
  const { out } = await (async () => {
    const dir = await mkdtemp(join(tmpdir(), 'label-'));
    try {
      const p = join(dir, 'gold.csv');
      await writeAndConfirm(p, csv(clean(60)));
      return await run([p]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  })();
  assert.match(out, /first look, not a verdict you should cite/);
});

test('a malformed confidence is skipped and reported, not silently treated as 1', async () => {
  const rows = [...clean(40), { id: 'bad', gold: 'positive', predicted: 'positive', confidence: 'high' }];
  const { json } = await audit(rows);
  assert.equal(json.problems.length, 1);
  assert.match(json.problems[0], /not a number in 0–1/);
});

test('the demo shows all three signals at once, which is what makes it a fixture', async () => {
  const { code, out } = await run(['--demo']);
  assert.equal(code, 1);
  assert.match(out, /accuracy/);
  assert.match(out, /Kappa/);
  assert.match(out, /按置信度分层/);
  assert.match(out, /confidence is inverted/);
});
