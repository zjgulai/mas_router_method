#!/usr/bin/env node
/**
 * xref — the cross-table references between the project's tables, checked instead
 * of trusted.
 *
 * Fourteen tables describe one product. Each table is internally consistent by
 * construction — the rows were written by someone who had the whole thing in their
 * head at the time. The failures live *between* tables:
 *
 *   · a capability names `des-02`, and no such design exists;
 *   · a design is finished, and no development row ever picked it up;
 *   · a development row is done, and nothing ever verifies it.
 *
 * All three are invisible in any single table. The first is a fiction; the second
 * is work that stops; the third is work nobody can check. That is why this is a
 * script and not a habit.
 *
 * Input is a JSON dump of the tables (`{ "01 需求": [ {..}, .. ], .. }`), because
 * fetching from Feishu needs credentials this repo does not ship. Dumping is a
 * separate step; the check must stay runnable offline and in CI.
 *
 * Usage:
 *   node scripts/xref.mjs <tables.json> [--json]
 */
import { readFile } from 'node:fs/promises';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

/** Which field is each table's own id. A new table needs a row here or it is invisible. */
export const ID_FIELD = {
  '01 需求': '需求编号',
  '01-1 能力清单': '能力编号',
  '03-1 采集设计': '设计编号',
  '03-2 打标设计': '设计编号',
  '03-3 指标设计': '设计编号',
  '03-4 结论设计': '设计编号',
  '04 开发': '开发编号',
  '05 验收': '验收编号',
  '06 交付': '交付编号',
  '07 运营': '运营编号',
  '08 迭代': '迭代编号',
  '09 管理': '管理编号',
  '10 回流（闭环）': '回流编号',
};

/**
 * The chain each row must point up at, and the prefix that proves it.
 *
 * Only the tables where a missing upstream is a defect. Operations and management
 * rows are not required to point up — an incident does not have to cite a design.
 */
export const UPSTREAM = {
  '03-1 采集设计': { field: '来自哪条需求', prefix: 'dem-' },
  '03-2 打标设计': { field: '来自哪条需求', prefix: 'dem-' },
  '03-3 指标设计': { field: '来自哪条需求', prefix: 'dem-' },
  '03-4 结论设计': { field: '来自哪条需求', prefix: 'dem-' },
  '04 开发': { field: '来自哪份设计', prefix: 'des-' },
  '05 验收': { field: '对应需求', prefix: 'dem-' },
  '06 交付': { field: '对应需求', prefix: 'dem-' },
};

/** Every id-shaped token in free text, with the prefixes this project uses. */
const REF = /(?<![A-Za-z-])(dem|des|dev|acc|ship|ops|it|adm|loop|eval)-\d{2,3}(?!\d)/g;

const text = (v) => (typeof v === 'string' ? v : '');

export function check(tables) {
  const problems = [];
  const allIds = new Set();
  for (const [name, rows] of Object.entries(tables)) {
    const idField = ID_FIELD[name];
    if (idField === undefined) {
      problems.push(`table "${name}" is not in ID_FIELD — its ids are unchecked and every reference to it will read as dangling`);
      continue;
    }
    for (const row of rows) {
      if (text(row[idField]) !== '') allIds.add(row[idField]);
    }
  }

  // 1. A reference to something that does not exist. This is the one that turns a
  //    table into fiction: it reads as planned work and is actually a typo.
  for (const [name, rows] of Object.entries(tables)) {
    const idField = ID_FIELD[name];
    for (const row of rows) {
      const own = text(row[ID_FIELD[name] ?? '']);
      for (const [field, value] of Object.entries(row)) {
        if (field === idField) continue;
        for (const match of text(value).matchAll(REF)) {
          if (!allIds.has(match[0])) {
            problems.push(`${name} / ${own} / ${field}: refers to ${match[0]}, which no table defines`);
          }
        }
      }
    }
  }

  // 2. A row that does not point up at the thing it came from. A design with no
  //    requirement is a design solving nothing; a build row with no design is work
  //    nobody specified.
  for (const [name, { field, prefix }] of Object.entries(UPSTREAM)) {
    for (const row of tables[name] ?? []) {
      const value = text(row[field]);
      if (!value.startsWith(prefix)) {
        problems.push(`${name} / ${row[ID_FIELD[name]] ?? '?'}: 「${field}」 is "${value || '(empty)'}", not a ${prefix} reference`);
      }
    }
  }

  // 3. A design nobody built. Not an error — a design can legitimately wait — but
  //    it is the shape of a product that designed more than it intends to make.
  const builtFrom = new Set();
  for (const row of tables['04 开发'] ?? []) {
    const v = text(row['来自哪份设计']);
    if (v !== '') builtFrom.add(v);
  }
  const designs = [];
  for (const name of ['03-1 采集设计', '03-2 打标设计', '03-3 指标设计', '03-4 结论设计']) {
    for (const row of tables[name] ?? []) designs.push(row['设计编号']);
  }
  const unbuilt = designs.filter((d) => d !== undefined && !builtFrom.has(d));

  // 4. A build that nothing verifies. The sharpest of the four: the work exists, it
  //    may even be done, and no one can say whether it is right.
  const verified = new Set();
  for (const row of tables['05 验收'] ?? []) {
    for (const match of text(row['对应开发']).matchAll(/dev-\d{2,3}/g)) verified.add(match[0]);
  }
  const unverified = (tables['04 开发'] ?? [])
    .map((r) => r['开发编号'])
    .filter((d) => d !== undefined && !verified.has(d));

  return { problems, allIds, unbuilt, unverified };
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  const file = process.argv[2];
  if (file === undefined) {
    console.error('usage: node scripts/xref.mjs <tables.json> [--json]');
    process.exitCode = 2;
  } else {
    const tables = JSON.parse(await readFile(file, 'utf8'));
    const { problems, unbuilt, unverified, allIds } = check(tables);

    if (process.argv.includes('--json')) {
      console.log(JSON.stringify({ problems, unbuilt, unverified, idCount: allIds.size }, null, 2));
      process.exitCode = problems.length > 0 ? 1 : 0;
    } else {
      console.log(`\n${BOLD}交叉引用${RESET} ${DIM}${Object.keys(tables).length} 张表，${allIds.size} 个编号${RESET}\n`);
      if (problems.length === 0) {
        console.log(`${GREEN}ok${RESET} — every reference resolves, every row points up`);
      } else {
        console.log(`${RED}${problems.length} 处悬空或断链${RESET}\n`);
        for (const p of problems) console.log(`  ${RED}•${RESET} ${p}`);
      }
      console.log();
      console.log(`${YELLOW}${unbuilt.length}${RESET} 份设计还没有开发承接${DIM}`
        + `${unbuilt.length > 0 ? `: ${unbuilt.join(', ')}` : ''}${RESET}`);
      console.log(`${YELLOW}${unverified.length}${RESET} 个开发还没有验收${DIM}`
        + `${unverified.length > 0 ? `: ${unverified.join(', ')}` : ''}${RESET}`);
      console.log();
      process.exitCode = problems.length > 0 ? 1 : 0;
    }
  }
}
