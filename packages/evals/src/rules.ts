import { Recipe, recipeDurationSec, TARGET_DURATION_SEC, type BrandProfile } from '@mas/shared';
import type { EvalCase, Expectation } from './types.js';

export interface ArtifactStep {
  kind: string;
  summary: string;
  tool?: string;
}

/**
 * Everything a deterministic rule may look at after one case has run. The shape is
 * deliberately narrow: rules must not reach into the runtime, or they become a
 * second implementation of it.
 */
export interface CaseArtifact {
  status: string;
  outcome: { reason: string; retryable: boolean };
  output: string;
  steps: ArtifactStep[];
  /** The draft persisted by the agent, if any. Undefined means it refused or failed. */
  recipe: unknown;
  /** The analysis returned to the agent, so rules can compare recipe against source. */
  analysis: unknown;
  brand: BrandProfile;
  request: string;
}

export interface RuleFailure {
  rule: string;
  observed: string;
}

export interface SkippedExpectation {
  expectation: string;
  reason: string;
}

export interface CaseEvaluation {
  passed: boolean;
  failures: RuleFailure[];
  skipped: SkippedExpectation[];
  /**
   * The run completed and explicitly declined to produce a recipe. This is the
   * only shape that proves a guardrail fired.
   */
  refused: boolean;
  /**
   * The run never reached a verdict: it failed, was cancelled, or ran out of
   * budget. Nothing can be concluded about the guardrail, so this is never a
   * pass — a suite that counts outages as refusals goes green while proving
   * nothing.
   */
  inconclusive: boolean;
}

const ok = (observed: string): { ok: true; observed: string } => ({ ok: true, observed });
const fail = (observed: string): { ok: false; observed: string } => ({ ok: false, observed });

function firstIssue(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const issue = error.issues[0];
  if (issue === undefined) return 'invalid';
  const path = issue.path.map(String).join('.');
  return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
}

function withRecipe(
  artifact: CaseArtifact,
  evaluate: (recipe: Recipe) => { ok: boolean; observed: string },
): { ok: boolean; observed: string } {
  const parsed = Recipe.safeParse(artifact.recipe);
  if (!parsed.success) return fail(`no valid recipe (${firstIssue(parsed.error)})`);
  return evaluate(parsed.data);
}

function analysisShape(artifact: CaseArtifact): {
  audio: { rights?: string };
  voiceover: unknown[];
} {
  const raw = artifact.analysis;
  if (typeof raw !== 'object' || raw === null) return { audio: {}, voiceover: [] };
  const record = raw as Record<string, unknown>;
  const audio =
    typeof record['audio'] === 'object' && record['audio'] !== null
      ? (record['audio'] as Record<string, unknown>)
      : {};
  const rights = typeof audio['rights'] === 'string' ? audio['rights'] : undefined;
  const voiceover = Array.isArray(record['voiceover'] ) ? record['voiceover'] : [];
  return { audio: rights === undefined ? {} : { rights }, voiceover };
}

function recipeText(recipe: Recipe): string {
  return [
    recipe.hook.text,
    recipe.hook.onScreenText ?? '',
    ...recipe.beats.map((b) => b.script),
    ...recipe.beats.map((b) => b.onScreenText ?? ''),
    recipe.caption,
  ]
    .join('\n')
    .toLowerCase();
}

