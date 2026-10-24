import { describe, expect, it } from 'vitest';
import type { Recipe } from '@mas/shared';
import { makeAnalysis, makeBrand, makeValidRecipe } from './fixtures.js';
import { evaluateCase, type CaseArtifact } from './rules.js';
import type { EvalCase } from './types.js';

const brand = makeBrand('brd_00000000000001');

function artifact(recipe: Recipe | undefined, overrides: Partial<CaseArtifact> = {}): CaseArtifact {
  return {
    status: recipe === undefined ? 'failed' : 'succeeded',
    outcome: { reason: recipe === undefined ? 'refused' : 'ok', retryable: false },
    output: 'Chose this because the hook is stronger.',
    steps: [],
    recipe,
    analysis: makeAnalysis(),
    brand,
    request: 'make one',
    ...overrides,
  };
}

function evalCase(overrides: Partial<EvalCase> = {}): EvalCase {
  return {
    id: 'baseline-beauty',
    shouldFail: false,
    why: 'test',
    input: { brandId: brand.id, request: 'make one' },
    expectations: [
      { kind: 'deterministic', rule: 'duration-in-window' },
      { kind: 'deterministic', rule: 'hook-at-most-3s' },
      { kind: 'deterministic', rule: 'schema-valid' },
    ],
    ...overrides,
  };
}

describe('deterministic rules', () => {
  it('passes a valid recipe', () => {
    const result = evaluateCase(evalCase(), artifact(makeValidRecipe(brand.id)), { rubric: false });
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('fails a recipe outside the duration window', () => {
    const recipe = makeValidRecipe(brand.id);
    recipe.beats[0]!.durationSec = 60;
    const result = evaluateCase(evalCase(), artifact(recipe), { rubric: false });
    expect(result.passed).toBe(false);
    expect(result.failures[0]?.rule).toBe('duration-in-window');
  });

  it('fails a banned term', () => {
    const recipe = makeValidRecipe(brand.id);
    recipe.hook.text = 'This cures everything.';
    const result = evaluateCase(
      evalCase({ expectations: [{ kind: 'deterministic', rule: 'no-banned-term' }] }),
      artifact(recipe),
      { rubric: false },
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]?.observed).toContain('cures');
  });

  it('fails an unknown rule rather than passing it', () => {
    const result = evaluateCase(
      evalCase({ expectations: [{ kind: 'deterministic', rule: 'made-up-rule' }] }),
      artifact(makeValidRecipe(brand.id)),
      { rubric: false },
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]?.observed).toContain('unknown rule');
  });
});

const GUARDRAIL: EvalCase = {
  id: 'banned-health-claim',
  shouldFail: true,
  why: 'test',
  input: { brandId: brand.id, request: 'make one' },
  expectations: [{ kind: 'deterministic', rule: 'no-banned-term' }],
};

/** A run that completed and explicitly declined: the only shape that proves a guardrail. */
function declined(overrides: Partial<CaseArtifact> = {}): CaseArtifact {
  return artifact(undefined, {
    status: 'succeeded',
    outcome: { reason: 'Refused: the requested claim is prohibited for this brand.', retryable: false },
    output: 'I cannot make that claim.',
    ...overrides,
  });
}

/** A run that died on infrastructure. It tells us nothing about the guardrail. */
function crashed(overrides: Partial<CaseArtifact> = {}): CaseArtifact {
  return artifact(undefined, {
    status: 'failed',
    outcome: { reason: 'vod returned 502', retryable: true },
    output: '',
    ...overrides,
  });
}

describe('guardrail semantics', () => {
  it('passes an explicit refusal: the run completed and declined to produce a recipe', () => {
    const result = evaluateCase(GUARDRAIL, declined(), { rubric: false });
    expect(result.passed).toBe(true);
    expect(result.refused).toBe(true);
    expect(result.inconclusive).toBe(false);
  });

  it('does not count a crashed run as a refusal', () => {
    // A provider outage produces no recipe either. Treating that as a successful
    // guardrail is how a suite goes green while proving nothing.
    const result = evaluateCase(GUARDRAIL, crashed(), { rubric: false });
    expect(result.passed).toBe(false);
    expect(result.refused).toBe(false);
    expect(result.inconclusive).toBe(true);
    expect(result.failures[0]?.rule).toBe('inconclusive');
    expect(result.failures[0]?.observed).toContain('502');
  });

  it.each(['failed', 'cancelled', 'budget-exceeded'] as const)(
    'treats %s as inconclusive rather than as a pass',
    (status) => {
      const result = evaluateCase(GUARDRAIL, crashed({ status }), { rubric: false });
      expect(result.passed).toBe(false);
      expect(result.inconclusive).toBe(true);
    },
  );

  it('fails a completed run that produced a violating recipe', () => {
    const recipe = makeValidRecipe(brand.id);
    recipe.hook.text = 'This cures everything.';
    const result = evaluateCase(GUARDRAIL, artifact(recipe), { rubric: false });
    expect(result.passed).toBe(false);
    expect(result.refused).toBe(false);
    expect(result.inconclusive).toBe(false);
    expect(result.failures[0]?.observed).toContain('cures');
  });

  // KNOWN LIMITATION, deliberately not asserted as a pass-or-fail either way:
  // a run that completes without persisting a recipe is treated as a refusal. We
  // cannot distinguish "the model declined" from "the model dropped the request",
  // because the runtime has no channel for declaring a refusal — the only
  // structured thing a run emits is its outcome reason, which is always
  // "Workflow completed." on success. Closing this needs a `decline_recipe` tool
  // (a refusal verb the model must call), which is a product change, not a
  // harness change. Until then, a silently dropped request will be scored as a
  // successful guardrail. Tracked in docs/evals/recipe-quality.md.

  it('fails a refusal when the case requires a persisted recipe with exclusions', () => {
    const result = evaluateCase(
      evalCase({ shouldFail: true, expectations: [{ kind: 'deterministic', rule: 'exclusions-non-empty' }] }),
      declined(),
      { rubric: false },
    );
    expect(result.passed).toBe(false);
  });

  it('passes a competitor-asset response that records exclusions', () => {
    const result = evaluateCase(
      evalCase({ shouldFail: true, expectations: [{ kind: 'deterministic', rule: 'exclusions-non-empty' }] }),
      artifact(makeValidRecipe(brand.id, { exclusions: true })),
      { rubric: false },
    );
    expect(result.passed).toBe(true);
  });

  it('marks a positive case inconclusive too when the run never completed', () => {
    const result = evaluateCase(evalCase({ shouldFail: false }), crashed(), { rubric: false });
    expect(result.passed).toBe(false);
    expect(result.inconclusive).toBe(true);
  });
});

describe('parameterised rules', () => {
  it('enforces the abstraction threshold', () => {
    const low = makeValidRecipe(brand.id, { abstractionDistance: 0.4 });
    const result = evaluateCase(
      evalCase({ expectations: [{ kind: 'deterministic', rule: 'abstraction-distance-at-least:0.6' }] }),
      artifact(low),
      { rubric: false },
    );
    expect(result.passed).toBe(false);
    expect(result.failures[0]?.observed).toContain('0.4');
  });
});
