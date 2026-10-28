#!/usr/bin/env node
/**
 * Tests for the site build entry point.
 *
 * Every test that writes goes through SITE_DIR into a scratch directory. The
 * first version wrote into the real docs/site, which raced with the facts test in
 * work.test.mjs — that test deliberately corrupts a generated page and asserts
 * facts.mjs notices, and a concurrent rebuild quietly restored the file. The test
 * failed for a reason that had nothing to do with what it was testing.
 *
 * Whether the committed site matches its generators is asserted in CI instead
 * (`build && git diff --exit-code docs/site/`), which is the only place that
 * question has a stable answer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAndConfirm } from '../test-fs.mjs';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILD = join(ROOT, 'scripts', 'site', 'build.mjs');

const build = (siteDir) => promisify(execFile)(process.execPath, [BUILD], {
  env: { ...process.env, SITE_DIR: siteDir },
})
  .then((r) => ({ code: 0, out: r.stdout + r.stderr }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

test('build: succeeds, and the committed site holds exactly what it generated', async () => {
  /*
   * The page count used to be written here as 13, and went red the day a fourteenth
   * page was added — a test failing because the site grew, which is the definition of
   * a check that measures itself rather than the product. There is no number to state:
   * the staged directory *is* the answer, and docs/site must equal it.
   */
  const site = await mkdtemp(join(tmpdir(), 'site-'));
  try {
    const { code, out } = await build(site);
    assert.equal(code, 0, `build failed:\n${out}`);
    assert.match(out, /pages generated into docs\/site/);
    const generated = (await readdir(site)).filter((f) => f.endsWith('.html')).sort();

    const committed = (await readdir(join(ROOT, 'docs', 'site'), { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith('.html')).map((e) => e.name).sort();

    assert.deepEqual(committed, generated,
      'docs/site must hold exactly the pages the generators produce — run `node scripts/site/build.mjs`');
  } finally {
    await rm(site, { recursive: true, force: true });
  }
});

test('build: goes red on a page no generator produces', async () => {
  const site = await mkdtemp(join(tmpdir(), 'site-'));
  const orphan = join(site, 'zzz-orphan-probe.html');
  try {
    await writeAndConfirm(orphan, '<!doctype html><title>orphan</title>');
    const { code, out } = await build(site);
    assert.equal(code, 1, 'a file nobody generated must fail the build, not be left to rot');
    assert.match(out, /zzz-orphan-probe\.html/);
    assert.match(out, /no generator produces/);
  } finally {
    await rm(site, { recursive: true, force: true });
  }
});

test('build: the eight hand-written originals are present and untouched', async () => {
  // Read-only on the real tree. If the orphan check ever widens to include
  // originals/ it would demand their deletion, and the site itself forbids
  // changing them ("未改一字").
  const originals = await readdir(join(ROOT, 'docs', 'site', 'originals'));
  const html = originals.filter((f) => f.endsWith('.html'));
  assert.equal(html.length, 8, `expected 8 originals, found ${html.length}: ${html.join(', ')}`);

  // No count here either: the previous assertion ("root must hold only generated
  // pages, 13 of them") mixed two questions. Whether the root holds only generated
  // pages is answered by comparing it against a fresh build, which the first test does.
});

test('build: goes red on a directory named like a page', async () => {
  // 第一版只收「普通文件 + 小写 .html」，所以一个名为 page.html 的目录、一个软链接、
  // 或者 PAGE.HTML 都能躲在站点根目录里，而构建照样报成功。
  const { mkdir, rmdir } = await import('node:fs/promises');
  const site = await mkdtemp(join(tmpdir(), 'site-'));
  const dirPage = join(site, 'sneaky.html');
  try {
    await mkdir(dirPage, { recursive: true });
    const { code, out } = await build(site);
    assert.equal(code, 1, 'something named like a page that is not one needs a human decision');
    assert.match(out, /named like a page but is not one/);
  } finally {
    await rmdir(dirPage).catch(() => {});
    await rm(site, { recursive: true, force: true });
  }
});

test('build: goes red on an uppercase .HTML orphan', async () => {
  const site = await mkdtemp(join(tmpdir(), 'site-'));
  const shout = join(site, 'SHOUT.HTML');
  try {
    await writeAndConfirm(shout, '<!doctype html><title>shout</title>');
    const { code, out } = await build(site);
    assert.equal(code, 1);
    assert.match(out, /SHOUT\.HTML/);
  } finally {
    await rm(site, { recursive: true, force: true });
  }
});