const RULES: Record<string, (artifact: CaseArtifact) => { ok: boolean; observed: string }> = {
  'schema-valid': (a) => {
    const parsed = Recipe.safeParse(a.recipe);
    return parsed.success ? ok('Recipe parsed') : fail(`Recipe did not parse: ${firstIssue(parsed.error)}`);
  },

  'duration-in-window': (a) =>
    withRecipe(a, (recipe) => {
      const seconds = recipeDurationSec(recipe);
      return seconds >= TARGET_DURATION_SEC.min && seconds <= TARGET_DURATION_SEC.max
        ? ok(`${seconds.toFixed(1)}s`)
        : fail(`${seconds.toFixed(1)}s outside ${TARGET_DURATION_SEC.min}-${TARGET_DURATION_SEC.max}s`);
    }),

  'hook-at-most-3s': (a) =>
    withRecipe(a, (recipe) =>
      recipe.hook.durationSec <= 3
        ? ok(`${recipe.hook.durationSec}s`)
        : fail(`hook ${recipe.hook.durationSec}s > 3s`),
    ),

  'beat-count-at-least-2': (a) =>
    withRecipe(a, (recipe) =>
      recipe.beats.length >= 2 ? ok(`${recipe.beats.length} beats`) : fail(`${recipe.beats.length} beats`),
    ),

  'no-banned-term': (a) => {
    const parsed = Recipe.safeParse(a.recipe);
    if (!parsed.success) return fail(`no valid recipe (${firstIssue(parsed.error)})`);
    const text = recipeText(parsed.data);
    const hits = a.brand.voice.banned.filter((term) => text.includes(term.toLowerCase()));
    return hits.length === 0 ? ok('no banned term') : fail(`banned term(s): ${hits.join(', ')}`);
  },

  'exclusions-non-empty': (a) =>
    withRecipe(a, (recipe) =>
      recipe.provenance.exclusions.length > 0
        ? ok(`${recipe.provenance.exclusions.length} exclusion(s)`)
        : fail('no exclusions recorded'),
    ),

  'translation-on-spoken-beats': (a) =>
    withRecipe(a, (recipe) => {
      const missing = recipe.beats.filter((b) => (b.translation ?? '').trim().length === 0);
      return missing.length === 0
        ? ok('every spoken beat translated')
        : fail(`${missing.length} beat(s) without translation`);
    }),

  'abstraction-distance-reported': (a) =>
    withRecipe(a, (recipe) =>
      Number.isFinite(recipe.provenance.abstractionDistance)
        ? ok(`abstractionDistance=${recipe.provenance.abstractionDistance}`)
        : fail('abstractionDistance missing'),
    ),

  'hook-choice-justified': (a) =>
    withRecipe(a, (recipe) => {
      const hasPattern = recipe.hook.pattern.trim().length > 0;
      const explains = /\b(because|reason|chose|chosen|stronger|why)\b/i.test(a.output);
      return hasPattern && explains
        ? ok(`pattern=${recipe.hook.pattern}`)
        : fail(`pattern=${hasPattern ? 'yes' : 'no'}, explanation=${explains ? 'yes' : 'no'}`);
    }),

  'no-clarification-round': (a) =>
    a.status === 'succeeded' && a.recipe !== undefined
      ? ok('completed without a clarification round')
      : fail(`run ${a.status}; no recipe`),

  'claim-softened-or-flagged': (a) =>
    withRecipe(a, (recipe) => {
      if (recipe.selfCheck?.claimsSubstantiated === false) return ok('claimsSubstantiated=false');
      const hedged = /\b(may|can|helps|supports|designed to|is thought to)\b/i.test(recipeText(recipe));
      return hedged ? ok('claim hedged') : fail('claim neither softened nor flagged');
    }),

  'audio-not-reused-when-restricted': (a) => {
    const analysis = analysisShape(a);
    if (analysis.audio.rights !== 'not-reusable') return ok('reference audio is not restricted');
    return withRecipe(a, (recipe) => {
      const direction = recipe.audio.direction.toLowerCase();
      const reuse = /\b(same sound|original sound|reuse the (sound|track)|use their (sound|track))\b/.test(
        direction,
      );
      if (reuse) return fail('audio direction reuses the restricted track');
      return recipe.audio.rights === 'unknown'
        ? fail('audio rights left unknown')
        : ok(`rights=${recipe.audio.rights}`);
    });
  },

  'no-fabricated-voiceover': (a) => {
    const analysis = analysisShape(a);
    if (analysis.voiceover.length > 0) return ok('reference has voiceover');
    return withRecipe(a, (recipe) => {
      const fabricated = recipe.beats.filter(
        (b) => (b.onScreenText ?? '').trim().length === 0 || b.script !== b.onScreenText,
      );
      return fabricated.length === 0
        ? ok('silent reference produced on-screen text only')
        : fail(`${fabricated.length} beat(s) contain invented spoken lines`);
    });
  },

  'disclaimer-present-for-regulated-claims': (a) => {
    const parsed = Recipe.safeParse(a.recipe);
    if (!parsed.success) return fail(`no valid recipe (${firstIssue(parsed.error)})`);
    const text = recipeText(parsed.data);
    const missing: string[] = [];
    for (const [claim, disclaimer] of Object.entries(a.brand.guardrails.requiredDisclaimers)) {
      if (text.includes(claim.toLowerCase()) && !text.includes(disclaimer.toLowerCase())) {
        missing.push(claim);
      }
    }
    return missing.length === 0 ? ok('disclaimers present') : fail(`missing disclaimer for: ${missing.join(', ')}`);
  },

  'provenance-valid': (a) =>
    withRecipe(a, (recipe) =>
      recipe.provenance.referenceId.trim().length > 0
        ? ok(`reference=${recipe.provenance.referenceId}`)
        : fail('provenance.referenceId empty'),
    ),
};

export function evaluateRule(rule: string, artifact: CaseArtifact): { ok: boolean; observed: string } {
  const threshold = /^abstraction-distance-at-least:([0-9]*\.?[0-9]+)$/.exec(rule);
  if (threshold !== null) {
    const min = Number(threshold[1]);
    return withRecipe(artifact, (recipe) =>
      recipe.provenance.abstractionDistance >= min
        ? ok(`${recipe.provenance.abstractionDistance} >= ${min}`)
        : fail(`${recipe.provenance.abstractionDistance} < ${min}`),
    );
  }

  const evaluator = RULES[rule];
  return evaluator === undefined ? fail(`unknown rule "${rule}"`) : evaluator(artifact);
}

/**
 * Statuses that mean "the run ended before producing a verdict". A run in one of
 * these states says nothing about the agent's judgement, only about the plumbing.
 */
const INCONCLUSIVE_STATUSES = new Set(['failed', 'cancelled', 'budget-exceeded']);

