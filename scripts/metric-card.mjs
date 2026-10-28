#!/usr/bin/env node
/**
 * metric-card — the eight fields a metric must declare before it may be published.
 *
 * The design says "每个指标必须有八项，缺一项就不许进产品", and singles out the last
 * two as the point: **已知偏差** and **什么时候不可用**. Those are the failure atlas's
 * seventh class written into the card itself — a number that is not the number you
 * think it is.
 *
 * A template with eight empty headings is not a check; it passes by being copied.
 * So this validates content, not shape: a field whose value is a placeholder, a
 * restatement of its own name, or a value word ("较高", "正常") fails. That is the
 * same rule `work check` applies to 应答规则, and for the same reason — a rule that
 * accepts "按情况处理" accepts everything.
 *
 * Cards live in `work/metrics/` because 口径版本 changes, and `work/` is where things
 * that change live. They have no state machine: a card is current or superseded by
 * a newer version, which is a version number, not a lifecycle.
 *
 * Usage:
 *   node scripts/metric-card.mjs check [dir]
 *   node scripts/metric-card.mjs show <name>
 *   node scripts/metric-card.mjs new <name>      # print a template to stdout
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, WORK } from './schema.mjs';
import { section } from './markdown.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const DIR = join(WORK, 'metrics');

/**
 * The eight fields. `key` is matched as a substring of the `## ` heading, so a card
 * may write 「## 一、可执行定义」 or 「## 可执行定义」 — the numbering is presentation.
 */
export const FIELDS = [
  { key: '指标名', what: 'the name, and the thing it is a name for' },
  { key: '可执行定义', what: 'a rule someone else could run, not a gloss' },
  { key: '粒度', what: 'the grain: region × week, SKU × week …' },
  { key: '单位', what: 'count, currency, ratio — and on which base' },
  { key: '数据源', what: 'which store, which table, which field' },
  { key: '口径版本', what: 'a version, so a later change is visible rather than silent' },
  { key: '已知偏差', what: 'how it is wrong even when nothing has failed' },
  { key: '什么时候不可用', what: 'the condition under which it must not be quoted' },
];

/**
 * Values that assert nothing.
 *
 * Split by field, because the same word is fine in one place and fatal in another:
 * 「按区域」 is a real answer for 粒度, and an empty one for 可执行定义.
 */
const VAGUE = {
  universal: ['按情况', '视情况', '看情况', '酌情', '适当', '按需', '灵活', '较高', '较低', '正常', '合理', '完善', '待定', 'TBD', 'TODO'],
  byField: {
    可执行定义: ['各渠道', '多源', '综合', '统计后', '按业务'],
    已知偏差: ['无', '暂无', '基本没有', '可忽略'],
    什么时候不可用: ['无', '暂无', '一般都可', '任何情况'],
  },
};

const MSG = (s) => s.trim();

function parse(text) {
  const out = {};
  for (const f of FIELDS) {
    const sec = section(text, f.key);
    out[f.key] = sec === undefined ? null : MSG(sec.body);
  }
  return out;
}

