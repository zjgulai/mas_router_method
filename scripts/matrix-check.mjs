#!/usr/bin/env node
/**
 * matrix-check — the 8+3 matrix's contract, checked instead of promised.
 *
 * The matrix is only worth building if it can be wrong. Three ways it can:
 *
 *   · a cell claims three things and is missing one — the SOP template's whole
 *     point is that all three exist, and a missing one is a hole that reads like a
 *     finished row;
 *   · a cell names a checker that does not exist or does not run — a green dot on
 *     the site pointing at a deleted script is worse than no dot, because it says
 *     "verified" about nothing;
 *   · the JSON and the prose disagree — this repo has already shipped a reversed
 *     instruction when one fact lived in four places.
 *
 * The status of each cell is *derived*, never written down:
 *
 *   verified       has a checker, and the command resolves to a real file
 *   contract       three things present, no checker — the contract exists, the
 *                  enforcement does not, and the site must show that difference
 *   hole           three things present but one is empty or vacuous
 *
 * A cell with a checker whose script is missing fails, it does not silently become
 * `contract`. That is the same rule `facts.mjs` applies to a claim whose file was
 * renamed: a check that stops running must be an error, not a downgrade.
 *
 * Usage:
 *   node scripts/matrix-check.mjs [--json]
 */
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, loadSchema } from './schema.mjs';
import { readTickets, attach, expandCells, unclaimedKind } from './ticket-cells.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const argv = process.argv.slice(2);
const fileArg = argv.includes('--file') ? argv[argv.indexOf('--file') + 1] : null;
const MATRIX = fileArg === null ? join(ROOT, 'docs/product/matrix.json') : fileArg;

const raw = await readFile(MATRIX, 'utf8');
const doc = JSON.parse(raw);

/** Values that assert nothing. Same list, same reason, as the metric card's. */
const VACUOUS = ['按情况', '视情况', '酌情', '适当', '按需', '待定', 'TBD', 'TODO', '暂无', '上面的', '上面', '同上'];

/**
 * The command in a checker field is the first token of its `cmd`, which may hold
 * several separated by `;`. Only local scripts are resolvable; anything else (a
 * curl, a vendor CLI) is not a thing this repo can promise to have.
 */
function scriptPaths(cmd) {
  const out = [];
  for (const part of cmd.split(';')) {
    const m = /^\s*node\s+(scripts\/[^\s]+)/.exec(part);
    if (m !== null) out.push(m[1]);
  }
  return out;
}

async function exists(rel) {
  try { await access(join(ROOT, rel)); return true; } catch { return false; }
}

/** The three things, and whether each says something. */
function assess(cell, label) {
  const problems = [];
  for (const key of ['input', 'output', 'failure']) {
    const v = (cell[key] ?? '').trim();
    if (v === '') {
      problems.push(`${label}: 「${key}」 is empty — the cell has no ${key} contract`);
      continue;
    }
    if (v === '上面' || v === '同上' || v === '上面的方案' || v === '上面的源清单' || v === '上面的 schema') {
      // "同上" is the shape a template collapses into when nobody fills it in. The
      // first version of the SOP used it in eight places, and each one was a place
      // where the author did not say what actually travelled to the next layer.
      problems.push(`${label}: 「${key}」 says "${v}" — that names the previous row, not a value that moves`);
    }
    const vac = VACUOUS.find((w) => v === w || v === `${w}。`);
    if (vac !== undefined) problems.push(`${label}: 「${key}」 says "${vac}"`);
  }
  return problems;
}

const problems = [];
const seen = new Set();

// 1. every cell is inside the declared grid, and no cell appears twice
for (const cell of doc.cells) {
  const label = `${cell.stage} · ${cell.layer}`;
  if (!doc.stages.includes(cell.stage)) problems.push(`${label}: "${cell.stage}" is not a declared stage`);
  if (!doc.layers.includes(cell.layer)) problems.push(`${label}: "${cell.layer}" is not a declared layer`);
  if (!['决策类', '工程类', '运行类', '工程类 + 决策类'].includes(cell.kind)) {
    problems.push(`${label}: kind "${cell.kind}" is not one of the three classes the SOP template defines`);
  }
  const key = `${cell.stage}\u0000${cell.layer}`;
  if (seen.has(key)) problems.push(`${label}: appears twice — two cells claiming one position`);
  seen.add(key);
  problems.push(...assess(cell, label));
}

