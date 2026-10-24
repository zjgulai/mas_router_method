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

test('live schema: design records are a state machine, not a flat doc', async () => {
  const schema = await loadSchema();
  const d = schema.entities.design;
  assert.equal(d.dir, 'designs');
  assert.equal(d.prefix, 'D');
  assert.deepEqual(d.states, ['drafting', 'confirmed', 'superseded']);
  // An ADR is permanent and lives in docs/adr/. A design record changes, so it
  // belongs in work/ — and `stage_entities.design` must name it, or the site's
  // design page will claim the stage owns no records.
  assert.deepEqual(schema.stageEntities.design, ['design']);
});

test('design check: a record whose block is filled parses as filled', async () => {
  // The first version truncated every block at the first blank line because the
  // pattern ended with `\s*$` under the `m` flag. Four correct records reported
  // as empty. A checker that cries wolf gets switched off, so this asserts the
  // parsing rule directly rather than trusting a green run.
  const text = [
    '---',
    'id: D-900',
    '---',
    '## 一、流程形状',
    '',
    '固定两步。',
    '',
    '## 二、拒绝清单',
    '',
    '- 要 X → 改为 Y',
    '',
    '## 三、动作权限',
    '',
    '（跳过：只读，没有动作）',
    '',
  ].join('\n');

  const sections = (t) => {
    const parts = t.split(/^## /m).slice(1);
    return parts.map((p) => {
      const nl = p.indexOf('\n');
      return nl < 0 ? { head: p.trim(), body: '' } : { head: p.slice(0, nl).trim(), body: p.slice(nl + 1).trim() };
    });
  };
  const secs = sections(text);
  const flow = secs.find((s) => s.head.includes('流程形状'));
  assert.ok(flow !== undefined);
  assert.match(flow.body, /固定两步/, 'a filled block must not be truncated at its first blank line');
  const perms = secs.find((s) => s.head.includes('动作权限'));
  assert.match(perms.body, /跳过[：:]\s*\S/, 'an explicit skip carries a reason and is not "empty"');
});

test('design check: a confirmed record with no re-open condition fails', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { writeFile, unlink } = await import('node:fs/promises');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const probe = join(WORK, 'designs/confirmed/D-998-no-reopen.md');

  const body = [
    '---', 'id: D-998', 'title: probe', 'status: confirmed', '---',
    '## 一、流程形状', '', '固定。', '',
    '## 二、拒绝清单', '', '- 输入 X → 返回 Y', '',
    '## 三、动作权限', '', '（跳过：只读）', '',
    '## 四、交接契约', '', '（跳过：单一调用）', '',
  ].join('\n');

  try {
    await writeFile(probe, body, 'utf8');
    let code = 0, stdout = '';
    try {
      const r = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/work.mjs'), 'check']);
      stdout = r.stdout;
    } catch (e) { code = e.code ?? 1; stdout = e.stdout ?? ''; }
    assert.equal(code, 1, 'a confirmed design with no re-open condition must fail');
    assert.match(stdout, /no condition that would make this design wrong/);
  } finally {
    await unlink(probe).catch(() => {});
  }
});

test('--only design: scope is real, and 0 designs is a pass not a skip', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  const out = await promisify(execFile)(process.execPath,
    [resolve(root, 'scripts/work.mjs'), 'check', '--only', 'design'])
    .then((r) => r.stdout).catch((e) => e.stdout);

  // It must actually have run, and said what it covered. A scoped check that
  // silently reports "ok" for scope it never applied is the failure mode CI
  // would inherit — it has to name the count it looked at.
  assert.match(out, /--only design/, 'the scoped check must say it is scoped');
  assert.match(out, /(\d+) design/, 'the scoped check must report how many designs it looked at');
  const n = Number(/(\d+) design/.exec(out)[1]);
  assert.ok(n >= 1, 'there must be at least one design record for this to mean anything');
});

