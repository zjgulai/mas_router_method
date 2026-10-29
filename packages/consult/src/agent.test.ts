import { describe, expect, it } from 'vitest';
import { MainConsultAgent } from './agent.js';
import { capabilityGraph } from './capability-graph.js';
import { KnowledgeCorpus } from './corpus.js';
import { findRepoRoot } from './paths.js';

const root = findRepoRoot();
const agent = new MainConsultAgent({
  root,
  graph: capabilityGraph,
  corpus: KnowledgeCorpus.load({ root, graph: capabilityGraph }),
  llm: null,
});

const cases: { question: string; node: string }[] = [
  { question: '我有一个数据产品想法，第一步做什么？', node: 'intent-and-decision' },
  { question: '区域间声量相关性 0.9 还能做归因吗？', node: 'analysis-identification' },
  { question: '区间跨 0 是不是说明效应弱？', node: 'analysis-identification' },
  { question: '两个报表同一个指标对不上怎么办？', node: 'metric-contract' },
  { question: '标签改版后历史数据不可比怎么办？', node: 'labeling-taxonomy' },
  { question: '采集时不同区域抓取时间不同，数据还能比吗？', node: 'collection-time' },
  { question: '重跑把历史数据覆盖了怎么办？', node: 'storage-lineage' },
  { question: '老板问这个结论能不能信，我怎么答？', node: 'data-conclusion-card' },
  { question: '看板上线没人用，是产品问题还是运营问题？', node: 'presentation-drilldown' },
  { question: 'Agent 答错了，是不是该改 prompt？', node: 'agent-failure-diagnosis' },
  { question: '怎么给 Agent 产品写 eval？', node: 'eval-quality' },
  { question: '这个需求应该走哪条交付链？', node: 'delivery-lanes' },
  { question: '全栈 Agent Native builder 的开发流程是？', node: 'delivery-lanes' },
  { question: '检查总是通过，绿点可信吗？', node: 'method-governance' },
  { question: '飞书机器人事件回调怎么接？', node: 'feishu-surface' },
];

