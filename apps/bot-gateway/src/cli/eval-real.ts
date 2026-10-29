import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MainConsultAgent } from '@mas/consult';
import type { ConsultAnswer } from '@mas/consult';
import { createLlmJudgeFromEnv, findRepoRoot, tokenize } from '@mas/consult';
import type { ConversationTurn, JudgeResult } from '@mas/consult';

type Expected = 'in_scope' | 'out_of_scope' | 'needs_context';

interface EvalCase {
  id: string;
  text: string;
  expected: Expected;
  expectedNodes?: string[];
  why: string;
  source?: string;
  history?: ConversationTurn[];
  verdict?: 'usable' | 'needs_improvement';
  reviewNote?: string;
}

interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

interface CaseResult {
  id: string;
  text: string;
  expected: Expected;
  expectedNodes: string[];
  why: string;
  source?: string;
  verdict: 'usable' | 'needs_improvement' | 'unreviewed';
  reviewNote: string;
  actualNode?: string;
  confidence: string;
  outOfScope: boolean;
  passed: boolean;
  checks: Check[];
  rubric?: Rubric;
  llmJudge?: JudgeResult;
  answer: string;
  sources: string[];
}

interface Rubric {
  directAnswer: number;
  actionable: number;
  evidence: number;
  score: number;
  notes: string[];
}

interface HistoryEntry {
  generatedAt: string;
  total: number;
  passed: number;
  passRate: number;
  manual: { usable: number; needsImprovement: number; unreviewed: number };
  rubricAverage: number;
}

const root = findRepoRoot();
const casesPath = join(root, 'packages', 'consult', 'data', 'eval', 'main-agent-cases.json');
const outDir = join(root, 'packages', 'consult', 'data', 'eval');
const resultsPath = join(outDir, 'main-agent-real-results.jsonl');
const summaryPath = join(outDir, 'main-agent-real-summary.json');
const historyPath = join(outDir, 'history.jsonl');
const reportPath = join(root, 'docs', 'evals', 'main-agent-real-qa.md');

const parsed = JSON.parse(readFileSync(casesPath, 'utf8')) as {
  version: number;
  source: string;
  note: string;
  cases: EvalCase[];
};

if (!Array.isArray(parsed.cases) || parsed.cases.length < 20) {
  console.error(`expected at least 20 cases, got ${parsed.cases?.length ?? 0}`);
  process.exit(1);
}

const agent = MainConsultAgent.fromRepo({ llm: null });
const llmJudge = createLlmJudgeFromEnv();
const results: CaseResult[] = [];

for (const testCase of parsed.cases) {
  const answer = await agent.answer(
    testCase.text,
    testCase.history !== undefined ? { history: testCase.history } : {},
  );
  const checks = evaluate(testCase, answer);
  const rubric = testCase.expected === 'in_scope' ? evaluateRubric(testCase, answer) : undefined;
  const judgeResult =
    llmJudge !== null && testCase.expected === 'in_scope'
      ? await llmJudge.judge({ question: testCase.text, answer })
      : null;
  if (rubric !== undefined) {
    checks.push({
      name: 'rubric_score',
      pass: rubric.score >= 0.66,
      detail: `direct=${rubric.directAnswer} actionable=${rubric.actionable} evidence=${rubric.evidence} score=${rubric.score.toFixed(2)}`,
    });
  }
  results.push({
    id: testCase.id,
    text: testCase.text,
    expected: testCase.expected,
    expectedNodes: testCase.expectedNodes ?? [],
    why: testCase.why,
    ...(testCase.source !== undefined ? { source: testCase.source } : {}),
    verdict: testCase.verdict ?? 'unreviewed',
    reviewNote: testCase.reviewNote ?? '',
    ...(answer.nodeId !== undefined ? { actualNode: answer.nodeId } : {}),
    confidence: answer.confidence,
    outOfScope: answer.outOfScope,
    passed: checks.every((check) => check.pass),
    checks,
    ...(rubric !== undefined ? { rubric } : {}),
    ...(judgeResult !== null ? { llmJudge: judgeResult } : {}),
    answer: answer.text,
    sources: answer.sources.map((source) => source.path),
  });
}