test('--only design: a value masquerading as a refusal fails in scope too', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { writeFile, unlink } = await import('node:fs/promises');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const probe = join(WORK, 'designs/drafting/D-996-probe.md');

  const body = [
    '---', 'id: D-996', 'title: probe', 'status: drafting', '---',
    '## 一、流程形状', '', '固定两步。', '',
    '## 二、拒绝清单', '', '- 要诚实', '- 不要有害', '',
    '## 三、动作权限', '', '（跳过：只读，没有动作）', '',
    '## 四、交接契约', '', '（跳过：单一调用）', '',
  ].join('\n');

  try {
    await writeFile(probe, body, 'utf8');
    let code = 0, stdout = '';
    try {
      await promisify(execFile)(process.execPath, [resolve(root, 'scripts/work.mjs'), 'check', '--only', 'design']);
    } catch (e) { code = e.code ?? 1; stdout = e.stdout ?? ''; }
    assert.equal(code, 1, 'a refusal list with no concrete input must fail the scoped check');
    assert.match(stdout, /no concrete input/);
  } finally {
    await unlink(probe).catch(() => {});
  }
});

test('check: an artifact with no delete_when fails — the rule that had gone dead', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { writeFile, unlink, mkdir } = await import('node:fs/promises');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const probe = join(WORK, 'artifacts/active/ART-099-probe.md');

  // artifacts were switched from a flat entity to a state directory, and the
  // owner/delete_when rule kept reading `found.artifact.list` — which only flat
  // entities have. The rule silently stopped running. Nothing noticed because no
  // artifact had ever been filed. This test is what makes that stay fixed.
  await mkdir(join(WORK, 'artifacts/active'), { recursive: true });
  await writeFile(probe, ['---', 'id: ART-099', 'title: probe', 'owner: probe', '---', 'probe'].join('\n'), 'utf8');
  try {
    let code = 0, stdout = '';
    try {
      const r = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/work.mjs'), 'check']);
      stdout = r.stdout;
    } catch (e) { code = e.code ?? 1; stdout = e.stdout ?? ''; }
    assert.equal(code, 1, 'an artifact with no delete_when must fail; it lives forever otherwise');
    assert.match(stdout, /ART-099 artifact has no delete_when/);
  } finally {
    await unlink(probe).catch(() => {});
  }
});

test('live schema: the stage order is one list and every view of it agrees', async () => {
  const s = await loadSchema();
  const sorted = (a) => a.slice().sort();
  const order = s.stageOrder;

  assert.ok(order.length >= 7, `expected the seven stages, got ${order.length}`);
  // Four structures keyed by stage. If one gains a stage and another does not,
  // that stage silently has no label, no skill, or no register.
  assert.deepEqual(sorted(Object.keys(s.stageLabels)), sorted(order), 'stage_labels disagrees with stage_order');
  assert.deepEqual(sorted(Object.keys(s.stageSkills)), sorted(order), 'stage_skills disagrees with stage_order');
  assert.deepEqual(sorted(Object.keys(s.stageOneline)), sorted(order), 'stage_oneline disagrees with stage_order');
  assert.deepEqual(sorted(Object.keys(s.stageEntities)), sorted(order), 'stage_entities disagrees with stage_order');

  // Index is derived from position and nowhere else. That is the whole point:
  // a written-down number is what went stale.
  assert.deepEqual(s.stages.map((x) => x.index), order.map((_, i) => i + 1));
});

test('live schema: every stage names a skill that exists on disk', async () => {
  const s = await loadSchema();
  const { readdir } = await import('node:fs/promises');
  const dirs = await readdir(join(WORK, '..', '.claude/skills'));
  for (const st of s.stages) {
    assert.ok(dirs.includes(st.skill), `stage "${st.id}" names ${st.skill}, which is not a skill directory`);
    assert.notEqual(st.label, '', `stage "${st.id}" has no label`);
    assert.notEqual(st.oneline, '', `stage "${st.id}" has no one-line description`);
  }
});

test('facts: --check fails when a claim points at a file that is not there', async () => {
  // 这条断言曾经在文件读不到时 `continue` —— 于是它引用的文件一旦被移动或改名，
  // 断言就静默停止工作，而 --check 照样报绿。原件移进 originals/ 时就发生了这件事。
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve, dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { rename } = await import('node:fs/promises');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const target = join(root, 'docs/site/manage.html');
  const hidden = join(root, 'docs/site/manage.html.hidden');

  await rename(target, hidden);
  try {
    let code = 0, stdout = '';
    try {
      const r = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/facts.mjs'), '--check']);
      stdout = r.stdout;
    } catch (e) { code = e.code ?? 1; stdout = e.stdout ?? ''; }
    assert.equal(code, 1, 'a claim whose file vanished must fail, not be skipped');
    assert.match(stdout, /cannot be read/);
  } finally {
    await rename(hidden, target);
  }
});
