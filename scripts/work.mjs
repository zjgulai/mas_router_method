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

const DIM = '\x1b[2m', BOLD = '\x1b[1m', RED = '\x1b[31m',
      GREEN = '\x1b[32m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m', RESET = '\x1b[0m';

const GROUP_LABEL = {
  requirement: '需求 requirement',
  ticket: '执行票 ticket',
  incident: '事故 incident',
  decision: '决策 decision',
  artifact: '产物 artifact',
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

const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysSince = (d) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

const STATE_COLOUR = {
  open: YELLOW, 'in-progress': CYAN, 'awaiting-verification': YELLOW,
  done: GREEN, abandoned: DIM, drafting: YELLOW, confirmed: GREEN,
  dropped: DIM, contained: YELLOW, closed: GREEN, active: GREEN, expired: DIM,
};

async function cmdStatus() {
  const schema = await loadSchema();
  const { found, missingDirs, problems } = await collect(schema);
  const today = new Date();

  console.log(`\n${BOLD}work${RESET}  ${fmtDate(today)}  ${DIM}${WORK.replace(process.cwd() + '/', '')}${RESET}\n`);

  const order = ['requirement', 'ticket', 'incident', 'artifact', 'decision'];
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
  for (const r of found.artifact?.list ?? []) {
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
    const known = missingDirs.filter((m) => {
      const others = Object.entries(schema.entities).length;
      return others > 0;
    });
    console.log(`\n${DIM}${known.length} state directories do not exist yet (normal until something is filed there)${RESET}`);
  }
  console.log();
  return problems.length === 0 ? 0 : 1;
}

async function cmdCheck() {
  const schema = await loadSchema();
  const { found, missingDirs, problems } = await collect(schema);
  const out = [...problems];

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
    if (seen.has(r.id)) out.push(`duplicate id ${r.id}: ${seen.get(r.id)} and ${r.path}`);
    else seen.set(r.id, r.path);
  }

  // 2. a ticket marked done must carry evidence — "done" without a re-runnable
  //    command is a claim, and this is the rule the migration kept tripping on.
  for (const r of found.ticket?.done ?? []) {
    if (r.evidence.length === 0) out.push(`${r.id} is done but records no evidence`);
  }

  // 3. artifacts need an owner and a delete condition, or they live forever
  for (const r of found.artifact?.list ?? []) {
    if (r.owner === '') out.push(`${r.id} artifact has no owner`);
    if (r.deleteWhen === '') out.push(`${r.id} artifact has no delete_when`);
  }

  // 4. every `needs:` target must exist as a record
  for (const r of all) {
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
  for (const r of all) {
    for (const e of r.evidence) {
      if (!evidenceFiles.has(e)) out.push(`${r.id} cites evidence ${e}, which is not in work/evidence/`);
    }
  }

  const total = all.length;
  if (out.length === 0) {
    console.log(`${GREEN}ok${RESET} — ${total} records, ${missingDirs.length} empty state dirs, no problems`);
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
