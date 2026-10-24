#!/usr/bin/env node
/**
 * layout — check that every file lives where LAYOUT.md says it lives.
 *
 * The rule this enforces is the one that keeps failing by hand: one kind of
 * information, one home. Duplicates do not break anything when they are created;
 * they break the first time you change one copy. This command is cheaper than
 * remembering.
 *
 * Rules are declared here because they must be checkable. LAYOUT.md explains the
 * reasoning; this file is the executable part. If the two disagree, LAYOUT.md is
 * the intent and this file is the bug — same convention as the eval docs.
 */
import { readdir, stat } from 'node:fs/promises';
import { join, relative, extname, basename } from 'node:path';
import { ROOT, WORK } from './schema.mjs';

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m',
      DIM = '\x1b[2m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

const SKIP_DIRS = new Set(['node_modules', '.git', '.turbo', 'dist', '.next', '.agent-runs', 'outputs']);

/**
 * Where a given kind of file is allowed to be. `pattern` matches the top-level or
 * nested path; `allow` lists exceptions that are legitimate.
 */
const RULES = [
  {
    what: 'ADR',
    match: (p) => /^docs\/adr\/\d{4}-.+\.md$/.test(p),
    forbid: (p) => /\.md$/.test(p) && /(^|\/)adr(\/|$)/i.test(p) && !/^docs\/adr\//.test(p),
    hint: 'ADR 只住 docs/adr/NNNN-*.md，它们是永久记录，不进 work/',
  },
  {
    what: '执行票',
    match: (p) => /^work\/tickets\/[a-z-]+\/T-\d{3}-.+\.md$/.test(p),
    forbid: (p) => /(^|\/)T-\d{3}-.+\.md$/.test(p) && !/^work\/tickets\//.test(p),
    hint: '执行票只住 work/tickets/<state>/T-NNN-*.md，状态就是目录',
  },
  {
    what: '事故',
    match: (p) => /^work\/incidents\/[a-z]+\/INC-\d{3}-.+\.md$/.test(p),
    forbid: (p) => /(^|\/)INC-\d{3}-.+\.md$/.test(p) && !/^work\/incidents\//.test(p),
    hint: '事故只住 work/incidents/<state>/INC-NNN-*.md',
  },
  {
    what: '证据',
    match: (p) => /^work\/evidence\/E-\d{3}-.+\.md$/.test(p),
    forbid: (p) => /(^|\/)E-\d{3}-.+\.md$/.test(p) && !/^work\/evidence\//.test(p),
    hint: '证据只住 work/evidence/E-NNN-*.md，只增不改',
  },
  {
    // Pages only publishes the repo root or /docs, so the site lives at docs/site/.
    // That is an external constraint, not a preference - recorded in LAYOUT.md.
    what: '站点页面',
    // docs/site/ 根放生成物，originals/ 放手写原件。这层区别必须在路径上：
    // 八份原件是站点自己声明「未改一字」的历史文档，与生成物混在一起，
    // 孤儿检测就分不清「构建残留」和「不许动的东西」。
    match: (p) => /^docs\/site\/(originals\/)?[^/]+\.html$/.test(p),
    // docs/index.html is the entry point Pages serves at /, and it redirects into
    // docs/site/. It is the one page allowed outside the site directory.
    forbid: (p) => /\.html$/.test(p) && /^docs\//.test(p)
      && !/^docs\/site\//.test(p) && p !== 'docs/index.html',
    hint: '站点 html 只住 docs/site/（Pages 限制）：生成物在根，手写原件在 originals/',
  },
];

/**
 * Walk the tree, accumulating the *relative* path as we go.
 *
 * Not `path.relative()` and not string-prefix stripping: on this mounted
 * filesystem both produced `mas_router_method/docs/...` for a path that was
 * clearly `<root>/docs/...`. I never explained it, which is reason enough not to
 * depend on it. Carrying the relative path avoids the question entirely — there
 * is no absolute path to convert.
 */
async function walk(rel, out = [], depth = 0) {
  if (depth > 6) return out;
  let entries;
  try {
    entries = await readdir(rel === '' ? ROOT : join(ROOT, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === '.gitkeep' || e.name === '.DS_Store') continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) await walk(childRel, out, depth + 1);
    else if (e.isFile()) out.push(childRel);
  }
  return out;
}

const files = await walk('');
const problems = [];
const counts = {};

for (const rule of RULES) {
  counts[rule.what] = files.filter((f) => rule.match(f)).length;
}

// 1. a file matching a "forbid" predicate is in the wrong place
for (const f of files) {
  for (const rule of RULES) {
    if (rule.forbid(f)) problems.push({ file: f, rule, why: rule.hint });
  }
}

// 2. duplicate IDs across registers
const idOwners = new Map();
for (const f of files) {
  const base = basename(f);
  const m = /^((?:T|INC|E|R|ART|REC)-\d{3})-/.exec(base);
  if (m === null) continue;
  const id = m[1];
  if (idOwners.has(id)) problems.push({ file: f, why: `同 id 出现两次：${idOwners.get(id)} 和 ${f}` });
  else idOwners.set(id, f);
}

// 3. top-level directories that are not declared anywhere
const declared = new Set([
  'work', 'docs', 'packages', 'apps', 'scripts', 'node_modules', '.git', '.turbo', '.github',
  'anb-experiment-linkdigest', 'anb2-repo-vitals', '.agent-runs', '.claude', '.scratch', 'outputs',
]);
const top = await readdir(ROOT, { withFileTypes: true });
const unknown = top
  .filter((e) => e.isDirectory() && !declared.has(e.name) && !e.name.startsWith('.'))
  .map((e) => e.name);

if (problems.length === 0 && unknown.length === 0) {
  console.log(`${GREEN}ok${RESET} — ${files.length} files, everything in its declared place`);
  console.log(`${DIM}${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}${RESET}`);
  process.exitCode = 0;
} else {
  if (problems.length > 0) {
    console.log(`${RED}${problems.length} file(s) in the wrong place${RESET}\n`);
    for (const p of problems) {
      console.log(`  ${RED}•${RESET} ${p.file}`);
      if (p.why) console.log(`    ${DIM}${p.why}${RESET}`);
    }
  }
  if (unknown.length > 0) {
    console.log(`\n${YELLOW}${unknown.length} undeclared top-level director${unknown.length === 1 ? 'y' : 'ies'}${RESET}\n`);
    for (const u of unknown) console.log(`  ${YELLOW}•${RESET} ${u}/`);
    console.log(`\n  ${DIM}在 work/LAYOUT.md 里声明它属于哪一类，或者删掉它。${RESET}`);
  }
  process.exitCode = 1;
}