// 2. a checker must resolve to a Cfile this repo actually has
for (const cell of doc.cells) {
  if (!cell.checker) continue;
  const label = `${cell.stage} · ${cell.layer}`;
  const paths = scriptPaths(cell.checker.cmd ?? '');
  if (paths.length === 0) {
    problems.push(`${label}: checker command names no script this repo can vouch for ("${cell.checker.cmd}")`);
  }
  for (const p of paths) {
    if (!(await exists(p))) problems.push(`${label}: checker script ${p} does not exist`);
  }
  for (const f of ['exit', 'note']) {
    if ((cell.checker[f] ?? '') === '') problems.push(`${label}: checker has no "${f}" — an exit code nobody stated is not a contract`);
  }
}

// 3. transitions must join two cells that exist, and carry something
const at = new Map(doc.cells.map((c) => [`${c.stage}\u0000${c.layer}`, c]));
for (const [n, t] of doc.transitions.entries()) {
  const from = `${t.from[0]}\u0000${t.from[1]}`;
  const to = `${t.to[0]}\u0000${t.to[1]}`;
  const label = `transition ${n + 1} (${t.from.join('·')} → ${t.to.join('·')})`;
  if (!at.has(from)) problems.push(`${label}: source cell does not exist`);
  if (!at.has(to)) problems.push(`${label}: target cell does not exist`);
  if ((t.carries ?? '') === '') problems.push(`${label}: carries nothing — that is a line, not a handoff`);
  if (!Array.isArray(t.versioned) || t.versioned.length === 0) {
    problems.push(`${label}: no version fields — the design requires the version quartet on every hop`);
  }
  if ((t.downstreamChecks ?? '') === '') problems.push(`${label}: nothing checks it downstream`);
  if ((t.breaks ?? '') === '') problems.push(`${label}: cannot say what breaks if the hop is cut`);
}

// 4. the chains must reference real layers, and each must have at least one cell
//    that a build stage touches — a chain whose layers exist but have no 开发 cell
//    is a chain of designs, not of work.
for (const chain of doc.chains) {
  if (!Array.isArray(chain.layers) || chain.layers.length === 0) {
    problems.push(`chain ${chain.id}: names no layers`);
    continue;
  }
  for (const l of chain.layers) {
    if (!doc.layers.includes(l)) problems.push(`chain ${chain.id}: "${l}" is not a declared layer`);
  }
  const built = doc.cells.filter((c) => chain.layers.includes(c.layer) && c.stage === '开发');
  if (built.length === 0) {
    problems.push(`chain ${chain.id}: no 开发 cell in ${chain.layers.join(' / ')} — nothing is built`);
  }
}

/*
 * The HITL classification, derived once so the ops document cannot drift.
 *
 * The document states four counts (6 command-closed, 32 human-closed, 2 human-opened,
 * 9 nobody-closed) and the reasoning for each. Numbers in prose go stale silently; this
 * is the same treatment the matrix counts already get.
 *
 * The rule is NOT "by category" — the first attempt did that and classified 开发·采集 as
 * command-closed, which is wrong: writing an adapter has no command that can close it.
 * Presence of a checker is the judge.
 */
export function closedBy(cell) {
  if (cell.kind !== undefined && cell.kind.includes('运行')) return '无人关门';
  if (cell.checker) return '命令关门';
  if (cell.stage === '需求') return '人开门';
  return '人关门';
}

// ── Derived status, which is what the site renders ──────────────────────────
const enriched = doc.cells.map((cell) => {
  const cellProblems = assess(cell, `${cell.stage} · ${cell.layer}`);
  const status = cellProblems.length > 0 ? 'hole'
    : cell.checker ? 'verified'
      : 'contract';
  return { ...cell, status, problems: cellProblems };
});

// ── Tickets, joined on the cells they claim ─────────────────────────────────
//
// The join is the point of this whole exercise: a cell can say "contract written"
// and still be nobody's work. Attaching the tickets makes that visible — a row of
// cells with no ticket and no checker is the place the product would quietly stall.
//
// A ticket claiming a cell that does not exist is an error, not a detail: either it
// is working on something nobody planned, or the matrix lost a row.
const { tickets } = await readTickets(await loadSchema());
const { byCell } = attach(tickets, doc.stages, doc.layers);

