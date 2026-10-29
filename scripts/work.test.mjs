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
import { writeAndConfirm } from './test-fs.mjs';
import { sections } from './markdown.mjs';

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
    await writeAndConfirm(target, original.replace(/全部 \d+ 个/, '全部 3 个'));
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
    await writeAndConfirm(target, original);
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

  // 用共享解析器，不在这里复制一份。
  // 之前这份测试自带实现，所以 scripts/markdown.mjs 坏掉时它照样绿——
  // 一条测的是自己副本的测试，和没有测试是同一种东西。
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
  const { unlink } = await import('node:fs/promises');
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
    await writeAndConfirm(probe, body);
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
  const { unlink } = await import('node:fs/promises');
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
    await writeAndConfirm(probe, body);
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
  const { unlink, mkdir } = await import('node:fs/promises');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const probe = join(WORK, 'artifacts/active/ART-099-probe.md');

  // artifacts were switched from a flat entity to a state directory, and the
  // owner/delete_when rule kept reading `found.artifact.list` — which only flat
  // entities have. The rule silently stopped running. Nothing noticed because no
  // artifact had ever been filed. This test is what makes that stay fixed.
  await mkdir(join(WORK, 'artifacts/active'), { recursive: true });
  await writeAndConfirm(probe, ['---', 'id: ART-099', 'title: probe', 'owner: probe', '---', 'probe'].join('\n'));
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

test('design rules follow the schema: a record in a newly added state is still checked', async () => {
  // 这条断言针对的 bug 在这个文件里出现过三次：ticket 的目录名、artifact 的读取方式、
  // 以及 design 的状态列表——每一次都是某处抄了一份本该只有一份的东西。
  //
  // 复现方式就是审查者的做法：给 design 加一个状态，放一份四块全缺的记录进去。
  // 硬编码状态列表时，check 报「ok」；从 schema 读时，它报出那份记录缺块。
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { unlink, mkdir, rmdir } = await import('node:fs/promises');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  const schemaPath = join(WORK, 'schema.yml');
  const original = await readFile(schemaPath, 'utf8');
  const NEW_STATE = 'rejected';
  const patched = original
    .replace('    states: [drafting, confirmed, superseded]',
             `    states: [drafting, confirmed, superseded, ${NEW_STATE}]`)
    .replace('      drafting: [confirmed, superseded]',
             `      drafting: [confirmed, superseded, ${NEW_STATE}]`)
    .replace('      confirmed: [superseded]',
             `      confirmed: [superseded, ${NEW_STATE}]`)
    .replace('      superseded: []',
             `      superseded: []\n      ${NEW_STATE}: []`);

  assert.notEqual(patched, original, 'the schema no longer looks the way this probe expects — update the probe');

  const probeDir = join(WORK, 'designs', NEW_STATE);
  const probe = join(probeDir, 'D-997-probe.md');
  await mkdir(probeDir, { recursive: true });
  try {
    await writeAndConfirm(schemaPath, patched);
    // 四块全缺：任何一条设计规则跑到了，这份记录都不可能通过。
    await writeAndConfirm(probe, ['---', 'id: D-997', 'title: no blocks at all', '---', 'nothing here'].join('\n'));

    let code = 0, stdout = '';
    try {
      const r = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/work.mjs'), 'check']);
      stdout = r.stdout;
    } catch (e) { code = e.code ?? 1; stdout = e.stdout ?? ''; }

    assert.equal(code, 1,
      `a design record with no blocks passed the check because its state was not in a `
      + `hardcoded list — the design rules must read work/schema.yml.\n${stdout}`);
  } finally {
    await unlink(probe).catch(() => {});
    await rmdir(probeDir).catch(() => {});
    await writeAndConfirm(schemaPath, original);
  }
});

