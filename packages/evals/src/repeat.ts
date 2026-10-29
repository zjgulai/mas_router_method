/**
 * Repeat consistency: N runs in, one verdict out.
 *
 * The Recipe harness runs every case once, and that is correct for it — a recipe
 * either lands in the duration window or it does not, and running twice tells you
 * nothing new. A conversational agent is different in a way that matters: the same
 * question typed twice can produce two different numbers, and each of them can be
 * individually defensible. A single-run pass then certifies a product that
 * contradicts itself the second time someone asks.
 *
 * So this module exists. It is small, and the one thing it must get right is that
 * **"mostly consistent" is not a pass**. 3 of 5 runs agreeing is not "basically
 * stable"; it is a product whose answer depends on the roll. The threshold is the
 * case's to state, and it is stated as a fraction of runs that must agree — not as
 * a vibe.
 */

/** How many times to ask, and how many answers have to match. */
export interface RepeatPolicy {
  /** Total runs. 1 means "this case is deterministic; a repeat adds nothing". */
  attempts: number;
  /**
   * How many of the attempts must produce the same observed value.
   *
   * Deliberately not a ratio: `attempts: 5, agree: 4` says what it means, and
   * anybody reading the case can check it against the product's promise without
   * doing arithmetic. A ratio also silently changes meaning when `attempts` is
   * edited, which is exactly the kind of drift this repo has already paid for.
   */
  agree: number;
}

export interface RepeatOutcome<T> {
  /** The value each run produced, in run order. */
  values: T[];
  /** The value at least `agree` runs produced, or undefined when none reached it. */
  agreed: T | undefined;
  /** How many runs produced `agreed`. Zero when nothing reached the threshold. */
  agreements: number;
  /** Runs that produced a value different from `agreed`, with which value they gave. */
  dissent: { run: number; value: T }[];
  passed: boolean;
  /** Human-readable, and it carries the counts — a bare "unstable" cannot be argued with. */
  observed: string;
}

/**
 * Fold a set of runs into one verdict.
 *
 * Ties are the interesting case. With `attempts: 5, agree: 3` and values
 * `[A, A, B, B, C]`, no value reaches 3 and the verdict is a failure — correct,
 * because no answer is the answer. With `[A, A, A, B, B]` it passes on 3, and the
 * two dissenters are still reported: a passing case that hides its dissent is how
 * a flaky product ships with a clean eval history.
 */
export function summarise<T>(
  policy: RepeatPolicy,
  values: T[],
): RepeatOutcome<T> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  // Highest count wins; ties broken by which value appeared first, so the verdict is
  // deterministic for a given run order rather than dependent on Map iteration.
  let agreed: T | undefined;
  let agreements = 0;
  for (const value of values) {
    const count = counts.get(value) ?? 0;
    if (count > agreements) {
      agreed = value;
      agreements = count;
    }
  }

  const reachedThreshold = agreements >= policy.agree;
  const dissent: { run: number; value: T }[] = [];
  if (agreed !== undefined) {
    values.forEach((value, i) => {
      if (value !== agreed) dissent.push({ run: i + 1, value });
    });
  }

  const passed = reachedThreshold && values.length === policy.attempts;
  const observed = passed
    ? `${agreements}/${values.length} runs agree (needed ${policy.agree})`
      + (dissent.length > 0 ? `; dissent: run ${dissent.map((d) => d.run).join(', ')}` : '')
    : `${agreements}/${values.length} runs agree, needed ${policy.agree} of ${policy.attempts}`
      + (values.length === policy.attempts ? '' : ' (fewer runs than the policy asks for)');

  return { values, agreed, agreements, dissent, passed, observed };
}
