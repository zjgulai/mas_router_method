/**
 * Tests for the collect rules.
 *
 * Each rule gets a passing artifact and at least one *specific* wrong artifact it
 * must catch. The wrong ones are the test: a rule that only ever sees a correct
 * input is a rule nobody has seen work, and this repo has shipped that mistake
 * more than once.
 *
 * Every artifact here is hand-written on purpose. A fixture that runs the real
 * agent would couple these tests to the agent's current wording, and then a prompt
 * change would break the tests without breaking anything real.
 */
import { describe, expect, it } from 'vitest';
import type { CollectArtifact, CollectCase } from './collect-types.js';
import { collectCases } from './collect-cases.js';
import {
  COLLECT_RULE_NAMES,
  citationIn,
  comparand,
  evaluateCollectCase,
  evaluateCollectRule,
  numbersIn,
} from './collect-rules.js';

function testCase(id = 'count-us-account'): CollectCase {
  const found = collectCases.find((c) => c.id === id);
  if (found === undefined) throw new Error(`no such case: ${id}`);
  return found;
}

function artifact(overrides: Partial<CollectArtifact> = {}): CollectArtifact {
  return {
    status: 'succeeded',
    outcome: { reason: 'done', retryable: false },
    question: '上周 @brand 在 TikTok 上有多少条提及？',
    answer: '2026-10-15 到 2026-10-21，@brand 在 TikTok 上共 412 条提及。',
    calls: [
      {
        tool: 'query_mentions',
        platform: 'tiktok',
        account: '@brand',
        since: '2026-10-15',
        until: '2026-10-21',
        count: 412,
        failed: false,
      },
    ],
    costUsd: 0.01,
    ...overrides,
  };
}

describe('number extraction', () => {
  it('reads a thousands-separated count', () => {
    expect(numbersIn('共 1,284 条')).toEqual([1284]);
  });

  it('does not read the window dates as a count', () => {
    // The bug this guards: a naive \d+ makes "10月15日到10月21日" look like a
    // fabricated figure, so every correct answer would fail.
    expect(numbersIn('2026-10-15 到 2026-10-21，共 412 条')).toEqual([412]);
  });

  it('reads a small count, because a counter follows it', () => {
    // The first version of `numbersIn` only accepted 3+ digit groups and could not
    // see this at all. Anchoring to the counter fixed both problems at once.
    expect(numbersIn('共 12 条')).toEqual([12]);
  });

  it('reads a bare figure when that is the whole answer', () => {
    expect(numbersIn('412。')).toEqual([412]);
  });

  it('reads nothing out of prose that names no figure', () => {
    expect(numbersIn('大约几百条，具体要看平台后台。')).toEqual([]);
  });
});

describe('answer-matches-gold', () => {
  it('passes when the number is the gold number', () => {
    const result = evaluateCollectRule('answer-matches-gold', artifact(), testCase());
    expect(result.ok).toBe(true);
  });

  it('fails a plausible but wrong count, and names both numbers', () => {
    const result = evaluateCollectRule(
      'answer-matches-gold',
      artifact({ answer: '2026-10-15 到 2026-10-21 共 308 条提及。' }),
      testCase(),
    );
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('308');
    expect(result.observed).toContain('412');
  });

  it('fails an answer that hedges instead of counting', () => {
    const result = evaluateCollectRule(
      'answer-matches-gold',
      artifact({ answer: '大约几百条。' }),
      testCase(),
    );
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('no count');
  });

  it('fails an answer stating two counts, because which one is the answer is ambiguous', () => {
    const result = evaluateCollectRule(
      'answer-matches-gold',
      artifact({ answer: '共 412 条，其中负面 308 条。' }),
      testCase(),
    );
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('ambiguous');
  });
});

describe('answer-has-no-number', () => {
  const absent = testCase('unknown-account');

  it('passes when the answer states no figure', () => {
    const result = evaluateCollectRule(
      'answer-has-no-number',
      artifact({ answer: '@acme-not-in-our-index 不在已索引的账号池里，查不到数据。', calls: [] }),
      absent,
    );
    expect(result.ok).toBe(true);
  });

  it('fails the fabricated count — the failure this whole case exists for', () => {
    const result = evaluateCollectRule(
      'answer-has-no-number',
      artifact({ answer: '@acme-not-in-our-index 上周共 156 条提及。' }),
      absent,
    );
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('fabricated');
  });
});

describe('answers-plainly', () => {
  it('passes a clear refusal to answer', () => {
    const result = evaluateCollectRule('answers-plainly', artifact({ answer: '@x 不在账号池里，查不到。' }), testCase());
    expect(result.ok).toBe(true);
  });

  it('fails a deflection that contains no figure and no statement of inability', () => {
    // The product-level failure: no number, so answer-has-no-number passes, and
    // the user is told nothing. Two rules, two promises.
    const result = evaluateCollectRule(
      'answers-plainly',
      artifact({ answer: '相关数据请参考平台后台。' }),
      testCase(),
    );
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('left to guess');
  });
});