test('design: a drafting record may be missing blocks, but not have an empty one', async () => {
  // 方法的做法是「每答完一问就落一行」，所以草稿阶段必然缺块——这必须通过。
  // 但「已经写出来的块」仍然受约束，否则草稿就成了规则管不着的角落。
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { unlink, mkdir, rmdir } = await import('node:fs/promises');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = join(WORK, 'designs/drafting');
  const partial = join(dir, 'D-995-partial.md');
  const emptyOne = join(dir, 'D-994-empty-block.md');

  const run = async () => {
    let code = 0, stdout = '';
    try {
      const r = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/work.mjs'), 'check']);
      stdout = r.stdout;
    } catch (e) { code = e.code ?? 1; stdout = e.stdout ?? ''; }
    return { code, stdout };
  };

  await mkdir(dir, { recursive: true });
  try {
    // 只写了一块 —— 应当通过
    await writeAndConfirm(partial, ['---', 'id: D-995', 'title: half written', '---',
      '## 一、流程形状', '', '固定两步。', ''].join('\n'));
    const a = await run();
    assert.equal(a.code, 0, `a half-written drafting record must pass:\n${a.stdout}`);

    // 写出了一个空块 —— 应当失败
    await writeAndConfirm(emptyOne, ['---', 'id: D-994', 'title: empty block', '---',
      '## 一、流程形状', '', '固定两步。', '', '## 二、拒绝清单', '', ''].join('\n'));
    const b = await run();
    assert.equal(b.code, 1, 'a block that was started and left empty is not the same as one not yet asked');
    assert.match(b.stdout, /D-994.*拒绝清单.*empty/);
  } finally {
    await unlink(partial).catch(() => {});
    await unlink(emptyOne).catch(() => {});
    await rmdir(dir).catch(() => {});
  }
});

test('live schema: a requirement can say "settled, verification not run"', async () => {
  // 试跑加上的。需求阶段有自己的 exit test——「念给一个不做这行的人听」——而它可能没跑。
  // 原来只有 drafting/confirmed，于是那个状态只能塞进 drafting，读起来像「还在写」。
  // 票据一直有 awaiting-verification，需求没有：同一个框架里，一个寄存器能说「差一步」，
  // 另一个不能。这是实测中撞到的八条缺口之一。
  const schema = await loadSchema();
  const r = schema.entities.requirement;

  assert.ok(r.states.includes('awaiting-verification'),
    'the need stage has an exit test; the register must be able to say it has not been run');

  // 与票据的形状一致：能进去、能确认、也能打回重写。
  assert.ok(r.transitions.drafting.includes('awaiting-verification'),
    'a drafted requirement goes to awaiting-verification');
  assert.ok(r.transitions['awaiting-verification'].includes('confirmed'),
    'a requirement whose exit test passed becomes confirmed');
  assert.ok(r.transitions['awaiting-verification'].includes('drafting'),
    'a requirement whose exit test failed goes back to drafting, as a ticket does to in-progress');

  // 用词与票据一致，不是另发明一个词。
  assert.ok(schema.entities.ticket.states.includes('awaiting-verification'),
    'the two registers should use the same word for the same situation');
});

// ─────────────────────────────────────────────────────────────────────────────
// 应答规则专项校验
//
// 六块里只有「拒绝清单」有专项规则（每行要写出具体输入 → 行为）。新加的
// 「应答规则」是一张决策表，却一直只受「块不是空的」这一条约束——写满
// 「尽最大努力」「按情况处理」也能过 check。这正是方法反复在治的那种
// 「检查不到的地方」。
// ─────────────────────────────────────────────────────────────────────────────

const RULE_HEADER = '| 具体输入 | 该怎么答 | 升级档次 | 依据 |\n|---|---|---|---|\n';

async function withDesignProbe(name, blocks, fn) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { unlink } = await import('node:fs/promises');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const probe = join(WORK, 'designs/confirmed', name);
  const body = ['---', `id: ${name.slice(0, 5)}`, 'title: probe', 'status: confirmed', '---', ...blocks,
    '## 七、什么情况说明这个设计错了', '', '拿不到真实输入时。', ''].join('\n');
  await writeAndConfirm(probe, body);
  try {
    let code = 0, stdout = '';
    try {
      const r = await promisify(execFile)(process.execPath, [resolve(root, 'scripts/work.mjs'), 'check']);
      stdout = r.stdout;
    } catch (e) { code = e.code ?? 1; stdout = e.stdout ?? ''; }
    await fn({ code, stdout });
  } finally {
    await unlink(probe).catch(() => {});
  }
}

const SIX_BLOCKS_OK = [
  '## 一、流程形状', '', '固定。', '',
  '## 二、拒绝清单', '', '- 某个具体输入 → 必须改做什么', '',
];

test('rules: a well-formed answer table passes', async () => {
  await withDesignProbe('D-980-ok.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', RULE_HEADER +
      '| 买家问关税 | 答买家承担 | 不升级 | 政策 8 |' + '\n' +
      '| 买家问能不能治湿疹 | 不答，转人 | 硬升级 | 政策 2 |', '',
    '## 四、动作权限', '', '| 动作 | 档 | 理由 |', '|---|---|---|', '| 读政策 | 可撤销 | 只读 |', '',
    '## 五、交接契约', '', '（跳过：本轮不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    assert.equal(code, 0, `a good record must pass:\n${stdout}`);
  });
});

