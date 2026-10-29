/**
 * The data-collect agent's turn, narrowed to what a rule may read.
 *
 * `docs/evals/data-collect.md` is the intent; this file is the shape it is written
 * against. Two constraints from the Recipe harness carry over unchanged:
 *
 *   · the artifact is narrow on purpose. A rule that could reach into the runtime
 *     would be a second implementation of it, and the two would drift.
 *   · "no verdict" is a first-class result. A run that never finished proves
 *     nothing, and a suite that scores it as a pass goes green during an outage.
 *
 * The third constraint is new here and is the reason this product needs its own
 * file: **a gold answer has provenance, and an illustrative one cannot certify
 * anything.** See `Gold.provenance`.
 */
import type { RepeatPolicy } from './repeat.js';

/** One query the run made. Only the fields a rule reasons about. */
export interface QueryCall {
  tool: string;
  /** Source the query was scoped to, e.g. "tiktok". */
  platform?: string | undefined;
  /** Account handle as the agent passed it, e.g. "@brand". */
  account?: string | undefined;
  /** Inclusive start of the window the agent asked for, ISO date. */
  since?: string | undefined;
  /** Inclusive end of the window the agent asked for, ISO date. */
  until?: string | undefined;
  /** What the tool returned, when it returns a count. Undefined when it does not. */
  count?: number | undefined;
  /** True when the tool reported it could not answer: unknown account, source not integrated. */
  failed: boolean;
}

/** What one run of the collect agent produced. */
export interface CollectArtifact {
  /** Run status from the runtime; `succeeded` means a reply was produced. */
  status: string;
  outcome: { reason: string; retryable: boolean };
  question: string;
  /** The full text the agent replied with. Not a summary — rules read numbers out of this. */
  answer: string;
  /** Every tool call, in the order the run made them. */
  calls: QueryCall[];
  /** Total spend recorded by the runtime. Compared against the case's ceiling. */
  costUsd: number;
}

/**
 * The answer the question has, and how we know.
 *
 * `provenance` is not paperwork. A count of 412 is only a gold standard if
 * something produced it that can be pointed at; a number someone typed is a
 * guess wearing a gold standard's clothes. The last verification round shipped
 * exactly that mistake — a demo run was recorded as "通过 2/2" — so the
 * distinction is enforced where it cannot be forgotten, in `collect-suite.ts`:
 * an illustrative gold can never yield a pass, however green the rules look.
 */
export type Gold =
  | {
      kind: 'count';
      count: number;
      /** Where the number came from: a ledger path, a saved query output, a person who counted. */
      source: string;
      /** When that source produced it. A gold number without a date is a memory. */
      at: string;
      provenance: 'measured' | 'illustrative';
    }
  | {
      kind: 'absent';
      /** Why there is no answer: which source is not integrated, or why the account is unknown. */
      reason: string;
      source: string;
      at: string;
      provenance: 'illustrative' | 'measured';
    }
  /**
   * The question has an answer, but not *a* value — it has a required shape.
   *
   * acc-04 is the case that needs this. The promise is not "the number is 412"; it is
   * "three teams asking the same thing get the same answer from the same source". Any
   * number can be right, as long as all three runs got it from one place. A `count`
   * gold cannot express that, and forcing one would make the case assert a particular
   * figure the product never promised.
   *
   * `expect` carries the rules; `requireCitation` says which parts of the citation
   * must be present for the answer to count as sourced at all.
   */
  | {
      kind: 'consistency';
      /**
       * The one card every answer must cite. A card id, not a version: the version is
       * read out of the answers and compared, so a stale version is caught as
       * inconsistency rather than as a wrong constant typed here.
       */
      requireCitation: { conclusionId: string };
      source: string;
      at: string;
      provenance: 'illustrative' | 'measured';
    };

/** What the agent is expected to query. Also what a good artifact's calls look like. */
export interface CollectQuery {
  platform: string;
  account: string;
  since: string;
  until: string;
}

/**
 * A second way to ask the same question.
 *
 * acc-04's promise is about three teams who do not talk to each other. They will not
 * phrase the question identically, and a product that only answers consistently when
 * the wording is identical has not solved the problem — it has solved a demo. So a
 * case may carry several phrasings, and repeat-consistency runs across all of them.
 */
export interface QuestionVariant {
  /** Who asks this way: 品牌团队 / 市场团队 / 商分团队. */
  asksAs: string;
  question: string;
}

export interface CollectCase {
  /** Stable across runs so scores are comparable. Never renumber. */
  id: string;
  /** Which acceptance row in the 05 table this case belongs to. */
  acceptance: string;
  /** One sentence: which real-world failure this case prevents. */
  why: string;
  question: string;
  /**
   * Other phrasings of `question`. Absent means one wording only.
   *
   * When present, the case asserts something stronger: consistency must survive a
   * change of wording, which is the only version of consistency that helps three
   * teams who each type it their own way.
   */
  variants?: QuestionVariant[];
  query: CollectQuery;
  gold: Gold;
  /** Rule names, resolved by `evaluateCollectRule`. A typo here is caught by a test. */
  expect: { rule: string }[];
  repeat: RepeatPolicy;
  /** Tool-call ceiling. Read by the `within-step-budget` rule. */
  maxSteps: number;
  /** Dollar ceiling for one run. Read by the `within-cost-budget` rule. */
  maxCostUsd: number;
}

export interface RuleFailure {
  rule: string;
  /** What was observed, not just "failed" — a failure without a value cannot be argued with. */
  observed: string;
}
