import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases } from './cases/index.js';
import { makeSelfTestArtifact } from './fixtures.js';
import { evaluateCase } from './rules.js';
import { runCase } from './runner.js';
import type { CaseResult, EvalCase, SuiteResult } from './types.js';

interface Options {
  fast: boolean;
  all: boolean;
  selfTest: boolean;
  rubric: boolean;
  saveBaseline: boolean;
  caseId?: string;
  label: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..');

function parseArgs(argv: string[]): Options {
  const caseIndex = argv.indexOf('--case');
  const labelIndex = argv.indexOf('--label');
  const caseId = caseIndex >= 0 ? argv[caseIndex + 1] : undefined;
  return {
    fast: argv.includes('--fast'),
    all: argv.includes('--all'),
    selfTest: argv.includes('--self-test'),
    rubric: argv.includes('--rubric'),
    saveBaseline: argv.includes('--save-baseline'),
    ...(caseId === undefined ? {} : { caseId }),
    label: labelIndex >= 0 ? (argv[labelIndex + 1] ?? 'run') : 'run',
  };
}

function selectCases(options: Options): EvalCase[] {
  let selected = cases;
  if (options.caseId !== undefined) {
    selected = selected.filter((c) => c.id === options.caseId);
    if (selected.length === 0) throw new Error(`Unknown case: ${options.caseId}`);
  } else if ((options.fast || options.selfTest) && !options.all) {
    selected = selected.filter((c) => c.shouldFail || c.id === 'baseline-beauty');
  }
  return selected;
}

function describe(result: CaseResult): string {
  if (result.passed && (result.skipped?.length ?? 0) === 0) return 'pass';
  if (result.inconclusive) {
    return `INCONCLUSIVE ${result.failures.map((f) => f.observed).join('; ')}`;
  }
  const parts: string[] = [];
  for (const failure of result.failures) parts.push(`${failure.rule} (${failure.observed})`);
  for (const skip of result.skipped ?? []) parts.push(`skipped ${skip.expectation}`);
  return parts.join('; ');
}

function suiteFrom(results: CaseResult[], selected: EvalCase[], options: Options): SuiteResult {
  const byId = new Map(selected.map((c) => [c.id, c]));
  return {
    ranAt: new Date().toISOString(),
    model: process.env['AGENT_MODEL'] ?? 'claude-sonnet-4-6',
    workflowVersion: 'recipe-tracer@v0',
    cases: results,
    guardrailFailures: results
      .filter(
        (result) =>
          byId.get(result.caseId)?.shouldFail === true && !result.passed && !result.inconclusive,
      )
      .map((result) => result.caseId),
    guardrailInconclusive: results
      .filter((result) => byId.get(result.caseId)?.shouldFail === true && result.inconclusive)
      .map((result) => result.caseId),
    totalCostUsd: results.reduce((sum, result) => sum + result.costUsd, 0),
  };
}

async function readBaseline(): Promise<SuiteResult | null> {
  try {
    const raw = await readFile(join(PACKAGE_ROOT, 'baselines', 'current.json'), 'utf8');
    return JSON.parse(raw) as SuiteResult;
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const selected = selectCases(options);

  if (options.selfTest) {
    console.log('SELF-TEST: fixture artifacts, no model call. This verifies plumbing, not quality.');
  }

  const results: CaseResult[] = [];
  for (const evalCase of selected) {
    try {
      const outcome = options.selfTest
        ? { artifact: makeSelfTestArtifact(evalCase), costUsd: 0 }
        : await runCase(evalCase);
      const evaluation = evaluateCase(evalCase, outcome.artifact, { rubric: options.rubric });
      results.push({
        caseId: evalCase.id,
        passed: evaluation.passed,
        inconclusive: evaluation.inconclusive,
        failures: evaluation.failures,
        ...(evaluation.skipped.length === 0 ? {} : { skipped: evaluation.skipped }),
        costUsd: outcome.costUsd,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      results.push({
        caseId: evalCase.id,
        passed: false,
        inconclusive: true,
        failures: [{ rule: 'runner', observed: message }],
        costUsd: 0,
      });
    }
  }

  const suite = suiteFrom(results, selected, options);
  console.log(`\nEval: ${results.length} case(s) — label=${options.label}`);
  for (const result of results) {
    const mark = result.inconclusive ? '??? ' : result.passed ? 'PASS' : 'FAIL';
    console.log(`  ${mark}  ${result.caseId.padEnd(26)} ${describe(result)}`);
  }
  console.log(`\nGuardrail failures: ${suite.guardrailFailures.length === 0 ? 'none' : suite.guardrailFailures.join(', ')}`);
  console.log(
    `Guardrail inconclusive: ${suite.guardrailInconclusive.length === 0 ? 'none' : `${suite.guardrailInconclusive.join(', ')} (an outage is not a refusal)`}`,
  );
  console.log(`Total cost: $${suite.totalCostUsd.toFixed(4)}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeJson(join(PACKAGE_ROOT, 'runs', `${stamp}-${options.label}.json`), suite);

  if (options.saveBaseline) {
    await writeJson(join(PACKAGE_ROOT, 'baselines', 'current.json'), suite);
    console.log('Baseline saved to baselines/current.json');
  } else if (!options.selfTest) {
    const baseline = await readBaseline();
    if (baseline === null) {
      console.log('No baseline yet. Run with --save-baseline once the tracer is green.');
    } else {
      const before = new Map(baseline.cases.map((c) => [c.caseId, c.passed]));
      const regressions = results.filter((r) => before.get(r.caseId) === true && !r.passed);
      console.log(
        regressions.length === 0
          ? 'No regressions against baseline.'
          : `REGRESSIONS: ${regressions.map((r) => r.caseId).join(', ')}`,
      );
    }
  }

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('run-evals.ts') === true) {
  main().catch((cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
