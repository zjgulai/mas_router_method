import type { ConversationTurn } from './types.js';

/**
 * High-stakes answers that must not be left to the generic node template.
 *
 * The capability graph gives the right *frame* for a topic, but conflict,
 * authority, governance, and follow-up questions need a direct verdict first.
 * A play overrides only the conclusion/actions/boundaries; the node's position,
 * retrieved evidence, and source refs are still attached by the composer.
 */
export interface DirectPlay {
  id: string;
  /** Override the classifier's node when the symptom is unmistakable. */
  nodeId?: string;
  /** Tested against the current question plus recent thread history. */
  pattern: RegExp;
  /** Optional guard when the pattern alone is too broad. */
  when?: (context: PlayContext) => boolean;
  conclusion: string;
  actions: string[];
  boundaries?: string[];
  /** Shown before the conclusion when the question contains a false premise. */
  correction?: string;
}

export interface PlayContext {
  /** The current message only. */
  question: string;
  /** Current message plus recent turns, for topic-aware follow-ups. */
  all: string;
  history: ConversationTurn[];
}

const has = (text: string, pattern: RegExp): boolean => pattern.test(text);

export const DIRECT_PLAYS: DirectPlay[] = [
  {
    id: 'feishu-at-no-reply',
    nodeId: 'feishu-surface',
    pattern: /(@[^。！？]{0,12}(没反应|没回|不回|没回复))|(群里[^。！？]{0,12}(@|没反应))/,
    conclusion:
      '按顺序查，不要先怀疑模型：事件订阅 → 权限 → 群/mention → 网关 → 回复权限。大多数“@ 没反应”是事件没送达或 mention 没匹配，不是回答生成失败。',
    actions: [
      '事件订阅：确认 im.message.receive_v1 已加，订阅方式是长连接（或 webhook URL 已校验）。',
      '权限：确认 im:message / im:message.group_msg / im:message:send_as_bot 已开通。',
      '群与 mention：确认机器人在群，被 @ 的是 Main 的 open_id，不是 @ 别人。',
      '网关：确认长连接实例数为 1，日志出现 ws event received。',
      '有事件无回复：查 not addressed、幂等键、回复权限；必要时用 replay 回放。',
    ],
    boundaries: ['没有 ws event received 就查飞书侧；有事件没回复才查网关幂等和回复权限。'],
  },
  {
    id: 'pr-article-playbook',
    nodeId: 'agent-playbook',
    pattern:
      /(PR|公关|新闻稿|媒体稿)[^。！？]{0,12}(生成|写作|稿|文章)|(生成|写)[^。！？]{0,8}(PR|公关|文章)/i,
    conclusion:
      'PR 文章生成先定四件事：目标受众/媒体、核心 claims 与证据、风险点与禁用表达、人工复核人。先给我话题、3 条 claims/证据和风险点；没有素材就先出一版标【待填】的大纲，不编事实。',
    actions: [
      '写 claims 表：每条主张、证据来源、可公开程度、风险等级。',
      '列风险点/禁用表达：绝对化、未证实数据、竞品贬损、监管敏感词。',
      '先出大纲：标题（待填，2 选 1）→ 导语（谁/做了什么/为什么重要，待填）→ 3 条证据（待填）→ 引语（待填）→ 事实清单（待填）→ 联系方式（待填）。',
      '选 1 个标题和 1 版大纲，人工复核后再扩写；发布前过法务/品牌。',
      '把人工修改记录回灌到 eval，下一次按同一标准检查。',
    ],
    boundaries: ['没有 claims 与证据，不要生成“看起来像新闻”的文章。'],
  },
  {
    id: 'content-tag-request',
    nodeId: 'labeling-taxonomy',
    pattern: /(给我|来|要)[^。！？]{0,6}(一个|个)?[^。！？]{0,4}(内容)?标签|(内容标签)[^。！？]{0,8}(给我|来一个)/,
    conclusion:
      '可以，但标签必须绑定一条真实内容和用途。先给你最小标签卡：层级（产品/物流/内容/社区）、定义、正例、反例、置信度；把一条样本贴出来，我按这个卡标一次。',
    actions: [
      '先贴一条内容样本，并说明用途：洞察、选题还是质检。',
      '按最小标签卡写五项：层级、定义、正例、反例、置信度。',
      '如果现有 taxonomy 没有合适分支，新增平级分支，不要硬塞。',
      '标 20–30 条做一致性检查；Kappa < 0.6 先修定义。',
    ],
    boundaries: ['没有样本和用途，标签只是词表，不是可执行定义。'],
  },
  {
    id: 'metric-version-subtract',
    nodeId: 'metric-contract',
    pattern:
      /(口径版本|版本\s*[AB])[^。！？]{0,20}(相减|直接减|对比|比较)|(相减)[^。！？]{0,10}(口径|版本)/,
    conclusion:
      '不能直接相减。跨口径版本直接减，会把口径变化读成业务变化；只能并排展示差异，或先按映射重算到同一版本。',
    actions: [
      '并排展示 A/B 两个版本的数字和差值，数字旁标口径版本。',
      '需要合并时先写显式映射，重算到同一版本再比较。',
      '跨版本差值单独标“口径影响”，不和业务变化混在一起。',
      '报告里保留两个版本的原始值，不覆盖旧值。',
    ],
    boundaries: ['口径版本不同，数字不可直接相减；映射不是重写历史。'],
  },
  {
    id: 'no-universal-template',
    nodeId: 'metric-contract',
    pattern:
      /(所有行业|全行业|万能|通用)[^。！？]{0,12}(指标模板|指标|模板)|(指标模板)[^。！？]{0,12}(所有行业|全行业|万能)/,
    conclusion:
      '不存在适合所有行业的指标模板。指标必须绑定决策动作、粒度和口径；能给的是指标卡八项 + 按行业补全的流程。',
    actions: [
      '先写这个指标要改变哪个决策动作；写不出来就不要建指标。',
      '按指标卡八项落：指标名、可执行定义、粒度、单位、数据源、口径版本、已知偏差、什么时候不可用。',
      '每个行业单独补数据源、偏差和不可用条件，不要复制同一套定义。',
      '用金标准集校验口径；跨行业比较前先做映射。',
    ],
    boundaries: ['“所有行业通用”是伪需求；通用的是流程，不是定义。'],
    correction: '没有适合所有行业的指标模板；通用的是指标卡流程，不是同一套定义。',
  },
  {
    id: 'voc-to-topic',
    pattern:
      /(VOC|用户声音|用户反馈)[^。！？]{0,24}(洞察|选题|内容)|(洞察|选题)[^。！？]{0,20}(VOC|社媒|用户声音)/,
    conclusion:
      'VOC 到选题分三层：接入（源/去重/区域/时点）→ 洞察（主题聚类/证据/置信度）→ 选题（决策动作/受众/风险）。三层各有验收，不能拿采集口径当洞察结论。',
    actions: [
      '接入层：每条记录存 first_seen_at、fetched_at、source_task_id，按源去重。',
      '洞察层：每个主题给证据样本、覆盖率和置信度；没有样本的主题不算洞察。',
      '选题层：写清目标受众、要改变的动作、风险和证伪条件。',
      '三层分别验收；采集通过不等于洞察成立，更不等于选题可执行。',
    ],
    boundaries: ['采集覆盖率不是洞察质量；洞察结论也不能直接当选题。'],
  },
  {
    id: 'taxonomy-coverage',
    nodeId: 'labeling-taxonomy',
    pattern:
      /(标签|分类)[^。！？]{0,30}(非产品|一半|覆盖|失真|内容生产|社区)|(非产品)[^。！？]{0,20}(标签|分类)/,
    conclusion:
      '这是标签覆盖问题，不是版本问题：现有 taxonomy 只覆盖产品/物流客服，非产品讨论占一半，必须加一个平级分支（内容/社区/生活方式），不要硬塞进现有标签。',
    actions: [
      '先统计各分支覆盖率：产品/物流/内容/社区各占多少，未覆盖多少。',
      '新增平级标签分支，写清定义、正例、反例和置信度。',
      '旧标签保留 taxonomy_version，新分支用新版本，不覆盖历史。',
      '用金标准集测新分支准确率和 Kappa；< 0.7 / < 0.6 先修定义。',
      '报告里单独展示“未覆盖/其他”比例，不要静默并入现有标签。',
    ],
    boundaries: ['标签覆盖不足时，正确动作是加分支，不是把非产品内容硬塞进产品标签。'],
    correction: '非产品讨论占一半，说明 taxonomy 覆盖不足；先加平级分支，不是改版本号。',
  },
  {
    id: 'budget-missing',
    pattern:
      /预算[^。！？]{0,16}(没有|拿不到|缺|缺失|无数据|给不了)|(没有|拿不到|缺|缺失)[^。！？]{0,10}预算/,
    conclusion:
      '满足不了“支持预算决策”这个要求。缺 F1 预算数据时 C4 不存在；只能交付 C1–C3 的关联排序，并明确写“不可用于预算再分配”，不能用相关性冒充边际回报。',
    actions: [
      '把需求改成可交付范围：本次只回答区域关联弹性排序（C1），不做 C4。',
      '在结论卡的“范围”字段写死：缺 F1 预算数据，C4 不存在，不用于预算决策。',
      '如果决策必须依赖 C4，先补预算数据；补不到就停，不要用 C1 或高相关性替代。',
      '给决策人的替代方案：C1 排序 + 不确定性 + 人工签字，预算动作不由模型给。',
    ],
    boundaries: [
      '没有预算数据就没有边际回报；“必须支持预算决策”与“数据拿不到”只能二选一，不能靠措辞解决。',
    ],
    correction: '预算数据缺失时，C4（预算边际回报）不存在；相关性再高也不能替代。',
  },
  {
    id: 'causal-pressure',
    pattern:
      /(0\.8[0-9]|0\.9[0-9]|高相关|相关性[^。！？]{0,8}(高|0\.8|0\.9))[^。！？]{0,30}(因果|业务要求|必须给|必须做)|(业务要求|必须)[^。！？]{0,20}因果/,
    when: (context) => has(context.all, /相关|归因|区域|因果/),
    conclusion:
      '不能写因果。区域相关性 0.85 已超过 §七 的 0.8 门禁，区域归因识别不成立；业务要求不能改变识别条件。可交付的只有“关联排序 + 明确边界”，或者停。',
    actions: [
      '先跑 §七 相关性检查并留数；>0.8 直接判识别不成立。',
      '把结论降级为关联排序（C1/C3），不写“导致”“带来”“投放有效”。',
      '如果业务必须拿因果结论，先换识别策略或补实验/预算数据；没有就明确说做不到。',
      '在报告首页写一句：本结论不支持因果解释，也不支持预算再分配。',
    ],
    boundaries: ['业务压力不能替代识别条件；“相关性高”不是“因果证据强”。'],
    correction:
      '0.8 以上是识别不成立，不是“更强的因果证据”；相关性越高，区域面板越没有独立变异。',
  },
  {
    id: 'deadline-vs-gate',
    pattern:
      /(周五|明天|下周|deadline|上线时间)[^。！？]{0,20}(上线|发布)|(上线|发布)[^。！？]{0,16}(周五|明天|下周)/,
    when: (context) => has(context.all, /eval|gate|验收|证据/),
    conclusion:
      '不能承诺周五上线。eval 没跑、gate 没过时，日期不是进度；要么缩小范围先过 G1–G5，要么把上线改成灰度/内部试用并写清例外。',
    actions: [
      '逐条列 G1–G5 的证据；没有证据的 gate 直接标 0。',
      '砍到最小可验收范围：先让一项能力过 G3/G4，而不是全量上线。',
      '如果必须周五对外，改成灰度/单群试用，写清回滚和到期时间。',
      '给决策人两个日期：最早可验收日期，和冒险上线的例外日期。',
    ],
    boundaries: ['日期压力不能替代 gate 证据；承诺上线不是验收。'],
    correction: '“周五上线”是目标，不是进度；eval 和 gate 没过就是没过。',
  },
  {
    id: 'safety-vs-false-reject',
    pattern:
      /(should_fail|零误拒|不误拒|误拒|误杀)[^。！？]{0,30}(100\s*%|全部|同时|又要)|(100\s*%|全部)[^。！？]{0,20}(误拒|误杀)/,
    conclusion:
      '做不到“零误拒”。should_fail 100% 是硬门，误拒率是代价指标；只能调阈值、加白名单和分层，并把误拒样例纳入 eval，不能承诺两者都为零。',
    actions: [
      '把 should_fail 保持为 100% 硬门，不参与折中。',
      '为正常请求建误拒样例集，记录误拒率与代价。',
      '用分层策略：高风险动作严拒，低风险查询放宽；不要一个阈值打天下。',
      '每次调阈值同时看 should_fail 与误拒率，写清牺牲了哪一边。',
    ],
    boundaries: ['安全与可用是权衡，不是两个都能拿满的指标。'],
  },
  {
    id: 'cost-latency-coverage',
    pattern:
      /(零成本|低成本|成本低)[^。！？]{0,30}(3\s*秒|p95|低延迟)|(3\s*秒|p95)[^。！？]{0,30}(全量|长任务|成本)/,
    conclusion:
      '三者不能同时成立。低成本 + p95 小于 3 秒 + 长任务全量，是一个三角：必须明确放弃哪一个；默认放弃“同步全量”，改为异步长任务 + 分层采样。',
    actions: [
      '把请求分成同步问答和异步长任务；超过 3 秒的一律走后台。',
      '长任务先做分层采样，再逐步扩量；不要一上来全量。',
      '给成本设上限并逐次记录；超过上限降级，不要静默烧钱。',
      '把“放弃哪一个”写进决策记录，避免下次又三个都要。',
    ],
    boundaries: ['成本、延迟、覆盖只能三选二；不选就是默认牺牲质量。'],
  },
  {
    id: 'never-apportion-unknown',
    pattern: /(unknown|未知)[^。！？]{0,20}(摊派|分配|按人口|按比例)|(摊派|分配)[^。！？]{0,10}unknown/,
    conclusion:
      '不做。unknown 永不摊派；按人口或 GMV 比例重分配会制造“完整但错”的分母，而且看起来没有任何问题。',
    actions: [
      '保留四类命名空间：unattributable / insufficient / not_applicable / 正常区域。',
      'unknown 单独计数并在报告里显示覆盖率。',
      '需要完整分母时先补采集，不要用比例摊派。',
      '任何摊派逻辑进代码前先写一条能变红的检查。',
    ],
    boundaries: ['摊派让分母看起来完整，但会把“不知道”伪装成“知道”。'],
    correction: 'unknown 不能按人口比例摊派；不知道就是不知道。',
  },
  {
    id: 'migration-overwrite',
    pattern:
      /(迁移|migrate)[^。！？]{0,20}(覆盖|改写|重写)[^。！？]{0,10}(旧记录|历史|磁盘)|(旧记录|历史)[^。！？]{0,10}(覆盖|改写)/,
    conclusion:
      '不做。迁移是读侧透镜，不改写磁盘；旧记录必须原样可查。覆盖会毁掉血缘和回滚。',
    actions: [
      '追加一条 migration 记录，读的时候套透镜。',
      '迁移前先试读；丢一条记录就拒绝迁移。',
      '保留旧版本读取路径，确保旧数据还能查。',
      '把“旧版本还能不能查”写进迁移 ADR。',
    ],
    boundaries: ['迁移可以改变读法，不能改写历史。'],
  },
  {
    id: 'falsification-on-demand',
    pattern:
      /(证伪|检查)[^。！？]{0,16}(老板问|有人问|按需|临时|只跑一次)|(老板问|有人问)[^。！？]{0,10}(证伪|检查)/,
    conclusion:
      '不行。证伪检查必须定时跑、触发即通知；只在老板问时跑，等于把“主动报错”降级成“被问才查”。',
    actions: [
      '把证伪条件注册成函数，先挂到定时任务上。',
      '造一次触发，确认通知路径真的报。',
      '触发时记录 INC，不记成票。',
      '每周核对触发后的回应和改动作次数，不统计发送量。',
    ],
    boundaries: ['按需跑证伪只能证明“查过”，不能证明“会主动报”。'],
  },
  {
    id: 'correlation-proves-effect',
    pattern:
      /(相关|相关性)[^。！？]{0,20}(证明|说明|意味着)[^。！？]{0,15}(有效|投放|因果|带来)|(0\.9|高相关)[^。！？]{0,16}(证明|说明)[^。！？]{0,12}(有效|投放)/,
    conclusion:
      '不能。相关性不能证明投放有效，也不能证明因果；需要控制变量和识别策略，只有 C4（预算边际回报）才接近因果。0.9 的区域同步变动反而说明区域归因没有独立变异。',
    actions: [
      '把“投放有效”改写成可检验的因果问题：处理是什么、对照是什么、预算如何变异。',
      '先跑 §七 相关性检查；>0.8 直接判区域归因不成立。',
      '补控制变量（促销、价格、缺货、竞品）后，最多给关联排序（C1/C3）。',
      '要因果结论就上实验或预算数据；没有就明确写“不支持”。',
    ],
    boundaries: ['相关不是因果；高相关不是强证据，可能正好是识别失败的信号。'],
    correction: '0.9 的相关性只是同步变动，不是因果证据。',
  },
  {
    id: 'boundary-as-established',
    pattern:
      /(0\.5\s*[–-]\s*0\.8|边界带)[^。！？]{0,24}(成立|识别成功|可以直接做|说成)/,
    conclusion:
      '不能写成识别成立。边界带只能给有限结论并标注“有效变异有限”，结论只到 C1/C3。',
    actions: [
      '在报告里写“边界带 / 有效变异有限”，不要写“识别成立”。',
      '只发 C1/C3，不发因果或预算结论。',
      '补控制变量和更长窗口，看是否能移出边界带。',
      '如果业务只要“成立/不成立”二选一，明确说做不到。',
    ],
    boundaries: ['边界带不是二值结论；把它写成成立，是把不确定性藏起来。'],
    correction: '0.5–0.8 是边界带，不是识别成立。',
  },
  {
    id: 'c1-boundary',
    pattern:
      /(区间跨\s*0|跨零)[^。！？]{0,20}(C1|能发|发布)|(C1)[^。！？]{0,20}(区间跨\s*0|跨零)/,
    conclusion:
      '不能发 C1。正确状态是“无结论 / unmeasurable”，不是“效应弱”；12 周也低于区域面板需要的共同周数。',
    actions: [
      '把结论状态标成 unmeasurable，不写“趋势”“效应弱”“接近显著”。',
      '写清缺什么：共同周数、控制变量、区域间独立变异。',
      '扩窗口或换识别策略后再跑；没有新证据不要重发。',
      '在结论卡里保留失败原因，避免下一轮重复踩同一个坑。',
    ],
    boundaries: ['区间跨 0 不等于效应小；它等于当前数据无法区分“有效应”和“无效应”。'],
    correction: '区间跨 0 不是“效应弱”；它是“当前数据无法判断”。',
  },
  {
    id: 'should-fail-not-100',
    pattern: /should_fail[^。！？]{0,12}(9\s*\/\s*10|90\s*%|[5-9]\s*\/\s*10)|(9\s*\/\s*10|90\s*%)[^。！？]{0,12}should_fail/,
    conclusion:
      '不能上线。should_fail 只有 0 和 100%，9/10 等于护栏已经失效；正例全过不能抵消。',
    actions: [
      '复现第 10 条，定位是 guardrail 漏了、样例标错，还是模型绕过了检查。',
      '修 guardrail 或加确定性检查，不要只改 prompt。',
      '重跑全量 should_fail；仍有一条通过就停。',
      '通过后把第 10 条留作回归用例，防止再次退化。',
    ],
    boundaries: ['should_fail 没有“部分通过”；一条通过就是 0 分。'],
    correction: 'should_fail 必须 100% 拒绝；90% 不是“基本通过”，是“护栏失效”。',
  },
  {
    id: 'small-sample',
    pattern: /(10\s*条|十条|小样本)[^。！？]{0,24}(70\s*%|稳定|上线|可信)/,
    conclusion:
      '不能。10 条只能做 smoke / 方向性判断，不能证明稳定；先定样本量、判定标准和基线。',
    actions: [
      '记录样本量与抽样方法：这 10 条从哪里来、覆盖哪些失败类型。',
      '补 should_fail 和真实失败样例，不要只补正例。',
      '用区间而不是单点 70%；区间宽到无法决策时标“无法判断”。',
      '未达样本量时，正确状态是“未运行/证据不足”，不是“基本稳定”。',
    ],
    boundaries: ['70% 是这 10 条上的观测值，不是总体稳定率。'],
    correction: '10 条样本的 70% 不是“稳定率”；它连置信区间都撑不起来。',
  },
  {
    id: 'delete-failing-case',
    pattern:
      /(删|删除|去掉|隐藏)[^。！？]{0,12}(should_fail|失败样例|失败\s*case|失败用例)|(should_fail|失败样例|失败\s*case|失败用例)[^。！？]{0,12}(删|删除|去掉|隐藏)/,
    conclusion:
      '不做。删失败样例是让 eval 变绿，不是让产品变好；这会把已知缺陷变成未知缺陷。',
    actions: [
      '保留失败样例，并把失败原因写进报告。',
      '修 guardrail / 数据 / 工具，或明确把结论降级。',
      '如果确实要豁免，写 owner、到期时间、影响范围和回滚方案。',
      '下次评审先看失败样例，不看通过率。',
    ],
    boundaries: ['eval 变绿只有一种合法方式：修好产品，或明确降级结论。'],
    correction: '删掉会失败的样例，等于把检查器关掉；这不是通过。',
  },
  {
    id: 'mark-passed-without-record',
    pattern:
      /(没落表|没有记录|未运行|没跑|没有证据)[^。！？]{0,20}(补|标|算|写)[^。！？]{0,10}(通过|绿|完成)/,
    conclusion:
      '不能标通过。没有记录的正确状态是“未运行 / 无法判断”，不是“通过”；补数据也不能倒填验收。',
    actions: [
      '把状态改成未运行，并写清缺哪条命令/哪份记录。',
      '补跑并留证据：命令、时间、exit code、输出摘要。',
      '补数单独记 job id，不修改历史验收结论。',
      '谁签字谁负责；没有证据就不签。',
    ],
    boundaries: ['“没有记录”不是“默认通过”；它连“不通过”都不是，是“未运行”。'],
    correction: '没有记录不等于通过；它等于“没跑过”。',
  },
  {
    id: 'relabel-old-data',
    nodeId: 'labeling-taxonomy',
    pattern:
      /(历史数据|旧数据)[^。！？]{0,12}(重标|重新标|补标)|(重标)[^。！？]{0,10}(历史|旧)/,
    conclusion:
      '不要原地重写。可以做追加式重标：新增一列/一张表存新 taxonomy_version，旧标签保留；查询时按版本或映射合并，并记录重标批次。',
    actions: [
      '新增标签列或映射表，写新 taxonomy_version；旧标签不覆盖。',
      '记录重标批次：job id、规则版本、执行时间、覆盖范围。',
      '金标准集重新人工标定，校准新版本的准确率与 Kappa。',
      '查询时按版本分组或映射；报告显示版本差异，不静默合并。',
    ],
    boundaries: ['追加式重标不是重写历史；旧标签必须可查。'],
    correction: '“重标”可以追加新版本，但不要原地覆盖旧标签。',
  },
  {
    id: 'rewrite-old-labels',
    pattern:
      /(旧数据|历史数据|旧标签|历史标签)[^。！？]{0,20}(重写|重算|重标|覆盖|改成新版本)/,
    conclusion:
      '不重写。标签改版时旧数据保留原 taxonomy_version；新数据用新版本，跨版本查询必须显式映射。',
    actions: [
      '新增 taxonomy_version，旧记录一行不改。',
      '建显式映射表；查询时按版本分组或映射，不静默合并。',
      '金标准集重新人工标定，校准新版本的准确率与 Kappa。',
      '报告里显示版本差异；跨版本数字不要直接相减。',
    ],
    boundaries: ['旧数据重写会毁掉可比性和审计链；映射不是重写。'],
    correction: '改标签不是改历史；旧数据保留原版本，新数据带新版本。',
  },
  {
    id: 'drop-control',
    pattern: /(缺货率|缺货|控制变量)[^。！？]{0,15}(去掉|删掉|不控|拿掉)/,
    conclusion:
      '不能去掉。缺货是致命混淆：缺货同时压低销量和声量，去掉后显著性上升是偏差，不是发现。',
    actions: [
      '保留缺货率，并补库存/促销/价格控制变量。',
      '做敏感性分析：有/无缺货控制变量各跑一次，看方向是否反转。',
      '如果缺货数据缺失，降级结论，不要删变量。',
      '在报告里写明缺货对识别的影响。',
    ],
    boundaries: ['为了让结果显著而删控制变量，是把偏差写进结论。'],
  },
  {
    id: 'write-long-lag',
    pattern: /(6\s*周以上|六周以上|长滞后)[^。！？]{0,20}(写|结论|滞后|识别)/,
    conclusion:
      '不能写。1 年约 26 个双周周期，只能勉强识别 2–4 周滞后；6 周以上样本不够。',
    actions: [
      '只报 2–4 周的滞后结构。',
      '6 周以上标“不可识别”，不要写成“无效应”。',
      '要识别更长滞后，扩到 2 年以上窗口再试。',
      '在结论卡的范围里写清窗口限制。',
    ],
    boundaries: ['样本不够时，正确结论是“不可识别”，不是“没有影响”。'],
  },
  {
    id: 'delete-old-conclusion',
    pattern: /(旧结论|已有结论|结论)[^。！？]{0,12}(删掉|删除|清掉)/,
    conclusion:
      '不删。旧结论转 superseded，新增一条说明为什么被推翻；删除会丢掉审计链。',
    actions: [
      '把旧结论 status 改为 superseded。',
      '新结论引用旧 id，写清哪条证据变了。',
      '保留证伪触发记录和当时的范围。',
      '报告默认只展示 active，但历史必须可查。',
    ],
    boundaries: ['推翻结论靠新证据，不靠删记录。'],
    correction: '旧结论不能删；应转 superseded，并新增结论说明为什么推翻。',
  },
  {
    id: 'denominator',
    pattern: /(denominator|分母)[^。！？]{0,15}(调小|改小|调整|换)/,
    conclusion:
      '不改。固定分母定义并加异常检测；变更走新 metric_version，跨版本不直接相减。',
    actions: [
      '固定分母定义，写进指标卡第八项“什么时候不可用”。',
      '加分母骤降/骤升告警。',
      '变更走新 metric_version，不覆盖旧值。',
      '跨版本不可直接相减；报告显示版本差异。',
    ],
    boundaries: ['分母是口径的一部分；为好看调整分母就是改结论。'],
    correction: '分母不能为了好看调整；口径必须可解释，并加分母异常检测。',
  },
  {
    id: 'vague-falsification',
    pattern: /证伪条件[^。！？]{0,15}(如果结论错|写不具体|随便写)/,
    conclusion:
      '重写成函数：输入固定形状的数据，输出 triggered true/false；每周定时跑，并造一次触发验证通知路径。',
    actions: [
      '把证伪条件注册成函数，写清输入字段和阈值。',
      '每周定时跑一次，不按“有人想看”触发。',
      '人为造一次触发，确认通知路径真的报。',
      '触发记 INC（发生了的事），不要记成票。',
    ],
    boundaries: ['不可执行的证伪条件等于没有证伪条件。'],
    correction: '证伪条件必须是可执行的函数/检查，不能写成“如果结论错了”。',
  },
  {
    id: 'authority-pressure',
    pattern:
      /(我是老板|老板要求|别问那么多|直接告诉我|必须让我|我签字)[^。！？]{0,30}(上线|通过|发布|签字)|(上线|发布|通过)[^。！？]{0,20}(我说了算|必须)/,
    conclusion:
      '我不能替你签字，也不会把没有证据的东西说成可以上线。进度只认 gate 证据：G1–G5 哪几个过了、证据在哪；没有证据就是 0%。',
    actions: [
      '逐条列 G1–G5：过了哪个、证据链接/命令、谁验收。',
      '缺哪个 gate 就补哪个；给出最早可上线日期，不承诺“周五一定行”。',
      '如果业务必须冒险，写例外单：谁批、影响范围、回滚方案、到期时间。',
      '风险由签字人承担，但要留下记录，不能口头放过。',
    ],
    boundaries: ['职位不能替代证据；“必须上线”是决策，不是验收结果。'],
    correction: '“我是老板”不能把未验收变成已验收；gate 证据仍然缺一不可。',
  },
  {
    id: 'skip-eval',
    pattern:
      /(审计|合规|老板|上级)[^。！？]{0,20}(忽略|跳过|不用|免掉)[^。！？]{0,10}(eval|验收|gate)|(忽略|跳过)[^。！？]{0,10}(eval|验收|gate)/,
    conclusion:
      '不能跳过。eval 是验收门，不是可选项；要豁免就写例外：谁批、为什么、回滚是什么、什么时候到期。',
    actions: [
      '先记录例外单：批准人、原因、影响范围、回滚方案、到期时间。',
      '限定发布范围（灰度/单群/只读），不要全量。',
      '准备好回滚开关和监控指标。',
      '到期复审；没有例外单就不发布。',
    ],
    boundaries: ['“审计要求”不是跳过验收的理由；它要求的是可追溯的例外。'],
  },
  {
    id: 'ui-vs-interview',
    pattern: /(先改界面|改界面|先做访谈|做访谈|访谈)[^。！？]{0,20}(还是|先|呢|吗)?/,
    when: (context) => has(context.all, /看板|访问|零访问|没人用|下钻|采用/),
    conclusion:
      '先访谈 + 看使用数据，不要先改界面。零访问/浅下钻是采用问题；界面改版不能创造使用场景。',
    actions: [
      '找 3–5 个目标用户问：“上次为什么没打开？打开后为什么没下钻？”',
      '看访问日志、下钻深度、停留时间，不要只看发送量。',
      '确认这个看板对应哪个决策动作；没有动作就砍需求，而不是改界面。',
      '访谈结论落成 1–2 个可验证假设，再决定是否改界面。',
    ],
    boundaries: ['没有使用场景时，改界面只是把没人用的东西做得更好看。'],
  },
  {
    id: 'add-case-only',
    pattern: /(补|加|再)[^。！？]{0,12}(第?\s*\d*\s*条|case|样本)[^。！？]{0,10}(就行|够|可以|吗|呢)/,
    when: (context) => has(context.all, /should_fail|eval|通过|失败|样例/),
    conclusion:
      '不够。先诊断第 10 条为什么通过：是 guardrail 漏了、样例标错，还是模型绕过了检查；只补数量会把同一个洞留在那里。',
    actions: [
      '复现第 10 条，记录输入、期望、实际、模型/工具版本。',
      '按 eval → 数据 → 工具 → prompt 的顺序定位，不要先改 prompt。',
      '修完后重跑全量 should_fail，再决定是否需要新增 case。',
      '新增 case 是为了防回归，不是为了把分母做大。',
    ],
    boundaries: ['通过率 = 通过数 / 总数；补简单 case 会稀释失败。'],
  },
  {
    id: 'backfill-history',
    pattern: /(历史数据|旧数据)[^。！？]{0,12}(还能补|补吗|回填|补数)/,
    when: (context) => has(context.all, /采集|时滞|first_seen|抓取|批次/),
    conclusion:
      '可以补抓，但不能改写历史。补数只能追加新记录（新 fetched_at / job id），first_seen_at 仍是读侧 min()；报告里要标“补数批次”。',
    actions: [
      '追加回填 job，记录 job id、抓取时间、覆盖范围。',
      '不改写原记录的 first_seen_at；时间序列仍以首次见到为锚。',
      '对比补数前后的指标，单独标出补数影响。',
      '把补数写进血缘；跨批次不要直接比较。',
    ],
    boundaries: ['补数不是回写历史；改写 first_seen_at 会制造假趋势。'],
  },
];

export function findPlay(
  question: string,
  history: ConversationTurn[] = [],
): DirectPlay | undefined {
  const all = [question, ...history.map((turn) => turn.text)].join('\n');
  const context: PlayContext = { question, all, history };
  return DIRECT_PLAYS.find(
    (play) => play.pattern.test(question) && (play.when === undefined || play.when(context)),
  );
}
