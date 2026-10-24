#!/usr/bin/env node
/**
 * work — read the project's own record, from disk.
 *
 * Read-only on purpose. Changing state means moving a file, which is a git
 * operation you can see and revert. A writing command is a later step.
 *
 * Every directory name and every state comes from `work/schema.yml` via
 * `scripts/schema.mjs`. Nothing here hardcodes one — an earlier version did, and
 * reported five existing tickets as zero while claiming everything was fine.
 *
 * Usage:
 *   node scripts/work.mjs status      what exists, by state
 *   node scripts/work.mjs check       validate every record; exit 1 on problems
 *   node scripts/work.mjs timeline    newest first
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSchema, stateDir, flatDir, WORK } from './schema.mjs';
import { sections } from './markdown.mjs';

const DIM = '\x1b[2m', BOLD = '\x1b[1m', RED = '\x1b[31m',
      GREEN = '\x1b[32m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m', RESET = '\x1b[0m';

const GROUP_LABEL = {
  requirement: '需求 requirement',
  ticket: '执行票 ticket',
  incident: '事故 incident',
  decision: '决策 decision',
  artifact: '产物 artifact',
  design: '设计记录 design',
};

/** Frontmatter: `---` fenced, `key: value`, `key: [a, b]`. */
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { data: {} };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { data: {} };
  const data = {};
  for (const line of text.slice(3, end).split('\n')) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (m === null) continue;
    const [, key, value] = m;
    data[key] = value.startsWith('[') && value.endsWith(']')
      ? value.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
      : value;
  }
  return { data };
}

async function readRecord(kind, dirName, state, file) {
  const path = join(dirName, file);
  const [{ data }, s] = await Promise.all([readFile(path, 'utf8').then(parseFrontmatter), stat(path)]);
  return {
    kind, state, file, path,
    id: data.id ?? file.replace(/\.md$/, ''),
    title: data.title ?? '',
    stage: data.stage ?? '',
    needs: data.needs ?? [],
    evidence: data.evidence ?? [],
    owner: data.owner ?? '',
    expires: data.expires ?? '',
    deleteWhen: data.delete_when ?? '',
    ticket: data.ticket ?? '',
    mtime: s.mtime,
  };
}

/**
 * Read every record. Returns what was found and what was expected but missing.
 *
 * The distinction matters: a state directory that does not exist because nothing
 * has ever been filed there is normal. A state directory that does not exist for
 * an entity whose other directories do exist is a broken path — and that is
 * exactly the bug that made five tickets invisible.
 */
async function collect(schema) {
  const found = {};
  const missingDirs = [];
  const problems = [];

  /*
   * Append-only registers (evidence, receipts) have no state machine, so the loop
   * below skips them by construction. The first version skipped them entirely and
   * `check` reported "5 records" while three evidence files sat on disk — a count
   * that is wrong is worse than no count.
   */
  for (const name of schema.appendOnly) {
    const dir = join(WORK, name);
    let files = [];
    try { files = await readdir(dir); } catch { files = []; }
    found[name] = { list: [] };
    for (const f of files.filter((x) => x.endsWith('.md'))) {
      const rec = await readRecord(name, dir, 'append', f);
      found[name].list.push({ ...rec, state: 'append' });
    }
  }

  for (const [kind, def] of Object.entries(schema.entities)) {
    found[kind] = {};
    const flat = def.transitions === undefined || Object.keys(def.transitions).length === 0;

    if (flat) {
      // decisions and artifacts carry state in frontmatter: moving an ADR between
      // directories would rewrite where history lives.
      const dir = flatDir(schema, kind);
      let files = [];
      try { files = await readdir(dir); } catch { files = []; }
      const list = [];
      for (const f of files.filter((x) => x.endsWith('.md'))) {
        const rec = await readRecord(kind, dir, 'flat', f);
        list.push({ ...rec, state: rec.state === 'flat' ? 'unknown' : rec.state });
        const text = await readFile(join(dir, f), 'utf8');
        const fmStatus = /^status:\s*(.*)$/m.exec(text);
        if (fmStatus !== null) list[list.length - 1].state = fmStatus[1].trim();
      }
      found[kind].list = list;
      continue;
    }

    for (const state of def.states) {
      const dir = stateDir(schema, kind, state);
      let files;
      try {
        files = await readdir(dir);
      } catch (cause) {
        if (cause.code === 'ENOENT') { missingDirs.push({ kind, state, dir }); continue; }
        problems.push(`${kind}/${state}: cannot read ${dir} (${cause.code})`);
        continue;
      }
      const md = files.filter((x) => x.endsWith('.md'));
      if (md.length === 0) continue;
      found[kind][state] = [];
      for (const f of md) {
        const rec = await readRecord(kind, dir, state, f);
        found[kind][state].push(rec);
        if (!f.startsWith(rec.id)) {
          problems.push(`${kind}/${state}/${f}: id "${rec.id}" does not match filename`);
        }
      }
    }
  }

  return { found, missingDirs, problems };
}

