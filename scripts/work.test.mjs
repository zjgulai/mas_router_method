#!/usr/bin/env node
/**
 * Tests for the work tooling. Runs with `node --test`.
 *
 * These exist because the tooling is the thing that tells you the truth about
 * everything else. If it lies, every later judgement is built on the lie — and
 * both bugs found while building it were silent:
 *
 *   1. `work status` hardcoded `ticket` while the schema said `tickets`, so five
 *      tickets were invisible and the report said "0 tickets, everything fine".
 *   2. The schema parser matched keys with [A-Za-z0-9_] only, so the hyphenated
 *      state names `in-progress` and `awaiting-verification` were dropped from
 *      the transitions map. A ticket could never legally reach `done`.
 *
 * Neither threw. Both produced confident, wrong output.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseSchema, loadSchema, WORK } from './schema.mjs';

test('parser keeps hyphenated keys — the bug that hid two states', () => {
  const parsed = parseSchema(`
entities:
  ticket:
    dir: tickets
    states: [open, in-progress]
    transitions:
      open: [in-progress]
      in-progress: [open]
`);
  assert.deepEqual(
    Object.keys(parsed.entities.ticket.transitions).sort(),
    ['in-progress', 'open'],
    'state names contain hyphens and must survive parsing',
  );
});

test('parser reads inline arrays without leaving stray spaces', () => {
  const parsed = parseSchema('entities:\n  x:\n    states: [ a , b ,c ]\n');
  assert.deepEqual(parsed.entities.x.states, ['a', 'b', 'c']);
});

test('live schema: every state named in transitions is a declared state', async () => {
  const schema = await loadSchema();
  for (const [kind, def] of Object.entries(schema.entities)) {
    for (const [from, targets] of Object.entries(def.transitions ?? {})) {
      assert.ok(def.states.includes(from), `${kind}: transition source "${from}" is not a declared state`);
      for (const to of targets) {
        assert.ok(def.states.includes(to), `${kind}: "${from}" -> "${to}" targets an undeclared state`);
      }
    }
  }
});

test('live schema: the ticket path from open to done exists', async () => {
  const schema = await loadSchema();
  const t = schema.entities.ticket.transitions;
  assert.ok(t.open.includes('in-progress'));
  assert.ok(t['in-progress'].includes('awaiting-verification'));
  assert.ok(
    t['awaiting-verification'].includes('done'),
    'a ticket that passes verification must be able to reach done',
  );
});

test('live schema: dir names are plural and match what is on disk', async () => {
  const schema = await loadSchema();
  assert.equal(schema.entities.ticket.dir, 'tickets', 'the bug was a singular/plural mismatch');
  assert.equal(schema.entities.incident.dir, 'incidents');
  assert.equal(schema.entities.requirement.dir, 'requirements');
});

test('every entity directory named in schema exists on disk', async () => {
  const schema = await loadSchema();
  const { readdir } = await import('node:fs/promises');
  const top = await readdir(WORK);
  for (const [kind, def] of Object.entries(schema.entities)) {
    assert.ok(
      top.includes(def.dir),
      `${kind}: schema says dir "${def.dir}" but work/ contains: ${top.filter((x) => !x.startsWith('.')).join(', ')}`,
    );
  }
});

test('append-only registers have no state machine', async () => {
  const schema = await loadSchema();
  assert.ok(schema.appendOnly.includes('evidence'));
  assert.ok(schema.appendOnly.includes('receipts'));
  for (const name of schema.appendOnly) {
    assert.equal(schema.entities[name], undefined, `${name} must not be an entity with states`);
  }
});

test('check counts append-only records — the bug that hid three evidence files', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const out = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/work.mjs'), 'check'])
    .then((r) => r.stdout).catch((e) => e.stdout);

  const m = /ok.*?(\d+) records?/.exec(out);
  assert.ok(m !== null, `check did not report a record count:\n${out}`);
  const counted = Number(m[1]);

  // Independently count what is on disk.
  const { readdir } = await import('node:fs/promises');
  const schema = await loadSchema();
  let onDisk = 0;
  for (const def of Object.values(schema.entities)) {
    const states = Object.keys(def.transitions ?? {});
    if (states.length === 0) {
      try { onDisk += (await readdir(join(WORK, def.dir))).filter((f) => f.endsWith('.md') && f.includes('-')).length; } catch {}
    } else {
      for (const s of def.states) {
        try { onDisk += (await readdir(join(WORK, def.dir, s))).filter((f) => f.endsWith('.md') && f.includes('-')).length; } catch {}
      }
    }
  }
  for (const name of schema.appendOnly) {
    try { onDisk += (await readdir(join(WORK, name))).filter((f) => f.endsWith('.md') && f.includes('-')).length; } catch {}
  }

  assert.equal(counted, onDisk,
    `check counted ${counted} records but ${onDisk} exist on disk — a wrong count is worse than none`);
});

test('facts: every quoted number matches disk', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const out = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/facts.mjs'), '--check'])
    .then((r) => r.stdout)
    .catch((e) => e.stdout);
  assert.match(out, /ok/, `stale numbers:\n${out}`);
});

test('facts: --check fails when a document quotes a wrong number', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve, dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { readFile, writeFile } = await import('node:fs/promises');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const target = join(root, 'docs/site/skills.html');

  const original = await readFile(target, 'utf8');
  try {
    await writeFile(target, original.replace(/全部 \d+ 个/, '全部 3 个'), 'utf8');
    let code = 0;
    let stdout = '';
    try {
      const r = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/facts.mjs'), '--check']);
      stdout = r.stdout;
    } catch (e) {
      code = e.code ?? 1;
      stdout = e.stdout ?? '';
    }
    assert.equal(code, 1, 'a stale number must fail the check, not warn');
    assert.match(stdout, /says 3/, `the failure should name the claimed value:\n${stdout}`);
  } finally {
    await writeFile(target, original, 'utf8');
  }
});
