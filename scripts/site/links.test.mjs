#!/usr/bin/env node
/**
 * Tests for the link checker.
 *
 * The checker exists because a stale `07-iterate.html` survived a rename of every
 * stage page. That is the whole class of bug it is for, so these prove it goes red
 * on each of the three shapes a link can break in, rather than only running green.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAndConfirm } from '../test-fs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LINKS = join(ROOT, 'scripts', 'site', 'links.mjs');
const PROBE = join(ROOT, 'docs', 'site', 'zzz-links-probe.html');

const check = () => promisify(execFile)(process.execPath, [LINKS])
  .then((r) => ({ code: 0, out: r.stdout + r.stderr }))
  .catch((e) => ({ code: e.code ?? 1, out: (e.stdout ?? '') + (e.stderr ?? '') }));

async function withProbe(href, body = '') {
  await writeAndConfirm(PROBE, `<!doctype html><title>probe</title><div id="here">x</div><a href="${href}">y</a>${body}`);
  try {
    return await check();
  } finally {
    await unlink(PROBE).catch(() => {});
  }
}

test('links: the real site resolves', async () => {
  const { code, out } = await check();
  assert.equal(code, 0, `broken links in the real site:\n${out}`);
  assert.match(out, /every internal link resolves/);
});

test('links: goes red on a link to a page that does not exist', async () => {
  const { code, out } = await withProbe('no-such-page.html');
  assert.equal(code, 1);
  assert.match(out, /no page no-such-page\.html/);
});

test('links: goes red on a stale numbered stage URL', async () => {
  // The exact link that survived the rename and shipped.
  const { code, out } = await withProbe('07-iterate.html');
  assert.equal(code, 1);
  assert.match(out, /07-iterate\.html/);
});

test('links: goes red on a legacy absolute prefix', async () => {
  // The site must work at both the Pages subpath and the domain root; an
  // absolute prefix breaks one of them, so it is an error rather than a style.
  const { code, out } = await withProbe('/mas_router_method/site/need.html');
  assert.equal(code, 1);
  assert.match(out, /legacy absolute prefix/);
});

test('links: goes red on an anchor that is not on the target page', async () => {
  const { code, out } = await withProbe('need.html#no-such-anchor');
  assert.equal(code, 1);
  assert.match(out, /no id "no-such-anchor"/);
});

test('links: resolves a real anchor, and leaves external links alone', async () => {
  const ok = await withProbe('#here');
  assert.equal(ok.code, 0, ok.out);
  const ext = await withProbe('https://example.com/not-our-problem');
  assert.equal(ext.code, 0, ext.out);
});
