#!/usr/bin/env node
/**
 * Tests for the stage-naming rule.
 *
 * The stage order was written in four places — the site's STAGES list, the site
 * pages' own prose, each skill's title, and the cross-references inside the
 * skills — and no two of them agreed. The fix is one source plus this checker;
 * without the checker the rule drifts again, which it has already done twice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findStageNumbers } from './naming.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const check = () => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/naming.mjs'), 'check'])
  .then((r) => ({ code: 0, out: r.stdout + r.stderr }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

test('findStageNumbers catches every shape the drift has actually taken', () => {
  const text = [
    '# Stage 3 — It can be judged',
    'before stage 4 (shipping)',
    'ANB 阶段 2 覆盖这一步',
  ].join('\n');
  assert.deepEqual(findStageNumbers(text).map((h) => h.line), [1, 2, 3]);
  // 模式现在直接抓「阶段 N」，不再要求前缀是 ANB——管理页的寄存器表一度用
  // 「阶段 1」「阶段 2–5」标「谁写这一栏」，那同样是位置引用。
  assert.deepEqual(findStageNumbers(text).map((h) => h.snippet), ['Stage 3', 'stage 4', '阶段 2']);
});

test('findStageNumbers leaves the word "stage" alone when it is not a number', () => {
  assert.deepEqual(findStageNumbers('This is a later stage of the work.'), []);
  assert.deepEqual(findStageNumbers('a stage name, not a stage number'), []);
});

test('check: goes red on a skill that numbers a stage', async () => {
  const dir = join(ROOT, '.claude/skills/anb-naming-probe');
  const file = join(dir, 'SKILL.md');
  await mkdir(dir, { recursive: true });
  await writeFile(file, ['---', 'name: anb-naming-probe', '---', '', '# Probe', '', 'This runs at Stage 3.', ''].join('\n'), 'utf8');
  try {
    const { code, out } = await check();
    assert.equal(code, 1, 'a hardcoded stage number must fail the check, not warn');
    assert.match(out, /anb-naming-probe/);
    assert.match(out, /Stage 3/);
  } finally {
    await unlink(file).catch(() => {});
    await (await import('node:fs/promises')).rmdir(dir).catch(() => {});
  }
});
