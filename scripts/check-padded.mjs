#!/usr/bin/env node
/**
 * Detect the INC-002 write-path signature: a file whose logical size is one
 * 4096-byte page longer than the bytes a data-length reader sees.
 *
 * A write through the editor tooling on this host can attach a preallocated page
 * to the file. `stat` and Node trust st_size and read that page (uninitialized
 * bytes); `cat`, Python and Git stop at the data length and read the intended
 * text. TypeScript then fails with TS1490 "File appears to be binary" on a file
 * that is valid UTF-8.
 *
 * Two independent views are compared:
 *   - Node's st_size (the padded view);
 *   - Python's read_bytes length (the data-length view).
 * A normal file agrees. The signature is statSize - cleanSize === 4096.
 *
 * Usage:
 *   node scripts/check-padded.mjs              # changed and untracked files
 *   node scripts/check-padded.mjs --all        # every tracked file
 *   node scripts/check-padded.mjs --fix        # atomically rewrite flagged files
 *   node scripts/check-padded.mjs <paths...>   # named files
 *
 * Exit: 0 clean, 1 flagged, 2 cannot determine.
 */
import { lstatSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const PAGE = 4096;

const PYTHON_LENGTHS = String.raw`
import sys
from pathlib import Path
for p in sys.argv[1:]:
    try:
        sys.stdout.write(str(len(Path(p).read_bytes())) + "\t" + p + "\n")
    except Exception as e:
        sys.stdout.write("ERR\t" + p + "\t" + type(e).__name__ + "\n")
`;

const PYTHON_FIX = String.raw`
import os, sys, tempfile
p = sys.argv[1]
b = open(p, "rb").read()
fd, t = tempfile.mkstemp(dir=os.path.dirname(p) or ".", suffix=".tmp")
os.write(fd, b)
os.close(fd)
os.replace(t, p)
sys.stdout.write(str(len(b)))
`;

export function classify(statSize, cleanSize) {
  if (statSize === cleanSize) return { ok: true, kind: 'clean', extra: 0 };
  const extra = statSize - cleanSize;
  if (extra === PAGE) return { ok: false, kind: 'page-padded', extra };
  return { ok: false, kind: 'size-mismatch', extra };
}

function gitRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

function gitPaths(args) {
  const r = spawnSync('git', args, { encoding: 'buffer' });
  if (r.status !== 0) return null;
  return r.stdout.toString('utf8').split('\0').filter(Boolean);
}

function changedPaths() {
  const sets = [
    gitPaths(['diff', '--name-only', '-z']),
    gitPaths(['diff', '--cached', '--name-only', '-z']),
    gitPaths(['ls-files', '--others', '--exclude-standard', '-z']),
  ];
  if (sets.some((s) => s === null)) return null;
  return [...new Set(sets.flat())];
}

function cleanLengths(paths) {
  if (paths.length === 0) return new Map();
  const r = spawnSync('python3', ['-I', '-c', PYTHON_LENGTHS, ...paths], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw new Error(`python3 unavailable: ${r.error.message}`);
  if (r.status !== 0)
    throw new Error(`python3 exited ${r.status}: ${r.stderr?.trim().split('\n')[0] ?? ''}`);
  const out = new Map();
  for (const line of r.stdout.split('\n')) {
    if (!line) continue;
    const [head, ...rest] = line.split('\t');
    const p = rest.join('\t');
    if (head === 'ERR') throw new Error(`cannot read ${p}: ${rest[1] ?? 'unknown error'}`);
    out.set(p, Number(head));
  }
  return out;
}

/** Check named files. Returns one row per file; throws only when it cannot decide. */
export function checkFiles(paths) {
  const lengths = cleanLengths(paths);
  return paths.map((p) => {
    const statSize = statSync(p).size;
    const cleanSize = lengths.get(p);
    if (cleanSize === undefined) throw new Error(`no clean length for ${p}`);
    return { path: p, statSize, cleanSize, ...classify(statSize, cleanSize) };
  });
}

export function checkFile(path) {
  return checkFiles([path])[0];
}

function fixFile(path) {
  const r = spawnSync('python3', ['-I', '-c', PYTHON_FIX, path], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return false;
  const written = Number(r.stdout.trim());
  if (!Number.isFinite(written)) return false;
  return statSync(path).size === written;
}

function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const fix = args.includes('--fix');
  const quiet = args.includes('--quiet');
  const named = args.filter((a) => !a.startsWith('--'));

  const root = gitRoot();
  if (!root) {
    console.error('check-padded: not a git repository; pass paths explicitly');
    return 2;
  }
  process.chdir(root);

  const paths = named.length > 0 ? named : all ? gitPaths(['ls-files', '-z']) : changedPaths();
  if (paths === null) {
    console.error('check-padded: cannot list files (git failed)');
    return 2;
  }
  // 只有普通文件可能带 4096 字节尾页。stat() 会跟随符号链接，于是
  // skills/repo/* 这种「指向目录的符号链接」被当成文件交给 Python，
  // 读目录抛 IsADirectoryError，门禁以「无法判定」拦下所有提交。
  const existing = paths.filter((p) => {
    try {
      return lstatSync(p).isFile();
    } catch {
      return false;
    }
  });

  let rows;
  try {
    rows = checkFiles(existing);
  } catch (e) {
    console.error(`check-padded: ${e.message}`);
    return 2;
  }

  const bad = rows.filter((r) => !r.ok);
  if (bad.length === 0) {
    if (!quiet) console.log(`check-padded: ${rows.length} files, 0 padded`);
    return 0;
  }

  for (const r of bad) {
    console.log(`${r.kind}\t${r.path}\tstat=${r.statSize}\tclean=${r.cleanSize}\tdiff=${r.extra}`);
  }

  if (!fix) {
    console.error(`check-padded: ${bad.length} file(s) carry a padded tail; run with --fix`);
    return 1;
  }

  let failed = 0;
  for (const r of bad) {
    if (r.kind !== 'page-padded') {
      console.error(`check-padded: refusing to auto-fix ${r.path} (${r.kind}, diff=${r.extra})`);
      failed++;
      continue;
    }
    if (fixFile(r.path)) {
      console.log(`fixed\t${r.path}`);
    } else {
      console.error(`check-padded: fix failed for ${r.path}`);
      failed++;
    }
  }
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  process.exit(main());
}
