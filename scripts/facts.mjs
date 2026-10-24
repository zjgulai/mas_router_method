#!/usr/bin/env node
/**
 * facts — the numbers this project quotes about itself, computed from disk.
 *
 * Every doc that says "109 skills" or "seven stages" is making a claim that goes
 * stale the moment something is added. The claim is cheap to write and expensive
 * to notice: a page advertising six classes while the atlas demonstrates seven
 * argues against its own method.
 *
 * So the numbers get one home. `facts` prints them; `facts --check` verifies that
 * the documents agree. Documents should either read from here or be checked
 * against it — quoting a number twice is the same failure as writing a rule twice.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, WORK, loadSchema } from './schema.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

/** Count files in a directory, with an optional filename filter. */
async function count(dir, pattern = null) {
  try {
    const files = await readdir(dir);
    return pattern === null ? files.length : files.filter((f) => pattern.test(f)).length;
  } catch {
    return 0;
  }
}

/** Count rows in the generated skill table, the number the page states. */
async function skillTableRows() {
  try {
    const html = await readFile(join(ROOT, 'docs/site/skills.html'), 'utf8');
    const bodies = html.match(/<tbody>[\s\S]*?<\/tbody>/g) ?? [];
    return bodies.reduce((n, b) => n + (b.match(/<tr/g) ?? []).length, 0);
  } catch {
    return 0;
  }
}

/** Count prompt entries in the generator, which is their only source of truth. */
/** Count prompt cards in the generated page — the artifact, not the generator. */
async function promptCount() {
  try {
    const html = await readFile(join(ROOT, 'docs/site/prompts.html'), 'utf8');
    // One prompt per <pre> block: each entry is exactly one code block, whereas
    // "card" also appears in stylesheet rules.
    return (html.match(/<pre>/g) ?? []).length;
  } catch {
    return 0;
  }
}

/** Count numbered class sections in the failure atlas. */
async function atlasClasses() {
  try {
    // originals/ 是手写原件的新家。旧路径读不到时这里曾静默返回 0，
    // 而 0 和「真的没有」长得一样。
    const html = await readFile(join(ROOT, 'docs/site/originals/failure-atlas.html'), 'utf8');
    // Each class opens with <span class="fn">N</span>; the checklist and appendix
    // use the same markup but are not classes, so exclude them by their heading.
    const sections = [...html.matchAll(/<span class="fn">[一二三四五六七八九十]<\/span><h2 class="fam">([^<]+)/g)];
    return sections.filter((m) => !/自检表|做不到/.test(m[1])).length;
  } catch {
    return 0;
  }
}

/**
 * The stage count, from the single source.
 *
 * This used to count files matching `0\d-*.html`. When stage page filenames lost
 * their numeric prefix, that pattern would have quietly returned 0 — a number
 * that changes by becoming wrong rather than by becoming different, which is the
 * exact failure `facts` exists to catch. So it asks the schema instead.
 */
async function stagePages() {
  // No catch: a schema that cannot be read is a broken gate, not a project with
  // zero stages. Returning 0 here would print a number that is wrong in a way
  // that looks exactly like a real one.
  const schema = await loadSchema();
  return schema.stages.length;
}

async function collectFacts() {
  const schema = await loadSchema();

  const skills = await readdir(join(ROOT, '.claude/skills'), { withFileTypes: true }).catch(() => []);
  const skillDirs = skills.filter((e) => e.isDirectory()).map((e) => e.name);
  const anb = skillDirs.filter((d) => d.startsWith('anb'));
  const vendored = skillDirs.filter((d) => !d.startsWith('anb'));

  const tickets = {};
  for (const state of schema.entities.ticket.states) {
    tickets[state] = await count(join(WORK, 'tickets', state), /^T-\d{3}-.*\.md$/);
  }

  return {
    'anb skills': anb.length,
    'vendored skills': vendored.length,
    'skill dirs total': skillDirs.length,
    'site pages': await count(join(ROOT, 'docs/site'), /\.html$/),
    'adrs': await count(join(ROOT, 'docs/adr'), /^\d{4}-.*\.md$/),
    'tickets': Object.values(tickets).reduce((a, b) => a + b, 0),
    'tickets done': tickets.done,
    'evidence': await count(join(WORK, 'evidence'), /^E-\d{3}-.*\.md$/),
    'incidents': (await count(join(WORK, 'incidents/open'), /\.md$/))
      + (await count(join(WORK, 'incidents/contained'), /\.md$/))
      + (await count(join(WORK, 'incidents/closed'), /\.md$/)),
    // Rows in the skill table, which is what the page actually says. It exceeds the
    // directory count because the table also lists client-provided plugin skills.
    'skill table rows': await skillTableRows(),
        // Counted from the atlas itself: one section per class.
    'atlas classes': await atlasClasses(),
    'stages': await stagePages(),
    // Registers = entities with a lifecycle + the append-only ones + ADRs, which
    // live outside work/ but are listed in the same table.
    'registers': Object.keys(schema.entities).length + schema.appendOnly.length + 1,
    'prompts': await promptCount(),
  };
}