/**
 * 取某一类实体在任意形态下的全部记录。
 *
 * artifacts 原本是扁平实体，后来改成了状态目录，而有两条规则仍然在念
 * `found[kind].list` —— 那个字段只有扁平实体才有。于是「没有 delete_when 的
 * artifact 必须失败」这条规则悄悄地不再运行了：一个永远不会变红的检查。
 * 没人发现，是因为从来没有任何 artifact 被登记过。这就是那个 bug 的修复。
 */
function recordsOf(bucket) {
  if (bucket === undefined) return [];
  if (Array.isArray(bucket.list)) return bucket.list;
  const out = [];
  for (const v of Object.values(bucket)) if (Array.isArray(v)) out.push(...v);
  return out;
}

const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysSince = (d) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

const STATE_COLOUR = {
  open: YELLOW, 'in-progress': CYAN, 'awaiting-verification': YELLOW,
  done: GREEN, abandoned: DIM, drafting: YELLOW, confirmed: GREEN,
  dropped: DIM, contained: YELLOW, closed: GREEN, active: GREEN, expired: DIM,
  drafting: YELLOW, confirmed: GREEN, superseded: DIM,
};

async function cmdStatus() {
  const schema = await loadSchema();
  const { found, missingDirs, problems } = await collect(schema);
  const today = new Date();

  console.log(`\n${BOLD}work${RESET}  ${fmtDate(today)}  ${DIM}${WORK.replace(process.cwd() + '/', '')}${RESET}\n`);

  const order = ['requirement', 'design', 'ticket', 'incident', 'artifact', 'decision'];
  for (const kind of order) {
    const def = schema.entities[kind];
    if (def === undefined) continue;
    const bucket = found[kind] ?? {};

    if (bucket.list !== undefined) {
      const items = bucket.list;
      console.log(`${BOLD}${GROUP_LABEL[kind] ?? kind}${RESET} ${DIM}(${items.length})${RESET}`);
      if (items.length === 0) { console.log(`  ${DIM}—${RESET}`); console.log(); continue; }
      for (const r of items.sort((a, b) => a.id.localeCompare(b.id))) {
        const expired = r.expires !== '' && r.expires < fmtDate(today) ? ` ${RED}EXPIRED ${r.expires}${RESET}` : '';
        const who = r.owner !== '' ? `${DIM}${r.owner}${RESET}` : `${RED}no owner${RESET}`;
        console.log(`  ${DIM}${r.id.padEnd(9)}${RESET}${r.title.slice(0, 46).padEnd(46)}  ${who}${expired}`);
      }
      console.log();
      continue;
    }

    const total = def.states.reduce((n, s) => n + (bucket[s]?.length ?? 0), 0);
    console.log(`${BOLD}${GROUP_LABEL[kind] ?? kind}${RESET} ${DIM}(${total})${RESET}`);
    if (total === 0) { console.log(`  ${DIM}—${RESET}`); console.log(); continue; }

    for (const state of def.states) {
      const items = bucket[state] ?? [];
      if (items.length === 0) continue;
      const colour = STATE_COLOUR[state] ?? YELLOW;
      console.log(`  ${colour}${state}${RESET} ${DIM}${items.length}${RESET}`);
      for (const r of items.sort((a, b) => a.id.localeCompare(b.id))) {
        const quiet = daysSince(r.mtime);
        const stuck = (state === 'in-progress' || state === 'open') && quiet > 14 ? ` ${RED}quiet ${quiet}d${RESET}` : '';
        console.log(`    ${r.id.padEnd(9)}${r.title.slice(0, 58)}${stuck}`);
      }
    }
    console.log();
  }

  // What needs a human. Facts with reasons, not a verdict.
  const attention = [];
  for (const r of found.ticket?.['awaiting-verification'] ?? []) attention.push(`${r.id} waiting for verification — ${r.title}`);
  for (const r of found.ticket?.['in-progress'] ?? []) {
    if (daysSince(r.mtime) > 14) attention.push(`${r.id} in progress, untouched ${daysSince(r.mtime)} days`);
  }
  for (const r of found.incident?.open ?? []) attention.push(`${r.id} incident open — ${r.title}`);
  for (const r of recordsOf(found.artifact)) {
    if (r.expires !== '' && r.expires < fmtDate(today)) attention.push(`${r.id} expired ${r.expires} — ${r.title}`);
    if (r.owner === '') attention.push(`${r.id} has no owner — ${r.title}`);
  }

  // Append-only registers: no states, just a count and the newest few.
  for (const name of schema.appendOnly) {
    const items = found[name]?.list ?? [];
    const label = name === 'evidence' ? '证据 evidence' : name === 'receipts' ? '回执 receipt' : name;
    console.log(`${BOLD}${label}${RESET} ${DIM}(${items.length}, append-only)${RESET}`);
    if (items.length === 0) { console.log(`  ${DIM}—${RESET}`); console.log(); continue; }
    for (const r of items.slice(-4).reverse()) {
      console.log(`  ${DIM}${r.id.padEnd(9)}${RESET}${r.title ? r.title.slice(0, 40) : r.file.slice(0, 40).padEnd(40)}  ${DIM}${r.ticket ? 'for ' + r.ticket : ''}${RESET}`);
    }
    console.log();
  }

  console.log(`${BOLD}needs you${RESET} ${DIM}(${attention.length})${RESET}`);
  if (attention.length === 0) console.log(`  ${GREEN}nothing${RESET}`);
  else for (const a of attention) console.log(`  ${YELLOW}•${RESET} ${a}`);

  if (problems.length > 0) {
    console.log(`\n${RED}record problems ${problems.length}${RESET} ${DIM}(run \`work check\`)${RESET}`);
    for (const p of problems.slice(0, 5)) console.log(`  ${RED}•${RESET} ${p}`);
  }
  if (missingDirs.length > 0) {
    // 这里原本是一个恒真的 filter（谓词里算了 others 却没用它），所以它只是把
    // missingDirs 原样复制了一遍。删掉，直接数。
    console.log(`\n${DIM}${missingDirs.length} state directories do not exist yet (normal until something is filed there)${RESET}`);
  }
  console.log();
  return problems.length === 0 ? 0 : 1;
}

