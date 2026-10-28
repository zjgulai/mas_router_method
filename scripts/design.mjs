#!/usr/bin/env node
/**
 * design — read a confirmed design record into what the later stages consume.
 *
 * The design stage's most useful output is its refusal list: a concrete input and
 * what the product must do instead. Its exit test promises the verify stage will
 * turn every row into a check. Until now nothing read the file — `work check`
 * validated its shape and no stage consumed its contents — so the record was a
 * document where it was meant to be a spec. This is the receiving end.
 *
 * The reason this is a command and not an instruction to "read the file": a
 * record with a deliberately skipped refusal list must not come back looking like
 * a record with nothing to refuse. Those mean opposite things, and only a reader
 * that can tell them apart is worth having.
 *
 * Usage:
 *   node scripts/design.mjs latest [--dir <path>]
 *   node scripts/design.mjs refusals [D-NNN]
 *   node scripts/design.mjs constraints [D-NNN]
 *
 * Exit codes:
 *   0  printed what was asked for
 *   3  there is nothing to read, and the reason is on stdout — distinct from
 *      "the design says there is nothing to refuse"
 *   1  usage error, or the named record does not exist
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WORK } from './schema.mjs';
import { sections, section, skipReason, tablesIn } from './markdown.mjs';

const RED = '\x1b[31m', YELLOW = '\x1b[33m', GREEN = '\x1b[32m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const NOTHING_TO_READ = 3;

const ID_RE = /^(D-\d{3})-/;

/**
 * The newest confirmed design, by number.
 *
 * By number, not by readdir order or filename sort: `D-010` sorts before `D-002`
 * as a string, and readdir makes no promise at all. Picking the wrong record
 * silently is worse than picking none.
 */
export function pickLatest(records) {
  let best = null;
  let bestN = -1;
  for (const r of records) {
    const m = /^D-(\d+)/.exec(r.id ?? '');
    if (m === null) continue;
    const n = Number(m[1]);
    if (n > bestN) { bestN = n; best = r.id; }
  }
  return best;
}

/** Every design record in a directory, as `{ id, path }`. */
async function load(dir) {
  const files = await readdir(dir).catch(() => []);
  const out = [];
  for (const f of files.filter((x) => x.endsWith('.md'))) {
    const m = ID_RE.exec(f);
    if (m === null) continue;
    out.push({ id: m[1], path: join(dir, f) });
  }
  return out;
}

/**
 * Explicit argument parsing.
 *
 * The first version found the positional argument by elimination — "the first arg
 * that is not a flag and does not look like the --dir value". That works for the
 * usage it was written against and quietly does something else the moment an
 * argument is added, which is the failure mode this whole repo is about.
 */
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [name, inline] = a.slice(2).split('=');
      flags[name] = inline ?? argv[++i];
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

const { flags, positional } = parseArgs(process.argv.slice(2));
const dir = flags.dir ?? join(WORK, 'designs', 'confirmed');
const recordId = positional[1] ?? null;

/** Resolve the record to read: the named one, or the newest confirmed. */
async function resolveRecord() {
  const records = await load(dir);
  if (recordId !== null && /^D-\d/.test(recordId)) {
    const found = records.find((r) => r.id === recordId);
    if (found === undefined) {
      console.log(`${RED}no confirmed design record ${recordId} in ${dir}${RESET}`);
      console.log(`${DIM}available: ${records.map((r) => r.id).join(', ') || '(none)'}${RESET}`);
      process.exitCode = 1;
      return null;
    }
    return found;
  }

  if (records.length === 0) {
    console.log(`no confirmed design record in ${dir}`);
    console.log(`${DIM}The design stage produces one when all four questions are answered.`);
    console.log(`Without it there is no refusal list to turn into checks, and no action`);
    console.log(`permissions to respect — which is not the same as "nothing to refuse".${RESET}`);
    process.exitCode = NOTHING_TO_READ;
    return null;
  }

  const latest = pickLatest(records);
  return records.find((r) => r.id === latest) ?? null;
}

/*
 * Only run the CLI when this file *is* the program.
 *
 * Without this guard, `import { pickLatest } from './design.mjs'` executes the
 * dispatch below inside the importing process — the test runner — where argv[2] is
 * a test path, so it takes the usage branch and sets a failing exit code. The
 * tests all passed and the file still reported failure.
 */
const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

const cmd = positional[0] ?? '';

