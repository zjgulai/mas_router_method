/**
 * Tests for the repeat-consistency fold and the suite verdict.
 *
 * The two things under test here are the two things this product line gets wrong
 * most easily:
 *
 *   · "3 of 5 agree" being read as "basically stable"
 *   · a green run against illustrative data being recorded as a pass
 *
 * Both are asserted from the failure side, because both failures look like success.
 */
import { describe, expect, it } from 'vitest';
import { summarise } from './repeat.js';
import { judgeSuite, releaseDecision } from './collect-suite.js';
import { collectCases } from './collect-cases.js';
import type { CollectArtifact } from './collect-types.js';

describe('summarise', () => {
  it('passes when enough runs agree', () => {
    const result = summarise({ attempts: 5, agree: 4 }, ['412', '412', '412', '412', '412']);
    expect(result.passed).toBe(true);
    expect(result.agreed).toBe('412');
    expect(result.agreements).toBe(5);
    expect(result.observed).toContain('5/5');
  });

  it('passes on the threshold but still reports the dissent', () => {
    // A passing case that hides its dissent is how a flaky product ships clean.
    const result = summarise({ attempts: 5, agree: 4 }, ['412', '412', '412', '412', '308']);
    expect(result.passed).toBe(true);
    expect(result.dissent).toEqual([{ run: 5, value: '308' }]);
    expect(result.observed).toContain('dissent: run 5');
  });

  it('fails at 3 of 5 against a threshold of 4 — "mostly stable" is not stable', () => {
    const result = summarise({ attempts: 5, agree: 4 }, ['412', '412', '412', '308', '156']);
    expect(result.passed).toBe(false);
    expect(result.observed).toContain('3/5');
    expect(result.observed).toContain('needed 4');
  });

  it('fails when no value reaches the threshold, and says so rather than picking one', () => {
    const result = summarise({ attempts: 5, agree: 3 }, ['A', 'A', 'B', 'B', 'C']);
    expect(result.passed).toBe(false);
    expect(result.agreed).toBe('A');
    expect(result.agreements).toBe(2);
  });

  it('fails when fewer runs happened than the policy asks for', () => {
    // 2 of 2 agreeing is not the same evidence as 4 of 5, and a suite that treats
    // them alike rewards running less.
    const result = summarise({ attempts: 5, agree: 4 }, ['412', '412']);
    expect(result.passed).toBe(false);
    expect(result.observed).toContain('fewer runs');
  });
});

function artifact(overrides: Partial<CollectArtifact> = {}): CollectArtifact {
  return {
    status: 'succeeded',
    outcome: { reason: 'done', retryable: false },
    question: 'q',
    answer: '2026-10-15 到 2026-10-21，@brand 在 TikTok 上共 412 条提及。',
    calls: [{ tool: 'query_mentions', platform: 'tiktok', account: '@brand',
      since: '2026-10-15', until: '2026-10-21', count: 412, failed: false }],
    costUsd: 0.01,
    ...overrides,
  };
}

function map(caseId: string, artifacts: CollectArtifact[]): Map<string, CollectArtifact[]> {
  return new Map([[caseId, artifacts]]);
}

