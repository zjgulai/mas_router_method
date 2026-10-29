#!/usr/bin/env node
/**
 * Tests for the ticket → matrix join.
 *
 * Three things can go wrong here, and all three are silent:
 *
 *   · a ticket claims a cell the matrix does not have — work nobody planned, or a
 *     row that was lost;
 *   · a wildcard expands onto empty positions, so a ticket for two layers appears to
 *     own six stages it never touched. This actually happened: `*·采集` made T-006
 *     look like it covered 管理·采集;
 *   · "no ticket" is treated as one condition, hiding the difference between "not
 *     yet" (运营 before launch) and "forgotten" (打标 today).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCells, expandCells, attach, unclaimedKind, STATE_TO_CELL, FUTURE_STAGES } from './ticket-cells.mjs';

const STAGES = ['需求', '设计', '开发', '验收', '交付', '运营', '迭代', '管理'];
const LAYERS = ['采集', '存储', '打标', '指标', '分析', '呈现', '结论', '报告'];

test('cells parse from the middle-dot form, and a malformed entry is dropped', () => {
  assert.deepEqual(parseCells(['开发·采集', '验收·存储']), [
    { stage: '开发', layer: '采集' }, { stage: '验收', layer: '存储' },
  ]);
  assert.deepEqual(parseCells(['开发']), []);
  assert.deepEqual(parseCells([]), []);
});

test('a wildcard expands only onto cells that exist', () => {
  // 交付 has exactly two cells; 存储 has six. A wildcard over 存储 must not invent
  // 交付·存储 just because the grid has that position.
  const existing = new Set(['验收\u0000存储', '开发\u0000存储']);
  const got = expandCells([{ stage: '*', layer: '存储' }], STAGES, LAYERS, existing);
  assert.deepEqual(got.map((c) => c.stage + '·' + c.layer).sort(), ['开发·存储', '验收·存储']);
});

test('an explicit pair survives even when the matrix has no such cell — so a typo still fails', () => {
  const existing = new Set(['验收\u0000存储']);
  const got = expandCells([{ stage: '交付', layer: '存储' }], STAGES, LAYERS, existing);
  assert.equal(got.length, 1, 'the checker needs to see it in order to report it');
});

test('the ticket state mapping does not promote awaiting-verification to verified', () => {
  // The whole point: "the work is done and waiting for a person" is a claim. Only
  // `done` — which the schema requires to carry evidence — is a landing.
  assert.equal(STATE_TO_CELL['awaiting-verification'], 'claimed');
  assert.equal(STATE_TO_CELL.done, 'landed');
  assert.equal(STATE_TO_CELL.open, 'pending');
});

test('a cell takes the weakest live ticket, so one unfinished ticket keeps it pending', () => {
  const { byCell } = attach([
    { id: 'T-1', linked: true, cellState: 'landed', cells: [{ stage: '开发', layer: '采集' }] },
    { id: 'T-2', linked: true, cellState: 'pending', cells: [{ stage: '开发', layer: '采集' }] },
  ], STAGES, LAYERS);
  const entry = byCell.get('开发\u0000采集');
  assert.equal(entry.state, 'pending');
  assert.equal(entry.tickets.length, 2, 'both are listed, so the page can say which');
});

test('an abandoned ticket does not keep a cell looking half-built once another finished it', () => {
  const { byCell } = attach([
    { id: 'T-1', linked: true, cellState: 'stopped', cells: [{ stage: '开发', layer: '采集' }] },
    { id: 'T-2', linked: true, cellState: 'landed', cells: [{ stage: '开发', layer: '采集' }] },
  ], STAGES, LAYERS);
  assert.equal(byCell.get('开发\u0000采集').state, 'landed');
});

test('unclaimed has two kinds, and 运营 before launch is not a gap', () => {
  assert.deepEqual(FUTURE_STAGES, ['运营', '迭代', '管理']);
  assert.equal(unclaimedKind('运营', {}), 'future');
  assert.equal(unclaimedKind('打标' && '设计', {}), 'gap');
  // A claimed cell is neither.
  assert.equal(unclaimedKind('运营', { ticketState: 'claimed' }), null);
});
