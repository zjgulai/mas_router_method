#!/usr/bin/env node
/**
 * sop-render — write the SOP's cell section from matrix.json, or check it matches.
 *
 * `docs/product/data-product-sop.md` says its §二 is generated. That sentence is
 * worth nothing unless something enforces it — this repo has already shipped a
 * document claiming a fact that lived in four places, three of which were stale.
 *
 * The section is delimited by `## 二、` and `## 三、` so it can be replaced without
 * touching the reasoning around it. Everything outside those markers is hand-written
 * and must stay that way: the prose explains why the template is shaped as it is,
 * and that argument does not come from a JSON file.
 *
 * Usage:
 *   node scripts/sop-render.mjs           # rewrite §二 in place
 *   node scripts/sop-render.mjs --check   # exit 1 if it differs from matrix.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './schema.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[2m', RESET = '\x1b[0m';

const MATRIX = join(ROOT, 'docs/product/matrix.json');
const SOP = join(ROOT, 'docs/product/data-product-sop.md');

const doc = JSON.parse(await readFile(MATRIX, 'utf8'));
const by = new Map(doc.cells.map((c) => [`${c.stage}\u0000${c.layer}`, c]));

/** Counts per layer, used in the section heading and the intro. */
const perLayer = Object.fromEntries(doc.layers.map((l) => [l, doc.cells.filter((c) => c.layer === l).length]));

function render() {
  const out = [];
  out.push(`## 二、${doc.cells.length} 格（由 \`docs/product/matrix.json\` 生成）`);
  out.push('');
  out.push('**这一节不手写。** 它由 `node scripts/sop-render.mjs` 从 `matrix.json` 生成，');
  out.push('`node scripts/sop-render.mjs --check` 会核对两者一致。理由是这个仓库已经犯过一次：');
  out.push('同一个事实写在四处，改了一处其余三处没跟上，于是出现了一条反向指令。');
  out.push('');
  const parts = doc.layers.map((l) => `${l} ${perLayer[l]}`).join(' 格、');
  out.push(`格子数是 **${doc.cells.length}**：${parts} 格。`);
  out.push('');

  doc.layers.forEach((layer, n) => {
    out.push(`### 2.${n + 1} ${layer}层（${perLayer[layer]} 格）`);
    out.push('');
    for (const stage of doc.stages) {
      const c = by.get(`${stage}\u0000${layer}`);
      if (c === undefined) continue;
      out.push(`**${stage} · ${layer}**｜${c.kind}`);
      out.push(`- **输入**：${c.input}`);
      out.push(`- **输出**：${c.output}`);
      out.push(`- **失败**：${c.failure}`);
      if (c.checker) {
        out.push(`- **检查器**：\`${c.checker.cmd}\``);
        out.push(`  - 退出码：${c.checker.exit}`);
        out.push(`  - ${c.checker.note}`);
      }
      out.push('');
    }
  });
  return out.join('\n');
}

/** The handoff table, which belongs to §五 of the matrix doc but is derived too. */
export function renderTransitions() {
  const out = [];
  out.push('| 从 | 到 | 交的是什么 | 带哪些版本 | 下游怎么校验 | 断了会怎样 |');
  out.push('|---|---|---|---|---|---|');
  for (const t of doc.transitions) {
    out.push(`| ${t.from.join('·')} | ${t.to.join('·')} | ${t.carries} | ${t.versioned.join(' + ')} `
      + `| ${t.downstreamChecks} | ${t.breaks} |`);
  }
  return out.join('\n');
}

const section = render();
const source = await readFile(SOP, 'utf8');
const start = source.indexOf('## 二、');
const end = source.indexOf('## 三、');

if (start < 0 || end < 0 || end < start) {
  console.error(`${RED}cannot find the §二 / §三 markers in ${SOP.replace(ROOT + '/', '')}${RESET}`);
  process.exitCode = 1;
} else if (process.argv.includes('--check')) {
  const current = source.slice(start, end).trimEnd();
  if (current === section.trimEnd()) {
    console.log(`${GREEN}ok${RESET} — SOP §二 matches matrix.json (${doc.cells.length} cells)`);
    process.exitCode = 0;
  } else {
    const a = current.split('\n'), b = section.split('\n');
    const at = a.findIndex((line, i) => line !== b[i]);
    console.log(`${RED}SOP §二 has drifted from matrix.json${RESET}\n`);
    console.log(`  ${DIM}first difference at line ${at + 1} of the section:${RESET}`);
    console.log(`  ${RED}- ${(a[at] ?? '(missing)').slice(0, 100)}${RESET}`);
    console.log(`  ${GREEN}+ ${(b[at] ?? '(missing)').slice(0, 100)}${RESET}`);
    console.log(`\n  ${DIM}run \`node scripts/sop-render.mjs\` to regenerate${RESET}`);
    process.exitCode = 1;
  }
} else {
  await writeFile(SOP, source.slice(0, start) + section + '\n' + source.slice(end), 'utf8');
  console.log(`${GREEN}rendered${RESET} — ${doc.cells.length} cells into §二`);
}
