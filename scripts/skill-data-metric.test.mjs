#!/usr/bin/env node
/**
 * Tests for the metric-layer skill's claims.
 *
 * A skill that describes a checker has to describe it *correctly* — otherwise it
 * teaches a boundary that does not exist, and the person trusts a green run that
 * never checked the thing the skill said it checked.
 *
 * So this file tests the claims the skill makes about `metric-card.mjs`, by running
 * the checker on inputs built to sit on each side of the line. If the checker's
 * behaviour changes, this fails and the skill has to be rewritten with it.
 *
 * The central claim: **eight fields filled in does not mean the definition is
 * meaningful.** A metric that divides GMV by mentions and multiplies by engagement
 * passes. The skill says so plainly, and that sentence has to stay true.
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
const SKILL = join(ROOT, '.claude/skills/anb-data-metric/SKILL.md');
const run = (args) => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/metric-card.mjs'), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

const card = (over = {}) => {
  const f = {
    指标名: '声量效率',
    可执行定义: '用总 GMV 除以总提及量，再乘上平均互动率，按区域汇总并去重。',
    粒度: '区域 × 周。',
    单位: '元。',
    数据源: 'ERP 的订单表，与 ledger.jsonl 的 observation 行。',
    口径版本: 'v1',
    已知偏差: '两个数都可能有误差，比值会放大误差，所以只能看趋势不能看绝对值。',
    什么时候不可用: '两个源的时间窗不一致时，这个数不与上一期比较。',
    ...over,
  };
  return Object.entries(f).map(([k, v]) => `## ${k}\n\n${v}\n`).join('\n');
};

async function check(text) {
  const dir = await mkdtemp(join(tmpdir(), 'skill-metric-'));
  try {
    await writeAndConfirm(join(dir, 'card.md'), text);
    return await run(['check', dir]);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('the skill exists and names the checker it describes', async () => {
  const text = await readFile(SKILL, 'utf8');
  assert.match(text, /scripts\/metric-card\.mjs/);
  // The three commands the skill tells a person to run.
  assert.match(text, /metric-card\.mjs check/);
  assert.match(text, /metric-card\.mjs new/);
});

test("the skill's central claim is still true: a cross-layer ratio passes the checker", async () => {
  // This is the claim the skill is built around. If the checker ever learns to catch
  // this, the skill's "the checker cannot see this" table becomes a lie — and a skill
  // that over-claims what is checked is worse than one that claims nothing.
  const { code, out } = await check(card());
  assert.equal(code, 0, `the checker now rejects the cross-layer ratio:\n${out}`);
});

test('the skill says which eight fields exist, and the checker agrees', async () => {
  const text = await readFile(SKILL, 'utf8');
  for (const field of ['指标名', '可执行定义', '粒度', '单位', '数据源', '口径版本', '已知偏差', '什么时候不可用']) {
    assert.ok(text.includes(field), `the skill does not mention 「${field}」`);
  }
  // Dropping any one of them must fail — otherwise the skill is describing a rule
  // that is not enforced.
  const { code } = await check(card().replace(/## 已知偏差[\s\S]*?(?=## )/, ''));
  assert.equal(code, 1, 'a card missing 已知偏差 passed, so the skill overstates the check');
});

test('the skill\'s two extra sections do not break the checker', async () => {
  // The skill tells a person to add 「和谁一起看才有意义」 and 「版本记录」. If those
  // broke validation, following the skill would fail its own gate.
  const { code, out } = await check(card() + '\n## 和谁一起看才有意义\n\n不适用：本指标不参与任何比值。\n'
    + '\n## 版本记录\n\n| 版本 | 什么时候 | 改了什么 | 旧数据 |\n|---|---|---|---|\n| v1 | 2026-10-28 | 初版 | — |\n');
  assert.equal(code, 0, out);
});

test("the skill's claim that 「无」 is rejected for 已知偏差 is true", async () => {
  const { code, out } = await check(card({ 已知偏差: '无' }));
  assert.equal(code, 1, 'the checker now accepts 「无」, so the skill is wrong about this');
  assert.match(out, /value, not a definition/);
});

test('the skill says a date-shaped 口径版本 is rejected — verify that', async () => {
  const { code } = await check(card({ 口径版本: '2026-10-28' }));
  // A bare date contains digits, so it passes the version-number test. The skill's
  // claim is narrower than "the checker rejects dates" — it says a date cannot be
  // compared. Keeping this test documents the boundary rather than pretending.
  const text = await readFile(SKILL, 'utf8');
  assert.match(text, /口径版本当成发布日期/, 'the skill no longer warns about this');
  assert.equal(code, 0, 'if the checker started rejecting dates, the skill should say so');
});
