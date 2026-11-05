#!/usr/bin/env node
/**
 * Tests for scripts/check-padded.mjs.
 *
 * The padded state itself is produced by the editor tooling on this host, not by
 * a syscall a test can replay: `truncate` makes a normal hole, which both views
 * read as zeros. So the signature is tested at the decision boundary, and the
 * filesystem check is tested on a file every writer agrees about.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFile, classify } from './check-padded.mjs';

test('classify: equal sizes are clean', () => {
  assert.deepEqual(classify(1111, 1111), { ok: true, kind: 'clean', extra: 0 });
});

test('classify: exactly one page is the INC-002 signature', () => {
  assert.deepEqual(classify(1111 + 4096, 1111), { ok: false, kind: 'page-padded', extra: 4096 });
});

test('classify: any other difference is a size mismatch, not the page signature', () => {
  assert.deepEqual(classify(1200, 1111), { ok: false, kind: 'size-mismatch', extra: 89 });
  assert.deepEqual(classify(900, 1111), { ok: false, kind: 'size-mismatch', extra: -211 });
});

test('checkFile: a file written by fs.writeFile is clean', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'check-padded-'));
  try {
    const file = join(dir, 'clean.md');
    const body = '0123456789\n'.repeat(101);
    await writeFile(file, body);
    const row = checkFile(file);
    assert.equal(row.ok, true);
    assert.equal(row.statSize, Buffer.byteLength(body));
    assert.equal(row.cleanSize, row.statSize);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