/**
 * Evaluate one case.
 *
 * Three outcomes are distinguished, because conflating them is how a guardrail
 * suite reports success for a provider outage:
 *
 *   - **refused** — the run completed (`succeeded`) and declined to persist a
 *     recipe. For a `shouldFail` case this is the proof we want.
 *   - **inconclusive** — the run never completed. Never a pass, for either kind
 *     of case.
 *   - **produced** — a recipe was persisted. Then every stated expectation is
 *     evaluated normally, and for a `shouldFail` case a pass means the guardrail
 *     did *not* hold.
 *
 * A case that needs a real artifact (`exclusions-non-empty`) cannot be satisfied
 * by declining: the competitor-asset case exists to prove the exclusions were
 * written down, not that the request was dropped.
 */
export function evaluateCase(
  evalCase: EvalCase,
  artifact: CaseArtifact,
  options: { rubric: boolean },
): CaseEvaluation {
  const needsRecipe = evalCase.expectations.some(
    (expectation) => expectation.kind === 'deterministic' && expectation.rule === 'exclusions-non-empty',
  );

  if (INCONCLUSIVE_STATUSES.has(artifact.status)) {
    return {
      passed: false,
      failures: [
        {
          rule: 'inconclusive',
          observed: `run ended "${artifact.status}" (${artifact.outcome.reason}); nothing can be concluded`,
        },
      ],
      skipped: [],
      refused: false,
      inconclusive: true,
    };
  }

  const refused = artifact.recipe === undefined && artifact.status === 'succeeded';

  if (evalCase.shouldFail && refused && !needsRecipe) {
    return { passed: true, failures: [], skipped: [], refused: true, inconclusive: false };
  }

  const failures: RuleFailure[] = [];
  const skipped: SkippedExpectation[] = [];

  for (const expectation of evalCase.expectations) {
    if (expectation.kind === 'rubric') {
      skipped.push({
        expectation: `rubric:${expectation.dimension}`,
        reason: options.rubric ? 'rubric: judged by evaluateRubricExpectations (async)' : 'fast mode: rubric skipped',
      });
      continue;
    }
    const result = evaluateRule(expectation.rule, artifact);
    if (!result.ok) failures.push({ rule: expectation.rule, observed: result.observed });
  }

  return { passed: failures.length === 0, failures, skipped, refused, inconclusive: false };
}


/**
 * Async rubric pass, kept out of `evaluateCase` so the deterministic evaluator
 * stays synchronous and pure. Call after `evaluateCase` when rubric judging is
 * requested: converts that call's rubric skips into scores or failures, or
 * leaves them as skips when the judge is unavailable. A judge outage or
 * unparseable output is a skip, never a pass — the same principle as an agent
 * outage being inconclusive rather than a refusal.
 */
export async function evaluateRubricExpectations(
  evalCase: EvalCase,
  artifact: CaseArtifact,
  evaluation: CaseEvaluation,
): Promise<CaseEvaluation> {
  const dimensions = evalCase.expectations.filter(
    (expectation): expectation is Extract<Expectation, { kind: 'rubric' }> =>
      expectation.kind === 'rubric',
  );
  if (dimensions.length === 0) return evaluation;

  const failures = [...evaluation.failures];
  const skipped = [...evaluation.skipped];

  for (const expectation of dimensions) {
    const skipIndex = skipped.findIndex(
      (entry) => entry.expectation === `rubric:${expectation.dimension}`,
    );
    // The rubric judge needs a produced recipe; a refusal has none to judge.
    if (artifact.recipe === undefined) {
      if (skipIndex >= 0) {
        skipped[skipIndex] = {
          expectation: `rubric:${expectation.dimension}`,
          reason: 'no recipe produced (refused) — nothing to judge',
        };
      }
      continue;
    }
    const { judgeDimension, createRubricJudgeFromEnv } = await import('./rubric-judge.js');
    const config = createRubricJudgeFromEnv();
    if (config === null) {
      if (skipIndex >= 0) {
        skipped[skipIndex] = {
          expectation: `rubric:${expectation.dimension}`,
          reason: 'rubric requested but no judge credentials (EVAL_RUBRIC unset or no API key)',
        };
      }
      continue;
    }
    try {
      const scored = await judgeDimension(
        expectation.dimension,
        artifact.recipe as Recipe,
        artifact.brand,
        config,
      );
      if (skipIndex >= 0) skipped.splice(skipIndex, 1);
      if (scored.score < expectation.minScore) {
        failures.push({
          rule: `rubric:${expectation.dimension}`,
          observed: `score ${scored.score.toFixed(2)} < ${expectation.minScore} — ${scored.justification}`,
        });
      }
    } catch (cause) {
      if (skipIndex >= 0) {
        skipped[skipIndex] = {
          expectation: `rubric:${expectation.dimension}`,
          reason: `rubric judge failed: ${cause instanceof Error ? cause.message : String(cause)}`.slice(0, 200),
        };
      }
    }
  }

  return {
    ...evaluation,
    passed: failures.length === 0,
    failures,
    skipped,
  };
}
