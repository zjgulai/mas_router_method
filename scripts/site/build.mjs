#!/usr/bin/env node
/**
 * build — regenerate docs/site from the generators, and refuse to leave orphans.
 *
 * The site is generated, but not everything in docs/site is: eight pages under
 * originals/ are hand-written, and the site itself says they must not be altered
 * ("未改一字"). That rule has to be physical rather than remembered — generated
 * pages at the root, sources under originals/ — and this command enforces it.
 *
 * It generates into a staging directory first. A file at the root that no
 * generator produced is either a leftover from an older layout or something
 * written by hand; both need a decision, so it reports them instead of leaving
 * them to rot. This is also why there is no hand-maintained list of "the files we
 * generate": that list would be one more thing to keep in sync, and the staged
 * directory already knows the answer.
 *
 * Usage: node scripts/site/build.mjs
 */
import { mkdtemp, readdir, rm, copyFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

// SITE_DIR exists so tests can build into a scratch directory instead of the
// real one. A test that writes to docs/site races with anything else that
// regenerates it — and the first version of these tests did exactly that,
// silently overwriting a deliberate corruption another test was asserting on.
const SITE = process.env.SITE_DIR ?? join(REPO, 'docs', 'site');

// build_shell.py is a library, not a generator: it produces no file, so it is
// deliberately absent. paths.py is the same.
const GENERATORS = [
  'build_pages.py',
  'build_prompts.py',
  'build_skills.py',
  'build_docs.py',
  'build_manage.py',
  'build_matrix.py',
  'build_tables.py',
  'build_agent_graph.py',
  'build_data_design.py',
  'build_data_layers.py',
  'build_cheatsheet.py',
  'build_meta.py',
];

function runGenerator(file, stage) {
  return new Promise((resolvePromise, reject) => {
    const p = spawn('python3', [join(HERE, file)], {
      env: { ...process.env, STAGE_DIR: stage },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => reject(new Error(`cannot run python3: ${e.message}`)));
    p.on('close', (code) => {
      if (code === 0) resolvePromise(out);
      else reject(new Error(`${file} exited ${code}\n${err || out}`));
    });
  });
}

/**
 * Root-level html only. originals/ is a subdirectory and is not generated.
 *
 * Anything whose name ends in `.html`, case-insensitively, counts as a page claim —
 * including things that are not regular files. The first version kept only regular
 * files with a lowercase suffix, so a directory named `page.html`, a symlink, or
 * `PAGE.HTML` sat in the site root unnoticed while the build reported success. A
 * file whose name claims it is a page and which no generator produces needs a
 * decision from a person, whether it is a file or not.
 */
async function rootHtml(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const pages = [];
  const files = [];
  const odd = [];
  for (const e of entries) {
    // 点文件（.nojekyll）是手工维护的宿主约定，不参与生成物比对。
    if (e.name.startsWith('.')) continue;
    if (e.isFile()) files.push(e.name);
    if (!/\.html$/i.test(e.name)) continue;
    if (e.isFile()) pages.push(e.name);
    else if (e.isDirectory()) odd.push(`${e.name} — a directory named like a page`);
    else if (e.isSymbolicLink()) odd.push(`${e.name} — a symlink`);
    else odd.push(`${e.name} — not a regular file`);
  }
  return { pages: pages.sort(), files: files.sort(), odd };
}

const stage = await mkdtemp(join(tmpdir(), 'site-build-'));
try {
  for (const g of GENERATORS) {
    const out = (await runGenerator(g, stage)).trim();
    if (out !== '') console.log(`  ${g}: ${out.replace(/\n/g, ' ')}`);
  }

  const { pages: generatedPages, files: generated, odd: stagedOdd } = await rootHtml(stage);
  const { files: present, odd } = await rootHtml(SITE);
  const orphans = present.filter((f) => !generated.includes(f));

  const odd_all = odd.concat(stagedOdd);
  if (odd_all.length > 0) {
    console.error(`\n${odd.length} entry in docs/site is named like a page but is not one:\n`);
    for (const o of odd) console.error(`  docs/site/${o}`);
    console.error('\n  Remove it, or move it to docs/site/originals/.');
    process.exitCode = 1;
  } else if (orphans.length > 0) {
    console.error(`\n${orphans.length} file(s) in docs/site that no generator produces:\n`);
    for (const f of orphans) console.error(`  docs/site/${f}`);
    console.error('\n  A leftover from an older layout, or a hand-written page that belongs');
    console.error('  in docs/site/originals/. Decide which, then run this again.');
    process.exitCode = 1;
  } else {
    await mkdir(SITE, { recursive: true });
    for (const f of generated) await copyFile(join(stage, f), join(SITE, f));
    const nonHtml = generated.length - generatedPages.length;
    console.log(`\nok — ${generatedPages.length} pages generated into docs/site/` +
      (nonHtml > 0 ? ` (+${nonHtml} non-page files)` : ''));
  }
} catch (cause) {
  console.error(cause.message);
  process.exitCode = 1;
} finally {
  await rm(stage, { recursive: true, force: true });
}
