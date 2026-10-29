import type {
  CapabilityGraph,
  CapabilityNode,
  Confidence,
  ConsultAnswer,
  ConsultStep,
  RetrievedChunk,
  SourceRef,
} from './types.js';
import { tokenize } from './tokenize.js';

export interface AnswerOptions {
  maxChars?: number;
  /** Include the related-node footer. Defaults to true. */
  includeRelated?: boolean;
}

export interface Classification {
  node?: CapabilityNode;
  score: number;
  confidence: Confidence;
  meta: boolean;
  outOfScope: boolean;
  /** Domain-adjacent, but needs project-specific context the agent does not have. */
  needsContext: boolean;
  reason: string;
}

const PROJECT_OPS_PATTERNS = [
  '周报',
  '日报',
  '工作日总结',
  '会议室',
  '拉的会',
  '谁拉的',
  '谁跟进',
  '任务是需要我跟进',
  '陈小花',
  'OGSM',
  'meltwater',
  'Nowledge Mem',
  '工具怎么选',
  '预期什么时候',
  '二期优化 todo',
  '社媒的二期优化',
];

const CONTEXTUAL_PATTERNS = [
  '文档在哪里看',
  '表格存',
  '落多维表格',
  '关注的趋势',
  '无法点击',
  '全渠道舆情',
  'PR 这个 agent',
  '之前不是做',
  '项目进度',
  '红人还要写入',
  '更像个看板',
  '目标我大概写',
  '复核下',
  '本周进度',
  '总体进度',
  '拓展到欧洲',
  'AI 视频生成',
  '多一个流程',
  'PR 的部分',
  '按照之前的记录',
];

const META_PATTERNS = [
  '你能做什么',
  '能回答什么',
  '能力清单',
  '怎么用',
  '你是谁',
  '帮助',
  '菜单',
  'hello',
  'hi',
  '你好',
  '在吗',
  '介绍一下自己',
];

const FAMILY_LABEL: Record<CapabilityNode['family'], string> = {
  navigation: '能力导航',
  'data-product': '数据产品',
  'agent-product': 'Agent 产品',
  delivery: '交付与治理',
  surface: '飞书入口',
};

export function classifyQuestion(
  question: string,
  graph: CapabilityGraph,
  retrieved: RetrievedChunk[],
): Classification {
  const q = question.trim().toLowerCase();
  const qTokens = new Set(tokenize(question));

  let best: { node: CapabilityNode; score: number } | undefined;

  for (const node of graph.nodes) {
    let score = 0;

    for (const keyword of node.keywords) {
      if (!q.includes(keyword.toLowerCase())) continue;
      // Two-character words like "需求" are common; longer phrases are more
      // specific. Weighting by length prevents a broad node from swallowing every
      // question that mentions a generic noun.
      score += keyword.length <= 2 ? 2.5 : 5 + Math.min(keyword.length, 10) / 3;
    }

    for (const alias of node.aliases) {
      if (!q.includes(alias.toLowerCase())) continue;
      score += alias.length <= 2 ? 0.8 : 1.6;
    }

    for (const canonical of node.questions) {
      const overlap = jaccard(qTokens, new Set(tokenize(canonical)));
      if (overlap > 0.15) score += overlap * 6;
    }

    // Evidence boost is capped per source file. Without the cap, a node that
    // cites `matrix.json` inherits a little score from every matrix cell and
    // starts winning questions it has nothing to do with.
    const seenPaths = new Set<string>();
    for (const item of retrieved) {
      if (item.chunk.kind === 'capability') continue;
      if (!node.sources.some((source) => source.path === item.chunk.path)) continue;
      if (seenPaths.has(item.chunk.path)) continue;
      seenPaths.add(item.chunk.path);
      score += Math.min(item.score, 4) * 0.15;
    }

    if (q.includes(node.title.toLowerCase())) score += 7;

    if (best === undefined || score > best.score) best = { node, score };
  }

  const domainHits = countDomainHits(q, graph);
  const strongDomainHits = countStrongDomainHits(q, graph);
  const topRetrieval = retrieved[0];
  const projectOps = matchesPatterns(q, PROJECT_OPS_PATTERNS);
  const contextual = matchesPatterns(q, CONTEXTUAL_PATTERNS);
  const meta =
    domainHits === 0 &&
    isMeta(q) &&
    (best === undefined || best.node.family === 'navigation' || best.score < 8);
  const outOfScope = !meta && (domainHits === 0 || (projectOps && strongDomainHits === 0));
  const needsContext = !meta && !outOfScope && contextual;

  let confidence: Confidence = 'low';
  if (best !== undefined) {
    if (best.score >= 9 || (best.score >= 5.5 && (topRetrieval?.coverage ?? 0) >= 0.4)) {
      confidence = 'high';
    } else if (best.score >= 4.5) {
      confidence = 'medium';
    }
  }
  if (needsContext) confidence = 'low';

  const reason =
    best === undefined
      ? 'no node matched'
      : `node=${best.node.id} score=${best.score.toFixed(2)} domainHits=${domainHits} strongHits=${strongDomainHits} projectOps=${projectOps} needsContext=${needsContext} top=${topRetrieval?.chunk.path ?? 'none'}`;

  return {
    ...(best !== undefined ? { node: best.node } : {}),
    score: best?.score ?? 0,
    confidence,
    meta,
    outOfScope,
    needsContext,
    reason,
  };
}

