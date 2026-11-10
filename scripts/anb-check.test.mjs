#!/usr/bin/env node
/**
 * anb-check 的测试。
 *
 * 这些测试的职责不是证明脚本"能跑"，而是证明它**会在该红的时候红**：
 * 一个永远返回 0 的回报校验器，比没有校验器更糟——它给了一个"已核对"的错觉。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'scripts/anb-check.mjs');
const run = (...args) =>
  promisify(execFile)(process.execPath, [CLI, ...args])
    .then((r) => ({ code: 0, out: r.stdout }))
    .catch((e) => ({ code: e.code, out: e.stdout ?? '' }));

async function fixture(text) {
  const dir = await mkdtemp(join(tmpdir(), 'anb-check-'));
  const file = join(dir, 'x.txt');
  await writeFile(file, text, 'utf8');
  return { dir, file };
}

test('count: 一行一个匹配时，两种数法一致', async () => {
  const { dir, file } = await fixture('a\nrow b\nrow c\n');
  const r = await run('count', file, '--pattern', '^row');
  assert.equal(r.code, 0);
  assert.match(r.out, /Method A: .*= 2/);
  assert.match(r.out, /Method B: .*= 2/);
  await rm(dir, { recursive: true, force: true });
});

test('count: 一行多个匹配时，行数与次数不等，必须报不一致', async () => {
  // 这就是 grep -c 的陷阱：三行，五个匹配。
  const { dir, file } = await fixture('x x\nx\nx x\n');
  const r = await run('count', file, '--pattern', 'x');
  assert.equal(r.code, 1);
  assert.match(r.out, /Method A: .*= 3/);
  assert.match(r.out, /Method B: .*= 5/);
  assert.match(r.out, /Agree: .*no/);
  await rm(dir, { recursive: true, force: true });
});

test('reconcile: 分项之和等于总数时通过', async () => {
  const r = await run('reconcile', '--total', '10', '--parts', '3,3,4');
  assert.equal(r.code, 0);
});

test('reconcile: 分项之和与总数不符时失败，并给出差额', async () => {
  const r = await run('reconcile', '--total', '108', '--parts', '19,24,17');
  assert.equal(r.code, 1);
  assert.match(r.out, /差 48/);
});

test('report: 自洽的 count 回报通过', async () => {
  const { dir, file } = await fixture(
    '> Counting: `rows`. Method A: `grep -c x f` = 7. Method B: `grep -o x f | wc -l` = 7. Agree: `yes`.',
  );
  const r = await run('report', file);
  assert.equal(r.code, 0);
  await rm(dir, { recursive: true, force: true });
});

test('report: Agree 与两个数矛盾时必须失败', async () => {
  // 写成 yes 但两个数不同——这正是"报告看起来完整，结论却是假的"。
  const { dir, file } = await fixture(
    '> Counting: `rows`. Method A: `a` = 7. Method B: `b` = 108. Agree: `yes`.',
  );
  const r = await run('report', file);
  assert.equal(r.code, 1);
  assert.match(r.out, /按定义应为 no/);
  await rm(dir, { recursive: true, force: true });
});

test('report: 认不出的格式返回 2，不是 0', async () => {
  const { dir, file } = await fixture('一切正常，全部通过。');
  const r = await run('report', file);
  assert.equal(r.code, 2);
  await rm(dir, { recursive: true, force: true });
});