test('rules: a row with no concrete input fails', async () => {
  await withDesignProbe('D-979-noinput.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', RULE_HEADER +
      '|  | 按情况处理 | 不升级 | 无 |', '',
    '## 四、动作权限', '', '| 动作 | 档 | 理由 |', '|---|---|---|', '| 读政策 | 可撤销 | 只读 |', '',
    '## 五、交接契约', '', '（跳过：不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    assert.equal(code, 1, 'a row naming no input cannot become a check');
    assert.match(stdout, /应答规则 row \d+ has no concrete input/);
  });
});

test('rules: an invalid escalation tier fails', async () => {
  // 档次只有三个值。第四种写法（「看情况」）会让实现者自己发明语义。
  await withDesignProbe('D-978-badtier.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', RULE_HEADER +
      '| 买家问关税 | 看情况答 | 视情况而定 | 政策 8 |', '',
    '## 四、动作权限', '', '| 动作 | 档 | 理由 |', '|---|---|---|', '| 读政策 | 可撤销 | 只读 |', '',
    '## 五、交接契约', '', '（跳过：不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    assert.equal(code, 1, 'the escalation tier has exactly three legal values');
    assert.match(stdout, /升级档次/);
  });
});

test('rules: an answer of "handle it appropriately" fails', async () => {
  // 这就是「价值观画上了表格」——看起来是一行，测不了。
  await withDesignProbe('D-977-vague.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', RULE_HEADER +
      '| 买家问关税 | 妥善处理 | 不升级 | 政策 8 |', '',
    '## 四、动作权限', '', '| 动作 | 档 | 理由 |', '|---|---|---|', '| 读政策 | 可撤销 | 只读 |', '',
    '## 五、交接契约', '', '（跳过：不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    assert.equal(code, 1);
    assert.match(stdout, /该怎么答/);
  });
});

test('rules: the table must carry all four columns', async () => {
  await withDesignProbe('D-976-cols.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', '| 具体输入 | 该怎么答 |', '|---|---|', '| 买家问关税 | 答买家承担 |', '',
    '## 四、动作权限', '', '| 动作 | 档 | 理由 |', '|---|---|---|', '| 读政策 | 可撤销 | 只读 |', '',
    '## 五、交接契约', '', '（跳过：不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    assert.equal(code, 1, '升级档次 and 依据 are not optional');
    assert.match(stdout, /应答规则.*missing column/);
  });
});

test('rules: a skipped answer table with a reason passes', async () => {
  // 只有一条路径的产品可以没有决策表，但必须写清为什么。
  await withDesignProbe('D-975-skip.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', '（跳过：整个产品只有一条路径，见流程形状）', '',
    '## 四、动作权限', '', '| 动作 | 档 | 理由 |', '|---|---|---|', '| 读政策 | 可撤销 | 只读 |', '',
    '## 五、交接契约', '', '（跳过：不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    assert.equal(code, 0, `an explicit skip is not an omission:\n${stdout}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 跨块约束：应答规则要求的动作，必须能在动作权限表里找到
//
// 三轮实测里，每一处硬矛盾都是跨块的：表格要求了权限表里不存在的动作，而五块
// 是各自独立回答的五个问题，唯一会比较它们的只有 exit test——而它只给一个数字。
// 这条在 skill 里写下来过，当时是靠人工逐行核对发现的。现在是检查。
// ─────────────────────────────────────────────────────────────────────────────

test('cross-block: a read the answer table requires must exist in the permission table', async () => {
  // 「陈述适用月龄」需要一个读商品事实的动作。权限表里没有它，就是硬矛盾——
  // 实测里正是这一处，靠人工发现的。
  await withDesignProbe('D-974-noread.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', RULE_HEADER +
      '| 买家问宝宝多大能用 | 查商品适用月龄后陈述 | 不升级 | 政策 3 |', '',
    '## 四、动作权限', '', '| 动作 | 档 | 理由 |', '|---|---|---|',
    '| 读买家消息 | 可撤销 | 只读 |', '| 起草回复 | 可撤销 | 草稿不出门 |', '',
    '## 五、交接契约', '', '（跳过：不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    assert.equal(code, 1, 'a row that reads something the permission table does not grant is a cross-block contradiction');
    assert.match(stdout, /应答规则 row 1/);
    assert.match(stdout, /商品适用月龄|适用月龄/);
  });
});

test('cross-block: the same row passes once the permission exists', async () => {
  await withDesignProbe('D-973-withread.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', RULE_HEADER +
      '| 买家问宝宝多大能用 | 查商品适用月龄后陈述 | 不升级 | 政策 3 |', '',
    '## 四、动作权限', '', '| 动作 | 档 | 理由 |', '|---|---|---|',
    '| 读买家消息 | 可撤销 | 只读 |', '| 读商品信息（成分、适用月龄） | 可撤销 | 只读 |', '| 起草回复 | 可撤销 | 草稿不出门 |', '',
    '## 五、交接契约', '', '（跳过：不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    assert.equal(code, 0, `the permission is there, so there is no contradiction:\n${stdout}`);
  });
});

test('cross-block: an action the answer claims to perform must be permitted or absent', async () => {
  // 「按政策给补偿」是一个动作。权限表里没有它 → 矛盾。
  // 正确写法是「说明符合哪条政策、由人执行」——草稿不冒充自己做了一个动作。
  await withDesignProbe('D-972-act.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', RULE_HEADER +
      '| 买家要求补偿 | 直接发放优惠券 | 不升级 | 政策 6 |', '',
    '## 四、动作权限', '', '| 动作 | 档 | 理由 |', '|---|---|---|',
    '| 读买家消息 | 可撤销 | 只读 |', '| 起草回复 | 可撤销 | 草稿不出门 |', '| 发送给买家 | 不在范围 | 由人做 |', '',
    '## 五、交接契约', '', '（跳过：不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    assert.equal(code, 1, 'the answer performs an action nobody granted');
    assert.match(stdout, /应答规则 row 1/);
  });
});

