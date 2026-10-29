/**
 * Deterministic rules for the data-collect agent.
 *
 * Every rule here answers a question about the *text* the agent replied with and
 * the *calls* it made. None of them needs a model, which is the point: the three
 * failures this file exists to catch are all mechanical once written down.
 *
 *   · a number that does not match the data (acc-01)
 *   · a number where there is no data (acc-02)
 *   · an answer with no query behind it (acc-01, second half)
 *
 * The rules are strict about one thing: **a number is only accepted when it is
 * traceable**. An answer of "about 400" to a question whose gold is 412 is not
 * "close"; it is unverifiable, and a product whose numbers are approximately right
 * cannot be used to decide anything.
 */
import type {
  CollectArtifact,
  CollectCase,
  CollectQuery,
  Gold,
  QueryCall,
  RuleFailure,
} from './collect-types.js';

const ok = (observed: string): { ok: true; observed: string } => ({ ok: true, observed });
const fail = (observed: string): { ok: false; observed: string } => ({ ok: false, observed });

/**
 * Numbers as they appear in a reply — anchored to a counting unit.
 *
 * The first version of this was a bare `\d{3,}`, and the tests caught it
 * immediately: the "2026" in "2026-10-15" was being read as a count, so every
 * correct answer that stated its window was reported as ambiguous. A rule that
 * accuses correct answers gets ignored within a week, and then it protects
 * nothing.
 *
 * So a figure is only a figure when it is attached to a counter. That has a
 * second benefit: it makes small counts readable ("12 条" works), where the
 * digit-count version could not see them at all.
 *
 * The limitation is real and documented in `docs/evals/data-collect.md`: an
 * answer that is prose with no counter — "a few hundred" — yields no number, and
 * the rule reports "no count" rather than guessing one.
 */
const COUNT = /(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+)\s*(?:条|篇|则|mentions?|posts?)/gi;

/** Remove date-shaped tokens so their digits cannot be mistaken for a count. */
function stripDates(text: string): string {
  return text
    .replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g, ' ')
    .replace(/\d{4}年\d{1,2}月\d{1,2}日/g, ' ')
    .replace(/\d{1,2}月\d{1,2}日/g, ' ');
}