describe('queried-before-answering', () => {
  it('passes when the matching query was made', () => {
    expect(evaluateCollectRule('queried-before-answering', artifact(), testCase()).ok).toBe(true);
  });

  it('fails an answer with no query at all — the guessed-number failure', () => {
    const result = evaluateCollectRule(
      'queried-before-answering',
      artifact({ calls: [] }),
      testCase(),
    );
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('without querying');
  });

  it('fails a query for the right account across the wrong window', () => {
    const result = evaluateCollectRule(
      'queried-before-answering',
      artifact({
        calls: [{ tool: 'query_mentions', platform: 'tiktok', account: '@brand',
          since: '2026-10-01', until: '2026-10-07', count: 412, failed: false }],
      }),
      testCase(),
    );
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('none matching');
    // The observed value must say what was actually queried, or the failure cannot be debugged.
    expect(result.observed).toContain('2026-10-01');
  });

  it('does not count a failed query as having answered the question', () => {
    const result = evaluateCollectRule(
      'queried-before-answering',
      artifact({
        calls: [{ tool: 'query_mentions', platform: 'tiktok', account: '@brand',
          since: '2026-10-15', until: '2026-10-21', failed: true }],
      }),
      testCase(),
    );
    expect(result.ok).toBe(false);
  });
});

describe('no-extra-sources', () => {
  it('passes a single-source query', () => {
    expect(evaluateCollectRule('no-extra-sources', artifact(), testCase()).ok).toBe(true);
  });

  it('fails a run that also scraped two other platforms', () => {
    const result = evaluateCollectRule(
      'no-extra-sources',
      artifact({
        calls: [
          ...artifact().calls,
          { tool: 'query_mentions', platform: 'instagram', account: '@brand',
            since: '2026-10-15', until: '2026-10-21', count: 90, failed: false },
          { tool: 'query_mentions', platform: 'reddit', account: '@brand',
            since: '2026-10-15', until: '2026-10-21', count: 3, failed: false },
        ],
      }),
      testCase(),
    );
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('instagram');
  });
});

describe('states-the-window', () => {
  it('accepts a slash-separated date, because readers write dates both ways', () => {
    const result = evaluateCollectRule(
      'states-the-window',
      artifact({ answer: '2026/10/15 到 2026/10/21 共 412 条。' }),
      testCase(),
    );
    expect(result.ok).toBe(true);
  });

  it('fails an answer that never says what period it covers', () => {
    const result = evaluateCollectRule(
      'states-the-window',
      artifact({ answer: '@brand 共 412 条提及。' }),
      testCase(),
    );
    expect(result.ok).toBe(false);
  });
});

describe('budgets', () => {
  it('fails a run that took too many steps', () => {
    const calls = Array.from({ length: 7 }, () => artifact().calls[0]!);
    const result = evaluateCollectRule('within-step-budget', artifact({ calls }), testCase());
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('7');
  });

  it('fails a run that cost more than the case allows, even with a right answer', () => {
    // The failure with no error message: correct output, red invoice.
    const result = evaluateCollectRule('within-cost-budget', artifact({ costUsd: 0.40 }), testCase());
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('0.40');
  });
});

describe('cites-source', () => {
  const consistency = testCase('three-teams-one-source');
  const cites = (answer: string) => artifact({ answer });

  it('passes an answer that names the card and a version', () => {
    const result = evaluateCollectRule('cites-source', cites('依据结论卡 C1（口径版本 2026.10），声量弹性为 0.35。'), consistency);
    expect(result.ok).toBe(true);
    expect(result.observed).toContain('C1');
  });

  it('fails an answer with a right number but no citation — the failure this case exists for', () => {
    // A number with no source is exactly what three teams already produce separately.
    const result = evaluateCollectRule('cites-source', cites('声量对 GMV 的弹性是 0.35，区间 0.2–0.5。'), consistency);
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('names no conclusion card');
  });

  it('fails an answer citing a different card, and names both', () => {
    const result = evaluateCollectRule('cites-source', cites('依据结论卡 C3（口径版本 2026.10），弹性 0.35。'), consistency);
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('C3');
    expect(result.observed).toContain('C1');
  });

  it('fails a citation with no version — it outlives the definition it points at', () => {
    const result = evaluateCollectRule('cites-source', cites('依据结论卡 C1，弹性 0.35。'), consistency);
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('no 口径版本');
  });

  it('fails two cards cited at once, because that is the ambiguity being removed', () => {
    const result = evaluateCollectRule('cites-source', cites('依据结论卡 C1 与 C3（口径版本 2026.10）。'), consistency);
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('C1+C3');
  });

  it('refuses to judge a count case, rather than passing it silently', () => {
    // A rule applied to the wrong kind of gold is a case bug. Silence would ship it.
    const result = evaluateCollectRule('cites-source', artifact(), testCase());
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('only judges');
  });
});

