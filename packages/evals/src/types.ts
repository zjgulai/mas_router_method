/**
 * The eval-case shape, defined once. Consumed by the harness and by the docs in
 * `docs/evals/recipe-quality.md`; a case that cannot express its `why` in one
 * sentence is a case that tests nothing.
 */
export type Expectation =
  /** Free to check, stable, and what the CI gate keys on. */
  | { kind: 'deterministic'; rule: string }
  /** Costs a model call. Reserved for what genuinely needs taste. */
  | { kind: 'rubric'; dimension: 'voice-match' | 'hook-strength' | 'transferability' | 'shootability'; minScore: number };

export interface EvalCase {
  /** Stable across runs so scores are comparable. Never renumber. */
  id: string;
  /** True when this case exists to prove a guardrail refuses. */
  shouldFail: boolean;
  /** One sentence: which real-world failure this case prevents. */
  why: string;
  input: { brandId: string; request: string };
  /**
   * References pre-saved for this brand before the run, simulating what a real
   * user's history provides. "Same as last time" is only answerable when there
   * was a last time; a blank eval env makes the case measure the fixture, not
   * the agent.
   */
  preset?: { url: string }[];
  expectations: Expectation[];
}

export interface CaseResult {
  caseId: string;
  passed: boolean;
  /**
   * The run never reached a verdict (failed, cancelled, budget-exceeded). Never
   * counted as a pass, and never counted as a guardrail failure either: it is a
   * third state that must block a release without blaming the model.
   */
  inconclusive: boolean;
  /** Each failed expectation, with the observed value — not just "failed". */
  failures: { rule: string; observed: string }[];
  /** Expectations the harness could not evaluate, with the reason. Never silently passed. */
  skipped?: { expectation: string; reason: string }[];
  costUsd: number;
}

export interface SuiteResult {
  ranAt: string;
  model: string;
  workflowVersion: string;
  cases: CaseResult[];
  /** Guardrail failures are listed separately because they block release outright. */
  guardrailFailures: string[];
  /**
   * Cases that could not be judged. Kept apart from `guardrailFailures` so a
   * provider outage is not reported as a broken guardrail — the two need
   * different people to fix them.
   */
  guardrailInconclusive: string[];
  totalCostUsd: number;
}