function matchesPatterns(question: string, patterns: string[]): boolean {
  return patterns.some((pattern) => question.includes(pattern.toLowerCase()));
}

function countStrongDomainHits(question: string, graph: CapabilityGraph): number {
  let hits = 0;
  for (const node of graph.nodes) {
    if (node.family === 'navigation') continue;
    for (const term of [...node.keywords, ...node.aliases]) {
      // Two-character terms are too generic to override a project-ops guard.
      if (term.length < 3) continue;
      if (question.includes(term.toLowerCase())) hits += 1;
    }
  }
  return hits;
}

function countDomainHits(question: string, graph: CapabilityGraph): number {
  let hits = 0;
  for (const node of graph.nodes) {
    if (node.family === 'navigation') continue;
    for (const term of [...node.keywords, ...node.aliases]) {
      if (term.length < 2) continue;
      if (question.includes(term.toLowerCase())) hits += 1;
    }
  }
  return hits;
}

export function composeAnswer(
  question: string,
  graph: CapabilityGraph,
  retrieved: RetrievedChunk[],
  classification: Classification,
  options: AnswerOptions = {},
): ConsultAnswer {
  const maxChars = options.maxChars ?? 3400;
  const steps: ConsultStep[] = [
    { name: 'classify', detail: classification.reason },
    {
      name: 'retrieve',
      detail: retrieved
        .slice(0, 4)
        .map((item) => `${item.chunk.path}#${item.chunk.heading}`)
        .join(' | '),
    },
  ];

  if (classification.meta) {
    const text = buildMenu(graph);
    steps.push({ name: 'compose', detail: 'capability menu' });
    return {
      text,
      confidence: 'high',
      sources: menuSources(graph),
      retrieved,
      steps,
      outOfScope: false,
    };
  }

  if (classification.outOfScope || classification.node === undefined) {
    const text = buildOutOfScope();
    steps.push({ name: 'compose', detail: 'out of scope' });
    return {
      text,
      confidence: 'low',
      sources: [],
      retrieved,
      steps,
      outOfScope: true,
    };
  }

  const node = classification.node;
  const preferredPaths = new Set(node.sources.map((source) => source.path));
  const snippets = extractSnippets(question, retrieved, 4, preferredPaths);
  const sourceRefs = mergeSources(node.sources, retrieved);

  const sections: string[] = [];
  if (classification.needsContext) {
    sections.push(
      '【结论】\n这需要你们项目里的具体记录；我无法仅凭这句话判断。先确认：是哪份文档、哪张表、哪个环境，以及你已经看到的现象。',
    );
    sections.push(`【定位】\n${node.title}（${FAMILY_LABEL[node.family]}）`);
    sections.push(
      '【需要你补充】\n我这边没有你们的文档、表格、代码或决策历史。请补充上面三项；没有记录时，正确状态是「未运行/无法判断」，不是「通过」。',
    );
    sections.push(`【可用的判断框架】\n${node.summary}`);
  } else {
    sections.push(`【结论】\n${node.summary}`);
    sections.push(`【定位】\n${node.title}（${FAMILY_LABEL[node.family]}）`);
  }

  if (snippets.length > 0) {
    sections.push(
      `【依据】\n${snippets
        .slice(0, 3)
        .map((snippet) => `- ${snippet.text}${snippet.path ? `（${snippet.path}）` : ''}`)
        .join('\n')}`,
    );
  }

  const actions = node.actions.slice(0, 6);
  sections.push(
    `【下一步】\n${actions.map((action, index) => `${index + 1}. ${action}`).join('\n')}`,
  );

  if (node.boundaries.length > 0) {
    sections.push(
      `【边界】\n${node.boundaries
        .slice(0, 3)
        .map((boundary) => `- ${boundary}`)
        .join('\n')}`,
    );
  }

  if (sourceRefs.length > 0) {
    sections.push(
      `【证据】\n${sourceRefs
        .slice(0, 4)
        .map((source) => `- ${source.path}${source.heading ? ` §${source.heading}` : ''}`)
        .join('\n')}`,
    );
  }

  if (classification.confidence === 'low') {
    sections.push(
      '【需要你补充】\n我先按最接近的能力节点回答。如果不对，请补充：你在哪一层（采集/指标/分析/结论/报告），以及你已经跑过哪个检查。',
    );
  }

  if (options.includeRelated !== false && node.related.length > 0) {
    const related = node.related
      .map((id) => graph.nodes.find((item) => item.id === id))
      .filter((item): item is CapabilityNode => item !== undefined)
      .slice(0, 2)
      .map((item) => item.title)
      .join('；');
    if (related.length > 0) sections.push(`【还可以看】\n${related}`);
  }

  const text = trimTo(sections, maxChars);
  steps.push({ name: 'compose', detail: `node=${node.id}; snippets=${snippets.length}` });

  return {
    text,
    nodeId: node.id,
    confidence: classification.confidence,
    sources: sourceRefs,
    retrieved,
    steps,
    outOfScope: false,
  };
}

