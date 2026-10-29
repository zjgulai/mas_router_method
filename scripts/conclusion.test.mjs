#!/usr/bin/env node
/**
 * Tests for the falsification checks.
 *
 * The design's only real acceptance criterion for the report layer is "人为造一次
 * 证伪触发，看它报不报". These tests are that, per condition: build a datum that
 * satisfies the condition, and one that violates it, and check the verdict flips.
 *
 * The third state gets the most attention, because it is the one that quietly
 * becomes a pass. A condition with no data is not a condition that held.
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
import { CONDITIONS, checkConclusion } from './conclusion-conditions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args) => promisify(execFile)(process.execPath, [join(ROOT, 'scripts/verify-conclusion.mjs'), ...args])
  .then((r) => ({ code: 0, out: r.stdout }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

const v = (name, data) => CONDITIONS[name].check(data);

test('an interval containing 0 falsifies — the check the whole product turns on', () => {
  assert.equal(v('ci-excludes-zero', { beta_ci: [0.012, 0.022] }).verdict, 'holds');
  const fired = v('ci-excludes-zero', { beta_ci: [-0.004, 0.011] });
  assert.equal(fired.verdict, 'falsified');
  assert.equal(fired.triggered, true);
  // An interval that touches 0 has not excluded it. `hi >= 0` is inclusive on purpose:
  // the boundary case is exactly where a careless implementation reports a finding.
  assert.equal(v('ci-excludes-zero', { beta_ci: [0, 0.02] }).verdict, 'falsified');
  assert.equal(v('ci-excludes-zero', { beta_ci: [-0.02, 0] }).verdict, 'falsified');
});

test('a missing interval is unmeasurable, not satisfied', () => {
  const r = v('ci-excludes-zero', {});
  assert.equal(r.verdict, 'unmeasurable');
  assert.equal(r.triggered, false);
  assert.match(r.detail, /no interval/);
});

test('flipped signs across regions falsify the panel assumption', () => {
  assert.equal(v('regional-sign-consistent', { region_betas: [0.17, 0.14, 0.19] }).verdict, 'holds');
  const fired = v('regional-sign-consistent', { region_betas: [0.17, -0.09] });
  assert.equal(fired.verdict, 'falsified');
  assert.match(fired.detail, /signs differ/);
});

test('accuracy below 0.7 falsifies the sentiment dimension; a low Kappa falsifies the definition', () => {
  assert.equal(v('labelling-accurate', { accuracy: 0.78, kappa: 0.71 }).verdict, 'holds');
  assert.match(v('labelling-accurate', { accuracy: 0.62, kappa: 0.71 }).detail, /accuracy/);
  // Accuracy is fine but agreement is poor: the labels themselves are ambiguous.
  assert.match(v('labelling-accurate', { accuracy: 0.80, kappa: 0.51 }).detail, /Kappa/);
});

test('a budget that moved once has no identifying power for C4', () => {
  assert.equal(v('budget-has-variation', { budget_changes: 1 }).verdict, 'falsified');
  assert.equal(v('budget-has-variation', { budget_changes: 5 }).verdict, 'holds');
  assert.equal(v('budget-has-variation', {}).verdict, 'unmeasurable');
});

test('controls that reverse the sign falsify the main effect', () => {
  assert.equal(v('controls-do-not-reverse', { design_effect_range: [0.21, 0.17] }).verdict, 'holds');
  assert.equal(v('controls-do-not-reverse', { design_effect_range: [0.21, -0.05] }).verdict, 'falsified');
});

test('coverage below 40% falsifies the regional denominator', () => {
  assert.equal(v('region-coverage-sufficient', { region_coverage: 0.62 }).verdict, 'holds');
  assert.equal(v('region-coverage-sufficient', { region_coverage: 0.31 }).verdict, 'falsified');
});

test('a condition name that was never registered cannot pass', () => {
  const { verdict, results } = checkConclusion(['ci-excludes-zero', 'sound-convincing'], { beta_ci: [0.01, 0.02] });
  assert.equal(verdict, 'unmeasurable', 'an unknown name must not read as a pass');
  assert.match(results[1].detail, /no such condition/);
});

test('falsified wins over unmeasurable — a conclusion already wrong does not become maybe', () => {
  const { verdict } = checkConclusion(
    ['ci-excludes-zero', 'region-coverage-sufficient'],
    { beta_ci: [-1, 1], region_coverage: undefined },
  );
  assert.equal(verdict, 'falsified');
});

test('the CLI exits 1 on a falsified conclusion and names which condition fired', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'concl-'));
  try {
    const path = join(dir, 'c.json');
    await writeAndConfirm(path, JSON.stringify({
      conclusions: [{
        id: 'C9', claim: 'a claim with a dead interval', status: 'active',
        conditions: ['ci-excludes-zero'], data: { beta_ci: [-0.01, 0.01] },
      }],
    }));
    const { code, out } = await run([path]);
    assert.equal(code, 1, out);
    assert.match(out, /ci-excludes-zero/);
    assert.match(out, /contains 0/);
    assert.match(out, /「效应弱」不是「无结论」/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the CLI exits 2 when nothing fired but something could not be evaluated', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'concl-'));
  try {
    const path = join(dir, 'c.json');
    await writeAndConfirm(path, JSON.stringify({
      conclusions: [{
        id: 'C9', claim: 'a claim nobody can check', status: 'active',
        conditions: ['region-coverage-sufficient'], data: {},
      }],
    }));
    const { code, out } = await run([path]);
    assert.equal(code, 2, out);
    assert.match(out, /This is not a pass/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a superseded conclusion is not re-checked — re-alerting on a dead conclusion mutes the channel', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'concl-'));
  try {
    const path = join(dir, 'c.json');
    await writeAndConfirm(path, JSON.stringify({
      conclusions: [
        { id: 'C1', claim: 'healthy', status: 'active', conditions: ['ci-excludes-zero'], data: { beta_ci: [0.01, 0.02] } },
        { id: 'C2', claim: 'already overturned', status: 'superseded', conditions: ['ci-excludes-zero'], data: { beta_ci: [-1, 1] } },
      ],
    }));
    const { code, out } = await run([path]);
    assert.equal(code, 0, out);
    assert.match(out, /1 superseded \(not re-checked\)/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the demo produces all three verdicts at once, which is what makes it a useful fixture', async () => {
  const { code, out } = await run(['--demo']);
  assert.equal(code, 1);
  assert.match(out, /1 active · 1 falsified · 1 unmeasurable/);
});

test('lag-has-peak: a curve that peaks and falls holds', () => {
  assert.equal(v('lag-has-peak', { lag_curve: [0.2, 0.5, 0.8, 0.4, 0.1], lag_noise: 0.05 }).verdict, 'holds');
});

test('lag-has-peak: highest at lag 0 means no lag structure to report', () => {
  const r = v('lag-has-peak', { lag_curve: [0.9, 0.6, 0.3, 0.1] });
  assert.equal(r.verdict, 'falsified');
  assert.match(r.detail, /contemporaneous/);
});

test('lag-has-peak: a bump within the noise is not a peak', () => {
  const r = v('lag-has-peak', { lag_curve: [0.50, 0.52, 0.51], lag_noise: 0.05 });
  assert.equal(r.verdict, 'falsified');
  assert.match(r.detail, /bump, not a peak/);
});

test('lag-has-peak: a maximum at the last lag is 无法判断, not 成立 and not 触发', () => {
  // The curve may not have turned yet. Calling that a peak is the optimistic reading;
  // calling it a failure is the pessimistic one; both are guesses.
  const r = v('lag-has-peak', { lag_curve: [0.1, 0.2, 0.3, 0.4] });
  assert.equal(r.verdict, 'unmeasurable');
  assert.match(r.detail, /extend the window/);
});

test('no-uncontrolled-events: an absent event list is unmeasurable, not clean', () => {
  const r = v('no-uncontrolled-events', {});
  assert.equal(r.verdict, 'unmeasurable');
  assert.match(r.detail, /has to be supplied/);
});

test('no-uncontrolled-events: an uncontrolled event in the window falsifies', () => {
  const r = v('no-uncontrolled-events', {
    known_events: ['US 劳动节大促', { name: 'DE 竞品降价' }],
    controlled: ['US 劳动节大促'],
  });
  assert.equal(r.verdict, 'falsified');
  assert.match(r.detail, /DE 竞品降价/);
});

test('no-uncontrolled-events: all events controlled holds', () => {
  assert.equal(v('no-uncontrolled-events', { known_events: ['A', 'B'], controlled: ['A', 'B'] }).verdict, 'holds');
  assert.equal(v('no-uncontrolled-events', { known_events: [], controlled: [] }).verdict, 'holds');
});