// An explicit claim must name a real cell; a wildcard expands only onto real cells.
for (const t of tickets) {
  if (!t.linked) continue;
  for (const c of t.cells) {
    if (c.stage === '*' || c.layer === '*') continue;
    if (!at.has(`${c.stage}\u0000${c.layer}`)) {
      problems.push(`ticket ${t.id} claims ${c.stage} · ${c.layer}, which is not a cell in the matrix`);
    }
  }
}

// A cell whose only ticket is `landed` but which has no checker is worth naming: the
// work was accepted somewhere and nothing in this repo can re-check it. Not an error
// — plenty of acceptance is a human reading a file — but it is the shape that rots.
for (const cell of enriched) {
  const claim = byCell.get(`${cell.stage}\u0000${cell.layer}`);
  if (claim === undefined) continue;
  cell.ticketState = claim.state;
  cell.tickets = claim.tickets;
}

// Every cell either has a ticket or does not, and "does not" has two meanings.
for (const cell of enriched) {
  const kind = unclaimedKind(cell.stage, cell);
  if (kind !== null) cell.unclaimed = kind;
}

const gaps = enriched.filter((c) => c.unclaimed === 'gap');
const futures = enriched.filter((c) => c.unclaimed === 'future');

for (const cell of enriched) cell.closedBy = closedBy(cell);
const byDoor = enriched.reduce((acc, c) => ({ ...acc, [c.closedBy]: (acc[c.closedBy] ?? 0) + 1 }), {});

// The ops document quotes these four counts, so it is checked against them.
try {
  const ops = await readFile(join(ROOT, 'docs/product/ops-bitable.md'), 'utf8');
  const claimed = {
    命令关门: Number((/\| \*\*命令关门\*\* \| 一条命令 exit 0 \| \*\*AI 自行\*\* \| \*\*(\d+)\*\*/.exec(ops) ?? [])[1]),
    人关门: Number((/\| \*\*人关门\*\* \|[^|]*\|[^|]*\| \*\*(\d+)\*\*/.exec(ops) ?? [])[1]),
    人开门: Number((/\| \*\*人开门\*\* \|[^|]*\|[^|]*\| \*\*(\d+)\*\*/.exec(ops) ?? [])[1]),
    无人关门: Number((/\| \*\*无人关门\*\* \|[^|]*\|[^|]*\| \*\*(\d+)\*\*/.exec(ops) ?? [])[1]),
  };
  for (const [k, v] of Object.entries(claimed)) {
    if (Number.isNaN(v)) problems.push(`ops-bitable.md: cannot read the 「${k}」 count — reworded or removed?`);
    else if (v !== byDoor[k]) problems.push(`ops-bitable.md: says ${v} cells are ${k}, disk has ${byDoor[k] ?? 0}`);
  }
} catch {
  problems.push('ops-bitable.md cannot be read, so its HITL counts are unchecked');
}

// 5. the prose must not quote counts that disagree with the data.
//
// This is the exact failure the matrix doc was written to fix: it said "88 个格子"
// while claiming the pillars were not a third dimension, and the SOP said "48 格"
// with 46 in it. A number in prose goes stale silently; a number checked against
// disk cannot. Same rule as `facts.mjs`, applied to the one document most likely to
// drift because it describes the thing that keeps changing.
const matrixDoc = await readFile(join(ROOT, 'docs/product/data-product-matrix.md'), 'utf8');
const sopDoc = await readFile(join(ROOT, 'docs/product/data-product-sop.md'), 'utf8');
const gridSize = doc.stages.length * doc.layers.length;

