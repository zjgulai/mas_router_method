/**
 * The data-collect agent's cases.
 *
 * Specified in `docs/evals/data-collect.md`, which is the intent; this file is the
 * implementation. When the two disagree, the document is right and this is the bug.
 *
 * Three cases, one per acceptance row in the 05 table:
 *
 *   acc-01  a question the product can answer   → the number must match
 *   acc-02  a question it cannot answer         → no number, and say so
 *   acc-03  a question asked five times         → at least four must agree
 *   acc-04  one question, three teams           → all three cite the same card
 *
 * **Every gold here is `illustrative`, and that is deliberate.** No queryable
 * dataset exists yet — `dev-01` is marked 已完成 in the 05 table but no collector
 * lives in this repo — so any count written below is a shape, not a measurement.
 * `collect-suite.ts` refuses to report a pass while a gold is illustrative. Filling
 * in a real count means also flipping `provenance` to `measured` and saying where
 * it came from; that edit is the whole point of the field.
 */
import type { CollectCase } from './collect-types.js';

/** The window every case uses. Fixed so the cases stay comparable as the product changes. */
const SINCE = '2026-10-15';
const UNTIL = '2026-10-21';

export const collectCases: CollectCase[] = [
  {
    id: 'count-us-account',
    acceptance: 'acc-01',
    why: 'The common path: a count was asked for, so the answer must be that count and it must have been queried.',
    question: '上周（10月15日到10月21日）@brand 在 TikTok 上有多少条提及？',
    query: { platform: 'tiktok', account: '@brand', since: SINCE, until: UNTIL },
    gold: {
      kind: 'count',
      count: 412,
      source: '合成示例，无真实账本 — 见 docs/evals/data-collect.md §四',
      at: '2026-10-29',
      provenance: 'illustrative',
    },
    expect: [
      { rule: 'answer-matches-gold' },
      { rule: 'queried-before-answering' },
      { rule: 'states-the-window' },
      { rule: 'no-extra-sources' },
      { rule: 'within-step-budget' },
      { rule: 'within-cost-budget' },
    ],
    repeat: { attempts: 3, agree: 3 },
    maxSteps: 6,
    maxCostUsd: 0.05,
  },
  {
    id: 'unknown-account',
    acceptance: 'acc-02',
    why: 'An agent with a plausible-sounding wrong answer is worse than one that says it does not know.',
    question: '上周 @acme-not-in-our-index 在 TikTok 上有多少条提及？',
    query: { platform: 'tiktok', account: '@acme-not-in-our-index', since: SINCE, until: UNTIL },
    gold: {
      kind: 'absent',
      reason: '这个账号不在已索引的账号池里，任何数字都是编的',
      source: '合成示例，无真实账本 — 见 docs/evals/data-collect.md §四',
      at: '2026-10-29',
      provenance: 'illustrative',
    },
    /**
     * `no-extra-sources` is deliberately absent: a sensible agent may check another
     * source to see whether the account exists there before concluding it does not.
     * Forbidding that would be testing obedience rather than judgement.
     */
    expect: [
      { rule: 'answer-has-no-number' },
      { rule: 'answers-plainly' },
      { rule: 'within-step-budget' },
      { rule: 'within-cost-budget' },
    ],
    repeat: { attempts: 3, agree: 3 },
    maxSteps: 4,
    maxCostUsd: 0.02,
  },
  {
    id: 'repeat-five-times',
    acceptance: 'acc-03',
    why: 'The same question twice must give the same number, or the product is unquotable.',
    question: '上周（10月15日到10月21日）@brand 在 TikTok 上有多少条提及？',
    query: { platform: 'tiktok', account: '@brand', since: SINCE, until: UNTIL },
    gold: {
      kind: 'count',
      count: 412,
      source: '合成示例，无真实账本 — 见 docs/evals/data-collect.md §四',
      at: '2026-10-29',
      provenance: 'illustrative',
    },
    /**
     * Same content as `count-us-account`, different policy. The separation is the
     * point: whether the answer is *right* and whether it is *stable* are two
     * questions, and a case that asks both at three attempts conflates them.
     */
    expect: [
      { rule: 'answer-matches-gold' },
      { rule: 'queried-before-answering' },
      { rule: 'within-cost-budget' },
    ],
    repeat: { attempts: 5, agree: 4 },
    maxSteps: 6,
    maxCostUsd: 0.05,
  },
  {
    id: 'three-teams-one-source',
    acceptance: 'acc-04',
    /**
     * dem-02's entire reason to exist. Today 品牌/市场/商分 each run their own
     * numbers and the same question gets three answers; the product's promise is one
     * source three teams cite. So this case does not check whether a figure is right
     * — acc-01 does that — it checks whether three differently-worded asks all land on
     * the same card at the same version.
     */
    why: 'Three teams asking the same thing must be sent to the same card, or the product has not replaced the problem it was built for.',
    question: '上周 US 市场的声量对 GMV 的影响有多大？',
    /**
     * The variants are the test. A product that is consistent only when the wording is
     * identical has solved a demo, not three teams who each type it their own way.
     * These are written in the register each team actually uses: brand talks about
     * 影响, market about 值不值得投, 商分 about 弹性.
     */
    variants: [
      { asksAs: '品牌团队', question: '上周 US 市场声量对 GMV 的影响有多大？' },
      { asksAs: '市场团队', question: 'US 上周的声量投入值不值得继续加预算？依据是什么' },
      { asksAs: '商分团队', question: '给我上周 US 的声量-GMV 弹性，带区间' },
    ],
    query: { platform: 'tiktok', account: '@brand', since: SINCE, until: UNTIL },
    gold: {
      kind: 'consistency',
      requireCitation: { conclusionId: 'C1' },
      source: '合成示例：结论卡 C1 是本规格假设的一张卡，见 docs/evals/data-collect.md §五',
      at: '2026-10-29',
      provenance: 'illustrative',
    },
    /**
     * No `answer-matches-gold`: a consistency gold has no figure to compare, and the
     * rule says so rather than passing quietly. No `states-the-window` either — a
     * market team asking about "上周" may get an answer scoped to the card's own
     * window, which is the card's business, not the question's.
     */
    expect: [
      { rule: 'cites-source' },
      { rule: 'within-step-budget' },
      { rule: 'within-cost-budget' },
    ],
    repeat: { attempts: 3, agree: 3 },
    maxSteps: 8,
    maxCostUsd: 0.10,
  },
];
