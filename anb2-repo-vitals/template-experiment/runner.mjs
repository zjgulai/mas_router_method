#!/usr/bin/env node
/**
 * One test runner for every small product in this method.
 *
 * Extracted at stage 6 from two hand-written copies (link-digest: 85 lines,
 * repo-vitals: 93 lines, ~80% identical). The parts that differed were all
 * product-specific assertions, which would have been written either way — so the
 * question this file answers is whether the shared 80% is worth carrying.
 *
 * What it keeps from both:
 *  - calls real modules; only the outside world is faked, at its own boundary
 *  - fails loudly when a file registers zero checks
 *  - reports skipped separately, and a run with skips is INCOMPLETE, not passing
 *  - exits non-zero on failure, 2 on incomplete
 */
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function run({ dir, pattern = /\.checks\.js$/, banner = null } = {}) {
  const checks = [];
  let currentFile = '';

  const api = {
    test(name, fn) { checks.push({ file: currentFile, name, fn }); },
    skip(name, reason) { checks.push({ file: currentFile, name, fn: null, skipReason: reason }); },
    assert(cond, msg) { if (!cond) throw new Error(msg ?? 'assertion failed'); },
    equal(a, e, msg) {
      const A = JSON.stringify(a), E = JSON.stringify(e);
      if (A !== E) throw new Error(`${msg ?? 'not equal'}\n    expected: ${E}\n    actual:   ${A}`);
    },
    includes(h, n, msg) {
      if (!String(h).includes(n)) throw new Error(`${msg ?? 'missing'}\n    wanted: ${n}\n    in: ${String(h).slice(0, 200)}`);
    },
    async throwsAsync(fn, matcher, msg) {
      let threw = false, text = '';
      try { await fn(); } catch (c) { threw = true; text = c instanceof Error ? c.message : String(c); }
      if (!threw) throw new Error(msg ?? 'expected a throw');
      if (matcher !== undefined && !text.includes(matcher)) throw new Error(`${msg ?? 'wrong error'}\n    wanted: ${matcher}\n    got: ${text}`);
      return text;
    },
  };
  globalThis.__t = api;

  const files = (await readdir(dir)).filter((f) => pattern.test(f)).sort();
  if (files.length === 0) {
    console.error(`No files matching ${pattern} in ${dir}. A suite that runs nothing is not a suite.`);
    process.exit(1);
  }

  let index = 0;
  for (const file of files) {
    currentFile = `${String(index + 1).padStart(2, '0')} ${file}`;
    index += 1;
    const before = checks.length;
    await import(pathToFileURL(join(dir, file)).href);
    if (checks.length === before) {
      console.error(`[${file}] registered zero checks`);
      process.exit(1);
    }
  }

  let passed = 0, skipped = 0;
  const failed = [];
  for (const c of checks) {
    if (c.fn === null) { skipped += 1; continue; }
    try { await c.fn(); passed += 1; }
    catch (e) { failed.push({ ...c, error: e instanceof Error ? e.message : String(e) }); }
  }

  if (banner !== null) console.log(banner);
  console.log(`\n  ${checks.length} checks · ${passed} passed · ${failed.length} failed · ${skipped} skipped`);
  if (skipped > 0) {
    console.log('\n  SKIPPED (this run is INCOMPLETE, not passing):');
    for (const c of checks.filter((x) => x.fn === null)) console.log(`    - ${c.name}: ${c.skipReason}`);
  }
  for (const f of failed) console.log(`\n  FAIL  [${f.file}] ${f.name}\n        ${f.error.replace(/\n/g, '\n        ')}`);

  if (failed.length > 0) { console.log('\n  verdict: FAIL'); return 1; }
  if (skipped > 0) { console.log('\n  verdict: INCOMPLETE — a skipped check is not a pass'); return 2; }
  console.log('\n  verdict: PASS (every check ran and passed)');
  return 0;
}