const DECLARED = [
  { file: 'data-product-matrix.md', text: matrixDoc, pattern: /64 个位置里 \*\*(\d+) 格有内容\*\*/, label: 'matrix 的「N 格有内容」', expect: (m) => Number(m[1]) === doc.cells.length, actual: (m) => Number(m[1]) },
  // This sentence states both numbers — filled and empty — so both are checked.
  // The first version captured only the first group and subtracted it, which made a
  // correct sentence read as wrong: it reported "says 49, has 49 cells" as a failure.
  { file: 'data-product-matrix.md', text: matrixDoc, pattern: /64 减 (\d+)，空 (\d+) 格/, label: 'matrix 的「64 减 N，空 M 格」',
    expect: (m) => Number(m[1]) === doc.cells.length && Number(m[2]) === gridSize - doc.cells.length,
    actual: (m) => `${m[1]} filled / ${m[2]} empty` },
  { file: 'data-product-sop.md', text: sopDoc, pattern: /^# 8\+3 实现 SOP：(\d+) 格/m, label: 'SOP 标题的格数', expect: (m) => Number(m[1]) === doc.cells.length, actual: (m) => Number(m[1]) },
  { file: 'data-product-sop.md', text: sopDoc, pattern: /## 二、(\d+) 格（由/, label: 'SOP §二 标题的格数', expect: (m) => Number(m[1]) === doc.cells.length, actual: (m) => Number(m[1]) },
];

for (const claim of DECLARED) {
  const m = claim.pattern.exec(claim.text);
  if (m === null) {
    problems.push(`${claim.file}: no match for /${claim.pattern.source}/ (${claim.label} — removed or reworded?)`);
    continue;
  }
  if (!claim.expect(m)) {
    problems.push(`${claim.file}: ${claim.label} says ${claim.actual(m)}, matrix.json has `
      + `${doc.cells.length} cells in a ${gridSize}-position grid`);
  }
}

const byStatus = enriched.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});

if (process.argv.includes('--json')) {
  // Everything the site needs to render, and nothing it would have to compute:
  // `byStatus` and each cell's `status` arrive already resolved. The page must not
  // derive them again — a second derivation is a second definition.
  console.log(JSON.stringify({
    cells: enriched,
    transitions: doc.transitions,
    chains: doc.chains,
    stages: doc.stages,
    layers: doc.layers,
    gridSize: doc.stages.length * doc.layers.length,
    byStatus,
    byDoor,
    gaps: gaps.map((c) => c.stage + '·' + c.layer),
    futures: futures.map((c) => c.stage + '·' + c.layer),
    problems,
  }, null, 2));
  process.exitCode = problems.length > 0 ? 1 : 0;
} else {
  const total = enriched.length;
  console.log(`\n${BOLD}矩阵${RESET} ${DIM}${doc.stages.length} 阶段 × ${doc.layers.length} 层 = `
    + `${doc.stages.length * doc.layers.length} 个位置，其中 ${total} 格有内容${RESET}\n`);

  // The grid, because a per-cell report cannot show shape.
  const width = 7;
  console.log(`  ${''.padEnd(6)}${doc.layers.map((l) => l.padStart(width)).join('')}`);
  for (const stage of doc.stages) {
    const cells = doc.layers.map((layer) => {
      const c = enriched.find((x) => x.stage === stage && x.layer === layer);
      if (c === undefined) return `${DIM}·${RESET}`.padStart(width + 8);
      const mark = c.status === 'verified' ? `${GREEN}验${RESET}`
        : c.status === 'contract' ? `${YELLOW}约${RESET}` : `${RED}空${RESET}`;
      return mark.padStart(width + 8);
    });
    console.log(`  ${stage.padEnd(6)}${cells.join('')}`);
  }
  console.log(`\n  ${GREEN}验${RESET} 有检查器且脚本存在 · ${YELLOW}约${RESET} 三件事齐但没有可执行验收 · ${RED}空${RESET} 三件事有缺`);
  console.log(`  ${DIM}${byStatus.verified ?? 0} verified · ${byStatus.contract ?? 0} contract · ${byStatus.hole ?? 0} hole`
    + ` · ${doc.transitions.length} 跳衔接${RESET}`);
  console.log(`  ${DIM}票据 ${tickets.filter((t) => t.linked).length} 张认领了 `
    + `${enriched.filter((c) => c.ticketState).length} 格 · `
    + `${RED}${gaps.length} 格缺口${RESET}${DIM}（该有票却没有） · ${futures.length} 格未到（还没到时候）${RESET}\n`);

  if (problems.length === 0) {
    console.log(`${GREEN}ok${RESET} — ${total} cells, ${doc.transitions.length} transitions, every checker resolves`);
    process.exitCode = 0;
  } else {
    console.log(`${RED}${problems.length} problem(s)${RESET}\n`);
    for (const p of problems) console.log(`  ${RED}•${RESET} ${p}`);
    process.exitCode = 1;
  }
  console.log();
}
