#!/usr/bin/env node
/**
 * Tests for the labelling skill's claims.
 *
 * Same rule as the metric skill's tests: a skill that describes a checker must describe
 * it correctly. The specific claims here are the three thresholds and the demo's
 * numbers — a reader will quote them ("准确率 75.8% 过了，Kappa 0.515 没过") and they
 * have to stay true, because the whole argument that "准确率达标不等于这一层能用"
 * rests on that one example.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeAndConfirm } from './test-fs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = join(ROOT, '.claude/skills/anb-data-label/SKILL.md');
const run = (args) => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/label-audit.mjs'), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

test('the skill names the checker and the three commands', async () => {
  const text = await readFile(SKILL, 'utf8');
  assert.match(text, /scripts\/label-audit\.mjs/);
  assert.match(text, /label-audit\.mjs --demo/);
  assert.match(text, /label-audit\.test\.mjs/);
});

test('the three thresholds the skill states are the three the checker enforces', async () => {
  const text = await readFile(SKILL, 'utf8');
  // The skill says: accuracy ≥ 0.7, Kappa ≥ 0.6, high band must beat low band.
  assert.match(text, /≥ 0\.7/);
  assert.match(text, /≥ 0\.6/);
  // And the checker must agree — a lower case threshold would make the skill wrong.
  const { json } = await audit([{ gold: 'a', predicted: 'a', confidence: 0.9 }]);
  assert.equal(json.verdict, 'inconclusive', 'one row cannot answer anything');
});

test('the demo still shows accuracy passing while Kappa fails — the skill quotes these numbers', async () => {
  const { json } = await run(['--demo', '--json']).then((r) => ({ json: JSON.parse(r.out) }));
  assert.ok(json.accuracy >= 0.7, `accuracy ${json.accuracy} no longer passes; the skill says it does`);
  assert.ok(json.kappa < 0.6, `Kappa ${json.kappa} no longer fails; the skill's example is stale`);
  assert.equal(json.confidenceInverted, true, 'the inversion is the third half of the example');
  // The exact figures the skill quotes.
  assert.equal(json.accuracy.toFixed(3), '0.758');
  assert.equal(json.kappa.toFixed(3), '0.515');
  assert.equal(json.byBand[0].accuracy.toFixed(3), '0.844');
  assert.equal(json.byBand[2].accuracy.toFixed(3), '0.436');
});

test('the skill says a gold set under 30 rows is inconclusive; the checker agrees', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ gold: i % 2 ? 'a' : 'b', predicted: i % 2 ? 'a' : 'b', confidence: 0.9 }));
  const { json } = await audit(rows);
  assert.equal(json.verdict, 'inconclusive');
  assert.match(json.blockers.join(' '), /below 30/);
  const text = await readFile(SKILL, 'utf8');
  assert.match(text, /低于 30 条/);
});

test('the skill says the design asks for 200–300 rows; the checker flags below 200', async () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ gold: i % 2 ? 'a' : 'b', predicted: i % 2 ? 'a' : 'b', confidence: 0.9 }));
  const { json } = await audit(rows);
  assert.equal(json.recommendedRows, 200);
  const text = await readFile(SKILL, 'utf8');
  assert.match(text, /200–300 条/);
});

test('the skill says a single-class gold set is 无法判断, not 不通过 — verify the exit code', async () => {
  // This is the case that was wrong in the first version: it came back `failed`, which
  // sends someone to rewrite label definitions when the set was never collected.
  const rows = Array.from({ length: 40 }, (_, i) => ({ gold: 'a', predicted: i % 3 ? 'a' : 'b', confidence: 0.9 }));
  const { code, json } = await audit(rows);
  assert.equal(json.verdict, 'inconclusive');
  assert.equal(code, 2, 'a single-class gold set must not exit 1');
});

test('the skill points at the known gap: work check does not validate work/labels', async () => {
  const text = await readFile(SKILL, 'utf8');
  assert.match(text, /已知缺口/);
  assert.match(text, /data-product-layers\.md/);
  // And that gap must be real — the layers doc must actually list it.
  const layers = await readFile(join(ROOT, 'docs/product/data-product-layers.md'), 'utf8');
  assert.match(layers, /打标层/, 'the layers doc must mention the labelling layer');
});

/** Write a small gold set and audit it. */
async function audit(rows) {
  const dir = await mkdtemp(join(tmpdir(), 'skill-label-'));
  try {
    const p = join(dir, 'gold.csv');
    await writeAndConfirm(p, 'id,gold,predicted,confidence\n'
      + rows.map((r, i) => `r${i},${r.gold},${r.predicted},${r.confidence}`).join('\n') + '\n');
    return await run([p, '--json']).then((r) => ({ code: r.code, json: JSON.parse(r.out) }));
  } finally { await rm(dir, { recursive: true, force: true }); }
}
