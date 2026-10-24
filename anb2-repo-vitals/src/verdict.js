/**
 * Turn facts into a verdict.
 *
 * This is the part that has to be *right*, not merely to run. So it is a pure
 * function of the facts: same input, same verdict, no model. That makes it
 * testable, and it makes a wrong verdict a bug with a reproducible input rather
 * than a matter of taste.
 *
 * Every rule below states what it is measuring AND what it cannot see. A verdict
 * that hides its blind spots is worse than no verdict, because it invites trust.
 */

import { detectDeprecation } from './deprecation.js';

/** Days between two ISO timestamps, floored. */
function daysBetween(fromIso, toIso) {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.floor((to - from) / 86_400_000);
}

/**
 * The five signals, each with a value, a judgement, and its source.
 *
 * `weight` is how much a bad reading here should worry a reader. They are
 * deliberately not equal: an archived repo outranks a stale commit, because one
 * is a decision and the other is a busy month.
 */
export function assess(facts, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const signals = [];

  // 1. Maintenance recency — the single strongest predictor of "will this be
  //    fixed when it breaks".
  const lastPush = facts.lastCommit.value ?? facts.pushedAt.value;
  const idle = lastPush === null ? null : daysBetween(lastPush, now);
  signals.push({
    key: 'maintenance',
    label: 'maintenance',
    weight: 0.25,
    value: idle === null ? 'unknown' : `${idle} days since last commit`,
    detail: lastPush,
    source: facts.lastCommit.source,
    /*
     * A repo can be "finished" rather than abandoned: a small library with no
     * open work looks identical to one nobody maintains. If the README says it is
     * done, this signal is not evidence. We cannot read the README, so we report
     * the number and let the reader apply that.
     */
    blind: 'cannot tell "finished" from "abandoned" — a complete small library looks idle too',
    level:
      idle === null ? 'unknown'
        : idle <= 90 ? 'good'
          : idle <= 365 ? 'warn'
            : 'bad',
  });

  // 2. Whether the project is closed to contributions.
  signals.push({
    key: 'archived',
    label: 'archived',
    weight: 0.2,
    value: facts.archived.value ? 'yes — read-only' : 'no',
    source: facts.archived.source,
    blind: 'an archived repo may still be a perfectly good dependency; it just will not change',
    level: facts.archived.value ? 'bad' : 'good',
  });

  // 3. Bus factor, proxied by contributor count. Deliberately labelled as a proxy.
  const contributors = facts.contributors.value;
  signals.push({
    key: 'bus-factor',
    label: 'bus factor',
    weight: 0.1,
    value: contributors === null ? 'unknown (endpoint not counted yet)' : `${contributors} contributors`,
    source: facts.contributors.source,
    blind: 'contributor count is not bus factor — one person can own 95% of the commits',
    level:
      contributors === null ? 'unknown'
        : contributors >= 10 ? 'good'
          : contributors >= 3 ? 'warn'
            : 'bad',
  });

  // 4. Licence — a missing licence is a legal problem, not a quality one, but it
  //    blocks adoption outright.
  const licence = facts.license.value;
  signals.push({
    key: 'licence',
    label: 'licence',
    weight: 0.1,
    value: licence === null ? 'none declared' : licence,
    source: facts.license.source,
    blind: 'declared is not the same as enforceable; this reads the field, not the text',
    level: licence === null ? 'bad' : 'good',
  });

  // 5. Issue load, relative to adoption. Absolute issue count is meaningless:
  //    a popular project has many issues because it has many users.
  const issues = facts.openIssues.value;
  const stars = facts.stars.value;
  const perThousand = stars > 0 ? (issues / stars) * 1000 : null;
  signals.push({
    key: 'issue-load',
    label: 'issue load',
    weight: 0.0,
    value: perThousand === null ? 'unknown' : `${perThousand.toFixed(1)} open issues per 1k stars`,
    detail: `${issues} open / ${stars} stars`,
    source: facts.openIssues.source,
    blind: 'issues per star says nothing about how fast they are answered',
    level:
      perThousand === null ? 'unknown'
        : perThousand <= 10 ? 'good'
          : perThousand <= 30 ? 'warn'
            : 'bad',
  });

  /*
   * The signal GitHub cannot express: what the authors say about their own
   * project. It carries the heaviest weight because it outranks every number —
   * a project can be popular, active, and still the wrong choice because its own
   * maintainers say so.
   */
  const readme = facts.readme?.value ?? null;
  const deprecation = detectDeprecation(readme);
  signals.unshift({
    key: 'deprecation',
    label: 'author notice',
    weight: 0.5,
    value: deprecation.deprecated
      ? `deprecated by its authors — "${deprecation.evidence}"`
      : readme === null ? 'unknown (no readme read)' : 'no deprecation notice found',
    detail: deprecation.evidence,
    // Always a URL string, even when there is no readme: a signal without a
    // source cannot be audited, and "the source is nothing" is itself information.
    source: facts.readme?.source ?? `https://github.com/${facts.repo.fullName}#readme`,
    blind: 'reads the first 2000 characters only; a notice buried deeper is missed',
    level: readme === null ? 'unknown' : deprecation.deprecated ? 'bad' : 'good',
  });

  const scored = signals.filter((s) => s.level !== 'unknown');
  const penalty = scored.reduce(
    (sum, s) => sum + (s.level === 'bad' ? s.weight : s.level === 'warn' ? s.weight / 2 : 0),
    0,
  );
  const score = Math.max(0, Math.min(1, 1 - penalty));

  return {
    repo: facts.repo.fullName,
    score,
    band: score >= 0.75 ? 'looks solid' : score >= 0.5 ? 'usable with caveats' : 'risky',
    signals,
    assessedAt: now,
    /*
     * Stated per verdict, not per signal. This is the thing a reader most needs
     * and least expects: what this tool does not look at at all.
     */
    notMeasured: [
      'whether the code works',
      'whether the API is pleasant',
      'whether it solves your problem',
      'security history',
      'how responsive maintainers are to issues',
    ],
  };
}

/** One sentence, for the reader who will not read the table. */
export function headline(result) {
  const bad = result.signals.filter((s) => s.level === 'bad');
  if (bad.length === 0) return `${result.repo}: ${result.band}. No red flags in the five signals checked.`;
  const names = bad.map((s) => s.label).join(' and ');
  return `${result.repo}: ${result.band}. Watch ${names}.`;
}
