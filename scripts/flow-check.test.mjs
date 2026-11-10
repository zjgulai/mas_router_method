#!/usr/bin/env node
/**
 * flow-check 的测试。
 *
 * 关键的一条在最后：一次只跑了一条用例的运行记录，不能算"build 通过"。
 * 那是所有局部运行最容易被当成全绿的地方。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'scripts/flow-check.mjs');
const run = (root, stage) =>
  promisify(execFile)(process.execPath, [CLI, '--stage', stage], {
    env: { ...process.env, FLOW_ROOT: root },
  })
    .then((r) => ({ code: 0, out: r.stdout }))
    .catch((e) => ({ code: e.code, out: e.stdout ?? '' }));

const CASES_TEXT = `export const cases = [
  {
    id: 'a',
    expectations: [{ kind: 'deterministic', rule: 'r1' }],
  },
  {
    id: 'b',
    expectations: [{ kind: 'deterministic', rule: 'r2' }],
  },
];
`;

async function tree({ cases = CASES_TEXT, runs = [], receipts = [] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'flow-check-'));
  if (cases !== null) {
    await mkdir(join(dir, 'packages/evals/src/cases'), { recursive: true });
    await writeFile(join(dir, 'packages/evals/src/cases/index.ts'), cases, 'utf8');
  }
  await mkdir(join(dir, 'packages/evals/runs'), { recursive: true });
  for (const [name, body] of runs) {
    await writeFile(join(dir, 'packages/evals/runs', name), JSON.stringify(body), 'utf8');
  }
  await mkdir(join(dir, 'work/receipts'), { recursive: true });
  for (const r of receipts) await writeFile(join(dir, 'work/receipts', r), 'x', 'utf8');
  return dir;
}

const passAll = {
  cases: [
    { caseId: 'a', passed: true },
    { caseId: 'b', passed: true },
  ],
  guardrailFailures: [],
};

test('spec: 没有用例文件时是"无法判断"，不是通过', async () => {
  const dir = await tree({ cases: null });
  const r = await run(dir, 'spec');
  assert.equal(r.code, 2);
  await rm(dir, { recursive: true, force: true });
});

test('spec: 有用例但没有确定性规则时失败', async () => {
  const dir = await tree({ cases: "export const cases = [{ id: 'a', expectations: [] }];" });
  const r = await run(dir, 'spec');
  assert.equal(r.code, 1);
  await rm(dir, { recursive: true, force: true });
});

test('build: 全量运行且全部通过时通过', async () => {
  const dir = await tree({ runs: [['2026-01-01T00-00-00-000Z-run.json', passAll]] });
  const r = await run(dir, 'build');
  assert.equal(r.code, 0);
  await rm(dir, { recursive: true, force: true });
});

test('build: 有用例失败时失败', async () => {
  const dir = await tree({
    runs: [
      [
        '2026-01-01T00-00-00-000Z-run.json',
        {
          cases: [
            { caseId: 'a', passed: true },
            { caseId: 'b', passed: false },
          ],
          guardrailFailures: [],
        },
      ],
    ],
  });
  const r = await run(dir, 'build');
  assert.equal(r.code, 1);
  assert.match(r.out, /b/);
  await rm(dir, { recursive: true, force: true });
});

test('build: 只覆盖部分用例的运行记录不能算通过', async () => {
  // 一条用例全部通过——字面上是真的，结论是假的。
  const dir = await tree({
    runs: [
      [
        '2026-01-01T00-00-00-000Z-run.json',
        { cases: [{ caseId: 'a', passed: true }], guardrailFailures: [] },
      ],
    ],
  });
  const r = await run(dir, 'build');
  assert.equal(r.code, 2);
  assert.match(r.out, /1\/2/);
  await rm(dir, { recursive: true, force: true });
});

test('build: 用例在运行之后改过时，"无法判断"而不是通过', async () => {
  const dir = await tree({ runs: [['2026-01-01T00-00-00-000Z-run.json', passAll]] });
  const old = new Date('2026-01-01T00:00:00Z');
  const now = new Date('2026-02-01T00:00:00Z');
  await utimes(join(dir, 'packages/evals/runs/2026-01-01T00-00-00-000Z-run.json'), old, old);
  await utimes(join(dir, 'packages/evals/src/cases/index.ts'), now, now);
  const r = await run(dir, 'build');
  assert.equal(r.code, 2);
  assert.match(r.out, /过期/);
  await rm(dir, { recursive: true, force: true });
});

test('release: 没有回执时是"无法判断"，不是失败', async () => {
  const dir = await tree();
  const r = await run(dir, 'release');
  assert.equal(r.code, 2);
  await rm(dir, { recursive: true, force: true });
});

test('release: 有回执即通过', async () => {
  const dir = await tree({ receipts: ['REC-001-acme.md'] });
  const r = await run(dir, 'release');
  assert.equal(r.code, 0);
  await rm(dir, { recursive: true, force: true });
});
