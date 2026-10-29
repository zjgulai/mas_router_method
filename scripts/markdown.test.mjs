#!/usr/bin/env node
/**
 * Tests for the markdown table parser.
 *
 * It exists because `design.mjs` counted "rows naming a concrete input" by looking
 * for an arrow — which works for a bullet list and silently undercounts a table.
 * Two blocks in a design record are tables, so the counter must understand tables.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTable, tablesIn } from './markdown.mjs';

test('parseTable reads a header and its rows, dropping the separator', () => {
  const body = [
    '| 具体输入 | 该怎么答 | 升级档次 |',
    '|---|---|---|',
    '| 买家用中文问关税 | 用他的语言回答 | 不升级 |',
    '| 问能不能治湿疹 | 不答，转人 | 硬升级 |',
  ].join('\n');
  const t = parseTable(body);
  assert.deepEqual(t.header, ['具体输入', '该怎么答', '升级档次']);
  assert.equal(t.rows.length, 2);
  assert.deepEqual(t.rows[0], ['买家用中文问关税', '用他的语言回答', '不升级']);
});

test('parseTable tolerates the leading and trailing pipes being absent', () => {
  const t = parseTable(['a | b', '--- | ---', '1 | 2'].join('\n'));
  assert.deepEqual(t.header, ['a', 'b']);
  assert.deepEqual(t.rows[0], ['1', '2']);
});

test('parseTable returns null when there is no table', () => {
  assert.equal(parseTable('- a bullet\n- another'), null);
});

test('parseTable ignores prose before and after the table', () => {
  const t = parseTable([
    '这一块是一张表，下面是它。',
    '',
    '| 输入 | 答 |',
    '|---|---|',
    '| x | y |',
    '',
    '表后面还有一句话。',
  ].join('\n'));
  assert.equal(t.rows.length, 1);
});

test('tablesIn finds a table nested inside a container block', () => {
  // 「动作权限」是一个容器块：正文里还有段落和加粗小标题，表格夹在中间。
  // 只在块的开头找表格是不够的——那正是第一次实现会犯的错。
  const body = [
    '| 动作 | 档 | 理由 |',
    '|---|---|---|',
    '| 读政策 | 可撤销 | 只读 |',
    '',
    '**必须问人的：** 无。',
    '',
    '还有一段说明。',
  ].join('\n');
  const found = tablesIn(body);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].header, ['动作', '档', '理由']);
  assert.deepEqual(found[0].rows[0], ['读政策', '可撤销', '只读']);
});

test('tablesIn returns every table in a block', () => {
  const body = [
    '| a | b |', '|---|---|', '| 1 | 2 |',
    '',
    '中间一段话。',
    '',
    '| c | d |', '|---|---|', '| 3 | 4 |',
  ].join('\n');
  assert.equal(tablesIn(body).length, 2);
});
