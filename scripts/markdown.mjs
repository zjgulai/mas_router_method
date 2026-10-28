/**
 * The one markdown section parser in this repo.
 *
 * It exists as its own module because two callers need it — `work check`, which
 * validates that a design record answers all four questions, and `design`, which
 * hands the record to the stages that consume it — and the first version of this
 * code had a bug worth not repeating.
 *
 * That version matched a section with `/^##[^\n]*KEY([\s\S]*?)(?=^## |\s*$)/m`.
 * Under the `m` flag, `\s*$` also matches at the end of *any* line, so every
 * section was truncated to the blank line just after its heading. Four correctly
 * written design records were reported as having empty sections. A checker that
 * cries wolf gets switched off, which is why this splits instead of matching.
 */

/**
 * Split markdown into `{ head, body }` for each `## ` heading.
 *
 * The heading line itself is not part of `body`. Text before the first `## ` is
 * ignored — frontmatter and any preamble belong to other concerns.
 */
export function sections(text) {
  const parts = text.split(/^## /m).slice(1);
  return parts.map((p) => {
    const nl = p.indexOf('\n');
    return nl < 0
      ? { head: p.trim(), body: '' }
      : { head: p.slice(0, nl).trim(), body: p.slice(nl + 1).trim() };
  });
}

/** The section whose heading contains `needle`, or undefined. */
export function section(text, needle) {
  return sections(text).find((s) => s.head.includes(needle));
}

/** A block marked as deliberately skipped, or null. The reason is the point. */
export function skipReason(body) {
  const m = /跳过[：:]\s*(\S.*)/.exec(body);
  return m === null ? null : m[1].trim();
}

/**
 * A markdown table, or null if the text has none.
 *
 * Rows are split on `|` with the outer pipes optional, because both spellings appear
 * in this repo's records and a parser that demanded one would quietly return nothing
 * for the other. The separator row (`---`) is consumed, not returned.
 */
export function parseTable(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.includes('|'));
  if (lines.length < 2) return null;

  const cells = (line) => {
    let s = line;
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map((c) => c.trim());
  };

  // The separator is the first line that is all dashes/colons/spaces once split.
  const isSeparator = (line) => /^[\s|:-]+$/.test(line) && line.includes('-');
  const sepAt = lines.findIndex(isSeparator);
  if (sepAt < 1) return null;

  const header = cells(lines[sepAt - 1]);
  const rows = lines.slice(sepAt + 1).filter((l) => !isSeparator(l)).map(cells);
  return { header, rows };
}

/**
 * Every table inside a block of prose.
 *
 * A design block is not necessarily a bare table: 「动作权限」 is a container whose
 * body has a table, then a paragraph, then a bolded sentence. Looking only at the
 * first lines of the block finds the table in one record and misses it in the next.
 */
export function tablesIn(body) {
  const out = [];
  // Group consecutive lines that contain a pipe; each group is a candidate table.
  let group = [];
  const flush = () => {
    if (group.length === 0) return;
    const t = parseTable(group.join('\n'));
    if (t !== null) out.push(t);
    group = [];
  };
  for (const line of body.split('\n')) {
    if (line.includes('|')) group.push(line);
    else flush();
  }
  flush();
  return out;
}

/** Find a table whose header contains every one of `needed`. */
export function findTable(body, needed) {
  return tablesIn(body).find((t) => needed.every((n) => t.header.some((h) => h.includes(n)))) ?? null;
}
