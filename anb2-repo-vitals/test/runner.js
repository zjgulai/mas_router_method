#!/usr/bin/env node
/**
 * Minimal test runner. Three things it does on purpose:
 *  1. Calls the REAL modules; only the network is faked, at the fetch boundary.
 *  2. Fails if a test file registers zero checks.
 *  3. Prints how many passed, how many failed, and how many were skipped.
 *
 * The skip column exists because a report that cannot say "skipped" has no way to
 * be incomplete, and an incomplete report that reads as complete is the failure
 * this whole method is about.
 */
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const checks = [];
let currentFile = '';

function test(name, fn, meta = {}) {
  checks.push({ file: currentFile, name, fn, ...meta });
}
function skip(name, reason) {
  checks.push({ file: currentFile, name, fn: null, skipReason: reason });
}
function assert(cond, msg) { if (!cond) throw new Error(msg ?? 'assertion failed'); }
function equal(a, e, msg) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A !== E) throw new Error(`${msg ?? 'not equal'}\n    expected: ${E}\n    actual:   ${A}`);
}
function includes(h, n, msg) {
  if (!String(h).includes(n)) throw new Error(`${msg ?? 'missing'}\n    wanted: ${n}\n    in: ${String(h).slice(0, 200)}`);
}
async function throwsAsync(fn, matcher, msg) {
  let threw = false, text = '';
  try { await fn(); } catch (c) { threw = true; text = c instanceof Error ? c.message : String(c); }
  if (!threw) throw new Error(msg ?? 'expected a throw');
  if (matcher !== undefined && !text.includes(matcher)) {
    throw new Error(`${msg ?? 'wrong error'}\n    wanted: ${matcher}\n    got: ${text}`);
  }
  return text;
}
globalThis.__t = { test, skip, assert, equal, includes, throwsAsync };

const files = (await readdir(HERE)).filter((f) => f.endsWith('.checks.js')).sort();
if (files.length === 0) { console.error('No *.checks.js files. A suite that runs nothing is not a suite.'); process.exit(1); }
let fileIndex = 0;
for (const file of files) {
  currentFile = `${String(fileIndex + 1).padStart(2, '0')} ${file}`;
  fileIndex += 1;
  const before = checks.length;
  await import(pathToFileURL(join(HERE, file)).href);
  if (checks.length === before) { console.error(`[${file}] registered zero checks`); process.exit(1); }
}

let passed = 0; const failed = []; let skipped = 0;
for (const c of checks) {
  if (c.fn === null) { skipped += 1; continue; }
  try { await c.fn(); passed += 1; }
  catch (e) { failed.push({ ...c, error: e instanceof Error ? e.message : String(e) }); }
}

console.log(`\n  ${checks.length} checks · ${passed} passed · ${failed.length} failed · ${skipped} skipped`);
if (skipped > 0) {
  console.log('\n  SKIPPED (this run is INCOMPLETE, not passing):');
  for (const c of checks.filter((x) => x.fn === null)) console.log(`    - ${c.name}: ${c.skipReason}`);
}
for (const f of failed) console.log(`\n  FAIL  [${f.file}] ${f.name}\n        ${f.error.replace(/\n/g, '\n        ')}`);
if (failed.length > 0) { console.log(`\n  verdict: FAIL`); process.exit(1); }
if (skipped > 0) { console.log(`\n  verdict: INCOMPLETE — a skipped check is not a pass`); process.exit(2); }
console.log('\n  verdict: PASS (every check ran and passed)');
