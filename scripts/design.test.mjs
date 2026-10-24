#!/usr/bin/env node
/**
 * Tests for the design reader.
 *
 * The design stage's most valuable output is its refusal list — concrete input,
 * and what the product must do instead. The stage promises the verify stage will
 * turn each row into a check, and until now nothing read the file, so the promise
 * had no receiving end. These tests pin the two ways that reader could mislead:
 * reporting a skip as "nothing to refuse", and picking a record non-deterministically.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unlink, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sections } from './markdown.mjs';
import { pickLatest } from './design.mjs';
import { writeAndConfirm } from './test-fs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIRMED = join(ROOT, 'work/designs/confirmed');

const run = (args) => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/design.mjs'), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

test('sections does not truncate a filled block at its first blank line', () => {
  // The first version ended its pattern with `\s*$` under the `m` flag, so every
  // block was cut off at the blank line after its heading and four correctly
  // written design records were reported as empty.
  const secs = sections('## 一、流程形状\n\n固定两步。\n\n## 二、拒绝清单\n\n- 输入 A → 改成 B\n');
  assert.match(secs[0].body, /固定两步/);
  assert.match(secs[1].body, /输入 A → 改成 B/);
});

test('pickLatest takes the highest D number, not the first thing readdir returned', () => {
  assert.equal(pickLatest([{ id: 'D-002' }, { id: 'D-010' }, { id: 'D-003' }]), 'D-010');
  assert.equal(pickLatest([]), null);
});

test('refusals reports an explicit skip, never an empty list', async () => {
  const probe = join(CONFIRMED, 'D-901-skip-probe.md');
  await mkdir(CONFIRMED, { recursive: true });
  await writeAndConfirm(probe, [
    '---', 'id: D-901', 'title: probe', 'status: confirmed', '---',
    '## 一、流程形状', '', '固定两步。', '',
    '## 二、拒绝清单', '', '（跳过：只读，没有动作）', '',
    '## 三、动作权限', '', '（跳过：只读）', '',
    '## 四、交接契约', '', '（跳过：单一调用）', '',
    '## 什么情况说明这个设计错了', '', '拿不到真实输入时。', '',
  ].join('\n'));
  try {
    const { code, out } = await run(['refusals', 'D-901']);
    assert.equal(code, 0, out);
    assert.match(out, /跳过：只读，没有动作/);
    // 「跳过」与「没有要拒绝的」是相反的意思，绝不能混。
    assert.doesNotMatch(out, /没有要拒绝的/);
  } finally {
    await unlink(probe).catch(() => {});
  }
});

test('refusals prints each row of a real refusal list', async () => {
  const { code, out } = await run(['refusals', 'D-001']);
  assert.equal(code, 0, out);
  assert.match(out, /→/, 'each refusal row is an input and the behaviour that replaces it');
  assert.ok(out.split('\n').filter((l) => l.includes('→')).length >= 3,
    `expected several rows from D-001, got:\n${out}`);
});

test('latest exits 3 with a reason when nothing is confirmed', async () => {
  // 「没有设计」必须与「设计说不用拒绝」区分开，所以约定一个独立的退出码。
  const empty = await mkdtemp(join(tmpdir(), 'designs-'));
  try {
    const { code, out } = await run(['latest', '--dir', empty]);
    assert.equal(code, 3, `expected the "nothing to read" exit code, got ${code}:\n${out}`);
    assert.match(out, /no confirmed/i);
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});

test('latest picks the real record when several are confirmed', async () => {
  const a = join(CONFIRMED, 'D-901-aaa.md');
  const b = join(CONFIRMED, 'D-902-bbb.md');
  const fm = (id) => ['---', `id: ${id}`, 'title: probe', 'status: confirmed', '---', '## 一、流程形状', '', 'x', ''].join('\n');
  await mkdir(CONFIRMED, { recursive: true });
  await writeAndConfirm(a, fm('D-901'));
  await writeAndConfirm(b, fm('D-902'));
  try {
    const { code, out } = await run(['latest']);
    assert.equal(code, 0, out);
    assert.match(out.trim(), /D-902/);
  } finally {
    await unlink(a).catch(() => {});
    await unlink(b).catch(() => {});
  }
});
