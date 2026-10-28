#!/usr/bin/env node
/**
 * Tests for the conclusion skill's claims.
 *
 * The claim this skill is built on is a division of labour: two checkers, two different
 * questions, and neither answers the other's. That claim is only worth making if it is
 * demonstrated, so the central test runs both checkers on the same card — one says
 * "全部成立" and the other reports eight problems.
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
const SKILL = join(ROOT, '.claude/skills/anb-data-conclude/SKILL.md');
const run = (script, args) => promisify(execFile)(process.execPath, [join(ROOT, `scripts/${script}`), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

/** A card that is empty in every field the card checker cares about, yet passes verify. */
const hollow = {
  conclusions: [{
    id: 'C9', claim: '更好的表现', scope: '全部市场', interval: 0.017,
    basis: ['看了很多数据'], conditions: ['ci-excludes-zero'], decision: '有助于决策',
    status: 'active', data: { beta_ci: [0.012, 0.022] },
  }],
};

async function withDoc(doc) {
  const dir = await mkdtemp(join(tmpdir(), 'skill-concl-'));
  try {
    const p = join(dir, 'cards.json');
    await writeAndConfirm(p, JSON.stringify(doc));
    return p;
  } catch (e) { await rm(dir, { recursive: true, force: true }); throw e; }
}

test('the skill names both checkers and says they answer different questions', async () => {
  const text = await readFile(SKILL, 'utf8');
  assert.match(text, /scripts\/conclusion-card\.mjs/);
  assert.match(text, /scripts\/verify-conclusion\.mjs/);
  assert.match(text, /它们是两个问题，不是一个/);
});

test('the central claim: verify says 全部成立 while the card checker reports eight problems', async () => {
  const p = await withDoc(hollow);
  const dir = dirname(p);
  try {
    const verify = await run('verify-conclusion.mjs', [p]);
    assert.equal(verify.code, 0, verify.out);
    assert.match(verify.out, /全部成立/);

    const card = await run('conclusion-card.mjs', [p]);
    assert.equal(card.code, 1, card.out);
    const problems = (card.out.match(/•/g) ?? []).length;
    assert.equal(problems, 8, `the skill says eight problems; the checker reports ${problems}:\n${card.out}`);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the skill says a 无法判断 from verify is exit 2 and is not a pass', async () => {
  const p = await withDoc({
    conclusions: [{
      id: 'C1', claim: '声量每提升 10%，US 的 GMV 提升 1.7%', scope: 'US · 2025 年 52 周',
      interval: [0.012, 0.022], basis: ['A2+ v2'], conditions: ['region-coverage-sufficient'],
      decision: '把预算从 DE 挪 15% 到 US', status: 'active', data: {},
    }],
  });
  const dir = dirname(p);
  try {
    const { code, out } = await run('verify-conclusion.mjs', [p]);
    assert.equal(code, 2, out);
    assert.match(out, /This is not a pass/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the skill lists which conditions each of C1–C4 needs, and every name is registered', async () => {
  const text = await readFile(SKILL, 'utf8');
  // Only the names the skill presents as registered conditions are asserted. A regex
  // sweep over every backticked token was the first attempt and it was tautological —
  // written as a ternary that always returned true, so it certified nothing. Deleted
  // rather than kept as decoration: a test that cannot fail is the exact defect this
  // repo is built around catching.
  const { CONDITIONS } = await import('./conclusion-conditions.mjs');
  for (const required of ['lag-has-peak', 'no-uncontrolled-events', 'ci-excludes-zero', 'budget-has-variation']) {
    assert.ok(required in CONDITIONS, `the skill names ${required}, which is not registered`);
  }
});

test('the skill says lag-has-peak was added because C2 could not be checked — that must stay true', async () => {
  const text = await readFile(SKILL, 'utf8');
  assert.match(text, /lag-has-peak.*是补上的/s);
  const { CONDITIONS } = await import('./conclusion-conditions.mjs');
  assert.ok('lag-has-peak' in CONDITIONS);
});

test('the skill points at the known gap: work check does not validate work/conclusions', async () => {
  const text = await readFile(SKILL, 'utf8');
  assert.match(text, /已知缺口/);
  const layers = await readFile(join(ROOT, 'docs/product/data-product-layers.md'), 'utf8');
  assert.match(layers, /conclusion-card/);
});
