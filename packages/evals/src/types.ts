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
  expectations: Expectation[];
}

export interface CaseResult {
  caseId: string;
  passed: boolean;
  /** Each failed expectation, with the observed value — not just "failed". */
  failures: { rule: string; observed: string }[];
  costUsd: number;
}

export interface SuiteResult {
  ranAt: string;
  model: string;
  workflowVersion: string;
  cases: CaseResult[];
  /** Guardrail failures are listed separately because they block release outright. */
  guardrailFailures: string[];
  totalCostUsd: number;
}