async function cmdCheck() {
  // `--only design` runs just the design-record rules. CI calls it as its own
  // step so that "a design question was never asked" names itself instead of
  // arriving as one more line under "records are invalid".
  const only = process.argv.includes('--only')
    ? process.argv[process.argv.indexOf('--only') + 1]
    : null;

  const schema = await loadSchema();
  const { found, missingDirs, problems } = await collect(schema);

  // collect() 的问题**始终**保留，即使带了 --only。
  // 那些问题说的是树的形状本身：id 与文件名不符、目录读不出来。树坏了的时候，
  // 一个局部的 "ok" 是假的——而这正是 --only design 要拿去当 CI 门禁的那条输出。
  const out = [...problems];

  const runAll = only === null;

  // 1. ids unique across all records
  const seen = new Map();
  const all = [];
  for (const [, def] of Object.entries(schema.entities)) {
    const bucket = found[def.name] ?? {};
    for (const [k, v] of Object.entries(bucket)) {
      if (Array.isArray(v)) all.push(...v);
    }
  }
  for (const name of schema.appendOnly) {
    for (const r of found[name]?.list ?? []) all.push(r);
  }
  for (const r of all) {
    if (seen.has(r.id) && runAll) out.push(`duplicate id ${r.id}: ${seen.get(r.id)} and ${r.path}`);
    else seen.set(r.id, r.path);
  }

  // 2. a ticket marked done must carry evidence — "done" without a re-runnable
  //    command is a claim, and this is the rule the migration kept tripping on.
  if (runAll) for (const r of found.ticket?.done ?? []) {
    if (r.evidence.length === 0) out.push(`${r.id} is done but records no evidence`);
  }

  // 3. artifacts need an owner and a delete condition, or they live forever
  if (runAll) for (const r of recordsOf(found.artifact)) {
    if (r.owner === '') out.push(`${r.id} artifact has no owner`);
    if (r.deleteWhen === '') out.push(`${r.id} artifact has no delete_when`);
  }

  // 4. every `needs:` target must exist as a record
  if (runAll) for (const r of all) {
    for (const n of r.needs) {
      if (![...seen.keys()].includes(n) && !/^ADR-/.test(n) && !/^R-/.test(n)) {
        out.push(`${r.id} needs ${n}, which does not exist`);
      }
    }
  }

  // 5. every evidence file named by a ticket must exist
  const evidenceFiles = new Set();
  try {
    for (const f of await readdir(join(WORK, 'evidence'))) {
      if (f.endsWith('.md')) evidenceFiles.add(f.split('-').slice(0, 2).join('-'));
    }
  } catch { /* no evidence dir yet */ }
  if (runAll) for (const r of all) {
    for (const e of r.evidence) {
      if (!evidenceFiles.has(e)) out.push(`${r.id} cites evidence ${e}, which is not in work/evidence/`);
    }
  }

  // 6. a design record must carry its four blocks. The blocks are the four
  //    questions from anb-design; a design missing one was never asked, and
  //    stage 3 will then have nothing to turn into checks.
  //
  //    A block may be skipped, but only explicitly: `（跳过：<reason>）`. Silence
  //    and a decision not to ask are different things, and in three months they
  //    read identically — which is why the skip has to carry a reason.
  //
  //    Parsing note: the first version matched a block with
  //    `/^##[^\n]*KEY([\s\S]*?)(?=^## |\s*$)/m`. The `\s*$` alternative matches
  //    at the end of *any* line under `m`, so every block was truncated to the
  //    blank line after its heading and four correct records reported as empty.
  //    A checker that cries wolf gets switched off, so this splits instead.
  const DESIGN_BLOCKS = [
    { key: '流程形状', what: 'the shape of the flow' },
    { key: '拒绝清单', what: 'what it must refuse' },
    { key: '动作权限', what: 'what it may do without asking' },
    { key: '交接契约', what: 'what the model sees when it acts' },
  ];

  // 解析器在 scripts/markdown.mjs —— design.mjs 也要用它，而且它第一版的 bug
  // 值得只修一次（见那个文件顶部的说明）。

  // 状态从 schema 读，不写死。
  //
  // 这份列表原本硬编码成三个状态。给 design 加第四个状态之后，落在新状态里的记录
  // 四块全缺也照样通过 check —— 同一个 bug 在同一个文件里已经犯过三次：
  // 先是 ticket 的目录名（复数）、再是 artifact 的读取方式，现在是这个。
  // 每一次的形式都一样：某处抄了一份本该只有一份的东西。
  const designStates = schema.entities.design.states;
  for (const bucket of designStates) {
    // `drafting` 是唯一一个「还没答完」的状态，所以它的块可以是空的。
    //
    // 不豁免它，方法就自相矛盾了：anb-design 明说「每答完一问就落一行，不是写完再落」，
    // 而这条检查会在四块齐之前一律判失败——照方法说的做，通不过方法自己的检查。
    // 实测中撞到：写完第一块（流程形状）跑 check，报出「拒绝清单 was never asked」，
    // 而那一块是还没问到，不是从没问过。
    //
    // 其余状态（confirmed、superseded，以及将来新增的）都表示「已经答过」，
    // 一律要求四块齐全。
    const answering = bucket === 'drafting';
    for (const r of found.design?.[bucket] ?? []) {
      const text = await readFile(r.path, 'utf8');
      const secs = sections(text);

      for (const block of DESIGN_BLOCKS) {
        const sec = secs.find((x) => x.head.includes(block.key));
        // 草稿阶段允许「还没问到」——但只允许这一种缺失。
        // 已经写出来的块一律受规则约束，否则草稿就成了规则管不着的角落：
        // 第一版豁免写成了整条 `continue`，于是「拒绝清单写成价值观」在草稿阶段
        // 也能蒙过去——被现有测试当场抓出，说明豁免的粒度写粗了。
        if (sec === undefined) {
          if (!answering) out.push(`${r.id}: no 「${block.key}」 block — ${block.what} was never asked`);
          continue;
        }
        if (sec.body === '') {
          out.push(`${r.id}: 「${block.key}」 is empty — say what it is, or mark it 跳过 with a reason`);
        } else if (/跳过/.test(sec.body) && !/跳过[：:]\s*\S/.test(sec.body)) {
          out.push(`${r.id}: 「${block.key}」 is marked skipped without a reason`);
        }
      }

      // A refusal row that names no concrete input cannot become a check at
      // stage 3 — and becoming a check is the only reason to write it here.
      const refusal = secs.find((x) => x.head.includes('拒绝清单'));
      if (refusal !== undefined && !/跳过[：:]/.test(refusal.body)) {
        const rows = refusal.body.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('-') || l.startsWith('|'));
        const concrete = rows.filter((l) => /→|->/.test(l));
        if (rows.length > 0 && concrete.length === 0) {
          out.push(`${r.id}: refusal list names no concrete input → behaviour, so none of it can become a check`);
        }
      }

      if (bucket === 'confirmed' && !/被推翻|重议|什么情况.{0,8}错/.test(text)) {
        out.push(`${r.id}: confirmed but records no condition that would make this design wrong`);
      }
    }
  }

  const total = all.length;
  const scope = only === null ? '' : ` (--only ${only})`;
  if (out.length === 0) {
    const designs = schema.entities.design.states
      .reduce((n, s2) => n + (found.design?.[s2]?.length ?? 0), 0);
    console.log(`${GREEN}ok${RESET} — ${total} records${only === 'design' ? `, ${designs} design` : ''}, ${missingDirs.length} empty state dirs, no problems${scope}`);
    return 0;
  }
  console.log(`${RED}${out.length} problem(s)${RESET} across ${total} records\n`);
  for (const p of out) console.log(`  ${RED}•${RESET} ${p}`);
  return 1;
}

