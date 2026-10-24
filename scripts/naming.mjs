#!/usr/bin/env node
/**
 * naming — the stage order has one home, and prose must not restate it.
 *
 * The order lives in `work/schema.yml` under `stage_order`. Everything that needs
 * to show a position derives it from there. Nothing else may write it down.
 *
 * This rule needs a machine behind it because it has already been broken twice by
 * hand. The site was renumbered when the design stage was inserted; five skills
 * were not, so `anb` ended up telling the reader "Stage 3 is the only gate, do not
 * build stage 4" — which, under the site's own numbering, reads *do not build the
 * verify stage*, the one gate that must be built. A confident wrong instruction is
 * worse for someone who cannot read code than no instruction at all.
 *
 * Usage:
 *   node scripts/naming.mjs check    exit 1 and list every hardcoded stage number
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './schema.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[2m', RESET = '\x1b[0m';

/**
 * The three shapes the drift has actually taken. A bare `stage` followed by a
 * word is left alone — "a later stage of the work" is ordinary English and
 * flagging it would make the checker noisy, and a noisy checker gets switched off.
 */
const PATTERNS = [
  { shape: 'Stage N', re: /\b[Ss]tage\s+\d+/ },
  { shape: 'ANB 阶段 N', re: /ANB\s*阶段\s*\d+/ },
];

/** Every hardcoded stage number in one string, one hit per line. */
export function findStageNumbers(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const p of PATTERNS) {
      const m = p.re.exec(lines[i]);
      if (m !== null) {
        hits.push({ line: i + 1, snippet: m[0].trim(), shape: p.shape });
        break; // one hit per line is enough to fix it
      }
    }
  }
  return hits;
}

/**
 * What this rule covers.
 *
 * Skills, because the agent executes those. Generated site pages, because that is
 * what a reader navigates by.
 *
 * Deliberately NOT `docs/site/originals/`: those eight documents are frozen
 * history that the site itself says must not be altered ("未改一字"), and they
 * discuss six-stage numbering because that is what the method was when they were
 * written. Flagging them would be asking history to update itself.
 */
export async function scan() {
  const files = [];

  const skillsDir = join(ROOT, '.claude/skills');
  for (const d of await readdir(skillsDir, { withFileTypes: true })) {
    if (!d.isDirectory() || !d.name.startsWith('anb')) continue;
    files.push(join(skillsDir, d.name, 'SKILL.md'));
  }

  const siteDir = join(ROOT, 'docs/site');
  for (const e of await readdir(siteDir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.html')) files.push(join(siteDir, e.name));
  }

  const hits = [];
  for (const file of files.sort()) {
    const text = await readFile(file, 'utf8').catch(() => null);
    if (text === null) continue;
    for (const h of findStageNumbers(text)) {
      hits.push({ file: file.slice(ROOT.length + 1), ...h });
    }
  }
  return { files, hits };
}

if (process.argv[2] === 'check') {
  const { files, hits } = await scan();
  if (hits.length === 0) {
    console.log(`${GREEN}ok${RESET} — ${files.length} files, no hardcoded stage numbers`);
  } else {
    console.log(`${RED}${hits.length} hardcoded stage number(s)${RESET} ${DIM}in ${files.length} files${RESET}\n`);
    for (const h of hits) console.log(`  ${RED}•${RESET} ${h.file}:${h.line}: ${h.snippet}`);
    console.log(`\n  ${DIM}阶段顺序的唯一来源是 work/schema.yml 的 stage_order。`);
    console.log(`  要指向某一阶段就写它的名字，不要写位置。${RESET}`);
    process.exitCode = 1;
  }
} else if (process.argv[2] !== undefined) {
  console.error(`unknown command: ${process.argv[2]}\n  check`);
  process.exitCode = 1;
}
