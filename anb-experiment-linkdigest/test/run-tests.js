#!/usr/bin/env node
/**
 * A tiny test runner, because this tool has no dependencies on purpose.
 *
 * Three things it deliberately does:
 *  1. Runs the REAL modules (no mocks of our own code). Only the network is faked,
 *     at the fetch boundary, and the fake obeys the same limits as the real one.
 *  2. Prints how many checks ran, and fails loudly if a test file registered zero.
 *  3. Exits non-zero on any failure, so "all green" means something.
 */
import { readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const tests = [];
let currentFile = '';

export function test(name, fn) {
  tests.push({ file: currentFile, name, fn });
}

export function assert(condition, message) {
  if (!condition) throw new Error(message ?? 'assertion failed');
}

export function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ?? 'not equal'}\n    expected: ${e}\n    actual:   ${a}`);
}

export function includes(haystack, needle, message) {
  if (!String(haystack).includes(needle)) {
    throw new Error(`${message ?? 'missing substring'}\n    looked for: ${needle}\n    in: ${String(haystack).slice(0, 300)}`);
  }
}

export async function throwsAsync(fn, matcher, message) {
  let threw = false;
  let text = '';
  try { await fn(); } catch (cause) { threw = true; text = cause instanceof Error ? cause.message : String(cause); }
  if (!threw) throw new Error(`${message ?? 'expected a throw, got none'}`);
  if (matcher !== undefined && !text.includes(matcher)) {
    throw new Error(`${message ?? 'wrong error'}\n    wanted to contain: ${matcher}\n    got: ${text}`);
  }
  return text;
}

const files = (await readdir(HERE)).filter((f) => f.endsWith('.test.js')).sort();
if (files.length === 0) {
  console.error('No test files found. A suite that runs nothing is not a suite.');
  process.exit(1);
}

globalThis.__suite = { test, assert, equal, includes, throwsAsync };

for (const file of files) {
  currentFile = file;
  const before = tests.length;
  await import(pathToFileURL(join(HERE, file)).href);
  if (tests.length === before) {
    console.error(`[${file}] registered zero tests`);
    process.exit(1);
  }
}

let passed = 0;
const failures = [];
for (const t of tests) {
  try {
    await t.fn();
    passed += 1;
  } catch (cause) {
    failures.push({ ...t, error: cause instanceof Error ? cause.message : String(cause) });
  }
}

console.log(`\n${passed}/${tests.length} checks passed`);
for (const f of failures) {
  console.log(`\n  FAIL  [${f.file}] ${f.name}\n        ${f.error.replace(/\n/g, '\n        ')}`);
}
if (failures.length > 0) {
  console.log(`\n${failures.length} failing`);
  process.exit(1);
}
console.log('all green');
