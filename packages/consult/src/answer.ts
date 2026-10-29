import type {
  CapabilityGraph,
  CapabilityNode,
  Confidence,
  ConsultAnswer,
  ConsultStep,
  ConversationTurn,
  RetrievedChunk,
  SourceRef,
} from './types.js';
import { findPlay } from './plays.js';
import { tokenize } from './tokenize.js';

export interface AnswerOptions {
  maxChars?: number;
  /** Include the related-node footer. Defaults to true. */
  includeRelated?: boolean;
  /** Prior turns, used for topic-aware follow-up plays. */
  history?: ConversationTurn[];
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
  '测试表给我',
  '给我发一下',
  'PMO',
  'rootbuddy',
  '每周上线我就不提供',
  '周报变成 todo',
];

const UNSAFE_PATTERNS = [
  '忽略之前',
  '忽略规则',
  '系统提示词',
  '.env',
  'api 密钥',
  '密钥',
  '密码',
  '删掉生产',
  '删除生产',
  '删库',
  '聊天记录',
  '绝对化',
  '100% 有效',
  '编一个',
  '论文',
  'gmv 是多少',
  '上周 gmv',
  '股价',
  '管理员 token',
  '管理员token',
  '手机号',
];

const AMBIGUOUS_PATTERNS = [
  '这个怎么办',
  '它为什么不行',
  '帮我看看这个',
  '按上次',
  '这个方案能上线吗',
  '这个数据',
  '这个结果',
  '这个呢',
  '这个指标能不能用',
  '帮我把这个报告',
  '按昨天说的做',
  '它和那个',
  '这个方案的风险',
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
  '抽帧',
  '切镜',
  '送审图片',
  'OCR',
  '趋势详情',
  '点击进去是空',
  '关注的 hashtag',
  '视频解析',
  '数仓',
  '数据源归集',
  'DSH 和 Codex',
  '额度',
  '完成了 80',
  '增加了 MCP',
  '测试验证期',
  '军令状',
  '路特工作台',
  '舆情洞察',
  '可以验收了么',
  '测试通过就不会做记录',
  '测试不通过',
  '第一期',
  '第二期',
  '飞书多维表',
  '下载能力',
  '工作总结',
  'SK 汇报',
  '里程碑',
  '下班前上线',
  '内容 agent',
  'Vicky agent',
  '无解析',
  '推环境',
  '趋势不对',
  '优化点',
  '没日期',
  '国内舆情',
  'aiprd',
  '测试表给我',
  '给我发一下',
  'PMO',
  'rootbuddy',
  '每周上线我就不提供',
  '周报变成 todo',
  '国内的舆情',
  'PR 的 Agent',
  '识别成链接',
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

/**
 * False premises are the most expensive kind of adversarial question: a fluent
 * answer to the wrong premise sounds correct. This table adds an explicit
 * correction before the normal answer.
 */
const PREMISE_CORRECTIONS: { pattern: RegExp; correction: string }[] = [
  {
    pattern: /周固定效应.*(处理|解决|吸收).*(归因|识别|相关)/,
    correction:
      '周固定效应吸收的是共同趋势，不能救区域间高相关；§七 的 >0.8 门禁仍然成立，不能直接做区域归因。',
  },
  {
    pattern: /(声量.*GMV|GMV.*声量).*(涨|上升|相关).*(因果)/,
    correction:
      '相关不等于因果。C1–C3 是关联，只有 C4（预算边际回报）才接近因果；需要预算数据与识别策略。',
  },
  {
    pattern: /should_fail.*90|90\s*%.*should_fail/,
    correction: 'should_fail 必须 100% 拒绝；90% 通过等于护栏已经失效。',
  },
  {
    pattern: /(10\s*条|十条).*(70\s*%|稳定).*(上线|可信)/,
    correction: '10 条样本只能做方向性判断，不能证明稳定；先记录样本量、判定标准和基线。',
  },
  {
    pattern: /旧数据.*(重算|覆盖).*(口径|统一)/,
    correction: '口径变更时旧数据不重算；新增版本并在数字旁显示版本差异。',
  },
  {
    pattern: /0\.9.*(相关|相关性).*(证明|说明).*(有效|投放)/,
    correction: '相关性不能证明投放有效；需要控制变量与因果识别设计（C4 才接近因果）。',
  },
  {
    pattern: /0\.5\s*[–-]\s*0\.8.*(成立|识别成功|可以直接做)/,
    correction: '0.5–0.8 是边界带，不是识别成立；只能给有限结论并标注“有效变异有限”。',
  },
  {
    pattern: /删.*(should_fail|失败样例)|删掉.*样例.*eval/,
    correction: '删失败样例是造假；只能修 case、补基线，或明确降级结论。',
  },
  {
    pattern: /删掉.*旧结论|旧结论.*删掉/,
    correction: '旧结论不能删；应转 superseded，并新增结论说明为什么推翻。',
  },
  {
    pattern: /denominator.*(调小|改小)|分母.*(调小|改小)/,
    correction: '分母不能为了好看调整；口径必须可解释，并加分母异常检测。',
  },
  {
    pattern: /证伪条件.*如果结论错|如果结论错.*证伪/,
    correction: '证伪条件必须是可执行的函数/检查，不能写成“如果结论错了”。',
  },
];

function correctionFor(question: string): string | undefined {
  return PREMISE_CORRECTIONS.find((item) => item.pattern.test(question))?.correction;
}

interface Clarification {
  conclusion: string;
  ask: string;
  steps: string[];
  /** The node framework is off-topic when the node was only a guess. */
  framework?: boolean;
}

function progressItems(question: string): string[] {
  return question
    .split(/[，,；;。]/)
    .map((part) => part.replace(/^[^:：]*[:：]/, ''))
    .map((part) =>
      part
        .replace(/\d{1,3}\s*%/g, '')
        .replace(/进度|完成了?|完成度|目前/g, '')
        .trim(),
    )
    .filter((part) => part.length >= 2 && part.length <= 18);
}

/**
 * A generic "give me the document/table/environment" reply is useless when the
 * user asked which of two things is better, or said "do what we discussed
 * yesterday". Pick the clarification that matches the missing context, and give
 * steps that collect it instead of the guessed node's actions.
 */
function clarifyFor(question: string): Clarification {
  if (
    /(几个点|三个点|红人|达人|看板|dashboard)[^。！？]{0,30}(写进来|写入|放进来|复核)|目标[^。！？]{0,10}(复核|看一下)/.test(
      question,
    )
  ) {
    return {
      conclusion: '你问了多个点；前两个能按方法判断，第三个需要目标草稿。',
      ask: [
        '红人/达人：是否写入，看它是否改变决策动作；只是素材或展示，不写入。',
        '看板型 agent：只展示、不产生动作，不写入 Playbook；有明确动作才写入。',
        '目标：把草稿贴出来，我按“目标/用户/边界/质量门槛/非目标”逐项复核。',
      ].join('\n'),
      steps: [
        '把最终版文档或目标草稿贴出来。',
        '列出要复核的 2–3 项（红人/看板/目标）。',
        '我按 Playbook 的目标、用户、边界、质量门槛、非目标逐项过。',
      ],
      framework: true,
    };
  }
  if (/(按上次|上次那个|按昨天|昨天说的|按那个来|照上次)/.test(question)) {
    return {
      conclusion: '我没有你们上次/昨天的上下文，不能凭这句话直接执行。',
      ask: '把上次那条消息或文档链接贴出来，或复述要做的那一件事；我按同一目标继续，不猜。',
      steps: [
        '贴出上次那条消息或文档链接。',
        '用一句话复述要做的事和目标。',
        '我按同一目标继续，不补编上下文。',
      ],
      framework: false,
    };
  }
  if (/(它和那个|这个和那个|那个更好|哪个好|选哪个)/.test(question)) {
    return {
      conclusion: '这句话缺少指代，我无法判断“它”和“那个”分别是什么。',
      ask: '先给我两个候选名称（或两条消息、两个文档链接）和比较维度（效果/成本/风险/可维护性）；我再逐项比较。',
      steps: [
        '贴出两个候选的名称或链接。',
        '说明比较维度：效果、成本、风险、可维护性。',
        '我给逐项比较和取舍，不猜候选。',
      ],
      framework: false,
    };
  }
  if (/(内容标签|给我一个.{0,6}标签|来一个.{0,6}标签)/.test(question)) {
    return {
      conclusion: '标签不能凭空给；它必须绑定一条真实内容和用途。',
      ask: '贴一条内容样本（帖子/评论/视频），说明用途（洞察/选题/质检）；我先给最小标签卡，再按样本标一次。',
      steps: [
        '贴一条内容样本。',
        '说明用途：洞察、选题还是质检。',
        '我给最小标签卡，并在这条样本上标一次。',
      ],
      framework: false,
    };
  }
  if (/(指标|metric)[^。！？]{0,12}(能不能用|可用|口径|定义)|这个指标/.test(question)) {
    return {
      conclusion: '缺少指标定义和数据源，无法判断能不能用。',
      ask: '给我指标名、可执行定义、数据源、口径版本；我用指标卡八项检查，缺一项就标“不可用”。',
      steps: [
        '给指标名、可执行定义、数据源、口径版本。',
        '说明它要支撑哪个决策动作。',
        '我按指标卡八项检查，缺一项标“不可用”。',
      ],
      framework: true,
    };
  }
  if (/(agent|智能体)[^。！？]{0,12}(反馈|两个问题|答错|不对|有问题)/.test(question)) {
    return {
      conclusion: '缺少可复现的输入和期望行为，无法判断 agent 哪里错。',
      ask: '给我两条问题的复现输入、期望输出、实际输出、模型/工具版本；我按 eval → 数据 → 工具 → prompt 的顺序定位。',
      steps: [
        '给两条问题的复现输入、期望输出、实际输出。',
        '给模型与工具版本、失败时间。',
        '我按 eval → 数据 → 工具 → prompt 定位。',
      ],
      framework: true,
    };
  }
  if (/(MCP|重构|平台|迁移)/i.test(question) && /(上线|完成|进度|测试)/.test(question)) {
    return {
      conclusion: '重构/MCP 是变更风险，不是完成度；80% 和“下周上线”都不能替代 gate 证据。',
      ask: '给我 G1–G5 证据，并单独列 MCP/重构的回归范围、回滚方案和观测指标；没有这些就不要承诺下周上线。',
      steps: [
        '列 MCP/重构改了哪些契约、影响哪些调用方。',
        '给 G1–G5 证据，特别是 G3 端到端和 G5 回滚。',
        '写下周上线的灰度范围、观测指标和回滚触发条件。',
      ],
      framework: true,
    };
  }
  if (/(\d{1,3}\s*%|进度|完成了|完成度)/.test(question)) {
    const items = progressItems(question);
    const itemText =
      items.length > 0 && items.length <= 3
        ? items.map((item) => `「${item}」`).join('、')
        : '每个条目';
    return {
      conclusion: `百分比不是进度；${itemText}都不等于 gate 通过。`,
      ask: `你提到的${itemText}分别对应哪个 gate、证据在哪？给 G1–G5 证据和上线范围；没有证据的 gate 先标 0。`,
      steps: [
        `把 ${itemText} 分别对应到 G1–G5。`,
        '给每个条目的证据（命令、评测结果、截图）。',
        '没有证据的 gate 标 0，不按百分比算进度。',
      ],
      framework: true,
    };
  }
  if (/(最终版|文档|复核|更新好了|prd|aiprd)/i.test(question)) {
    return {
      conclusion: '这是一次文档/多点评审，需要先拿到最终版和要复核的点。',
      ask: '把最终版文档链接（或正文）贴出来，并列出要复核的 2–3 项；我按 Playbook / 结论卡 / 指标卡对应检查表逐项过。',
      steps: [
        '贴出最终版文档链接或正文。',
        '列出 2–3 个要复核的点。',
        '我按对应检查表逐项过。',
      ],
      framework: true,
    };
  }
  return {
    conclusion: '这需要你们项目里的具体记录；我无法仅凭这句话判断。',
    ask: '先确认：是哪份文档、哪张表、哪个环境，以及你已经看到的现象；没有记录时，正确状态是「未运行/无法判断」，不是「通过」。',
    steps: [
      '给我文档/表/环境，以及你看到的现象。',
      '说明你已经跑过哪个检查。',
      '我按对应框架判断，不猜。',
    ],
    framework: true,
  };
}

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
  const unsafe = matchesPatterns(q, UNSAFE_PATTERNS);
  const ambiguous = matchesPatterns(q, AMBIGUOUS_PATTERNS);
  const meta =
    domainHits === 0 &&
    isMeta(q) &&
    (best === undefined || best.node.family === 'navigation' || best.score < 8);
  const outOfScope = !meta && !ambiguous && (domainHits === 0 || projectOps || unsafe);
  const needsContext = !meta && !outOfScope && (contextual || ambiguous);

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
      : `node=${best.node.id} score=${best.score.toFixed(2)} domainHits=${domainHits} strongHits=${strongDomainHits} projectOps=${projectOps} unsafe=${unsafe} ambiguous=${ambiguous} needsContext=${needsContext} top=${topRetrieval?.chunk.path ?? 'none'}`;

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
    // Roadmap/progress/delivery terms are generic enough that a project-ops
    // question ("周报变成 todo list") would otherwise inherit a false domain hit.
    if (
      node.id === 'roadmap-and-scope' ||
      node.id === 'progress-and-gates' ||
      node.id === 'delivery-lanes'
    ) {
      continue;
    }
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
    const text = buildOutOfScope(refusalFor(question));
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

  const clarify = classification.needsContext ? clarifyFor(question) : undefined;
  const direct = classification.needsContext
    ? undefined
    : findPlay(question, options.history ?? []);
  const playNode =
    direct?.nodeId !== undefined
      ? graph.nodes.find((item) => item.id === direct.nodeId)
      : undefined;
  const node = playNode ?? classification.node;
  const preferredPaths = new Set(node.sources.map((source) => source.path));
  const snippets = extractSnippets(question, retrieved, 4, preferredPaths);
  const sourceRefs =
    clarify?.framework === false
      ? []
      : direct !== undefined
        ? filterNodeSources(node.sources, question, 3)
        : mergeSources(node.sources, retrieved);

  const sections: string[] = [];
  const correction = direct !== undefined ? direct.correction : correctionFor(question);
  if (correction !== undefined) {
    sections.push(`【先纠正一个前提】\n${correction}`);
  }
  if (clarify !== undefined) {
    sections.push(`【结论】\n${clarify.conclusion}`);
    sections.push(
      `【定位】\n${
        clarify.framework === false
          ? '尚未定位：缺少指代或上下文'
          : `${node.title}（${FAMILY_LABEL[node.family]}）`
      }`,
    );
    sections.push(`【需要你补充】\n${clarify.ask}`);
    if (clarify.framework !== false) {
      sections.push(`【可用的判断框架】\n${node.summary}`);
    }
  } else {
    sections.push(`【结论】\n${direct?.conclusion ?? node.summary}`);
    sections.push(`【定位】\n${node.title}（${FAMILY_LABEL[node.family]}）`);
  }

  if (direct === undefined && clarify?.framework !== false && snippets.length > 0) {
    sections.push(
      `【依据】\n${snippets
        .slice(0, 3)
        .map((snippet) => `- ${snippet.text}${snippet.path ? `（${snippet.path}）` : ''}`)
        .join('\n')}`,
    );
  }

  const actions = clarify?.steps ?? direct?.actions ?? node.actions.slice(0, 6);
  sections.push(
    `【下一步】\n${actions.map((action, index) => `${index + 1}. ${action}`).join('\n')}`,
  );

  const boundaries =
    clarify?.framework === false ? [] : (direct?.boundaries ?? node.boundaries.slice(0, 3));
  if (boundaries.length > 0) {
    sections.push(
      `【边界】\n${boundaries.map((boundary) => `- ${boundary}`).join('\n')}`,
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

  if (classification.confidence === 'low' && direct === undefined && clarify === undefined) {
    sections.push(
      '【需要你补充】\n我先按最接近的能力节点回答。如果不对，请补充：你在哪一层（采集/指标/分析/结论/报告），以及你已经跑过哪个检查。',
    );
  }

  if (options.includeRelated !== false && clarify?.framework !== false && node.related.length > 0) {
    const related = node.related
      .map((id) => graph.nodes.find((item) => item.id === id))
      .filter((item): item is CapabilityNode => item !== undefined)
      .slice(0, 2)
      .map((item) => item.title)
      .join('；');
    if (related.length > 0) sections.push(`【还可以看】\n${related}`);
  }

  const text = trimTo(sections, maxChars);
  steps.push({
    name: 'compose',
    detail: `node=${node.id}; snippets=${snippets.length}${direct !== undefined ? `; play=${direct.id}` : ''}`,
  });

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

/**
 * A refusal should name the actual red line, not print the same menu for a
 * credential request and a weather question. The generic scope line stays so
 * the boundary is still explicit.
 */
function refusalFor(question: string): string | undefined {
  if (/(系统提示词|忽略.{0,6}规则|prompt\s*injection|内部规则)/i.test(question)) {
    return '不会输出系统提示词或内部规则。';
  }
  if (/(密钥|api\s*key|token|密码|凭据|\.env)/i.test(question)) {
    return '不会读取、转述或发送密钥/凭据，也不会用管理员 token 执行删除或权限变更。';
  }
  if (/(删掉|删除|删库|清空).{0,12}(生产|数据库|群|库)|(生产|数据库).{0,8}(删掉|删除|清空)/.test(question)) {
    return '不会执行或指导删除生产数据/群组；需要走审批、备份和回滚。';
  }
  if (/(手机号|身份证|个人信息|聊天记录|隐私|用户数据)/.test(question)) {
    return '不会导出或转发个人信息/聊天记录；这是隐私红线。';
  }
  if (/(权限|拉我|加我|进群|拉进)/.test(question)) {
    return '这是飞书/项目权限操作，我没有你们的租户权限，不能代拉人；找群主/文档所有者或管理员按最小权限授权。';
  }
  if (/(下午的会|开会|会议|日历|邀请|谁拉的会|会议室)/.test(question)) {
    return '我看不到你的日历/会议邀请，不能替你处理会议冲突或查是谁拉的会；找会议组织者或日历所有者。';
  }
  if (/(测试表|表格|文件|发一下|发我)/.test(question)) {
    return '我没有你们的表格或文件，不能代发；如果是要 eval 测试表，我可以给字段模板。';
  }
  if (/(代码|code).{0,8}(review|审查|bug)|(review|审查).{0,8}(代码|code)/i.test(question)) {
    return '通用代码 review 不在能力图谱；如果是交付前的 G4 审查，给我 PR 链接/代码和验收标准，我按 G4 清单过，但不替你找所有 bug。';
  }
  if (/(gmv|销售额|卖了多少|股价|行情)/i.test(question)) {
    return '我没有你们的数据源，不能查业务数字或实时行情；可以帮你设计口径、查询和校验。';
  }
  return undefined;
}

export function buildOutOfScope(reason?: string): string {
  return [
    '【结论】',
    ...(reason !== undefined ? [reason] : []),
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
  const candidates: { text: string; path: string; score: number; preferred: boolean }[] = [];

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
      const isPreferred = preferredPaths.has(item.chunk.path);
      const preferred = isPreferred ? 2.2 : 0;
      const kindBonus = item.chunk.kind === 'document' ? 0.6 : 0;
      const score =
        overlap * 10 +
        (headingHit ? 1.5 : 0) +
        preferred +
        kindBonus +
        Math.min(item.score, 6) * 0.15;
      if (overlap === 0 && !headingHit && preferred === 0) continue;
      // A non-source document must earn its place with real term overlap; a
      // single shared word like "Feishu" is not evidence for this capability.
      if (!isPreferred && overlap < 0.05) continue;
      candidates.push({
        text: truncate(cleaned, 260),
        path: item.chunk.path,
        score,
        preferred: isPreferred,
      });
    }
  }

  // The node's own sources are the evidence for this capability. When at least
  // one is available, quote only those: a loosely related document must not
  // crowd out the exact contract.
  const hasPreferred = candidates.some((candidate) => candidate.preferred);
  const pool = hasPreferred
    ? candidates.filter((candidate) => candidate.preferred)
    : candidates;
  pool.sort((a, b) => b.score - a.score);

  const out: Snippet[] = [];
  const seen = new Set<string>();
  for (const candidate of pool) {
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

/**
 * Direct plays answer a specific question; listing every curated source for the
 * node produces evidence like a tool-failure ADR on a PR-writing question. Keep
 * the sources whose path/heading/why overlaps the question, with the curated
 * order as the fallback when nothing matches.
 */
function filterNodeSources(
  nodeSources: SourceRef[],
  question: string,
  limit: number,
): SourceRef[] {
  const terms = new Set(tokenize(question));
  const scored = nodeSources.map((source, index) => {
    const text = `${source.path} ${source.heading ?? ''} ${source.why ?? ''}`;
    const hits = tokenize(text).filter((term) => terms.has(term)).length;
    return { source, index, hits };
  });
  const positive = scored.filter((item) => item.hits > 0);
  const pool =
    positive.length >= 2
      ? positive
      : scored.slice(0, Math.max(2, positive.length));
  return pool
    .sort((a, b) => b.hits - a.hits || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.source);
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