async function cmdTimeline() {
  const schema = await loadSchema();
  const { found } = await collect(schema);
  const all = [];
  for (const [, def] of Object.entries(schema.entities)) {
    const bucket = found[def.name] ?? {};
    for (const [, v] of Object.entries(bucket)) if (Array.isArray(v)) all.push(...v);
  }
  all.sort((a, b) => b.mtime - a.mtime);

  console.log(`\n${BOLD}timeline${RESET} ${DIM}newest first${RESET}\n`);
  if (all.length === 0) { console.log(`  ${DIM}nothing recorded yet${RESET}\n`); return; }
  for (const r of all.slice(0, 40)) {
    const colour = STATE_COLOUR[r.state] ?? DIM;
    console.log(`  ${fmtDate(r.mtime)}  ${colour}${(r.state ?? '').padEnd(21)}${RESET}${r.id.padEnd(9)}${r.title.slice(0, 50)}`);
  }
  console.log();
}

const cmd = process.argv[2] ?? 'status';
if (cmd === 'status') process.exitCode = await cmdStatus();
else if (cmd === 'check') process.exitCode = await cmdCheck();
else if (cmd === 'timeline') await cmdTimeline();
else { console.error(`unknown command: ${cmd}\n  status | check | timeline`); process.exitCode = 1; }
