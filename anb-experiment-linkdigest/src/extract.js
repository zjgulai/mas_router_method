/**
 * Turn an HTML document into plain text plus a title.
 *
 * Deliberately crude and deterministic: no LLM, no readability heuristics that
 * cannot be tested. A crude extractor that is honest about being crude beats a
 * clever one whose output changes between runs.
 */

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™',
};

export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/** Content we never want in a digest, removed with its contents. */
const DROP_WITH_CONTENT = /<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;

export function extractTitle(html) {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i.exec(html);
  if (og !== null) return decodeEntities(og[1]).trim();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return title === null ? '' : decodeEntities(title[1]).replace(/\s+/g, ' ').trim();
}

export function extractText(html) {
  const withoutCode = html.replace(DROP_WITH_CONTENT, ' ');
  const withoutComments = withoutCode.replace(/<!--[\s\S]*?-->/g, ' ');
  // Block-level tags become newlines so sentence boundaries survive.
  const withBreaks = withoutComments.replace(
    /<\/?(p|div|section|article|header|footer|li|tr|h[1-6]|blockquote|br)\b[^>]*>/gi,
    '\n',
  );
  const withoutTags = withBreaks.replace(/<[^>]+>/g, ' ');
  return decodeEntities(withoutTags)
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Count outbound links, which is a cheap signal of how much of a page is navigation. */
export function countLinks(html) {
  const anchors = html.match(/<a\b[^>]*href=/gi);
  return anchors === null ? 0 : anchors.length;
}