/**
 * Claims a document makes about the project, and the fact each must match.
 * Adding a check here is how a new class of stale number gets caught.
 */
const CLAIMS = [
  { file: 'docs/site/skills.html', pattern: /全部 (\d+) 个/, fact: 'skill table rows', what: 'skill table rows' },
  { file: 'docs/site/index.html', pattern: /(\d+) 个 skill 的归属表/, fact: 'skill table rows', what: 'skill table rows' },
  { file: 'docs/skills/skill-catalog.md', pattern: /本方法新增\*\* \| (\d+)/, fact: 'anb skills', what: 'anb skill count' },
  { file: 'docs/skills/skill-catalog.md', pattern: /仓库实际共 (\d+) 个 skill/, fact: 'skill dirs total', what: 'skill dirs total' },
  { file: 'docs/skills/skill-catalog.md', pattern: /仓库自带的 (\d+) 个/, fact: 'vendored skills', what: 'vendored count' },
  // The atlas states its own size in the title; if a class is added and the title
  // is not updated, the page argues against itself.
  { file: 'docs/site/originals/failure-atlas.html', pattern: /<h1>七种误判/, fact: 'atlas classes', what: 'atlas classes', literal: 7 },
  // Seven stages, but eight registers — the management layer's entities are not
  // one per stage. Quoting `stages` here was wrong the moment designs joined.
  { file: 'docs/site/manage.html', pattern: /八个寄存器/, fact: 'registers', what: 'registers', literal: 8 },
];

const facts = await collectFacts();

if (process.argv.includes('--check')) {
  const problems = [];
  for (const claim of CLAIMS) {
    let text;
    try {
      text = await readFile(join(ROOT, claim.file), 'utf8');
    } catch {
      // 之前这里是 `continue`：断言引用的文件一旦被移动或改名，这条断言就
      // 静默停止工作，而 --check 仍然报绿。一个不再检查任何东西的断言，
      // 和一条永远不会红的检查是同一种东西。
      problems.push(`${claim.file}: claim refers to a file that cannot be read (moved or renamed?)`);
      continue;
    }
    const m = claim.pattern.exec(text);
    if (m === null) {
      problems.push(`${claim.file}: no match for /${claim.pattern.source}/ (claim removed or reworded?)`);
      continue;
    }
    // Two shapes: a captured number, or a literal the pattern already encodes
    // (Chinese numerals in headings cannot be captured as digits).
    const claimed = claim.literal !== undefined ? claim.literal
      : m[1] !== undefined ? Number(m[1]) : null;
    const actual = facts[claim.fact];
    if (claimed === null) {
      problems.push(`${claim.file}: pattern matched but no number was captured`);
    } else if (claimed !== actual) {
      problems.push(`${claim.file}: says ${claimed} ${claim.what}, disk has ${actual}`);
    }
  }

  if (problems.length === 0) {
    console.log(`${GREEN}ok${RESET} — ${CLAIMS.length} quoted numbers match disk`);
    process.exitCode = 0;
  } else {
    console.log(`${RED}${problems.length} stale number(s)${RESET}\n`);
    for (const p of problems) console.log(`  ${RED}•${RESET} ${p}`);
    console.log(`\n  ${DIM}run \`node scripts/facts.mjs\` to see the current values${RESET}`);
    process.exitCode = 1;
  }
} else {
  console.log(`\n${BOLD}facts${RESET} ${DIM}computed from disk, not remembered${RESET}\n`);
  const width = Math.max(...Object.keys(facts).map((k) => k.length));
  for (const [k, v] of Object.entries(facts)) {
    console.log(`  ${k.padEnd(width)}  ${BOLD}${String(v).padStart(4)}${RESET}`);
  }
  console.log();
}