const passed = results.filter((result) => result.passed).length;
const total = results.length;
const byExpected = (['in_scope', 'needs_context', 'out_of_scope'] as const).map((expected) => {
  const subset = results.filter((result) => result.expected === expected);
  return {
    expected,
    total: subset.length,
    passed: subset.filter((result) => result.passed).length,
  };
});
const manual = {
  usable: results.filter((result) => result.verdict === 'usable').length,
  needsImprovement: results.filter((result) => result.verdict === 'needs_improvement').length,
  unreviewed: results.filter((result) => result.verdict === 'unreviewed').length,
};
const rubricResults = results.filter((result) => result.rubric !== undefined);
const rubricAverage =
  rubricResults.length === 0
    ? 0
    : rubricResults.reduce((sum, result) => sum + (result.rubric?.score ?? 0), 0) /
      rubricResults.length;
const llmResults = results.filter((result) => result.llmJudge !== undefined);
const llmAverage =
  llmResults.length === 0
    ? 0
    : llmResults.reduce((sum, result) => sum + (result.llmJudge?.score ?? 0), 0) /
      llmResults.length;

mkdirSync(outDir, { recursive: true });
const currentRun: HistoryEntry = {
  generatedAt: new Date().toISOString(),
  total,
  passed,
  passRate: total === 0 ? 0 : passed / total,
  manual,
  rubricAverage,
};
const history = appendHistory(historyPath, currentRun);
writeFileSync(resultsPath, `${results.map((result) => JSON.stringify(result)).join('\n')}\n`, 'utf8');
writeFileSync(
  summaryPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: parsed.source,
      note: parsed.note,
      total,
      passed,
      passRate: total === 0 ? 0 : passed / total,
      byExpected,
      manual,
      rubric: { average: rubricAverage, cases: rubricResults.length },
      llmJudge: { average: llmAverage, cases: llmResults.length },
      historyEntries: history.length,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

writeFileSync(
  reportPath,
  buildReport(parsed, results, passed, total, byExpected, manual, rubricAverage, history, llmAverage),
  'utf8',
);

console.log(`real-question eval: ${passed}/${total} passed`);
for (const group of byExpected) {
  console.log(`  ${group.expected}: ${group.passed}/${group.total}`);
}
console.log(
  `  manual: usable=${manual.usable}, needs_improvement=${manual.needsImprovement}, unreviewed=${manual.unreviewed}`,
);
console.log(`  rubric: average=${rubricAverage.toFixed(2)} over ${rubricResults.length} in-scope cases`);
if (llmResults.length > 0) console.log(`  llm judge: average=${llmAverage.toFixed(2)} over ${llmResults.length} cases`);
for (const failure of results.filter((result) => !result.passed)) {
  console.log(`\nFAIL ${failure.id} [${failure.expected}] ${failure.text.slice(0, 80)}`);
  for (const check of failure.checks.filter((item) => !item.pass)) {
    console.log(`  - ${check.name}: ${check.detail}`);
  }
}

const threshold = 0.75;
if (passed / total < threshold) {
  console.error(`\npass rate ${(passed / total).toFixed(2)} is below threshold ${threshold}`);
  process.exit(1);
}

function evaluateRubric(testCase: EvalCase, answer: ConsultAnswer): Rubric {
  const questionTerms = [
    ...new Set(
      tokenize(
        [testCase.text, ...(testCase.history ?? []).map((turn) => turn.text)].join(' '),
      ),
    ),
  ].filter((term) => term.length >= 2);
  const head = answer.text.slice(0, 700);
  const hits = questionTerms.filter((term) => head.includes(term)).length;
  const directAnswer = hits >= Math.min(2, questionTerms.length) ? 1 : 0;

  const actionSection = answer.text.split('【下一步】')[1]?.split('【')[0] ?? '';
  const actionLines = actionSection
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\./.test(line));
  const concrete = actionLines.filter((line) =>
    /node scripts\/|pnpm |跑|确认|写|建|记录|检查|先|不要|回执|task_id|落库|版本|核对|标|开启|添加|选|用|按|设置|配置|授权/.test(
      line,
    ),
  ).length;
  const actionable = actionLines.length >= 2 && concrete >= 2 ? 1 : 0;
  const evidence =
    answer.sources.length > 0 &&
    answer.sources.every((source) => existsSync(join(root, source.path)))
      ? 1
      : 0;

  const notes: string[] = [];
  if (directAnswer === 0) notes.push(`结论未覆盖问题关键词（命中 ${hits}/${questionTerms.length}）`);
  if (actionable === 0) notes.push(`可执行动作不足（${concrete}/${actionLines.length}）`);
  if (evidence === 0) notes.push('缺少可解析证据路径');

  return {
    directAnswer,
    actionable,
    evidence,
    score: (directAnswer + actionable + evidence) / 3,
    notes,
  };
}

