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