describe('judgeSuite: illustrative gold can never pass', () => {
  const target = collectCases.find((c) => c.id === 'count-us-account')!;

  it('a perfect run against an illustrative gold is unverified, not passed', () => {
    // This is the acc-08 lesson written where it cannot be forgotten: proving the
    // machinery works is not proving the product works.
    const suite = judgeSuite([target], map(target.id, [artifact(), artifact(), artifact()]));
    expect(suite.cases[0]?.verdict).toBe('unverified');
    expect(suite.cases[0]?.observed).toContain('illustrative');
    expect(suite.cases[0]?.observed).toContain('certifies nothing');
    expect(suite.blockers).toEqual([]);
  });

  it('a wrong answer against an illustrative gold is still failed — the rule survives', () => {
    // Illustrative does not mean toothless: a wrong number is wrong regardless of
    // where the right one came from, and that is actionable today.
    const suite = judgeSuite([target], map(target.id, [
      artifact({ answer: '2026-10-15 到 2026-10-21 共 308 条提及。' }),
      artifact({ answer: '2026-10-15 到 2026-10-21 共 308 条提及。' }),
      artifact({ answer: '2026-10-15 到 2026-10-21 共 308 条提及。' }),
    ]));
    expect(suite.cases[0]?.verdict).toBe('failed');
    expect(suite.blockers).toEqual([target.id]);
  });

  it('a measured gold lets a perfect run pass', () => {
    const measured = { ...target, gold: { ...target.gold, provenance: 'measured' as const } };
    const suite = judgeSuite([measured], map(target.id, [artifact(), artifact(), artifact()]));
    expect(suite.cases[0]?.verdict).toBe('passed');
    expect(suite.cases[0]?.observed).toContain('3/3');
  });
});

describe('judgeSuite: inconclusive runs', () => {
  const target = collectCases.find((c) => c.id === 'count-us-account')!;

  it('all runs inconclusive is unverified, never a rule failure', () => {
    // A provider outage must not be reported as a broken guardrail: they need
    // different people to fix them.
    const suite = judgeSuite([target], map(target.id, [
      artifact({ status: 'failed', calls: [] }),
      artifact({ status: 'budget-exceeded', calls: [] }),
      artifact({ status: 'cancelled', calls: [] }),
    ]));
    expect(suite.cases[0]?.verdict).toBe('unverified');
    expect(suite.cases[0]?.inconclusiveRuns).toBe(3);
    expect(suite.cases[0]?.runs).toBe(0);
    expect(suite.cases[0]?.observed).toContain('all 3 run(s) inconclusive');
  });

  it('some runs inconclusive still fails the repeat policy rather than crediting them', () => {
    const suite = judgeSuite([target], map(target.id, [
      artifact(), artifact(), artifact({ status: 'failed', calls: [] }),
    ]));
    expect(suite.cases[0]?.verdict).toBe('failed');
    expect(suite.cases[0]?.inconclusiveRuns).toBe(1);
  });

  it('too few completed runs is unverified, not failed — missing evidence is not a defect', () => {
    // Caught by running the suite end to end: a single-run case was reported as
    // `failed`, which blames the product for the harness's own shortfall. The two
    // verdicts send different people to do different work.
    const suite = judgeSuite([target], map(target.id, [artifact(), artifact()]));
    expect(suite.cases[0]?.verdict).toBe('unverified');
    expect(suite.cases[0]?.observed).toContain('2 run(s) reached a verdict out of the 3');
    expect(suite.blockers).toEqual([]);
  });

  it('no artifacts at all is unverified, not a failure', () => {
    const suite = judgeSuite([target], new Map());
    expect(suite.cases[0]?.verdict).toBe('unverified');
    expect(suite.cases[0]?.observed).toContain('nothing was measured');
  });
});

describe('releaseDecision', () => {
  it('blocks on a failure', () => {
    const decision = releaseDecision({
      ranAt: '', cases: [], unverified: [], blockers: ['count-us-account'], totalCostUsd: 0,
    });
    expect(decision.release).toBe(false);
    expect(decision.reason).toContain('failing');
  });

  it('allows the code to ship with unverified cases, but forbids the quality claim', () => {
    const decision = releaseDecision({
      ranAt: '', cases: [], unverified: ['count-us-account'], blockers: [], totalCostUsd: 0,
    });
    expect(decision.release).toBe(true);
    expect(decision.reason).toContain('no quality claim');
  });

  it('says plainly that everything passed', () => {
    const decision = releaseDecision({ ranAt: '', cases: [], unverified: [], blockers: [], totalCostUsd: 0 });
    expect(decision.release).toBe(true);
    expect(decision.reason).toContain('every case passed');
  });
});