function evaluate(testCase: EvalCase, answer: ConsultAnswer): Check[] {
  const checks: Check[] = [];
  const requiredSections = ['【结论】', '【定位】', '【下一步】', '【证据】'];
  const sourcesExist = answer.sources.every((source) => existsSync(join(root, source.path)));
  const lengthOk = answer.text.length <= 3400;

  if (testCase.expected === 'in_scope') {
    checks.push({
      name: 'not_out_of_scope',
      pass: !answer.outOfScope,
      detail: answer.outOfScope ? 'agent refused an in-scope question' : 'answered',
    });
    checks.push({
      name: 'expected_node',
      pass:
        (testCase.expectedNodes ?? []).length === 0 ||
        (answer.nodeId !== undefined && (testCase.expectedNodes ?? []).includes(answer.nodeId)),
      detail: `actual=${answer.nodeId ?? 'none'} expected=${(testCase.expectedNodes ?? []).join('/') || 'any'}`,
    });
    checks.push({
      name: 'answer_sections',
      pass: requiredSections.every((section) => answer.text.includes(section)),
      detail: `missing=${requiredSections.filter((section) => !answer.text.includes(section)).join(',') || 'none'}`,
    });
    checks.push({
      name: 'citations_exist',
      pass: answer.sources.length > 0 && sourcesExist,
      detail: answer.sources.length === 0 ? 'no sources' : sourcesExist ? 'ok' : 'one or more paths missing',
    });
    checks.push({ name: 'length', pass: lengthOk, detail: `${answer.text.length} chars` });
  }

  if (testCase.expected === 'out_of_scope') {
    checks.push({
      name: 'refused',
      pass: answer.outOfScope,
      detail: answer.outOfScope ? 'refused' : `answered with node=${answer.nodeId ?? 'none'}`,
    });
    checks.push({
      name: 'refusal_message',
      pass: answer.text.includes('不在当前能力图谱'),
      detail: answer.text.slice(0, 120),
    });
  }

  if (testCase.expected === 'needs_context') {
    const asksForContext =
      answer.outOfScope ||
      answer.confidence === 'low' ||
      /需要你补充|补充|上下文|没有数据|无法回答|不在当前能力图谱/.test(answer.text);
    checks.push({
      name: 'asks_for_context',
      pass: asksForContext,
      detail: `confidence=${answer.confidence} outOfScope=${answer.outOfScope} node=${answer.nodeId ?? 'none'}`,
    });
  }

  return checks;
}