export function buildMenu(graph: CapabilityGraph): string {
  const groups: { title: string; nodeIds: string[] }[] = [
    {
      title: '数据产品（8 层 × 3 柱）',
      nodeIds: [
        'intent-and-decision',
        'metric-contract',
        'collection-time',
        'analysis-identification',
        'reporting-falsification',
      ],
    },
    {
      title: 'Agent Native builder（7 阶段）',
      nodeIds: ['agent-playbook', 'eval-quality', 'agent-failure-diagnosis'],
    },
    { title: '交付与治理', nodeIds: ['delivery-lanes', 'method-governance'] },
    { title: '飞书入口', nodeIds: ['feishu-surface'] },
  ];

  const lines: string[] = [
    '我是 Main，当前项目的能力图谱咨询 Agent。',
    '',
    '我不是通用聊天机器人。我把问题定位到三条轴之一，再给判断、下一步和证据：',
    '- 数据产品：采集 → 存储 → 打标 → 指标 → 分析 → 呈现 → 结论 → 报告，外加口径/质量/血缘三根柱子。',
    '- Agent 产品：想法 → 设计 → 能跑 → 能判断 → 能交付 → 能运营 → 能复用。',
    '- 交付：Incident / Exploration / Capability / Fast 四车道，G1–G5 五道硬门。',
    '',
    '你可以直接这样问：',
  ];

  for (const group of groups) {
    lines.push(`【${group.title}】`);
    for (const id of group.nodeIds) {
      const node = graph.nodes.find((item) => item.id === id);
      const question = node?.questions[0];
      if (question !== undefined) lines.push(`- ${question}`);
    }
  }

  lines.push('');
  lines.push('也可以描述症状，例如“区域相关性 0.9，还能做归因吗”“标签改版后历史数据不可比”。');
  lines.push('回答会带证据路径；仓库里没有依据时我会明说。');

  return lines.join('\n');
}

export function buildOutOfScope(): string {
  return [
    '【结论】',
    '这个问题不在当前能力图谱的范围内。',
    '',
    '【我能回答】',
    '- 数据产品：需求/结论、指标口径、采集时滞、血缘、打标版本、面板识别、呈现下钻、证伪报告。',
    '- Agent 产品：Playbook、eval、工具契约、失败诊断、上线与回滚。',
    '- 交付与治理：四车道、G1–G5、检查器与假绿。',
    '- 飞书入口：事件回调、群聊问答、权限与长连接。',
    '',
    '【你可以这样问】',
    '- 我有一个数据产品想法，第一步做什么？',
    '- 声量到 GMV 的归因怎么做才不被伪相关骗？',
    '- 标签改版后历史数据不可比怎么办？',
    '- Agent 答得不对，是不是该改 prompt？',
    '',
    '如果你问的是业务数据本身（某个品牌上周卖了多少），我这边没有数据源，无法回答。',
  ].join('\n');
}

interface Snippet {
  text: string;
  path: string;
}

