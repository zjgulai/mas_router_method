import { cases } from './cases/index.js';
import type { SuiteResult } from './types.js';

/**
 * The eval runner.
 *
 * Intentionally a stub that is honest about being one: it prints the case list and
 * refuses to report a score. A runner that returned numbers before the harness can
 * actually score anything would be worse than none — a suite that always passes
 * teaches the team to ignore it, and then a real regression ships unnoticed.
 *
 * Wiring lands with the first tracer ticket. What it must do, so the shape is not
 * rediscovered later:
 *   1. Run each case through `createRuntime().run()` with fake ports.
 *   2. Apply deterministic rules first — they are free and catch most failures.
 *   3. Only then spend judge calls, and only on cases that passed determinism.
 *   4. Write `runs/<date>-<label>.json` and print the delta against the baseline.
 *   5. Exit non-zero if any `shouldFail` case regressed.
 */
export async function runEvals(): Promise<SuiteResult> {
  const pending = cases.length;
  throw new Error(
    `Eval harness not implemented yet (${pending} cases defined in src/cases). ` +
      'See docs/evals/recipe-quality.md for the scoring model and docs/roadmap.md for the tracer ticket that wires it.',
  );
}

if (process.argv[1]?.endsWith('run-evals.ts') === true) {
  runEvals().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
