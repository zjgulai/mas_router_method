import { createRuntime, loadConfig } from '@mas/core';
import type { CaseArtifact } from './rules.js';
import type { EvalCase } from './types.js';
import { analysisForUrl, createFakeEnv } from './fixtures.js';

export interface RunOutcome {
  artifact: CaseArtifact;
  costUsd: number;
}

const URL_PATTERN = /https?:\/\/\S+/;

/**
 * Run one case through the real runtime. The stores and the vision analyser are
 * fakes, but the model is real: an eval that fakes the model measures nothing.
 */
export async function runCase(evalCase: EvalCase): Promise<RunOutcome> {
  if (process.env['ANTHROPIC_API_KEY'] === undefined || process.env['ANTHROPIC_API_KEY'] === '') {
    throw new Error(
      'ANTHROPIC_API_KEY is required for a real eval run. Use --self-test to verify the harness without a model.',
    );
  }

  const env = createFakeEnv();
  // A case declaring `preset` gets those references saved before the run, so
  // history-dependent requests ("same as last time") measure the agent's use of
  // context, not the emptiness of the store.
  for (const ref of evalCase.preset ?? []) {
    await env.references.save(evalCase.input.brandId, { url: ref.url });
  }
  const runtime = createRuntime({
    brands: env.brands,
    references: env.references,
    recipes: env.recipes,
    vision: env.vision,
    runs: env.runs,
    config: { ...loadConfig(), maxCostUsd: 2 },
    cwd: process.cwd(),
  });

  const result = await runtime.run({
    prompt: evalCase.input.request,
    workflow: { name: 'recipe-tracer', version: 'v0' },
    trigger: 'eval',
    brandId: evalCase.input.brandId,
    actor: { kind: 'system', id: 'eval' },
  });

  const url = URL_PATTERN.exec(evalCase.input.request)?.[0] ?? '';
  const recipe = env.drafts.length > 0 ? env.drafts[env.drafts.length - 1] : undefined;
  const brand = await env.brands.get(evalCase.input.brandId);
  if (brand === null) throw new Error(`No brand fixture for ${evalCase.input.brandId}`);

  return {
    artifact: {
      status: result.status,
      outcome: result.outcome,
      output: result.output ?? '',
      steps: result.steps.map((step) => ({
        kind: step.kind,
        summary: step.summary,
        ...(step.tool === undefined ? {} : { tool: step.tool }),
      })),
      recipe,
      analysis: analysisForUrl(url),
      brand,
      request: evalCase.input.request,
    },
    costUsd: result.usage.costUsd,
  };
}