function extractSnippets(
  question: string,
  retrieved: RetrievedChunk[],
  limit: number,
  preferredPaths: Set<string> = new Set(),
): Snippet[] {
  const queryTokens = new Set(tokenize(question));
  const candidates: { text: string; path: string; score: number }[] = [];

  for (const item of retrieved) {
    if (item.chunk.kind === 'capability') continue;
    // The capability-graph document quotes example questions, so it matches
    // almost everything. It is a map, not evidence; exclude it from quotations.
    if (item.chunk.path === 'docs/product/main-agent-capability-graph.md') continue;
    const headingParts = item.chunk.heading
      .split(' > ')
      .map((part) => cleanMarkdown(part))
      .filter((part) => part.length > 0);
    const units = splitUnits(item.chunk.text);
    for (const unit of units) {
      const cleaned = cleanMarkdown(unit);
      if (cleaned.length < 12 || cleaned.length > 320) continue;
      if (/^\|?[\s:|-]+\|?$/.test(cleaned)) continue;
      if (cleaned.startsWith('#')) continue;
      if (headingParts.includes(cleaned)) continue;

      const unitTokens = new Set(tokenize(cleaned));
      const overlap = jaccard(queryTokens, unitTokens);
      const headingHit = headingParts.some(
        (part) => part.length >= 2 && question.toLowerCase().includes(part),
      );
      const preferred = preferredPaths.has(item.chunk.path) ? 2.2 : 0;
      const kindBonus = item.chunk.kind === 'document' ? 0.6 : 0;
      const score =
        overlap * 10 +
        (headingHit ? 1.5 : 0) +
        preferred +
        kindBonus +
        Math.min(item.score, 6) * 0.15;
      if (overlap === 0 && !headingHit && preferred === 0) continue;
      candidates.push({ text: truncate(cleaned, 260), path: item.chunk.path, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const out: Snippet[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.text.slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: candidate.text, path: candidate.path });
    if (out.length >= limit) break;
  }
  return out;
}

function splitUnits(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let paragraph = '';

  const flushParagraph = (): void => {
    const value = paragraph.trim();
    paragraph = '';
    if (value.length === 0) return;
    if (value.length <= 300) {
      out.push(value);
      return;
    }
    for (const sentence of value.split(/(?<=[。！？；])|(?<=[.!?])\s+/)) {
      const trimmed = sentence.trim();
      if (trimmed.length > 0) out.push(trimmed);
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trim();
    if (line.length === 0) {
      flushParagraph();
      continue;
    }
    if (line.startsWith('#')) {
      flushParagraph();
      continue;
    }

    // Collapse a Markdown table into one unit. A lone header row ("| 判定 | 动作 |")
    // is not evidence; the rows beneath it are.
    if (line.startsWith('|')) {
      flushParagraph();
      const rows: string[] = [];
      let j = i;
      while (j < lines.length && (lines[j] ?? '').trim().startsWith('|')) {
        const row = (lines[j] ?? '').trim();
        if (!/^\|?[\s:|-]+\|?$/.test(row)) rows.push(row);
        j += 1;
      }
      if (rows.length > 0) out.push(rows.slice(0, 5).join(' / '));
      i = j - 1;
      continue;
    }

    if (/^([-*+]|\d+\.)\s+/.test(line)) {
      flushParagraph();
      paragraph = line;
      continue;
    }

    paragraph = paragraph.length === 0 ? line : joinSmart(paragraph, line);
  }
  flushParagraph();

  return out;
}

function joinSmart(left: string, right: string): string {
  const last = left.slice(-1);
  const first = right.slice(0, 1);
  if (isCjk(last) && isCjk(first)) return `${left}${right}`;
  return `${left} ${right}`;
}

function isCjk(char: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(char);
}

function cleanMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeSources(nodeSources: SourceRef[], retrieved: RetrievedChunk[]): SourceRef[] {
  const out: SourceRef[] = [];
  const seen = new Set<string>();

  const add = (source: SourceRef): void => {
    // One line per file keeps the evidence list readable. The heading is the
    // first (most relevant) one we encountered; repeating the same file three
    // times does not add evidence.
    if (seen.has(source.path)) return;
    seen.add(source.path);
    out.push(source);
  };

  for (const source of nodeSources) add(source);
  for (const item of retrieved.slice(0, 6)) {
    if (item.chunk.path === 'docs/product/main-agent-capability-graph.md') continue;
    add({
      path: item.chunk.path,
      ...(item.chunk.heading.length > 0 ? { heading: item.chunk.heading } : {}),
    });
  }
  return out;
}

function menuSources(graph: CapabilityGraph): SourceRef[] {
  return graph.nodes
    .filter((node) => node.family === 'navigation')
    .flatMap((node) => node.sources)
    .slice(0, 4);
}

function trimTo(sections: string[], maxChars: number): string {
  let text = sections.join('\n\n');
  if (text.length <= maxChars) return text;

  // Drop the optional footer first, then shorten evidence, boundaries, and actions
  // in that order. The conclusion and the next action are the last things to go.
  const withoutRelated = sections.filter((section) => !section.startsWith('【还可以看】'));
  text = withoutRelated.join('\n\n');
  if (text.length <= maxChars) return text;

  const shortened = withoutRelated
    .map((section) => {
      if (section.startsWith('【证据】')) {
        return section.split('\n').slice(0, 4).join('\n');
      }
      if (section.startsWith('【边界】')) {
        return section.split('\n').slice(0, 3).join('\n');
      }
      if (section.startsWith('【下一步】')) {
        return section.split('\n').slice(0, 5).join('\n');
      }
      return section;
    })
    .join('\n\n');
  if (shortened.length <= maxChars) return shortened;

  return `${shortened.slice(0, Math.max(0, maxChars - 20))}\n…（内容已截断）`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function isMeta(question: string): boolean {
  return META_PATTERNS.some((pattern) => question.includes(pattern));
}