if (!isMain) {
  // imported for its exports; nothing to dispatch
} else if (cmd === 'latest') {
  const records = await load(dir);
  if (records.length === 0) {
    console.log(`no confirmed design record in ${dir}`);
    console.log(`${DIM}Nothing to read — which is not the same as "the design says there is nothing".${RESET}`);
    process.exitCode = NOTHING_TO_READ;
  } else {
    console.log(pickLatest(records));
  }
} else if (cmd === 'refusals' || cmd === 'constraints') {
  const record = await resolveRecord();
  if (record !== null) {
    const text = await readFile(record.path, 'utf8');

    if (cmd === 'refusals') {
      // 两块都读。实测之前它们是一块，而十一行里只有三行是禁令、八行是「该怎么答」。
      // 验证阶段要把两者都变成检查，所以两者都要交出去。
      const rules = section(text, '应答规则');
      let ruleCount = 0;
      if (rules !== undefined) {
        console.log(`${BOLD}${record.id}${RESET} ${DIM}应答规则 / how each case is answered${RESET}\n`);
        const skipRules = skipReason(rules.body);
        if (skipRules !== null) console.log(`${YELLOW}跳过：${skipRules}${RESET}`);
        else {
          // 用表格解析器，不用「按 | 切行」——后者遇到容器块里的说明文字会错位。
          for (const t of tablesIn(rules.body)) {
            for (const row of t.rows) console.log('| ' + row.join(' | ') + ' |');
            ruleCount += t.rows.length;
          }
          console.log(`\n${DIM}${ruleCount} 行规则；每一行都要在验收阶段变成一条检查。${RESET}`);
        }
        console.log();
      }
      const sec = section(text, '拒绝清单');
      console.log(`${BOLD}${record.id}${RESET} ${DIM}拒绝清单 / what it must refuse（只有禁令）${RESET}\n`);
      if (sec === undefined) {
        console.log(`${YELLOW}no 「拒绝清单」 section — this record does not say what it refuses${RESET}`);
      } else {
        const skip = skipReason(sec.body);
        if (skip !== null) {
          // 关键区分：跳过是有理由的空白，不是「没有要拒绝的」。
          console.log(`${YELLOW}跳过：${skip}${RESET}`);
          console.log(`${DIM}This layer of guardrails is empty by decision, not by oversight.`);
          console.log(`Stage verify must report it that way rather than as "nothing to refuse".${RESET}`);
        } else {
          const rows = sec.body.split('\n')
            .map((l) => l.trim())
            .filter((l) => l.startsWith('-') || l.startsWith('|'));
          for (const row of rows) console.log(row);
          const concrete = rows.filter((r) => /→|->/.test(r)).length;
          console.log(`\n${DIM}拒绝清单：${concrete} of ${rows.length} 行写出了具体输入 → 行为。`);
          console.log(`（这条计数只覆盖禁令，不含上面的应答规则——两者加起来才是验收阶段的工作量。）`);
          console.log(`禁令 ${concrete} 条 + 规则 ${ruleCount} 行 = ${concrete + ruleCount} 条检查。${RESET}`);
        }
      }
    } else {
      const flow = section(text, '流程形状');
      const perms = section(text, '动作权限');
      console.log(`${BOLD}${record.id}${RESET} ${DIM}约束 / what the build stage must respect${RESET}\n`);

      console.log(`${BOLD}流程形状${RESET}`);
      if (flow === undefined) console.log(`${YELLOW}(no section)${RESET}`);
      else {
        const count = /判断点[：:]\s*(\S+)/.exec(flow.body);
        console.log(count === null ? flow.body : `判断点：${count[1]}`);
        console.log(`${DIM}Judgement points must stay judgement: do not hard-code them into a special case.${RESET}`);
      }

      console.log(`\n${BOLD}动作权限${RESET}`);
      if (perms === undefined) console.log(`${YELLOW}(no section)${RESET}`);
      else {
        const skip = skipReason(perms.body);
        if (skip !== null) console.log(`${YELLOW}跳过：${skip}${RESET}`);
        else for (const row of perms.body.split('\n').filter((l) => l.trim().startsWith('|'))) console.log(row.trim());
      }
    }
    console.log();
  }
} else {
  console.error('usage: design.mjs latest | refusals [D-NNN] | constraints [D-NNN]  [--dir <path>]');
  process.exitCode = 1;
}
