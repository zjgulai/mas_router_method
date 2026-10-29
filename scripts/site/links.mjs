#!/usr/bin/env node
/**
 * links — every internal link on the site resolves.
 *
 * The site is served from two roots: GitHub Pages serves it under
 * `/mas_router_method/site/`, and main.luteos.com serves it at `/`. The only
 * link shape that works on both is a relative one, so an absolute legacy prefix
 * is treated as broken here — that is what keeps the migration from coming back.
 *
 * Three kinds of internal link fail independently: same-page anchors, cross-page
 * paths, and links into the frozen originals. A stale `07-iterate.html` survived
 * a rename until this script existed — checking by hand is exactly the step that
 * gets skipped when the change looks routine.
 *
 * Scope: the generated pages at the site root, the hand-written originals, and
 * docs/index.html (the entry point Pages serves, where a broken link is worst).
 *
 * Usage: node scripts/site/links.mjs
 */
import { readdir, readFile, access } from 'node:fs/promises';
import { join, dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const RED = '\x1b[31m', GREEN = '\x1b[32m', RESET = '\x1b[0m';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SITE = join(REPO, 'docs', 'site');
const LEGACY = '/mas_router_method/site/';

/** Every page we own, keyed by the path a relative link would use to reach it. */
async function pages() {
  const out = new Map(); // 'need.html' | 'originals/terms.html' -> html

  for (const e of await readdir(SITE, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.html')) {
      out.set(e.name, await readFile(join(SITE, e.name), 'utf8'));
    }
  }
  for (const name of await readdir(join(SITE, 'originals')).catch(() => [])) {
    if (name.endsWith('.html')) {
      out.set(`originals/${name}`, await readFile(join(SITE, 'originals', name), 'utf8'));
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

const anchorOf = (raw) => {
  try { return decodeURIComponent(raw); } catch { return raw; }
};

for (const [page, html] of all) {
  const entry = page === '__entry__';
  const where = entry ? 'docs/index.html' : `docs/site/${page}`;
  const base = entry ? '.' : posix.dirname(page);

  for (const m of html.matchAll(/href="([^"]*)"/g)) {
    const href = m[1];

    if (href === '' || href.startsWith('#')) {
      const anchor = href.slice(1);
      if (anchor !== '' && !idsOf(html).has(anchorOf(anchor))) {
        broken.push(`${where} -> ${href} (no such id on the page)`);
      }
      continue;
    }
    // External, mailto, tel, data, javascript, protocol-relative — not ours.
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;

    if (href.startsWith(LEGACY)) {
      broken.push(`${where} -> ${href} (legacy absolute prefix; the site must work at the domain root)`);
      continue;
    }

    let raw = href;
    let target;
    let anchor = '';
    if (entry) {
      if (!/^(?:\.\/)?site\//.test(raw)) continue; // the entry links elsewhere are not site pages
      raw = raw.replace(/^(?:\.\/)?site\//, '');
      target = raw === '' ? 'index.html' : raw;
    } else {
      if (raw.startsWith('/')) raw = raw.slice(1);
      const [pathPart, anchorPart = ''] = raw.split('#');
      anchor = anchorPart;
      target = pathPart === '' ? page : posix.normalize(posix.join(base, pathPart));
      if (target === '' || target === '.') target = 'index.html';
      if (target.endsWith('/')) target = posix.join(target, 'index.html');
    }

    if (target.startsWith('../')) {
      broken.push(`${where} -> ${href} (escapes the site root)`);
      continue;
    }

    const [targetPath = '', targetAnchor = ''] = target.split('#');
    anchor = anchor || targetAnchor;
    const content = all.get(targetPath);
    if (content === undefined) {
      if (/\.html?$/i.test(targetPath)) {
        broken.push(`${where} -> ${href} (no page ${targetPath})`);
        continue;
      }
      try {
        await access(join(SITE, targetPath));
        continue;
      } catch {
        broken.push(`${where} -> ${href} (no file ${targetPath})`);
        continue;
      }
    }
    if (anchor !== '' && !idsOf(content).has(anchorOf(anchor))) {
      broken.push(`${where} -> ${href} (no id "${anchor}" on ${targetPath})`);
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