describe('citationIn', () => {
  it('reads a card id written with and without a dash', () => {
    expect(citationIn('见 C1')?.conclusionId).toBe('C1');
    expect(citationIn('见 C-1')?.conclusionId).toBe('C1');
  });

  it('returns undefined when no card is named', () => {
    expect(citationIn('弹性 0.35')).toBeUndefined();
  });

  it('does not read a product code as a card', () => {
    // The failure a looser pattern would cause: "C" inside any word starts looking like
    // a citation, and then an uncited answer passes.
    expect(citationIn('COVID 期间的数据')).toBeUndefined();
  });
});

describe('comparand: what a repeat fold compares', () => {
  it('compares the figure for a count case', () => {
    expect(comparand(artifact(), testCase().gold)).toBe('412');
  });

  it('compares the citation for a consistency case, not the figure', () => {
    // The difference between acc-01 and acc-04 in one assertion: two teams may quote
    // different numbers and still be consistent, because "consistent" here means the
    // same card at the same version.
    const consistency = testCase('three-teams-one-source');
    const a = artifact({ answer: '依据结论卡 C1（口径版本 2026.10），弹性 0.35。' });
    const b = artifact({ answer: '结论卡 C1，口径版本 2026.10。区间 0.2 到 0.5，值得加投。' });
    expect(comparand(a, consistency.gold)).toBe('C1@2026.10');
    expect(comparand(b, consistency.gold)).toBe('C1@2026.10');
  });

  it('distinguishes the same card at two versions — a stale citation is dissent', () => {
    const consistency = testCase('three-teams-one-source');
    const old = artifact({ answer: '依据结论卡 C1（口径版本 2026.09）。' });
    const fresh = artifact({ answer: '依据结论卡 C1（口径版本 2026.10）。' });
    expect(comparand(old, consistency.gold)).not.toBe(comparand(fresh, consistency.gold));
  });

  it('reports an uncited answer distinctly', () => {
    const consistency = testCase('three-teams-one-source');
    expect(comparand(artifact({ answer: '弹性 0.35' }), consistency.gold)).toBe('uncited');
  });
});

describe('the case-to-rule contract', () => {
  it('every rule a case names exists', () => {
    for (const testCase of collectCases) {
      for (const expectation of testCase.expect) {
        expect(COLLECT_RULE_NAMES, `${testCase.id} names unknown rule ${expectation.rule}`)
          .toContain(expectation.rule);
      }
    }
  });

  it('every rule is used by at least one case, so none is dead', () => {
    const used = new Set(collectCases.flatMap((c) => c.expect.map((e) => e.rule)));
    for (const name of COLLECT_RULE_NAMES) {
      expect(used, `${name} is implemented but no case asks for it`).toContain(name);
    }
  });

  it('an unknown rule fails rather than being skipped', () => {
    const result = evaluateCollectRule('made-up-rule', artifact(), testCase());
    expect(result.ok).toBe(false);
    expect(result.observed).toContain('unknown rule');
  });

  it('every case states a repeat policy it can actually satisfy', () => {
    for (const c of collectCases) {
      expect(c.repeat.agree).toBeLessThanOrEqual(c.repeat.attempts);
      expect(c.repeat.agree).toBeGreaterThan(0);
    }
  });
});

describe('evaluateCollectCase', () => {
  it('reports every failing rule, not just the first', () => {
    const evaluation = evaluateCollectCase(
      testCase(),
      artifact({ answer: '大约几百条。', calls: [], costUsd: 0.99 }),
    );
    const names = evaluation.failures.map((f) => f.rule);
    expect(names).toContain('answer-matches-gold');
    expect(names).toContain('queried-before-answering');
    expect(names).toContain('within-cost-budget');
  });

  it('an unfinished run is inconclusive, not a rule failure', () => {
    // The regression this pins: before 2026-10-24 the Recipe harness counted any
    // non-successful run as a refusal, so four guardrail cases "passed" against a
    // simulated outage.
    const evaluation = evaluateCollectCase(testCase(), artifact({ status: 'failed', calls: [] }));
    expect(evaluation.inconclusive).toBe(true);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.value).toBeUndefined();
    expect(evaluation.failures.map((f) => f.rule)).toEqual(['inconclusive']);
  });
});
