#!/usr/bin/env node
/**
 * Tests for the cross-table reference checker.
 *
 * Each test mutates a small in-memory table set so exactly one defect exists, and
 * asserts that defect is reported *by name*. A checker that says "1 problem" has
 * told a reader nothing they can act on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, ID_FIELD, UPSTREAM } from './xref.mjs';

/** The smallest table set that has one valid row in every participating table. */
function base() {
  return {
    '01 需求': [{ 需求编号: 'dem-01' }],
    '01-1 能力清单': [{ 能力编号: 'C01', 对应设计: 'des-01' }],
    '03-1 采集设计': [{ 设计编号: 'des-01', 来自哪条需求: 'dem-01' }],
    '03-2 打标设计': [],
    '03-3 指标设计': [],
    '03-4 结论设计': [],
    '04 开发': [{ 开发编号: 'dev-01', 来自哪份设计: 'des-01' }],
    '05 验收': [{ 验收编号: 'acc-01', 对应需求: 'dem-01', 对应开发: 'dev-01' }],
    '06 交付': [{ 交付编号: 'ship-01', 对应需求: 'dem-01' }],
    '07 运营': [{ 运营编号: 'ops-01' }],
    '08 迭代': [{ 迭代编号: 'it-01' }],
    '09 管理': [{ 管理编号: 'adm-01' }],
    '10 回流（闭环）': [{ 回流编号: 'loop-01' }],
  };
}

test('a clean set reports nothing', () => {
  const { problems } = check(base());
  assert.deepEqual(problems, []);
});

test('a reference to a design that does not exist is reported with both ends', () => {
  const t = base();
  t['01-1 能力清单'][0].对应设计 = 'des-99';
  const { problems } = check(t);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /des-99/);
  assert.match(problems[0], /C01/);
  assert.match(problems[0], /no table defines/);
});

test('free text is scanned too, not just reference columns', () => {
  // The failure this catches: a design mentions dev-10 in prose, dev-10 is never
  // created, and the reader of the design believes it is planned.
  const t = base();
  t['03-1 采集设计'][0]['对应开发任务'] = 'dev-10';
  const { problems } = check(t);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /dev-10/);
});

test('a row that does not point up is reported', () => {
  const t = base();
  t['04 开发'][0].来自哪份设计 = '';
  const { problems } = check(t);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not a des- reference/);
});

test('a design with no requirement is a design solving nothing', () => {
  const t = base();
  t['03-1 采集设计'][0].来自哪条需求 = 'dem-01 衍生的';
  // Starts with dem-01, so this is accepted — the rule is the prefix, not equality.
  // Recorded here because it is the known limit of a string check.
  assert.deepEqual(check(t).problems, []);

  t['03-1 采集设计'][0].来自哪条需求 = '自己想的';
  assert.match(check(t).problems[0], /not a dem- reference/);
});

test('a table missing from ID_FIELD fails loudly rather than passing silently', () => {
  // The regression that matters: a new table added without registering it would
  // make every reference to its rows read as dangling, or worse, be skipped.
  const t = base();
  t['11 新的表'] = [{ 编号: 'new-01' }];
  const { problems } = check(t);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /not in ID_FIELD/);
});

test('an unbuilt design is reported but is not a problem', () => {
  const t = base();
  t['03-1 采集设计'].push({ 设计编号: 'des-02', 来自哪条需求: 'dem-01' });
  const { problems, unbuilt } = check(t);
  assert.deepEqual(problems, []);
  assert.deepEqual(unbuilt, ['des-02']);
});

test('a build row nothing verifies is reported, and multi-dev text counts', () => {
  const t = base();
  t['04 开发'].push({ 开发编号: 'dev-02', 来自哪份设计: 'des-01' });
  const { unverified } = check(t);
  assert.deepEqual(unverified, ['dev-02']);

  // One acceptance row may cover several build rows; all of them count as verified.
  t['05 验收'][0].对应开发 = 'dev-01 dev-02';
  assert.deepEqual(check(t).unverified, []);
});

test('the shipped table set is internally consistent', async () => {
  // Uses the real dump if present; skips rather than failing when it is not, so the
  // suite stays runnable on a machine that has never fetched the tables.
  const { readFile } = await import('node:fs/promises');
  let tables;
  try {
    tables = JSON.parse(await readFile(new URL('../docs/product/tables.json', import.meta.url), 'utf8'));
  } catch {
    return;
  }
  const { problems } = check(tables);
  assert.deepEqual(problems, [], `the real table set has dangling references:\n${problems.join('\n')}`);
});

test('every prefix this project uses has a home', () => {
  // A prefix that no table produces would make a reference to it permanently
  // dangling, and the message would point at the wrong thing.
  const prefixes = new Set(Object.values(UPSTREAM).map((u) => u.prefix));
  for (const p of ['dem-', 'des-']) assert.ok(prefixes.has(p), `${p} is not in any UPSTREAM rule`);
});
