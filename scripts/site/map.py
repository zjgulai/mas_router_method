# 七阶段 x 89 skill 的归属标注。
# 规则：一个 skill 只归一个主阶段（在站点上按主阶段放），次要归属用 tag 标。
# 判断依据：它主要解决"哪一步会卡住"。
# 阶段名不在这里列举——唯一来源是 work/schema.yml。
# build_skills.py 会校验每个条目的阶段名确实存在。

MAP = {
# 管理不是第八个阶段——它横跨七个阶段。但它是一个**归属单位**：技能表按它分组，
# 否则 anb-manage 在技能目录页上不存在，而「管理层难以被发现」正是审计提过的那条意见。
'anb-manage': ('管理', ['ANB', '必用'], '读写项目记录：票据、事故、证据、设计记录。状态就是目录。'),
# ---------- 数据产品（8 层 + 3 柱）----------
# 与七阶段并行的一套流程。按 SOP §零：只有「决策类」的格子才做成 skill，
# 工程类做成检查器，运行类做成定时脚本。所以数据产品侧的 skill 应该长成
# 一层一个，而不是一阶段一个。
'anb-data-metric': ('数据产品', ['ANB', '必用'], '指标层：一个数字的定义、粒度、已知偏差、禁令与版本。判据是换一个人能不能算出同一个数。'),
'anb-data-label': ('数据产品', ['ANB', '必用'], '打标层：判断的定义、不适用值、置信度口径、Kappa 门槛与版本映射。判据是两个人工标能不能一致。'),
'anb-data-conclude': ('数据产品', ['ANB', '必用'], '结论层：主张能不能错、区间跨不跨 0、证伪条件能不能跑、决策有没有动作。两个检查器回答两个问题。'),
# ---------- 需求 ----------
'interview-me': ('需求', ['澄清', '必用'], '把一句话想法问成可验收的意图。需求阶段的内核。'),
'grilling': ('需求', ['拷问', '必用'], '攻击已有草稿，把含糊处问空。'),
'grill-me': ('需求', ['拷问', '别名'], '七行壳，转调 grilling。'),
'grill-with-docs': ('需求', ['拷问', '文档'], '拷问同时沉淀术语表与 ADR。'),
'wayfinder': ('需求', ['探路'], '目标大到一个会话装不下时，先画决策地图。'),
'to-questionnaire': ('需求', ['调研'], '把问题变成问卷，用来问人而不是问模型。'),
'wait-what': ('需求', ['纠偏'], '理解偏差时强制复述。'),
'brainstorming': ('需求', ['发散'], '（未安装）发散阶段。'),
'anb-idea': ('需求', ['ANB', '必用'], '五句话写成想法，含可证伪的否定条件。'),
'ask-matt': ('需求', ['咨询'], '不确定该用哪个 skill 时问它。'),
'find-skills': ('需求', ['发现'], '不确定有没有现成 skill。'),
'codebase-onboarding': ('需求', ['理解现状'], '接手陌生仓库，产出架构地图。'),

# ---------- 设计 ----------
'anb-design': ('设计', ['ANB', '必用'], '四问：流程形状、拒绝清单、动作权限、交接契约。设计阶段的方法本身。'),
'architecture-decision-records': ('设计', ['必用'], '难回退的选择写成 ADR，含放弃的选项和代价。'),
'domain-modeling': ('设计', ['必用'], '术语定死，写进 GLOSSARY。'),
'codebase-design': ('设计', ['必用'], '模块边界、接口深浅、seam 位置。'),
'api-and-interface-design': ('设计', ['契约'], '契约先行、错误语义、分页、幂等。'),
'database-schema-designer': ('设计', ['数据'], '表结构、约束、索引、可回滚迁移。'),
'auth-implementation-patterns': ('设计', ['权限'], 'session/JWT/OAuth 选型、租户隔离。'),
'spec-driven-development': ('设计', ['规格', '必用'], '把共识固化成可验收的规格。'),
'to-spec': ('设计', ['规格'], '对话已透时直接固化，不再采访。'),
'writing-plans': ('设计', ['计划'], '把 spec 变成别人能执行的步骤。'),
'to-tickets': ('设计', ['拆票'], '拆成 tracer-bullet 纵向切片，标阻塞关系。'),
'diagram-design': ('设计', ['表达'], '架构图、流程图、时序图。'),
'archify': ('设计', ['表达'], '可交互的架构/流程/ER 图。'),

# ---------- 开发 ----------
'anb-runnable': ('开发', ['ANB', '必用'], '一条真实输入走通，不含假数据。'),
'implement': ('开发', ['必用'], '读票 → tdd → typecheck → code-review → commit。'),
'implement-spec': ('开发', ['多票'], '一个 spec 下多张票按 frontier 落地。'),
'tdd': ('开发', ['必用'], '红绿重构。'),
'ponytail': ('开发', ['克制'], '最小完整改动，不加没人要的抽象。'),
'ponytail-review': ('开发', ['审查'], '这次改动里哪一行本可以不写。'),
'karpathy-guidelines': ('开发', ['纪律'], '先声明假设，只改必须改的。'),
'reuse-first': ('开发', ['复用'], '写工具前先搜仓库、标准库、GitHub。'),
'prototype': ('开发', ['验证'], '一次性原型回答一个设计问题；多套并排，用截图/时序/状态面板作为证据，产出对比而非菜单。'),
'using-git-worktrees': ('开发', ['隔离'], '独立工作区，基线先绿。'),
'subagent-driven-development': ('开发', ['编排'], '每票一个 fresh subagent + 双审。'),
'dispatching-parallel-agents': ('开发', ['编排'], '判据：哪些能并行。'),
'todo-ledger': ('开发', ['跟踪'], '跨会话的 Now/Next/Done 账本。'),
'handoff': ('开发', ['交接'], '会话结束写交接文档。'),

# ---------- 验收 ----------
'anb-judgeable': ('验收', ['ANB', '硬门'], '定什么算好，且检查必须能失败。唯一硬门。'),
'anb-check-break': ('验收', ['ANB', '必用'], '故意弄坏，看检查会不会红。'),
'anb-check-offline': ('验收', ['ANB'], '断网/密钥错，必须是"无法判断"而非"通过"。'),
'anb-check-readback': ('验收', ['ANB'], '逐条念结果，含跳过了几条。'),
'anb-check-reconcile': ('验收', ['ANB'], '把总数拆开加一遍。'),
'anb-check-output': ('验收', ['ANB'], '看三个真实输出，判断结果对不对。'),
'anb-check-count': ('验收', ['ANB'], '换一种方法把数字再数一遍。'),
'llm-evaluation': ('验收', ['必用'], 'LLM 评测集设计、judge 偏差控制、回归门。'),
# 在仓库里但长期没进这张表。站点按 MAP 渲染，没登记就等于从页面上消失，
# 而 build_skills 的断言只覆盖 anb*，所以它不会报错。2026-11-08 补。
'eval-triage': ('验收', ['评测', '排障'], '真实模型 eval 失败时按层归因（eval → 数据 → 工具 → 提示），不跳层改 prompt。'),
'verification-before-completion': ('验收', ['必用'], '证据先于声明：跑命令、读输出、再下结论。'),
'test-suite-health': ('验收', ['测试'], '测试越写越多越慢越脆时体检。'),
'code-review': ('验收', ['审查'], 'Standards 与 Spec 两条轴分开报告。'),
'security-review': ('验收', ['审查'], '高置信度漏洞，含 prompt injection 与租户泄漏。'),
'requesting-code-review': ('验收', ['审查'], '（未安装）如何请求审查。'),
'receiving-code-review': ('验收', ['审查'], '（未安装）如何接收审查。'),
'diagnosing-bugs': ('验收', ['排障'], '先建会变红的回路，再谈假设。'),
'systematic-debugging': ('验收', ['排障'], '（未安装）同上，更详细。'),

# ---------- 交付 ----------
'anb-shipable': ('交付', ['ANB'], '别人能打开、能用，不需要你在旁边。'),
'anb-check-otherdevice': ('交付', ['ANB'], '换一台设备打开，让另一个人试。'),
'pr': ('交付', ['产出'], 'PR 正文：最小视图、前后证据、合并风险。'),
'deploy-checklist': ('交付', ['发布'], '发布前清单与回滚触发条件。'),
'deployment-patterns': ('交付', ['发布'], '滚动/蓝绿/金丝雀、容器化、CI/CD。'),
'milestone-report': ('交付', ['汇报'], '一页 HTML 里程碑报告，结论先行。'),
# 同上：在仓库里但没登记，站点上看不到它。
'ste': ('交付', ['文案', '规范'], 'ASD-STE100 中文写作规范：重点先说、一词一义、一句一事、状态词固定。生效后持续整场会话。'),

# ---------- 运营 ----------
'anb-observable': ('运营', ['ANB'], '三个数字：跑几次、花多少、为什么失败。'),
'observability-and-instrumentation': ('运营', ['必用'], '从 on-call 问题倒推日志、指标、追踪、告警。'),
'instrument-product-analytics': ('运营', ['必用'], '事件表、漏斗、留存、身份策略。'),
'artifact-registry': ('运营', ['登记'], '每个有持续成本的东西登记 owner 与过期。'),
'deprecation-and-migration': ('运营', ['下线'], '弃用策略与 expand/contract 迁移。'),
'tech-debt': ('运营', ['债务'], '打分排序的债务登记表。'),
'repo-gc': ('运营', ['回收'], 'E1–E4 分级的删除计划。'),
'ponytail-audit': ('运营', ['审计'], '全仓审计：什么可以删。'),

# ---------- 迭代 ----------
'anb-reusable': ('迭代', ['ANB'], '只用过三次以上的才抽；形状会变的别抽。'),
'retro': ('迭代', ['复盘'], '按严重度排序的环境改进项。'),
'setup-matt-pocock-skills': ('迭代', ['配置'], '新仓库首次接入工程 skill。'),
'setup-claude': ('迭代', ['配置'], '装插件、试 skill、连工具。'),
'triage': ('迭代', ['分诊'], 'issue 状态机、分类、agent brief。'),
'anb': ('需求', ['ANB', '入口'], '路由：按阻塞点定位到一步或一个检查。'),
'native-agent-dev': ('需求', ['路由'], '六阶段路由（面向工程师视角）。'),
'native-agent-dev-clarify': ('需求', ['路由'], '六阶段之一：澄清。'),
'native-agent-dev-spec': ('设计', ['路由'], '六阶段之一：规格。'),
'native-agent-dev-tickets': ('设计', ['路由'], '六阶段之一：拆票。'),
'native-agent-dev-build': ('开发', ['路由'], '六阶段之一：构建。'),
'native-agent-dev-eval': ('验收', ['路由'], '六阶段之一：评测。'),
'native-agent-dev-release': ('交付', ['路由'], '六阶段之一：发布。'),
'agent-delivery-router': ('需求', ['路由', '必用'], '先定车道：incident/exploration/capability/fast。'),

# ---------- 其他：不主挂某一阶段，但要收录 ----------
'research': ('设计', ['调研'], '派后台 agent 读一手来源，结论落 md 并标出处。'),
'graphify': ('设计', ['理解'], '查符号定义与调用链。'),
'improve-codebase-architecture': ('迭代', ['改进'], '找架构里的深化机会。'),
'consolidate-memory': ('迭代', ['整理'], '合并重复记忆，修剪索引。'),
'humanizer': ('交付', ['文案'], '去掉 AI 味的文风。'),
'i-have-adhd': ('需求', ['表达'], '按 ADHD 读者重塑输出结构。'),
'caveman': ('交付', ['表达'], '极简表达。'),
'teach': ('需求', ['学习'], '把主题教给人。'),
'wizard': ('开发', ['脚手架'], '交互式生成。'),
'writing-for-agents': ('设计', ['文档'], '写给 agent 读的文档。'),
'frontend-design': ('设计', ['界面'], '界面设计方向。'),
'impeccable': ('设计', ['界面'], '界面评审、审计、打磨、动效。'),
'taste-skill': ('设计', ['界面'], '反 slop 的艺术指导。'),
'ui-ux-pro-max': ('设计', ['界面'], '设计系统与可访问性。'),
'native-feel-skill': ('设计', ['桌面端'], '跨平台桌面端原生手感。'),
'rag-implementation': ('开发', ['检索'], 'RAG：切块、混合检索、引用、评测。'),
'playwright-best-practices': ('验收', ['E2E'], '可靠的 E2E 测试，无任意等待。'),
'agent-browser': ('验收', ['浏览器'], '真的开浏览器点、截图、抓数据。'),
'pdf': ('交付', ['文档'], 'PDF 生成。'),
'pdf-reading': ('设计', ['文档'], '读 PDF。'),
'docx': ('交付', ['文档'], 'Word 文档。'),
'xlsx': ('交付', ['表格'], '电子表格。'),
'pptx': ('交付', ['演示'], '演示文稿。'),
'diagram-design-dup': ('设计', ['表达'], '（占位）'),
'explain-usage': ('运营', ['成本'], '解释 token 花在哪。'),
'huashu-motion': ('交付', ['动效'], '动效视频与解说。'),
'replica-skill': ('需求', ['克隆'], 'clean-room 复刻应用。'),

# ---------- pstack 插件（Lauren Tan / poteto，michael-denyer 的 Claude Code 移植）----------
# 装法：claude plugin marketplace add michael-denyer/pstack-claude
#      claude plugin install pstack@pstack-claude
# 命名冲突：插件里也有 tdd 和 teach，与仓库自带同名。仓库版本胜出（不进这张表），
# 所以调用 /tdd、/teach 走的仍是仓库那套；要用插件版本得显式写全名。
'poteto-mode': ('需求', ['路由', 'pstack'], '插件总入口：按任务类型转具体 playbook。总开销约 4.2k token/会话。'),
'poteto-help': ('需求', ['pstack'], '不确定该用哪个 pstack skill 时问它。'),
'sharpen': ('需求', ['pstack'], '把任务改深而不是改大，然后重写 prompt。'),
'in-your-own-words': ('需求', ['pstack'], '复述目标与问题，强制暴露理解偏差。'),
'bro': ('需求', ['pstack'], '把人话讲回来，去掉术语。比 wait-what 更轻。'),
'figure-it-out': ('需求', ['pstack'], '没有更窄的 playbook 时，设计一份可审计的执行手册。'),
'how': ('设计', ['pstack', '理解'], '问"这东西怎么运作"、改前通读、以及归属层问题（该放哪个包）。'),
'why': ('设计', ['pstack'], '问"为什么这么设计"、回归、复盘、阈值出处。会去查各 MCP 而不靠记忆。'),
'recall': ('设计', ['pstack'], '从自身历史、实时状态与共享记录重建当前工作上下文。'),
'architect': ('设计', ['pstack'], '先出类型、签名、模块结构，再让实现填进去。写代码前定形。'),
'arena': ('设计', ['pstack', '必用'], '并行 N 份候选 → 交叉评审选基准 → 把落选者的强处嫁接进来 → 验证。'),
'principle-exhaust-the-design-space': ('设计', ['pstack', '验证'], '2–3 套并排原型再决定；同形状的第二套不算数。'),
'principle-model-the-domain': ('设计', ['pstack'], '写有状态的逻辑前先定数据形状，再选组织方式。'),
'principle-foundational-thinking': ('设计', ['pstack'], '先定核心类型与数据结构，再决定脚手架与功能谁先。'),
'principle-redesign-from-first-principles': ('设计', ['pstack'], '把新需求并进旧设计时，别叠加，重推一遍。'),
'principle-boundary-discipline': ('设计', ['pstack'], '校验与错误处理只堆在系统边界，内部类型可以信任。'),
'principle-type-system-discipline': ('设计', ['pstack'], '让非法状态无法被表达：类型、字面量、品牌类型。'),
'principle-subtract-before-you-add': ('设计', ['pstack'], '先删死代码与冗余校验，再在更简单的底座上加东西。'),
'principle-laziness-protocol': ('设计', ['pstack', '克制'], '偏向删除与最小改动；想加抽象时先读这条。'),
'principle-minimize-reader-load': ('设计', ['pstack'], '数清"问题到答案"之间的层数，塌掉只有一个调用方的包装。'),
'principle-outcome-oriented-execution': ('设计', ['pstack'], '迁移不过度保存中间态，收敛到目标架构。'),
'principle-never-block-on-the-human': ('设计', ['pstack', '必用'], '可逆的事别问"我可以做 X 吗"。能靠跑一次回答的，不占用人。'),
'principle-attack-the-premise': ('设计', ['pstack'], '两次修同一个前提都失败时，把前提写下来直接测，别写第三个补丁。'),
'swarm': ('开发', ['pstack'], '并行 N 个 worker，排干后汇一份报告：覆盖、竞速、遍历分区。'),
'statechart': ('开发', ['pstack'], '用 TLA+ 检查状态机，并画成 Mermaid 状态图。'),
'deslop': ('开发', ['pstack', '清理'], '删掉 AI 生成的代码泔水，统一风格。'),
'no-comments': ('开发', ['pstack', '清理'], '把注释当成代码缺陷处理：能改成结构或类型的就去改。'),
'typescript-best-practices': ('开发', ['pstack'], '读写任何 .ts/.tsx 时适用。'),
'correct': ('开发', ['pstack'], '把仓库里反复出现的错做成不可能再犯：先架构、再类型、再 lint、最后测试。'),
'principle-build-the-lever': ('开发', ['pstack'], '批量活先造工具（codemod/脚本/生成器），别用手敲。'),
'principle-encode-lessons-in-structure': ('开发', ['pstack'], '同一条指令写到第二次时，把它固化成 lint 或运行时检查。'),
'principle-guard-the-context-window': ('开发', ['pstack'], '上下文快满时，把粗活派给 subagent，主线程只留摘要。'),
'principle-make-operations-idempotent': ('开发', ['pstack'], '命令与处理循环要能扛住崩溃、重启与重试。'),
'principle-separate-before-serializing-shared-state': ('开发', ['pstack'], '先消除共享，再考虑加锁或串行化。'),
'principle-sequence-verifiable-units': ('开发', ['pstack'], '多步工作与堆叠 PR：每单元都要以一次可验证的检查收尾。'),
'principle-fix-root-causes': ('开发', ['pstack'], '排障：追到系统第一次出错的地方修；守卫不等于修复。'),
'principle-test-behavior-not-implementation': ('开发', ['pstack'], '断言用户能观察到的行为，内部改动不该让测试红。'),
'interrogate': ('验收', ['pstack', '必用'], '多模型各派一个对抗者；每条 finding 必须附可重跑的命令与真实输出，主 agent 重跑，跑不出来就丢。'),
'thermo-nuclear-review': ('验收', ['pstack', '审查'], '分支改动的安全与正确性深度审计。'),
'thermo-nuclear-code-quality-review': ('验收', ['pstack', '审查'], '极严的可维护性审查：抽象质量、巨型文件、条件分支蔓延。'),
'thermos': ('验收', ['pstack', '审查'], '并行跑上面两个审查，再合并结论。'),
'blast-radius': ('验收', ['pstack'], '上线前找"diff 之外会被这次改动弄坏的东西"，并真跑代码证明唯一侥幸成立的前提。'),
'benchmark-checklist': ('验收', ['pstack'], '报告任何测量数字前先过这一遍：限制因素、重复次数、是否真干了活。'),
'principle-prove-it-works': ('验收', ['pstack', '必用'], '声明完成前，对着真实产物验证，而不是"能编译"。'),
'principle-explain-the-number': ('验收', ['pstack', '必用'], '每个数字都要能解释：什么限制了它、噪声底多大、还可能测到了什么。'),
'create-verification-skill': ('验收', ['pstack'], '生成一个像用户那样驱动应用的项目级验证 skill。'),
'maintain-verification-skill': ('验收', ['pstack'], '定期校对验证 skill 与功能地图仍然诚实。'),
'create-formal-verification-skill': ('验收', ['pstack'], '给"错了最贵、测试又够不到"的地方选一种形式化验证工具并留下 skill。'),
'maintain-formal-verification-skill': ('验收', ['pstack'], '代码改完后，把形式化模型、harness、性质同步回来。'),
'make-pr-easy-to-review': ('交付', ['pstack'], '整理提交历史、改 PR 正文、给评审指路，不动行为。'),
'babysit': ('交付', ['pstack'], '盯住一个开着的 PR：修 CI、处理直白的评审意见，推到可合并。'),
'fix-ci': ('交付', ['pstack'], '找失败的检查、读日志、做聚焦修复。'),
'fix-merge-conflicts': ('交付', ['pstack'], '非交互解冲突，跑通构建与测试再收尾。'),
'get-pr-comments': ('交付', ['pstack'], '抓取并汇总当前 PR 的评审意见。'),
'show-me-your-work': ('运营', ['pstack'], '长跑无人值守的工作留一份可审计决策轨迹：每行一条 what/why/evidence/result。'),
'automate-me': ('运营', ['pstack'], '把反复的工作风格或偏好固化成 skill。'),
'reflect': ('运营', ['pstack'], '三个并行 reviewer 读本次会话，把学到的东西落到某个已有 skill 的具体改动上。'),
'what-did-i-get-done': ('运营', ['pstack'], '按时间段汇总自己提交的 commit。'),
'ketchup': ('运营', ['pstack'], '用大白话和小图把"你上次说话之后发生了什么"讲清楚，并列出等你决定的事。'),
'ketchup-video': ('运营', ['pstack'], '同上，产出带字幕的短视频。'),
'technical-writing': ('运营', ['pstack', '文案'], '分层写作标准：Diátaxis 结构、开发者句式、STE 指令规则。'),
'unslop': ('运营', ['pstack', '文案'], '去掉任何文字里的 AI 味。'),
'setup-pstack': ('迭代', ['pstack', '配置'], '为各角色选模型，写出本运行时的覆写表。'),
}


# ---------- 同名裁决（2026-11-08 实测） ----------
# 21 个名字同时由仓库和客户端插件提供，两份 SKILL.md 没有一对逐字节相同。
# 不写下来，调用 /name 走哪一份就取决于客户端优先级——那是一个不报错的行为差异。
# 这里记的是**当前实际生效**的裁决（仓库版胜出），不是对两份质量的评价。
_PINNED = ('repo', '仓库版是 2026-10-24 vendored 的固定快照，可复现；插件版随客户端升级而变。')
SHADOWED = {n: _PINNED for n in (
    'code-review', 'codebase-design', 'diagnosing-bugs', 'domain-modeling',
    'grill-me', 'grill-with-docs', 'grilling', 'handoff', 'implement',
    'implement-spec', 'improve-codebase-architecture', 'pr', 'prototype',
    'research', 'retro', 'setup-matt-pocock-skills', 'to-spec', 'to-tickets',
    'triage', 'wayfinder',
)}
# 这一个不只是版本新旧：插件版前提不同，只在明确要求 TDD 时才用。
SHADOWED['tdd'] = ('repo', '插件版只在明确要求 TDD 时用，前提不同；仓库版才是红-绿-重构。')
