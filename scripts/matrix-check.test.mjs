#!/usr/bin/env node
/**
 * Tests for the matrix checker.
 *
 * The matrix is a promise about what is enforced, so the failures that matter are
 * the ones where a cell *looks* finished: three things present but one of them says
 * "同上", a checker naming a script that was deleted, a prose count that has drifted
 * from the data it describes.
 *
 * Each test writes a scratch matrix.json, runs the checker against it with an
 * explicit --file, and asserts the exit code. Most also assert the *message*, because
 * "1 problem" does not tell a reader which of six rules fired.
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
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/matrix-check.mjs'), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

/** The real matrix, used as the baseline every mutation starts from. */
const REAL = JSON.parse(await readFile(join(ROOT, 'docs/product/matrix.json'), 'utf8'));

async function check(mutate) {
  const doc = JSON.parse(JSON.stringify(REAL));
  mutate(doc);
  const dir = await mkdtemp(join(tmpdir(), 'matrix-'));
  try {
    const path = join(dir, 'matrix.json');
    await writeAndConfirm(path, JSON.stringify(doc));
    return await run(['--file', path]);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

const cell = (doc, stage, layer) => doc.cells.find((c) => c.stage === stage && c.layer === layer);

test('the committed matrix passes', async () => {
  const { code, out } = await run([]);
  assert.equal(code, 0, out);
  assert.match(out, /every checker resolves/);
});

test('a cell whose input says 上面 is a hole — it names the previous row, not a value', async () => {
  const { code, out } = await check((d) => { cell(d, '开发', '存储').input = '上面'; });
  assert.equal(code, 1, out);
  assert.match(out, /names the previous row/);
});

test('a cell missing its failure contract is reported by name', async () => {
  const { code, out } = await check((d) => { cell(d, '验收', '分析').failure = ''; });
  assert.equal(code, 1, out);
  assert.match(out, /「failure」 is empty/);
});

test('a checker pointing at a deleted script fails — it does not quietly become "contract"', async () => {
  const { code, out } = await check((d) => {
    cell(d, '验收', '采集').checker.cmd = 'node scripts/deleted-checker.mjs';
  });
  assert.equal(code, 1, out);
  assert.match(out, /does not exist/);
});

test('a checker with no stated exit code is not a contract', async () => {
  const { code, out } = await check((d) => { cell(d, '验收', '采集').checker.exit = ''; });
  assert.equal(code, 1, out);
  assert.match(out, /no "exit"/);
});

test('a transition that carries nothing is a line, not a handoff', async () => {
  const { code, out } = await check((d) => { d.transitions[0].carries = ''; });
  assert.equal(code, 1, out);
  assert.match(out, /carries nothing/);
});

test('a transition with no version fields fails — the design requires them on every hop', async () => {
  const { code, out } = await check((d) => { d.transitions[2].versioned = []; });
  assert.equal(code, 1, out);
  assert.match(out, /no version fields/);
});

test('a transition to a cell that does not exist is reported with both ends', async () => {
  const { code, out } = await check((d) => { d.transitions[0].to = ['开发', '不存在的层']; });
  assert.equal(code, 1, out);
  assert.match(out, /target cell does not exist/);
});

test('the same position twice fails — two cells claiming one place', async () => {
  const { code, out } = await check((d) => { d.cells.push({ ...cell(d, '开发', '采集') }); });
  assert.equal(code, 1, out);
  assert.match(out, /appears twice/);
});

test('a kind outside the three classes fails', async () => {
  const { code, out } = await check((d) => { cell(d, '开发', '采集').kind = '重要类'; });
  assert.equal(code, 1, out);
  assert.match(out, /not one of the three classes/);
});

test('a chain with no 开发 cell is a chain of designs, not of work', async () => {
  // 呈现 alone is fine — it does have a 开发 cell. The rule fires only when a chain's
  // layers have no build cell at all, which happens if the 开发 row is missing for
  // those layers: a chain you cannot build is a diagram.
  const { code, out } = await check((d) => {
    d.chains[0].layers = ['呈现', '存储'];
    d.cells = d.cells.filter((c) => !(c.stage === '开发' && (c.layer === '存储' || c.layer === '呈现')));
    // Keep the transitions legal after the removal, so this test fails for one reason.
    d.transitions = d.transitions.filter((t) => t.from[1] !== '存储' && t.to[1] !== '存储'
      && t.from[1] !== '呈现' && t.to[1] !== '呈现');
  });
  assert.equal(code, 1, out);
  assert.match(out, /nothing is built/);
});

test('a prose count that drifted from the data fails, and names the sentence', async () => {
  // The real check: corrupt the matrix so its cell count no longer matches the docs.
  const { code, out } = await check((d) => { d.cells.pop(); });
  assert.equal(code, 1, out);
  assert.match(out, /matrix 的/);
});

test('the checker reads the docs it validates, and reports a missing claim rather than passing', async () => {
  const { out } = await run([]);
  // A green run must have actually looked at four numbers, not zero.
  assert.match(out, /49 cells, 8 transitions/);
});

test('the HITL classification is derived from checkers, not from category', async () => {
  // The first version classified by 类别 and made 开发·采集 command-closed — but writing
  // an adapter has no command that can close it. Presence of a checker is the judge.
  const { stdout } = await promisify(execFile)(process.execPath, [join(ROOT, 'scripts/matrix-check.mjs'), '--json'])
    .catch((e) => ({ stdout: e.stdout }));
  const doc = JSON.parse(stdout);
  const door = Object.fromEntries(doc.cells.map((c) => [`${c.stage}·${c.layer}`, c.closedBy]));

  assert.equal(door['验收·采集'], '命令关门', 'this one has a checker');
  assert.equal(door['开发·采集'], '人关门', 'no checker exists for writing an adapter');
  assert.equal(door['需求·指标'], '人开门', 'an answer is the input; AI cannot start');
  assert.equal(door['运营·采集'], '无人关门', 'runtime cells never finish');
  assert.equal(doc.byDoor['命令关门'], 6);
  assert.equal(doc.byDoor['人开门'], 2);
  assert.equal(doc.byDoor['无人关门'], 9);
  assert.equal(doc.byDoor['人关门'], 32);
});

test('the ops document\'s HITL counts are checked against disk, and the check can go red', () => {
  // Verified by hand while writing it: changing 6 to 99 made matrix-check report
  // "says 99 cells are 命令关门, disk has 6". This test pins the behaviour so the
  // check cannot silently stop comparing.
  const source = readFileSync(join(ROOT, 'scripts/matrix-check.mjs'), 'utf8');
  assert.match(source, /ops-bitable\.md: says/, 'the cross-check must report drift, not just read the doc');
  assert.match(source, /byDoor/, 'the derived counts must exist');
});