test('cross-block: a page with no permission table fails rather than passing vacuously', async () => {
  // 空表是最容易骗过跨块检查的形状：没有任何动作，于是没有任何矛盾。
  await withDesignProbe('D-971-noperm.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', RULE_HEADER +
      '| 买家问关税 | 查订单后陈述 | 不升级 | 政策 8 |', '',
    '## 四、动作权限', '', '（跳过：只读，没有动作）', '',
    '## 五、交接契约', '', '（跳过：不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    assert.equal(code, 1, 'an answer that reads something needs a permission for it; a skipped table is not a free pass');
    assert.match(stdout, /动作权限/);
  });
});

test('cross-block: its deliberate blind spot, written down rather than discovered later', async () => {
  // 这个检查是启发式的，而启发式会有方向。这里把已知的漏报方向钉成一条测试，
  // 免得以后有人以为它覆盖得比实际多。
  //
  // 漏报：答案描述的是一个**过程**而不是一个动作（「按月龄告知家长」）时，
  // 认不出动词，于是不报。这个方向是有意选的——宁可漏，也不乱叫。
  await withDesignProbe('D-969-blind.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', RULE_HEADER +
      '| 买家问宝宝多大能用 | 按月龄告知家长 | 不升级 | 政策 3 |', '',
    '## 四、动作权限', '', '| 动作 | 档 | 理由 |', '|---|---|---|',
    '| 读买家消息 | 可撤销 | 只读 |', '| 起草回复 | 可撤销 | 草稿不出门 |', '',
    '## 五、交接契约', '', '（跳过：不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    // 它没有「读/查/取」这类动词，所以这条**不报**。这就是它覆盖不到的地方。
    assert.equal(code, 0, `this is the known blind spot: a described process is not an action.\n${stdout}`);
  });
});

test('cross-block: the check is scoped — prose outside the table is not scanned', async () => {
  // 只查表格的「该怎么答」列。块里的说明文字不参与，否则一段解释会被当成要求。
  await withDesignProbe('D-968-prose.md', [
    ...SIX_BLOCKS_OK,
    '## 三、应答规则', '', '这一段说明里提到了「查订单」这件事，但它在表格外面。', '',
    RULE_HEADER + '| 买家问关税 | 答买家承担 | 不升级 | 政策 8 |', '',
    '## 四、动作权限', '', '| 动作 | 档 | 理由 |', '|---|---|---|',
    '| 读买家消息 | 可撤销 | 只读 |', '| 起草回复 | 可撤销 | 草稿不出门 |', '',
    '## 五、交接契约', '', '（跳过：不涉及工具）', '',
    '## 六、产出形态', '', '1. 走通 → 一张草稿。', '',
  ], async ({ code, stdout }) => {
    assert.equal(code, 0, `prose is not a rule:\n${stdout}`);
  });
});
