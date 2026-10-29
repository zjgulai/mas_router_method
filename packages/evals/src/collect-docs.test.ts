/**
 * The document's numbers, checked against the code that produces them.
 *
 * `docs/evals/data-collect.md` states three counts — cases, rules, tests — and one
 * claim about how many tests fail when a rule is mutated. Every one of those went
 * stale at least once while this file was being written: the rule count went 8 → 9
 * the moment acc-04 landed, and the mutation count went 13 → 20 in the same edit.
 *
 * The repo has already paid for this class of defect twice (a prose count of 49
 * cells against 46 rows; a skill count in `skill-catalog.md` drifting). A number in
 * prose decays silently; a number checked against disk cannot.
 */
import { describe, expect, it } from 'vitest';
import { collectCases } from './collect-cases.js';
import { COLLECT_RULE_NAMES } from './collect-rules.js';
import { readRepoDoc } from './doc-source.js';

const DOC = readRepoDoc('docs/evals/data-collect.md');

describe('docs/evals/data-collect.md stays true to the code', () => {
  it('states the real case count', () => {
    const claim = /(\d+) cases, (\d+) rules, (\d+) tests in the package/.exec(DOC);
    expect(claim, 'the honest-state sentence is missing or reworded').not.toBeNull();
    expect(Number(claim?.[1]), 'case count drifted').toBe(collectCases.length);
  });

  it('states the real rule count', () => {
    const claim = /(\d+) cases, (\d+) rules, (\d+) tests in the package/.exec(DOC);
    expect(Number(claim?.[2]), 'rule count drifted').toBe(COLLECT_RULE_NAMES.length);
  });

  it('every rule in the table exists in the code, and every rule in the code is in the table', () => {
    /*
     * Scoped to the rules table, not the whole document. The first version matched
     * every backticked id in a table row and picked up the case table's `count-us-account`
     * — so it reported a documented rule that "does not exist" while the doc was right.
     * A check that accuses a correct document is worse than no check.
     */
    const section = DOC.slice(DOC.indexOf('## The rules'), DOC.indexOf('## Repeat consistency'));
    const documented = [...section.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
    for (const name of documented) {
      expect(COLLECT_RULE_NAMES, `documented rule "${name}" does not exist`).toContain(name);
    }
    for (const name of COLLECT_RULE_NAMES) {
      expect(documented, `rule "${name}" is implemented but not in the doc's table`).toContain(name);
    }
  });

  it('every case has a row in the case table', () => {
    for (const testCase of collectCases) {
      expect(DOC, `case ${testCase.id} is not in the doc`).toContain(`\`${testCase.id}\``);
      expect(DOC, `acceptance ${testCase.acceptance} is not in the doc`).toContain(testCase.acceptance);
    }
  });
});