describe('acc-04: three teams, one source', () => {
  const target = collectCases.find((c) => c.id === 'three-teams-one-source')!;
  const cited = (answer: string) => artifact({ answer, calls: [
    { tool: 'query_conclusion', platform: 'tiktok', account: '@brand',
      since: '2026-10-15', until: '2026-10-21', failed: false },
  ] });

  it('passes three differently-worded answers that cite the same card and version', () => {
    // The variants exist so this is the real assertion: consistency has to survive a
    // change of wording, because the three teams do not phrase it the same way.
    const measured = { ...target, gold: { ...target.gold, provenance: 'measured' as const } };
    const suite = judgeSuite([measured], map(target.id, [
      cited('依据结论卡 C1（口径版本 2026.10），弹性 0.35，区间 0.2–0.5。'),
      cited('结论卡 C1 口径版本 2026.10：对 GMV 有正向影响，值得继续投。'),
      cited('C1（口径版本 2026.10）：弹性 0.35 [0.2, 0.5]。'),
    ]));
    expect(suite.cases[0]?.verdict).toBe('passed');
    expect(suite.cases[0]?.repeat?.agreements).toBe(3);
  });

  it('fails when one team is sent to a different card — the failure dem-02 exists to fix', () => {
    const suite = judgeSuite([target], map(target.id, [
      cited('依据结论卡 C1（口径版本 2026.10），弹性 0.35。'),
      cited('依据结论卡 C1（口径版本 2026.10），值得加投。'),
      cited('依据结论卡 C3（口径版本 2026.10），弹性 0.35。'),
    ]));
    expect(suite.cases[0]?.verdict).toBe('failed');
    expect(suite.cases[0]?.repeat?.dissent).toHaveLength(1);
    expect(suite.cases[0]?.repeat?.dissent[0]?.value).toBe('C3@2026.10');
  });

  it('fails when the same card is cited at two versions', () => {
    // A stale version is not "close enough": the definition moved and the answer did
    // not, so two teams are quoting numbers that are not comparable.
    const suite = judgeSuite([target], map(target.id, [
      cited('依据结论卡 C1（口径版本 2026.10）。'),
      cited('依据结论卡 C1（口径版本 2026.10）。'),
      cited('依据结论卡 C1（口径版本 2026.09）。'),
    ]));
    expect(suite.cases[0]?.verdict).toBe('failed');
  });

  it('fails when one answer is uncited, even if its number is right', () => {
    const suite = judgeSuite([target], map(target.id, [
      cited('依据结论卡 C1（口径版本 2026.10）。'),
      cited('依据结论卡 C1（口径版本 2026.10）。'),
      cited('弹性 0.35，区间 0.2–0.5。'),
    ]));
    expect(suite.cases[0]?.verdict).toBe('failed');
    expect(suite.cases[0]?.repeat?.dissent[0]?.value).toBe('uncited');
  });

  it('a perfect set of three identical citations is still unverified while the card is invented', () => {
    // Same rule as everywhere else in this suite: the card C1 does not exist.
    const suite = judgeSuite([target], map(target.id, [
      cited('依据结论卡 C1（口径版本 2026.10）。'),
      cited('依据结论卡 C1（口径版本 2026.10）。'),
      cited('依据结论卡 C1（口径版本 2026.10）。'),
    ]));
    expect(suite.cases[0]?.verdict).toBe('unverified');
    expect(suite.cases[0]?.observed).toContain('illustrative');
    // The message must name what is actually missing: a card, not a count.
    expect(suite.cases[0]?.observed).toContain('card that does not exist');
  });
});

describe('the shipped case set', () => {
  it('every case is illustrative today, and the suite reports it as such', () => {
    // Pins the honest state. When a real gold is recorded, this test fails and
    // forces the edit to be deliberate.
    const illustrative = collectCases.filter((c) => c.gold.provenance === 'illustrative');
    expect(illustrative.length).toBe(collectCases.length);
  });

  it('every case names an acceptance row that exists in the 05 table', () => {
    for (const c of collectCases) {
      expect(c.acceptance, `${c.id}`).toMatch(/^acc-\d{2}$/);
    }
  });
});