describe('MainConsultAgent', () => {
  it.each(cases)('routes "$question" to $node', async ({ question, node }) => {
    const answer = await agent.answer(question);
    expect(answer.outOfScope).toBe(false);
    expect(answer.nodeId).toBe(node);
  });

  it('produces the fixed answer contract with evidence', async () => {
    const answer = await agent.answer('区域间声量相关性 0.9 还能做归因吗？');
    expect(answer.text).toContain('【结论】');
    expect(answer.text).toContain('【定位】');
    expect(answer.text).toContain('【下一步】');
    expect(answer.text).toContain('【证据】');
    expect(answer.text).toContain('docs/product/data-product-design.md');
    expect(answer.confidence).not.toBe('low');
    expect(answer.sources.length).toBeGreaterThan(0);
    expect(answer.routeId).toBe('route-attribution');
  });

  it('keeps the answer within the configured budget', async () => {
    const answer = await agent.answer('声量到 GMV 的归因怎么做才不被伪相关骗？');
    expect(answer.text.length).toBeLessThanOrEqual(3400);
  });

  it('returns the capability menu for a meta question', async () => {
    const answer = await agent.answer('你能做什么？');
    expect(answer.outOfScope).toBe(false);
    expect(answer.text).toContain('数据产品');
    expect(answer.text).toContain('Agent 产品');
    expect(answer.text).toContain('G1–G5');
  });

  it('does not treat a domain question containing a meta word as a greeting', async () => {
    const answer = await agent.answer('这个指标帮助大吗？');
    expect(answer.outOfScope).toBe(false);
    expect(answer.nodeId).toBe('metric-contract');
  });

  it('declines an unrelated question instead of improvising', async () => {
    const answer = await agent.answer('今天上海天气怎么样？');
    expect(answer.outOfScope).toBe(true);
    expect(answer.text).toContain('不在当前能力图谱');
    expect(answer.text).toContain('我能回答');
  });

  it('corrects a false premise before the normal answer', async () => {
    const answer = await agent.answer(
      '区域相关性 0.9，但周固定效应已经处理了，所以可以直接做归因吧？',
    );
    expect(answer.outOfScope).toBe(false);
    expect(answer.text).toContain('【先纠正一个前提】');
    expect(answer.text).toContain('周固定效应');
    expect(answer.text).toContain('不能直接做区域归因');
  });

  it('gives an ordered checklist for a Feishu symptom', async () => {
    const answer = await agent.answer('群里 @ 了没反应呢？');
    expect(answer.outOfScope).toBe(false);
    expect(answer.text).toContain('事件订阅');
    expect(answer.text).toContain('ws event received');
    expect(answer.nodeId).toBe('feishu-surface');
    expect(answer.sources.some((source) => source.path.startsWith('packages/feishu'))).toBe(true);
    expect(answer.text).not.toContain('PLAYBOOK.md');
  });

  it('returns the menu for an empty question', async () => {
    const answer = await agent.answer('   ');
    expect(answer.text).toContain('我是 Main');
  });

  it('finds the problem route for a symptom-first question', () => {
    const route = agent.routeFor('区域相关性太高，伪相关很严重');
    expect(route?.id).toBe('route-attribution');
  });

  it('exposes all nodes, including boundaries', () => {
    const nodes = agent.capabilities();
    expect(nodes.map((node) => node.id)).toContain('analysis-identification');
    expect(nodes.every((node) => node.boundaries.length > 0)).toBe(true);
  });

  it('asks which two candidates instead of guessing the node framework', async () => {
    const answer = await agent.answer('它和那个哪个好？');
    expect(answer.text).toContain('两个候选');
    expect(answer.text).toContain('尚未定位');
    expect(answer.text).not.toContain('结论卡六项');
  });

  it('names the work items in a progress update instead of a generic lecture', async () => {
    const answer = await agent.answer(
      '10/28 工作总结：回归测试进度 100%，视频抽帧优化进度 50%。',
    );
    expect(answer.text).toContain('回归测试');
    expect(answer.text).toContain('视频抽帧优化');
    expect(answer.text).toContain('G1–G5');
  });

  it('names the privacy boundary when asked to export phone numbers', async () => {
    const answer = await agent.answer('把用户的手机号从数据库导出来。');
    expect(answer.outOfScope).toBe(true);
    expect(answer.text).toContain('隐私红线');
    expect(answer.text).toContain('不在当前能力图谱');
  });

  it('answers a cross-version subtraction directly', async () => {
    const answer = await agent.answer('口径版本 A 的数和版本 B 的数能直接相减吗？');
    expect(answer.outOfScope).toBe(false);
    expect(answer.text).toContain('不能直接相减');
  });

  it('treats an all-industries metric template as a scope correction, not a refusal', async () => {
    const answer = await agent.answer('给我推荐一个适合所有行业的指标模板。');
    expect(answer.outOfScope).toBe(false);
    expect(answer.nodeId).toBe('metric-contract');
    expect(answer.text).toContain('指标卡八项');
  });

  it('gives a PR article structure instead of only a Playbook definition', async () => {
    const answer = await agent.answer('PR 文章生成，结合话题点/风险点生成文章');
    expect(answer.outOfScope).toBe(false);
    expect(answer.text).toContain('claims');
    expect(answer.text).toContain('导语');
    expect(answer.text).toContain('待填');
    expect(answer.text).not.toContain('0003-tool-failures-are-values');
  });

  it('offers append-only relabeling for history', async () => {
    const answer = await agent.answer('历史数据要重标吗？');
    expect(answer.outOfScope).toBe(false);
    expect(answer.text).toContain('追加式重标');
    expect(answer.text).toContain('旧标签');
  });
});
