/**
 * Turning individual runs into a suite verdict.
 *
 * This layer exists for one reason, and it is a lesson this repo already paid for
 * once: **a green result from a check that could not have gone red is a green
 * result about nothing.** The 05 table recorded `acc-08` as "通过 2/2" off a run
 * against a synthesised ledger, and it took a second pass to notice that proving a
 * checker works is not proving a product works.
 *
 * So the verdict here has three values, not two:
 *
 *   passed        every rule held, on measured gold, across enough agreeing runs
 *   failed        a rule broke — the product is wrong, and this is actionable
 *   unverified    the rules may all have held, but nothing here can certify them
 *
 * `unverified` is not a soft `failed`. It means the machinery works and the
 * evidence does not exist yet, which is a different person's problem: failing
 * sends someone to fix the agent, unverified sends someone to collect data.
 */
import type { CollectArtifact, CollectCase, RuleFailure } from './collect-types.js';
import { evaluateCollectCase } from './collect-rules.js';
import { summarise, type RepeatOutcome } from './repeat.js';

export type Verdict = 'passed' | 'failed' | 'unverified';

export interface CaseVerdict {
  caseId: string;
  acceptance: string;
  verdict: Verdict;
  /** Why the verdict is what it is, in one sentence. Carries numbers. */
  observed: string;
  /** Rule failures, each with the value observed rather than just the rule name. */
  failures: RuleFailure[];
  /** How many runs reached a verdict at all. Fewer than `attempts` means some never finished. */
  runs: number;
  inconclusiveRuns: number;
  repeat: RepeatOutcome<string> | undefined;
  /** Per-run rule verdicts, so a reader can see which run dissented. */
  perRun: { run: number; passed: boolean; value: string | undefined; failures: RuleFailure[] }[];
}

export interface SuiteVerdict {
  ranAt: string;
  cases: CaseVerdict[];
  /** Cases that could not be judged because no measured gold exists. Never in `blockers`. */
  unverified: string[];
  /** Cases that failed. These block a release. */
  blockers: string[];
  totalCostUsd: number;
}

function verdictFor(testCase: CollectCase, artifacts: CollectArtifact[]): CaseVerdict {
  const perRun: CaseVerdict['perRun'] = [];
  const values: string[] = [];
  const failures: RuleFailure[] = [];
  let inconclusiveRuns = 0;

  artifacts.forEach((artifact, i) => {
    const evaluation = evaluateCollectCase(testCase, artifact);
    if (evaluation.inconclusive) {
      inconclusiveRuns += 1;
    } else if (evaluation.value !== undefined) {
      values.push(evaluation.value);
    }
    failures.push(...evaluation.failures.map((f) => ({ ...f, rule: `run ${i + 1}: ${f.rule}` })));
    perRun.push({
      run: i + 1,
      passed: evaluation.passed,
      value: evaluation.value,
      failures: evaluation.failures,
    });
  });

  const base = {
    caseId: testCase.id,
    acceptance: testCase.acceptance,
    failures,
    runs: artifacts.length - inconclusiveRuns,
    inconclusiveRuns,
    perRun,
  };

  // A run that never finished proves nothing about any rule, so it is reported
  // before the rules are read — otherwise an outage reads as a broken guardrail.
  if (base.runs === 0) {
    return {
      ...base,
      verdict: 'unverified',
      observed: `all ${artifacts.length} run(s) inconclusive — nothing was measured`,
      repeat: undefined,
    };
  }

  // One attempt means the case asserts determinism; a repeat fold would report
  // "1 of 1 agree" and read like evidence of stability it never gathered.
  const repeat = testCase.repeat.attempts > 1 ? summarise(testCase.repeat, values) : undefined;

  const rulesHeld = failures.length === 0;
  const repeatHeld = repeat === undefined ? true : repeat.passed;
  const observed = repeat === undefined
    ? (rulesHeld ? 'all rules held' : failures.map((f) => `${f.rule}: ${f.observed}`).join('; '))
    : `${repeat.observed}` + (rulesHeld ? '' : `; also: ${failures.length} rule failure(s)`);

  /*
   * Running fewer times than the policy asks is not a failure, it is missing
   * evidence — and the difference decides who has to act. "Failed" sends someone to
   * fix the agent; "we only got 2 of 5 runs" sends someone to find out why the runs
   * did not happen. The first pass at this returned `failed` for a single-run case,
   * which would have blamed the product for the harness's own shortfall.
   */
  if (rulesHeld && repeat !== undefined && base.runs < testCase.repeat.attempts) {
    return {
      ...base,
      verdict: 'unverified',
      observed: `${observed} — ${base.runs} run(s) reached a verdict out of the `
        + `${testCase.repeat.attempts} the policy asks for, so stability was never measured`,
      repeat,
    };
  }

  if (!rulesHeld || !repeatHeld) {
    return { ...base, verdict: 'failed', observed, repeat };
  }

  // Rules and repeat both held. Whether that is a pass depends on the gold's
  // provenance — the one thing this layer exists to get right.
  if (testCase.gold.provenance === 'illustrative') {
    /*
     * What is made up differs by kind, and the message has to say which. A count case
     * is judged against an invented figure; a consistency case is judged against an
     * invented *card*. Telling someone "a made-up number certifies nothing" about the
     * latter is true and unhelpful — the thing they have to go and create is a card,
     * not a count.
     */
    const invented = testCase.gold.kind === 'consistency'
      ? `a correct answer against a card that does not exist certifies nothing`
      : `a correct answer to a made-up number certifies nothing`;
    return {
      ...base,
      verdict: 'unverified',
      observed: `${observed}, but the gold is illustrative (${testCase.gold.source}) — ${invented}`,
      repeat,
    };
  }

  return { ...base, verdict: 'passed', observed, repeat };
}

export function judgeSuite(
  cases: CollectCase[],
  artifactsByCase: Map<string, CollectArtifact[]>,
  now: Date = new Date(),
): SuiteVerdict {
  const verdicts = cases.map((testCase) => verdictFor(testCase, artifactsByCase.get(testCase.id) ?? []));
  return {
    ranAt: now.toISOString(),
    cases: verdicts,
    unverified: verdicts.filter((v) => v.verdict === 'unverified').map((v) => v.caseId),
    blockers: verdicts.filter((v) => v.verdict === 'failed').map((v) => v.caseId),
    totalCostUsd: cases.reduce(
      (sum, c) => sum + (artifactsByCase.get(c.id) ?? []).reduce((s, a) => s + a.costUsd, 0),
      0,
    ),
  };
}

/**
 * A one-line release decision.
 *
 * Stated here rather than in a doc because the caller must not have to re-derive
 * it: unverified cases block a *claim* of quality but not a release of the code,
 * while failures block both. Conflating the two is how "we shipped with three
 * unverified" and "we shipped with three failures" get recorded as the same event.
 */
export function releaseDecision(suite: SuiteVerdict): { release: boolean; reason: string } {
  if (suite.blockers.length > 0) {
    return { release: false, reason: `${suite.blockers.length} failing case(s): ${suite.blockers.join(', ')}` };
  }
  if (suite.unverified.length > 0) {
    return {
      release: true,
      reason: `${suite.unverified.length} case(s) unverified — the code may ship, `
        + `but no quality claim about them may be made: ${suite.unverified.join(', ')}`,
    };
  }
  return { release: true, reason: 'every case passed on measured gold' };
}