function problemsFor(text, label) {
  const out = [];
  const fields = parse(text);

  for (const f of FIELDS) {
    const body = fields[f.key];
    if (body === null) {
      out.push(`${label}: no 「${f.key}」 section — ${f.what} was never written`);
      continue;
    }
    if (body === '') {
      out.push(`${label}: 「${f.key}」 is empty — a heading is not an answer`);
      continue;
    }
    // Don't write a second copy of the heading as its own content.
    const stripped = body.replace(/^[*_`\s]+|[*_`\s]+$/g, '');
    // Vague values are tested before the restatement rule: 「无」 trips both, and the
    // message that says *why* ("a value, not a definition") is the one that teaches.
    // Restating a heading (「粒度：粒度」) is a different mistake with its own message.
    const vague = [...VAGUE.universal, ...(VAGUE.byField[f.key] ?? [])];
    const hit = vague.find((v) => stripped === v || stripped === `${v}。` || stripped === `${v}.`);
    if (hit !== undefined) {
      out.push(`${label}: 「${f.key}」 says "${hit}" — that is a value, not a definition`);
      continue;
    }
    // 口径版本 is exempt from the length and restatement rules: "3" and "v2" are
    // correct answers, and a one-character version is still a version. Its own rule
    // (below) is the one that matters — a number you can compare across periods.
    if (f.key === '口径版本') {
      if (!/\bv?\d+(\.\d+)*\b/.test(stripped)) {
        out.push(`${label}: 「口径版本」 has no version number — "${stripped.slice(0, 40)}" cannot be compared across periods`);
      }
      continue;
    }
    if (stripped === f.key || stripped === `${f.key}：` || stripped.length <= 1) {
      out.push(`${label}: 「${f.key}」 only restates its own name`);
      continue;
    }
    // The template's own placeholder is the most likely thing to survive. It must be
    // caught: a template that passes its own validator means "eight headings copied"
    // reads as a complete card, and the check has certified nothing.
    if (/^[（(].*[）)]$/s.test(body.trim())) {
      out.push(`${label}: 「${f.key}」 still holds the template's placeholder — replace it or the card says nothing`);
      continue;
    }
    // The two fields the design singles out must say something falsifiable. A short
    // sentence can be a real answer; three characters cannot.
    if ((f.key === '已知偏差' || f.key === '什么时候不可用') && stripped.length < 8) {
      out.push(`${label}: 「${f.key}」 is ${stripped.length} characters — too short to name a condition`);
    }
  }

  // 口径版本 has to be a version a reader can compare, not a date-shaped vibe.
  const v = fields['口径版本'];
  if (v !== null && v !== '' && !/\bv?\d+(\.\d+)*\b/.test(v)) {
    out.push(`${label}: 「口径版本」 has no version number — "${v.slice(0, 40)}" cannot be compared across periods`);
  }

  return out;
}

const TEMPLATE = (name) => `## 指标名

${name}

## 可执行定义

（一条别人能照着跑的规则。写 SQL 或写步骤，不写解释。）

## 粒度

（例如：区域 × 周，去重后。说明聚合前的最小单位。）

## 单位

（例如：条。说明计数对象与是否含转发。）

## 数据源

（哪个库、哪张表、哪个字段。写到能让人打开就看到。）

## 口径版本

v1

## 已知偏差

（即使什么都没坏，它也是错的。例如：已删内容永久缺失，系统性偏低约 X%。）

## 什么时候不可用

（什么条件下不许引用这个数。例如：跨源去重未标定时，与上一期不可比。）
`;

const cmd = process.argv[2] ?? 'check';

if (cmd === 'new') {
  const name = process.argv[3];
  if (name === undefined) { console.error('usage: metric-card new <name>'); process.exitCode = 2; }
  else process.stdout.write(TEMPLATE(name));
} else if (cmd === 'show') {
  const name = process.argv[3];
  const files = await readdir(DIR).catch(() => []);
  const hit = files.find((f) => f.includes(name ?? '') && f.endsWith('.md'));
  if (hit === undefined) { console.error(`${RED}no metric card matching "${name}"${RESET}`); process.exitCode = 1; }
  else process.stdout.write(await readFile(join(DIR, hit), 'utf8'));
} else {
  const dir = process.argv[3] ?? DIR;
  let files;
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.md') && !f.startsWith('.'));
  } catch {
    console.log(`${DIM}no metric cards yet — ${dir.replace(ROOT + '/', '')} does not exist${RESET}`);
    console.log(`${DIM}create one with: node scripts/metric-card.mjs new <name> > ...${RESET}`);
    process.exitCode = 0;
    files = null;
  }

  if (files !== null) {
    const problems = [];
    for (const f of files) {
      problems.push(...problemsFor(await readFile(join(dir, f), 'utf8'), f));
    }
    if (problems.length === 0) {
      console.log(`${GREEN}ok${RESET} — ${files.length} metric card(s), all eight fields answered`);
      process.exitCode = 0;
    } else {
      console.log(`${RED}${problems.length} problem(s)${RESET} across ${files.length} card(s)\n`);
      for (const p of problems) console.log(`  ${RED}•${RESET} ${p}`);
      process.exitCode = 1;
    }
  }
}
