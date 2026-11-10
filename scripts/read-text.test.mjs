#!/usr/bin/env node
/**
 * Tests for scripts/read-text.mjs — the one reader that survives this mount.
 *
 * The mount quirk (INC-001/INC-002 family): some .md files are stored in a form
 * where Node's fs returns binary garbage while Python's open() returns the real
 * UTF-8 text. The first victim was `work check`: parseFrontmatter saw garbage,
 * reported "no frontmatter", and a done ticket with real evidence failed as
 * "records no evidence" — a wrong message that reads exactly like a real one.
 *
 * These tests use only real files and real processes. No fs mocking: the mount
 * itself is exercised end-to-end by the CLI probe in work.test.mjs, which is
 * the one place "Node returns binary for a valid file" can be staged honestly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAndConfirm } from './test-fs.mjs';
import { readText } from './read-text.mjs';

const execFileAsync = promisify(execFile);

/** Confirm via a fresh Python process what is really on disk (bypasses any Node-side staleness). */
async function pythonSees(file) {
  // spawnSync, not execFile: the async pipe on this mount loses bytes from
  // child stdout (the same second corruption layer read-text.mjs works around).
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(
    'python3',
    [
      '-I',
      '-c',
      'from pathlib import Path; import sys; sys.stdout.buffer.write(Path(sys.argv[1]).read_bytes())',
      file,
    ],
    { encoding: 'buffer' },
  );
  return r.stdout;
}

test('readText: valid UTF-8 markdown comes back through Node alone', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'read-text-'));
  try {
    const file = join(dir, 'ok.md');
    const content = '---\nid: T-900\n---\n## 中文标题\n\nevidence: [E-001]\n';
    await writeAndConfirm(file, content);

    // Prove the native path: with PATH stripped, a python3 fallback could not
    // even start. If this read succeeds, no fallback ran.
    const savedPath = process.env.PATH;
    process.env.PATH = '';
    try {
      assert.equal(await readText(file), content);
    } finally {
      process.env.PATH = savedPath;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readText: a non-markdown file with invalid UTF-8 fails loudly, no fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'read-text-'));
  try {
    const file = join(dir, 'payload.bin');
    await writeFile(file, Buffer.from([0xff, 0xfe, 0x00, 0x41]));

    await assert.rejects(
      () => readText(file),
      (e) => {
        assert.match(e.message, /payload\.bin/, 'the error must name the file');
        assert.match(e.message, /non-markdown|invalid UTF-8|NUL/);
        return true;
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readText: missing files stay missing — ENOENT, not an empty read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'read-text-'));
  try {
    for (const name of ['gone.md', 'gone.txt']) {
      await assert.rejects(
        () => readText(join(dir, name)),
        (e) => e.code === 'ENOENT',
        `${name}: a missing file must keep its original fs error`,
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readText: markdown whose bytes Python also cannot decode fails naming both causes', async () => {
  // Real garbage on disk (not a mount artifact): Node sees binary, the Python
  // fallback runs, and Python's read_text(encoding='utf-8') raises too. The
  // reader must surface that as an explicit error — never as empty text,
  // which is what turned this class of failure into "records no evidence".
  const dir = await mkdtemp(join(tmpdir(), 'read-text-'));
  try {
    const file = join(dir, 'garbage.md');
    const garbage = Buffer.from([0xff, 0xfe, 0x81, 0x9d, 0x00, 0x42]);
    let landed = false;
    for (let i = 0; i < 10 && !landed; i++) {
      await writeFile(file, garbage);
      landed = (await pythonSees(file)).equals(garbage);
    }
    assert.ok(landed, 'fixture must be garbage on disk before the assertion means anything');

    await assert.rejects(
      () => readText(file),
      (e) => {
        assert.match(e.message, /garbage\.md/, 'the error must name the file');
        assert.match(
          e.message,
          /not readable|fallback/i,
          'the error must say the file could not be read by either channel',
        );
        return true;
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readText: fallback output containing NUL bytes is rejected, not returned', async () => {
  // A file that IS valid UTF-8 but carries NULs: Node flags it, Python happily
  // decodes it (NUL is legal UTF-8), and the reader must still refuse — NUL
  // bytes in a record are the mount's corruption signature, never content.
  const dir = await mkdtemp(join(tmpdir(), 'read-text-'));
  try {
    const file = join(dir, 'nul.md');
    await writeAndConfirm(file, 'id: probe\u0000tail');
    await assert.rejects(
      () => readText(file),
      (e) => {
        assert.match(e.message, /nul\.md/);
        assert.match(e.message, /NUL/i);
        return true;
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
