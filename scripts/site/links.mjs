#!/usr/bin/env node
/**
 * links — every internal link on the site resolves.
 *
 * The stage pages lost their numeric prefixes, and the site has three kinds of
 * internal link that fail independently: same-page anchors, cross-page paths, and
 * links into the frozen originals. A stale `07-iterate.html` survived that rename
 * until this script existed — checking by hand is exactly the step that gets
 * skipped when the change looks routine.
 *
 * Scope: the generated pages at the site root, the hand-written originals, and
 * docs/index.html (the entry point Pages serves, where a broken link is worst).
 *
 * Usage: node scripts/site/links.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[2m', RESET = '\x1b[0m';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SITE = join(REPO, 'docs', 'site');
const PREFIX = '/mas_router_method/site/';

/** Every page we own, keyed by the path a link would use to reach it. */
async function pages() {
  const out = new Map(); // 'need.html' | 'originals/terms.html' -> html

  for (const e of await readdir(SITE, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.html')) {
      out.set(e.name, await readFile(join(SITE, e.name), 'utf8'));
    }
  }
  const originalsDir = join(SITE, 'originals');
  for (const name of await readdir(originalsDir).catch(() => [])) {
    if (name.endsWith('.html')) {
      out.set(`originals/${name}`, await readFile(join(originalsDir, name), 'utf8'));
    }
  }
  // The Pages entry point. It lives one level up, so it is not reachable by an
  // internal link — but its own link into the site is.
  out.set('__entry__', await readFile(join(REPO, 'docs', 'index.html'), 'utf8').catch(() => ''));
  return out;
}

const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

const all = await pages();
const broken = [];

for (const [page, html] of all) {
  const ids = idsOf(html);
  const where = page === '__entry__' ? 'docs/index.html' : `docs/site/${page}`;

  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];

    if (href.startsWith('#')) {
      const anchor = href.slice(1);
      if (anchor !== '' && !ids.has(anchor)) broken.push(`${where} -> ${href} (no such id on the page)`);
      continue;
    }
    if (!href.startsWith(PREFIX)) continue; // external, mailto, or an in-page asset

    const rest = href.slice(PREFIX.length);
    const [target = '', anchor] = rest.split('#');
    if (target === '') continue; // a link to /site/ — served by index.html

    if (!all.has(target)) {
      broken.push(`${where} -> ${href} (no page ${target})`);
      continue;
    }
    if (anchor !== undefined && anchor !== '' && !idsOf(all.get(target)).has(anchor)) {
      broken.push(`${where} -> ${href} (no id "${anchor}" on ${target})`);
    }
  }
}

if (broken.length === 0) {
  console.log(`${GREEN}ok${RESET} — ${all.size - 1} pages, every internal link resolves`);
} else {
  console.log(`${RED}${broken.length} broken link(s)${RESET}\n`);
  for (const b of broken) console.log(`  ${RED}•${RESET} ${b}`);
  process.exitCode = 1;
}