function appendHistory(path: string, entry: HistoryEntry): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        entries.push(JSON.parse(line) as HistoryEntry);
      } catch {
        // A corrupt history line must not break the current eval.
      }
    }
  }
  entries.push(entry);
  const tail = entries.slice(-50);
  writeFileSync(path, `${tail.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8');
  return tail;
}

function buildReport(
  input: typeof parsed,
  results: CaseResult[],
  passed: number,
  total: number,
  byExpected: { expected: string; total: number; passed: number }[],
  manual: { usable: number; needsImprovement: number; unreviewed: number },
  rubricAverage: number,
  history: HistoryEntry[],
  llmAverage: number,
): string {
  const lines: string[] = [
    '# Main Agent Eval（真实问题 + 对抗/多轮）',
    '',
    `**生成时间**：${new Date().toISOString()}`,
    `**来源**：${input.source}`,
    `**说明**：${input.note}`,
    '',
    '## 结果',
    '',
    `- 总用例：${total}`,
    `- 自动化通过：${passed}`,
    `- 通过率：${(passed / total).toFixed(2)}`,
    `- 人工判定：可用 ${manual.usable} / 需改进 ${manual.needsImprovement} / 未审 ${manual.unreviewed}`,
    `- Rubric 均分（in-scope）：${rubricAverage.toFixed(2)}（直接回答 / 可执行动作 / 证据，各 0–1）`,
    `- LLM judge 均分：${llmAverage > 0 ? llmAverage.toFixed(2) : '未启用（需要 MAIN_AGENT_JUDGE=llm + API key）'}`,
    '',
    '| 类别 | 自动化通过 / 总数 |',
    '|---|---|',
    ...byExpected.map((group) => `| ${group.expected} | ${group.passed} / ${group.total} |`),
    '',
    '## 历史',
    '',
    '| 时间 | 用例 | 自动通过 | 人工可用 | 需改进 | Rubric |',
    '|---|---|---|---|---|---|',
    ...history.slice(-10).map(
      (item) =>
        `| ${item.generatedAt.slice(0, 19)} | ${item.total} | ${item.passed} | ${item.manual.usable} | ${item.manual.needsImprovement} | ${item.rubricAverage.toFixed(2)} |`,
    ),
    '',
    '## 逐条结果',
    '',
    '| ID | 问题 | 期望 | 实际节点 | 置信度 | 自动 | Rubric | LLM | 人工 |',
    '|---|---|---|---|---|---|---|---|---|',
    ...results.map(
      (result) =>
        `| ${result.id} | ${escapeCell(result.text)} | ${result.expected} | ${result.actualNode ?? '—'} | ${result.confidence} | ${result.passed ? '✅' : '❌'} | ${result.rubric === undefined ? '—' : result.rubric.score.toFixed(2)} | ${result.llmJudge === undefined ? '—' : result.llmJudge.score.toFixed(2)} | ${result.verdict === 'usable' ? '可用' : result.verdict === 'needs_improvement' ? '需改进' : '未审'} |`,
    ),
    '',
  ];

  const needsImprovement = results.filter((result) => result.verdict === 'needs_improvement');
  if (needsImprovement.length > 0) {
    lines.push('## 人工判定：需要改进', '');
    for (const item of needsImprovement) {
      lines.push(`### ${item.id}`, '', `**问题**：${item.text}`, '', `**判定**：${item.reviewNote}`, '');
    }
  }

  const failures = results.filter((result) => !result.passed);
  if (failures.length > 0) {
    lines.push('## 未通过项', '');
    for (const failure of failures) {
      lines.push(`### ${failure.id}`, '', `**问题**：${failure.text}`, '', `**为什么重要**：${failure.why}`, '');
      for (const check of failure.checks.filter((item) => !item.pass)) {
        lines.push(`- ❌ \`${check.name}\`：${check.detail}`);
      }
      lines.push('', '**回答摘录**：', '```text', failure.answer.slice(0, 700), '```', '');
    }
  }

  lines.push(
    '## 读法',
    '',
    '- `in_scope`：必须回答、必须命中预期节点、必须有可解析的证据路径。',
    '- `needs_context`：必须承认缺少上下文，或明确拒答；高置信度硬答算失败。',
    '- `out_of_scope`：必须拒答，不能拿一个相邻节点硬套。',
    '- Rubric 是确定性代理：直接回答（问题词覆盖）、可执行动作（命令/动作数）、证据路径；不是 LLM judge，只做趋势和预警。',
    '- 人工判定才是质量信号；自动通过不等于可用。',
    '- 这是真实群消息的第一版样本，不是完整 benchmark；新增问题应继续追加，不要为了变绿而删除失败项。',
    '',
  );

  return lines.join('\n');
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 100);
}