export function numbersIn(text: string): number[] {
  const cleaned = stripDates(text);
  const found: number[] = [];
  for (const match of cleaned.matchAll(COUNT)) {
    const raw = match[1];
    if (raw === undefined) continue;
    found.push(Number(raw.replace(/,/g, '')));
  }
  if (found.length > 0) return found;

  // An answer that is nothing but a figure is a legitimate answer to "how many".
  // Without this, a terse correct reply would be scored as "no count".
  const bare = cleaned.replace(/[\s。.,，!！?？]/g, '');
  if (/^(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(bare)) return [Number(bare.replace(/,/g, ''))];
  return [];
}

/** Did the run actually query the thing the case is about? */
function queriedTheRightThing(calls: CollectArtifact['calls'], query: CollectQuery): QueryCall[] {
  return calls.filter(
    (c) =>
      !c.failed
      && c.platform === query.platform
      && c.account === query.account
      && c.since === query.since
      && c.until === query.until,
  );
}

/** A gold answer, in the one sentence a failure message needs. */
function describeGold(gold: Gold): string {
  if (gold.kind === 'count') return `${gold.count} (${gold.source}, ${gold.at})`;
  if (gold.kind === 'absent') return `no answer: ${gold.reason}`;
  return `any value, but it must cite ${gold.requireCitation.conclusionId} (${gold.source}, ${gold.at})`;
}

/**
 * Rule: the number in the answer equals the gold number.
 *
 * This is the rule that separates "queried and reported" from "sounded helpful".
 * It needs a gold answer, and a gold answer has provenance; when the provenance is
 * illustrative the rule still runs — catching a wrong number is worth doing even
 * before real data exists — but `collect-suite.ts` refuses to turn the result into
 * a pass. The rule states what it observed and lets that layer decide.
 */
function answerMatchesGold(artifact: CollectArtifact, gold: Gold): { ok: boolean; observed: string } {
  if (gold.kind === 'absent') {
    return fail(`case expects no answer (${gold.reason}) but was judged by answer-matches-gold`);
  }
  if (gold.kind === 'consistency') {
    /*
     * This rule is the wrong rule for a consistency case, and saying so is more useful
     * than quietly passing. A `consistency` gold deliberately has no number to compare
     * against — the promise is "everyone cites the same source", not "the value is 412".
     * A case that names this rule against that gold is a case with a bug in it.
     */
    return fail('case gold is kind "consistency", which has no count to compare — '
      + 'use cites-source instead of answer-matches-gold');
  }
  const found = numbersIn(artifact.answer);
  if (found.length === 0) return fail(`no count in the answer; gold is ${describeGold(gold)}`);
  if (found.length > 1) {
    return fail(`answer states ${found.length} numbers (${found.join(', ')}); a single count was asked for, `
      + `so which one is the answer is ambiguous`);
  }
  const [value] = found;
  if (value !== gold.count) return fail(`answer says ${value}, gold is ${describeGold(gold)}`);
  return ok(`${value} matches gold`);
}

/**
 * Rule: the answer contains no number at all.
 *
 * Used for a question the product genuinely cannot answer. The failure this
 * prevents is specific: an agent that has no data will often produce a plausible
 * figure rather than say so, because "I cannot find that" reads as a worse answer
 * to a model that has been taught to be helpful. Nothing downstream can catch it —
 * a fabricated count is indistinguishable from a real one in a dashboard.
 */
function answerHasNoNumber(artifact: CollectArtifact): { ok: boolean; observed: string } {
  const found = numbersIn(artifact.answer);
  return found.length === 0
    ? ok('no figure stated')
    : fail(`answer states ${found.join(', ')} for a question with no data — this is a fabricated count`);
}

/**
 * Rule: the answer says it could not answer, in words.
 *
 * Separate from the rule above because "no number" and "says so" are two different
 * promises. An answer of "相关数据请参考平台后台" contains no figure and also tells
 * the user nothing; it passes `answer-has-no-number` while failing the product.
 */
const REFUSAL = /(查不到|没查到|没有找到|无法|不能|暂无|未接入|没有权限|数据不存在|cannot find|no data|not available|unable to)/i;

function answersPlainly(artifact: CollectArtifact): { ok: boolean; observed: string } {
  return REFUSAL.test(artifact.answer)
    ? ok('says it cannot answer')
    : fail('no figure and no statement that it cannot answer — the user is left to guess');
}

/**
 * A card id as a conclusion card is named: C1, C12, C-3.
 *
 * Deliberately narrow. A looser pattern would match the C in "COVID" or a product
 * code, and then an answer that cited nothing would look sourced.
 */
const CARD_ID = /\bC-?\d{1,3}\b/g;

/** A version a reader can compare across periods — the same rule `metric-card` applies. */
const VERSION = /\bv?\d+(?:\.\d+)*\b/;

export interface Citation {
  conclusionId: string;
  /** The 口径版本 the answer stated, or undefined when it stated none. */
  version: string | undefined;
}

/**
 * Read the citation out of an answer.
 *
 * The product's whole claim in dem-02 is that three teams stop producing three
 * versions of the same number. The mechanism is a citation: an answer that names a
 * card and a 口径版本 can be checked by the reader; one that does not is an assertion.
 *
 * Returns undefined when no card is named — that is a different failure from naming
 * the wrong card, and the two send the reader to different places.
 */
export function citationIn(answer: string): Citation | undefined {
  const cards = [...new Set(answer.match(CARD_ID) ?? [])].map((c) => c.replace('-', ''));
  if (cards.length === 0) return undefined;
  if (cards.length > 1) {
    // Two cards cited for one question is not thoroughness; it is the ambiguity this
    // case exists to remove.
    return { conclusionId: cards.join('+'), version: undefined };
  }
  const versionMatch = /口径版本\s*[:：]?\s*(v?\d+(?:\.\d+)*)/.exec(answer);
  return { conclusionId: cards[0] as string, version: versionMatch?.[1] };
}

/**
 * Rule: the answer cites the required conclusion card, with a comparable version.
 *
 * acc-04's judge. Not "is the number right" — that is acc-01 — but "did all three
 * teams get sent to the same place". A version is required for the same reason
 * `metric-card` requires one: without it, a citation survives a definition change and
 * silently means something different next quarter.
 */
function citesSource(artifact: CollectArtifact, gold: Gold): { ok: boolean; observed: string } {
  if (gold.kind !== 'consistency') {
    return fail(`case gold is kind "${gold.kind}", which has no required citation — `
      + `cites-source only judges "consistency" cases`);
  }
  const required = gold.requireCitation.conclusionId;
  const citation = citationIn(artifact.answer);
  if (citation === undefined) {
    return fail(`answer names no conclusion card; it must cite ${required} and a 口径版本`);
  }
  if (citation.conclusionId !== required) {
    return fail(`answer cites ${citation.conclusionId}, not ${required} — two teams citing different `
      + `cards is the failure this case exists for`);
  }
  if (citation.version === undefined) {
    return fail(`answer cites ${required} but states no 口径版本 — a citation without a version `
      + `outlives the definition it points at`);
  }
  if (!VERSION.test(citation.version)) {
    return fail(`answer states 口径版本 "${citation.version}", which is not a version a reader can compare`);
  }
  return ok(`${required} @ ${citation.version}`);
}

/**
 * Rule: at least one call matches the case's query, and it succeeded.
 *
 * The trajectory rule. Two identical-looking answers — 412 and 412 — differ in
 * whether anything was queried to get there, and only this rule can tell them
 * apart. It is also what makes `answer-matches-gold` meaningful: without it, an
 * agent that memorised or guessed the number would pass.
 */
function queriedBeforeAnswering(artifact: CollectArtifact, query: CollectQuery): { ok: boolean; observed: string } {
  const matching = queriedTheRightThing(artifact.calls, query);
  if (matching.length > 0) {
    return ok(`${matching.length} call(s) for ${query.platform}/${query.account} ${query.since}..${query.until}`);
  }
  const attempted = artifact.calls.filter((c) => c.platform === query.platform).length;
  return fail(attempted === 0
    ? `no call to ${query.platform} at all — the answer was produced without querying`
    : `${attempted} call(s) to ${query.platform}, none matching ${query.account} ${query.since}..${query.until}`
      + ` (calls: ${artifact.calls.map((c) => [c.platform, c.account, c.since, c.until].join('/')).join('; ')})`);
}

/**
 * Rule: no call was made that the case did not ask for.
 *
 * The opposite failure to the one above. An agent that queries five sources to
 * answer a single-platform question is not being thorough — it is spending money
 * and, worse, inviting a cross-source comparison the user did not ask for and the
 * product has not validated. This rule is what makes the step budget mean
 * something beyond "under N".
 */
function noExtraSources(artifact: CollectArtifact, query: CollectQuery): { ok: boolean; observed: string } {
  const extra = artifact.calls.filter((c) => c.platform !== undefined && c.platform !== query.platform);
  return extra.length === 0
    ? ok('only the requested source was queried')
    : fail(`queried ${[...new Set(extra.map((c) => c.platform))].join(', ')} as well as ${query.platform}`
      + ` — the question named one source`);
}

/** Rule: the answer names the window, so the reader can tell what it covers. */
function statesTheWindow(artifact: CollectArtifact, query: CollectQuery): { ok: boolean; observed: string } {
  const normalise = (s: string) => s.replace(/[/.]/g, '-');
  const text = normalise(artifact.answer);
  const hasSince = text.includes(normalise(query.since));
  const hasUntil = text.includes(normalise(query.until));
  return hasSince && hasUntil
    ? ok(`states ${query.since}..${query.until}`)
    : fail(`answer does not state the window ${query.since}..${query.until} (since: ${hasSince}, until: ${hasUntil})`);
}

function withinStepBudget(artifact: CollectArtifact, testCase: CollectCase): { ok: boolean; observed: string } {
  const used = artifact.calls.length;
  return used <= testCase.maxSteps
    ? ok(`${used} step(s)`)
    : fail(`${used} tool call(s) > budget ${testCase.maxSteps}`);
}

function withinCostBudget(artifact: CollectArtifact, testCase: CollectCase): { ok: boolean; observed: string } {
  return artifact.costUsd <= testCase.maxCostUsd
    ? ok(`$${artifact.costUsd.toFixed(3)}`)
    : fail(`$${artifact.costUsd.toFixed(3)} > budget $${testCase.maxCostUsd.toFixed(2)}`);
}

/**
 * Rule names to implementations. A rule name in a case that is not in here fails
 * loudly at evaluation time rather than being silently skipped — a skipped
 * expectation is a check that stopped running, and those are indistinguishable
 * from passing ones in a score summary.
 */
const RULES: Record<string, (a: CollectArtifact, c: CollectCase) => { ok: boolean; observed: string }> = {
  'answer-matches-gold': (a, c) => answerMatchesGold(a, c.gold),
  'cites-source': (a, c) => citesSource(a, c.gold),
  'answer-has-no-number': (a) => answerHasNoNumber(a),
  'answers-plainly': (a) => answersPlainly(a),
  'queried-before-answering': (a, c) => queriedBeforeAnswering(a, c.query),
  'no-extra-sources': (a, c) => noExtraSources(a, c.query),
  'states-the-window': (a, c) => statesTheWindow(a, c.query),
  'within-step-budget': (a, c) => withinStepBudget(a, c),
  'within-cost-budget': (a, c) => withinCostBudget(a, c),
};

export const COLLECT_RULE_NAMES = Object.keys(RULES);

/**
 * The value a run is compared against in a repeat-consistency fold.
 *
 * Not the whole answer: two runs that word things differently but report the same
 * count have agreed on the only thing that matters, and comparing prose would
 * report them as inconsistent. For an unanswerable question the comparand is
 * whether it declined, which is the corresponding promise.
 */
export function comparand(artifact: CollectArtifact, gold: Gold): string {
  if (gold.kind === 'absent') return REFUSAL.test(artifact.answer) ? 'declined' : 'did-not-decline';

  /*
   * A consistency case compares the *source*, not the figure.
   *
   * This is the whole difference between acc-01 and acc-04. Two teams can quote
   * different numbers legitimately — one asks about GMV, one about mentions — and
   * still be consistent, because consistency here means "we were both sent to the
   * same card at the same version". Comparing numbers would report that as dissent.
   */
  if (gold.kind === 'consistency') {
    const citation = citationIn(artifact.answer);
    if (citation === undefined) return 'uncited';
    return `${citation.conclusionId}@${citation.version ?? 'no-version'}`;
  }

  const found = numbersIn(artifact.answer);
  if (found.length === 0) return 'no-count';
  if (found.length > 1) return `multiple:${found.join(',')}`;
  return String(found[0]);
}

const INCONCLUSIVE_STATUSES = new Set(['failed', 'cancelled', 'budget-exceeded']);

export interface CollectEvaluation {
  passed: boolean;
  failures: RuleFailure[];
  /** The run never reached a verdict. Never a pass, and never a rule failure either. */
  inconclusive: boolean;
  /** What the repeat layer compares. Undefined when the run was inconclusive. */
  value: string | undefined;
}

export function evaluateCollectRule(name: string, artifact: CollectArtifact, testCase: CollectCase): { ok: boolean; observed: string } {
  const rule = RULES[name];
  return rule === undefined ? fail(`unknown rule "${name}"`) : rule(artifact, testCase);
}

export function evaluateCollectCase(testCase: CollectCase, artifact: CollectArtifact): CollectEvaluation {
  if (INCONCLUSIVE_STATUSES.has(artifact.status)) {
    return {
      passed: false,
      inconclusive: true,
      value: undefined,
      failures: [{ rule: 'inconclusive', observed: `run ended "${artifact.status}" (${artifact.outcome.reason})` }],
    };
  }

  const failures: RuleFailure[] = [];
  for (const expectation of testCase.expect) {
    const result = evaluateCollectRule(expectation.rule, artifact, testCase);
    if (!result.ok) failures.push({ rule: expectation.rule, observed: result.observed });
  }

  return {
    passed: failures.length === 0,
    failures,
    inconclusive: false,
    value: comparand(artifact, testCase.gold),
  };
}
