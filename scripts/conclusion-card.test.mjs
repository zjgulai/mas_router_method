#!/usr/bin/env node
/**
 * Tests for the conclusion-card checker.
 *
 * The gap this closes: `verify-conclusion.mjs` asks "has this been falsified yet" and
 * says nothing about whether the card should exist. A claim of 更好的表现 passed it
 * clean, because a claim with no number has no falsification condition to fail.
 *
 * So every test here is one specific way a card looks finished and is not.
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
import { checkCard } from './conclusion-card.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/conclusion-card.mjs'), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

const good = (over = {}) => ({
  id: 'C1',
  claim: '控制促销与缺货后，声量每提升 10%，US 的 GMV 提升 1.7%',
  scope: 'US · 2025 年 52 周 · 母婴个护',
  interval: [0.012, 0.022],
  basis: ['A2+ v2', 'B1 v1', 'E-006'],
  conditions: ['ci-excludes-zero'],
  decision: '把 Q3 的社媒预算从 DE 挪 15% 到 US',
  status: 'active',
  ...over,
});

test('a real card passes', () => {
  assert.deepEqual(checkCard(good()), []);
});

test('a claim with no number fails — it cannot be wrong, so it cannot be checked', () => {
  const p = checkCard(good({ claim: '更好的表现' }));
  assert.ok(p.some((x) => /has no number/.test(x)), p.join('\n'));
  assert.ok(p.some((x) => /hedge/.test(x)), 'the hedge is also reported, not just the missing number');
});

test('a hedge in a quantified claim still fails — the number does not launder the adjective', () => {
  const p = checkCard(good({ claim: '声量提升 10% 后 GMV 可能有明显改善' }));
  assert.ok(p.some((x) => /hedge/.test(x)), p.join('\n'));
});

test('范围 without a time window fails — a region alone cannot be re-checked later', () => {
  const p = checkCard(good({ scope: 'US 和 DE' }));
  assert.ok(p.some((x) => /time window/.test(x)), p.join('\n'));
  // …while the same text with a window passes that field.
  assert.deepEqual(checkCard(good({ scope: 'US 和 DE · 2025 全年' })), []);
});

test('a point estimate in the interval field fails', () => {
  assert.ok(checkCard(good({ interval: 0.017 })).some((x) => /single number/.test(x)));
  assert.ok(checkCard(good({ interval: '1.7%' })).some((x) => /one number/.test(x)));
  // A pair written as a string is a real interval and must pass.
  assert.deepEqual(checkCard(good({ interval: '1.2%–2.2%' })), []);
});

test('a backwards interval fails', () => {
  assert.ok(checkCard(good({ interval: [0.022, 0.012] })).some((x) => /backwards/.test(x)));
});

test('依据 with no version or artefact fails — it is a link, not a path', () => {
  const p = checkCard(good({ basis: ['看了很多数据'] }));
  assert.ok(p.some((x) => /no version or traceable artefact/.test(x)), p.join('\n'));
});

test('没有证伪条件 fails, and an unregistered condition name fails differently', () => {
  assert.ok(checkCard(good({ conditions: [] })).some((x) => /cannot be overturned/.test(x)));
  const p = checkCard(good({ conditions: ['lag-has-peak', 'sounds-right'] }));
  assert.ok(p.some((x) => /not a registered condition/.test(x)), p.join('\n'));
  assert.ok(!p.some((x) => /lag-has-peak/.test(x)), 'a registered name must not be reported');
});

test('决策含义 that names a state of mind fails, and says why', () => {
  const p = checkCard(good({ decision: '有助于决策' }));
  assert.ok(p.some((x) => /state of mind/.test(x)), p.join('\n'));
  assert.ok(p.some((x) => /Name the thing someone does differently on Monday/.test(x)));
});

test('an empty card set is inconclusive, not a pass', async () => {
  const { code, out } = await withDoc({ conclusions: [] });
  assert.equal(code, 2, out);
  assert.match(out, /无法判断/);
});

test('the CLI exits 1 on an unpublishable card and names the field', async () => {
  const { code, out } = await withDoc({ conclusions: [good({ claim: '更好的表现' })] });
  assert.equal(code, 1, out);
  assert.match(out, /主张/);
});

/** Write a conclusions doc and run the CLI on it. */
async function withDoc(doc) {
  const dir = await mkdtemp(join(tmpdir(), 'card-'));
  try {
    const p = join(dir, 'cards.json');
    await writeAndConfirm(p, JSON.stringify(doc));
    return await run([p]);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
