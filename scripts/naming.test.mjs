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
import { unlink, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findStageNumbers, scan } from './naming.mjs';
import { writeAndConfirm } from './test-fs.mjs';

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

test('live: nothing in the repo restates the stage order as a number', async () => {
  // 这条断言在 Task 2 里被有意推迟到这里：校验器接进 CI 的那一刻起，仓库就必须已经合规，
  // 否则 CI 会红着跨两个提交。规则先落地、合规后落地，每个提交都是绿的。
  const { files, hits } = await scan();
  assert.ok(files.length >= 20, `expected to scan the skills and the site, got ${files.length} files`);
  assert.deepEqual(
    hits,
    [],
    `hardcoded stage numbers:\n${hits.map((h) => `  ${h.file}:${h.line}: ${h.snippet}`).join('\n')}`,
  );
});

test('check: goes red on a skill that numbers a stage', async () => {
  const dir = join(ROOT, '.claude/skills/anb-naming-probe');
  const file = join(dir, 'SKILL.md');
  await mkdir(dir, { recursive: true });
  await writeAndConfirm(file, ['---', 'name: anb-naming-probe', '---', '', '# Probe', '', 'This runs at Stage 3.', ''].join('\n'));
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
