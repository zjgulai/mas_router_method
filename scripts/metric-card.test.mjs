#!/usr/bin/env node
/**
 * Tests for the metric card validator.
 *
 * The interesting case is the template. A card made of eight copied headings is the
 * shape a validator with no content rules certifies, and it is exactly what a person
 * in a hurry produces. So the template must fail its own check — that test comes
 * first, before any test of a real card.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeAndConfirm } from './test-fs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/metric-card.mjs'), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

async function checkCard(text) {
  const dir = await mkdtemp(join(tmpdir(), 'metric-'));
  try {
    await writeAndConfirm(join(dir, 'card.md'), text);
    return await run(['check', dir]);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

const card = (over = {}) => {
  const fields = {
    指标名: 'A1 提及量',
    可执行定义: '按源 × 区域 × 周统计去重后的帖子数，去重键为内容指纹。',
    粒度: '区域 × 周，去重后。',
    单位: '条。不含转发与原帖的重复计。',
    数据源: 'ledger.jsonl 的 observation 行，按 first_seen_at 归周。',
    口径版本: 'v1',
    已知偏差: '已删内容永久缺失，使早期周系统性偏低，且越早偏低越多。',
    什么时候不可用: '跨源去重阈值未标定时，不与上一期比较。',
    ...over,
  };
  return Object.entries(fields).map(([k, v]) => `## ${k}\n\n${v}\n`).join('\n');
};

test('the template fails its own check — eight copied headings certify nothing', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [join(ROOT, 'scripts/metric-card.mjs'), 'new', 'X']);
  const { code, out } = await checkCard(stdout);
  assert.equal(code, 1, out);
  assert.match(out, /still holds the template's placeholder/);
});

test('a real card passes', async () => {
  const { code, out } = await checkCard(card());
  assert.equal(code, 0, out);
});

test('a missing field names itself', async () => {
  const text = card().replace(/## 已知偏差[\s\S]*?(?=## )/, '');
  const { code, out } = await checkCard(text);
  assert.equal(code, 1, out);
  assert.match(out, /no 「已知偏差」 section/);
});

test('“无” is not an answer for 已知偏差 — every metric is wrong in some way', async () => {
  const { code, out } = await checkCard(card({ 已知偏差: '无' }));
  assert.equal(code, 1, out);
  assert.match(out, /that is a value, not a definition/);
});

test('“暂无” is not an answer for 什么时候不可用', async () => {
  const { code, out } = await checkCard(card({ 什么时候不可用: '暂无' }));
  assert.equal(code, 1, out);
  assert.match(out, /什么时候不可用/);
});

test('a 已知偏差 too short to name a condition fails', async () => {
  const { code, out } = await checkCard(card({ 已知偏差: '偏低一点' }));
  assert.equal(code, 1, out);
  assert.match(out, /too short to name a condition/);
});

test('a value word in 可执行定义 fails', async () => {
  const { code, out } = await checkCard(card({ 可执行定义: '按情况' }));
  assert.equal(code, 1, out);
  assert.match(out, /可执行定义/);
});

test('a 口径版本 with no version number cannot be compared across periods', async () => {
  const { code, out } = await checkCard(card({ 口径版本: '最新' }));
  assert.equal(code, 1, out);
  assert.match(out, /no version number/);
  // …while the ordinals people actually write are accepted.
  assert.equal((await checkCard(card({ 口径版本: 'v2.1' }))).code, 0);
  assert.equal((await checkCard(card({ 口径版本: '3' }))).code, 0);
});

test('a field that only restates its own heading fails', async () => {
  const { code, out } = await checkCard(card({ 粒度: '粒度' }));
  assert.equal(code, 1, out);
  assert.match(out, /restates its own name/);
});

test('the repo\'s committed cards all pass', async () => {
  const { code, out } = await run(['check']);
  assert.equal(code, 0, out);
});
