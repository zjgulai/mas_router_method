# Skill 清单：输入、输出、场景与调用口令

本文列出 63 个 skill（其中 10 个在第十二节重复出现，那是调用关系表，不是重复条目），每个条目给出四件事：**什么时候用、吃什么、吐什么、怎么一句话叫它**。

配套文档：流程编排见 [`skill-sop.md`](./skill-sop.md)，阶段与 gate 见 [`skill-chain.md`](./skill-chain.md)。

## 先读这个：三种来源，不是一种

这份清单里的 skill 来自三个地方，**它们的安装位置不同，不能混为一谈**。之前这份文档没写清楚，导致一次盘点把它误判成「42 个 skill 不存在」。

| 来源 | 数量 | 装在哪 | 怎么验证它可用 |
|---|---|---|---|
| **这个清单里列出的** | 63 | —— | 见下表逐个标注 |
| **仓库自带（git 跟踪）** | 34 | `.claude/skills/`，随仓库走 | `ls .claude/skills/` |
| **随客户端提供的插件** | 38 | 不在仓库里，由客户端提供 | 调用需带前缀，如 `anthropic-skills:agent-browser` |
| **本方法新增** | 13 | `.claude/skills/anb*` | `ls -d .claude/skills/anb*` |

仓库实际共 47 个 skill 目录 = 34 个自带 + 13 个新增。

**仓库自带的 34 个**：`ask-matt`、`code-review`、`codebase-design`、`diagnosing-bugs`、`domain-modeling`、`grill-me`、`grill-with-docs`、`grilling`、`handoff`、`implement`、`implement-spec`、`improve-codebase-architecture`、`native-agent-dev`（含 6 个阶段 skill）、`pr`、`prototype`、`research`、`retro`、`setup-matt-pocock-skills`、`tdd`、`teach`、`to-questionnaire`、`to-spec`、`to-tickets`、`triage`、`wait-what`、`wayfinder`、`wizard`、`writing-for-agents`。

**新增的 13 个**（Agent Native Builder，见 `ANB-README.md`）：`anb`、`anb-idea`、`anb-runnable`、`anb-judgeable`、`anb-shipable`、`anb-observable`、`anb-reusable`，以及六个检查 `anb-check-break`、`anb-check-offline`、`anb-check-readback`、`anb-check-otherdevice`、`anb-check-output`、`anb-check-reconcile`。

**判断依据要说清楚**：一个 skill 在 `.claude/skills/` 里找不到，**不等于它不存在**。它可能在客户端插件里，调用时带前缀即可。下面的「来源」列标注了每一个的归属；标 `插件` 的，本仓库不负责安装，换一台机器或换一个客户端可能就没有。

## 读法

- **输入**：调用前必须已经存在的东西。缺了它，skill 会退化成聊天。
- **输出**：调用后应该落盘或落到对话里的产物。没有产物 = 这个节点没发生。
- **一句话 Prompt**：可直接复制的调用口令，`___` 处按需替换。
- 标 `[*]` 的是会被其它 skill 间接调用的支撑 skill，通常不单独开口。

---

## 一、入口与澄清（5）

| Skill | 来源 | 使用场景 | 输入 | 输出 | 一句话 Prompt |
|---|---|---|---|---|---|
| `interview-me` | `插件` | 需求模糊、只有一句"做个 X"、还没想清用户与成功标准 | 一句模糊诉求 | 一份被用户明确确认的「意图声明」（Outcome / User / Why now / Success / Constraint / Out of scope） | `用 interview-me 采访我：我想做 ___，但还没想清给谁用、成功长什么样。` |
| `grilling` `[*]` | `仓库` | 已有草稿（PRD、方案、设计），需要被逐条拷问 | 一份草稿或明确计划 | 设计树被逐轮问空；每轮问题 + 推荐答案 + 用户裁决 | `用 grilling 拷问这份方案，按 frontier 分轮提问，每个问题给出你的推荐答案。` |
| `grill-me` | `仓库` | 只想快速进入拷问，不需要额外文档 | 同 `grilling` | 同 `grilling`（壳，转调 `grilling`） | `grill me：把这份计划问到我无话可说为止。` |
| `grill-with-docs` | `仓库` | 拷问的同时要沉淀术语表和 ADR | 草稿 + 仓库 | 拷问结论 + 更新后的 `GLOSSARY.md` + `docs/adr/*.md` | `用 grill-with-docs 过一遍这个设计，边问边把术语和决策写进 glossary 和 ADR。` |
| `wayfinder` | `仓库` | 目标大到一个会话装不下、路径还看不清 | 一个模糊的大方向 | 一张 `wayfinder:map` 议题 + 一组决策票据，逐个解到路线清晰 | `用 wayfinder 为 ___ 画一张决策地图，先定目的地，再列出当前能提的票。` |

## 二、调研与代码理解（4）

| Skill | 来源 | 使用场景 | 输入 | 输出 | 一句话 Prompt |
|---|---|---|---|---|---|
| `research` | `仓库` | 需要一手事实：官方文档、源码、API 行为、版本差异 | 一个可回答的问题 | 一份带来源引用的 Markdown 调研笔记 | `用 research 查清 ___，只引一手来源，结论落成 md 并标注出处。` |
| `graphify` | `插件` | 问"这个符号在哪定义、谁在调、依赖方向如何" | 仓库（最好已有 `graphify-out/`） | 符号、文件、行号、调用链；图查询结果 | `用 graphify 查 ___ 的定义和所有调用点，给我文件与行号。` |
| `codebase-design` `[*]` | `仓库` | 设计模块边界、判断接口深浅、决定 seam 位置 | 一段代码或一个模块职责 | 用 module / interface / depth / seam / adapter 词汇写出的设计判断 | `用 codebase-design 的词汇分析这个模块：接口是不是太浅，seam 该放哪。` |
| `improve-codebase-architecture` | `仓库` | 想系统性找"哪里该重构"，而不是凭感觉 | 仓库 + 领域词汇 + ADR | 一份 HTML 报告：候选深化点、前后对比图、推荐强度 | `用 improve-codebase-architecture 扫一遍 ___，把候选深化点做成 HTML 报告。` |

## 三、规格与设计决策（6）

| Skill | 来源 | 使用场景 | 输入 | 输出 | 一句话 Prompt |
|---|---|---|---|---|---|
| `spec-driven-development` | `插件` | 新项目/新功能，需要先写规格再动手 | 已确认的意图 + 仓库现状 | `SPEC-*.md`：目标、命令、结构、风格、测试策略、边界、可验收的成功标准 | `用 spec-driven-development 把刚才的结论写成 spec，写完停下等我批准。` |
| `to-spec` | `仓库` | 对话已经聊透，只需把共识固化成 spec 并发到 tracker | 当前对话上下文 | 发布到 tracker 的 spec（含用户故事、实现决策、测试决策、Out of scope） | `用 to-spec 把当前对话整理成 spec，发到项目 tracker，打 ready-for-agent。` |
| `architecture-decision-records` | `插件` | 做了难回退、反直觉、有真实取舍的决定 | 选项、约束、权衡 | `docs/adr/NNNN-*.md`：背景、选项、决定、后果、何时重议 | `用 architecture-decision-records 为 ___ 的选择写一份 ADR，把放弃的选项和代价写进去。` |
| `api-and-interface-design` | `插件` | 设计 REST/GraphQL、模块契约、前后端边界 | 资源模型、调用方、错误语义 | 类型化契约、统一错误格式、分页、幂等键设计 | `用 api-and-interface-design 设计 ___ 的接口，先出契约和错误语义。` |
| `database-schema-designer` | `插件` | 建模、建表、加索引、写迁移 | 实体、关系、访问模式 | 表结构、约束、索引、可回滚迁移 | `用 database-schema-designer 为 ___ 出 schema，含索引和 up/down 迁移。` |
| `auth-implementation-patterns` | `插件` | 设计登录、会话、令牌、权限、多租户 | 用户类型、端类型、合规约束 | 认证/授权选型与实现规则（session vs JWT vs OAuth、RBAC/ABAC、租户隔离） | `用 auth-implementation-patterns 设计 ___ 的登录与权限，先说清选型和理由。` |

## 四、计划、拆票与原型（4）

| Skill | 来源 | 使用场景 | 输入 | 输出 | 一句话 Prompt |
|---|---|---|---|---|---|
| `writing-plans` | `插件` | 规格已批准，需要一份别人能照着执行的计划 | spec + ADR + 代码结构 | 实施计划：文件清单、接口、逐步测试、全局约束、自查 | `用 writing-plans 把这份 spec 变成可执行计划，每步都要有验证命令。` |
| `to-tickets` | `仓库` | 计划需要拆成可并行、可验收的纵向切片 | 计划或 spec | 带 blocking edges 的 tracer-bullet 票据 | `用 to-tickets 把计划拆成纵向切片，标清每张票被谁阻塞。` |
| `triage` | `仓库` | 票/issue 堆积，需要分类、验证、补信息或写 agent brief | 未处理的 issue / PR | 每个 issue 一个状态角色 + 分类 + 可执行的 brief | `用 triage 过一遍待处理 issue，先给我需要我注意的三类。` |
| `prototype` | `仓库` | 某个交互或状态模型光靠讨论判断不了 | 一个具体设计问题 | 一次性原型（逻辑演示 HTML 或 UI 变体），验证后丢弃 | `用 prototype 做一个一次性原型，只回答 ___ 这个问题，验证完就丢。` |

## 五、执行编排与跟踪（6）

| Skill | 来源 | 使用场景 | 输入 | 输出 | 一句话 Prompt |
|---|---|---|---|---|---|
| `todo-ledger` | `插件` | 跨会话、跨 worktree，需要一份真实状态 | 票据 + 当前分支/工作区 | `.agent/ledger.md`：Now / Next / Done（带证据）/ Decisions / Blocked | `用 todo-ledger 读一下当前状态，告诉我 Now 和下一件事。` |
| `dispatching-parallel-agents` | `插件` | 有 2 个以上互不依赖的任务，可以并行 | 独立任务清单 | 每个任务一个聚焦 prompt，并行派发，汇总后统一验证 | `用 dispatching-parallel-agents 判断这几件事能不能并行，能就一次派出去。` |
| `using-git-worktrees` | `插件` | 开始一条新工作流，需要和当前工作区隔离 | 仓库 + 分支名 | 独立 worktree、依赖装好、基线测试通过 | `用 using-git-worktrees 为 ___ 建一个隔离工作区，并确认基线是绿的。` |
| `subagent-driven-development` | `插件` | 有计划，任务基本独立，想每票一审 | 计划 + 票 + worktree | 每票一个实现 subagent + 一次任务审 + 分支终审 + ledger | `用 subagent-driven-development 执行这份计划，每票一个 fresh subagent，审完再下一票。` |
| `implement` | `仓库` | 单票实现，需要固定顺序 | 一张票或一段 spec | 代码 + 测试 + typecheck + 自审 + 提交 | `用 implement 做这张票：先读票，再 tdd，最后 code-review 再提交。` |
| `implement-spec` | `仓库` | 一个 spec 下有多张票，需要整体落地 | spec + 票图 | 一条集成分支，frontier 逐票合并，最后整体 review | `用 implement-spec 把这个 spec 下的票按 frontier 全部实现到集成分支。` |

## 六、编码纪律与复用（4）

| Skill | 来源 | 使用场景 | 输入 | 输出 | 一句话 Prompt |
|---|---|---|---|---|---|
| `tdd` | `仓库` | 写新逻辑、修 bug，需要红绿循环 | 已确认的 seam 与验收标准 | 先失败的测试 + 最小实现 + 通过的测试 | `用 tdd 在 ___ 这个 seam 上做，先写会失败的测试。` |
| `ponytail` | `插件` | 任何编码任务，尤其是担心过度设计 | 任务 + 相关代码 | 最小完整改动 + 一行"跳过了什么/风险" | `ponytail full：用最小完整改动解决，不要加没人要的抽象。` |
| `karpathy-guidelines` | `插件` | 写、审、重构时的通用行为约束 | 代码或改动 | 更少的假设、更小的改动、可验证的成功标准 | `按 karpathy-guidelines 来：先声明假设，只改必须改的，给出验证方式。` |
| `reuse-first` | `插件` | 准备写工具函数或加依赖之前 | 一句能力描述 | 候选库评分表 + 决定（adopt/adapt/wrap/build）+ 理由 | `用 reuse-first 判断 ___ 该不该自己写，先搜仓库、标准库、GitHub 和 registry。` |

## 七、验证、审查与排障（6）

| Skill | 来源 | 使用场景 | 输入 | 输出 | 一句话 Prompt |
|---|---|---|---|---|---|
| `verification-before-completion` | `插件` | 任何"完成了/修好了/通过了"的声明之前 | 一条可执行的验证命令 | 命令 + 原始输出 + 证据层级 + 结论 | `用 verification-before-completion 验证：跑命令，把输出贴出来再下结论。` |
| `test-suite-health` | `插件` | 测试越写越多、越跑越慢、越改越脆 | 测试套件 + CI 数据 | 运行时/flaky/变异分数 + 删除/重写清单 | `用 test-suite-health 体检测试套件，告诉我哪些测试该删。` |
| `code-review` | `仓库` | 分支/PR 合并前，检查规范与规格两条轴 | diff + 固定基点 + spec | Standards 与 Spec 两份并列报告 | `用 code-review 审 ___..HEAD，标准和规格两条轴分开出报告。` |
| `ponytail-review` | `插件` | 想知道这次改动里"哪一行本可以不写" | 一次改动 + 关联代码 | Must fix / Should fix / Nice to have + Lean 估算 | `用 ponytail-review 审这次改动，重点看有没有本可以不写的代码。` |
| `security-review` | `插件` | 合并前、上线前、处理用户输入/密钥/权限时 | 指定文件或 diff | 高置信度漏洞清单（含证据与修复），附"需验证"项 | `用 security-review 审 ___，只报高置信度，附证据和修复。` |
| `diagnosing-bugs` | `仓库` | 难 bug、性能回退、偶发失败 | 现象描述 + 可运行环境 | 一个能变红的反馈回路 + 最小复现 + 根因 + 回归测试 | `用 diagnosing-bugs 查这个 bug：先建一个会变红的回路，再谈假设。` |

## 八、交付、复盘与熵控制（9）

| Skill | 来源 | 使用场景 | 输入 | 输出 | 一句话 Prompt |
|---|---|---|---|---|---|
| `pr` | `仓库` | 准备开 PR | diff + 证据 + 风险 | PR 正文：最小可视化摘要、前后证据、合并风险 | `用 pr 写 PR 正文，摘要用最小视图，证据给前后对比。` |
| `milestone-report` | `插件` | 里程碑结束、演示前、决策会前 | git 记录 + 票 + 证据 + ADR | 单文件 HTML：结论、指标、交付、证据、风险、下一步 | `用 milestone-report 出这个里程碑的一页 HTML，每个结论都要有证据。` |
| `retro` | `仓库` | 一个周期结束，想改进协作环境 | 会话记录 + 仓库 | 按严重度排序的环境改进项（导航、检查、规范、工具） | `用 retro 复盘这次会话，给出环境改进项，按严重度排序。` |
| `tech-debt` | `插件` | 想知道"该先还哪笔债" | 代码/测试/依赖/事故记录 | 打分排序的债务登记表（含 Agent 特有的 prompt/eval/tool/context 债） | `用 tech-debt 盘点当前债务，按 (影响+风险)×(6-成本) 排序。` |
| `ponytail-audit` | `插件` | 接手仓库、怀疑臃肿、想找可删项 | 整个仓库或指定包 | 全仓审计报告：必修/应修/可选 + 可删行数与依赖数 | `用 ponytail-audit 审这个仓库，重点告诉我什么可以删。` |
| `repo-gc` | `插件` | 里程碑边界，做一次垃圾回收 | 仓库 + 过期登记 + 测试报告 | `docs/gc/<date>.md`：按 E1–E4 分级的删除计划 + 删除提交 | `用 repo-gc 做一次回收，先出报告和删除计划，等我批准再删。` |
| `artifact-registry` | `插件` | 创建脚本、探针、开关、dashboard、临时文档时 | 新产物的路径与用途 | `docs/artifacts.md` 新增一行：owner / expiry / delete when | `用 artifact-registry 给这个脚本登记 owner 和过期时间。` |
| `deprecation-and-migration` | `插件` | 要下线旧系统、旧接口、旧列 | 旧实现 + 消费者清单 | 弃用策略 + 迁移步骤 + expand/contract 方案 | `用 deprecation-and-migration 规划 ___ 的下线，先量化消费者。` |
| `handoff` | `仓库` | 会话结束、换 agent、换人接手 | 当前对话 + ledger | 交接文档：目标、状态、决策、下一步、待答问题、建议 skill | `用 handoff 写交接文档，指向 ledger 和票据，不要重复已有产物。` |

## 九、元技能（3）

| Skill | 来源 | 使用场景 | 输入 | 输出 | 一句话 Prompt |
|---|---|---|---|---|---|
| `domain-modeling` `[*]` | `仓库` | 术语混乱、需要 glossary 或 ADR | 讨论中的领域语言 | 更新后的 `GLOSSARY.md` / ADR | `用 domain-modeling 把刚才那个模糊词定死，写进 glossary。` |
| `setup-matt-pocock-skills` | `仓库` | 新仓库首次接入这套工程 skill | 仓库现状 | `docs/agents/*.md` + 配置块（tracker、标签、领域文档） | `用 setup-matt-pocock-skills 初始化这个仓库，不要重复已有配置。` |
| `find-skills` | `插件` | 不确定某个能力有没有现成 skill | 一句能力描述 | 候选 skill 列表（名称、来源、装量、安装命令） | `用 find-skills 找一下有没有能解决 ___ 的 skill，先验证来源和装量。` |

---

## 十、按需使用（不进入主链）

| Skill | 来源 | 使用场景 | 输入 | 输出 | 一句话 Prompt |
|---|---|---|---|---|---|
| `ui-ux-pro-max` | `插件` | 页面/组件/设计系统/可访问性 | 产品类型、栈、风格关键词 | 设计系统决策 + 交付前检查清单 | `用 ui-ux-pro-max 给这个页面定设计系统，再按清单自查。` |
| `impeccable` | `插件` | 设计评审、审计、打磨、加动效 | 现有界面或目标界面 | critique / audit / polish 结果与改动 | `用 impeccable critique 这个界面，按启发式打分并给修改建议。` |
| `taste-skill` | `插件` | 页面"看起来像 AI 做的"，需要艺术指导 | 品牌、素材、页面目标 | 方向 + 版式 + 配色 + 动效方案 + 自查 | `用 taste-skill 重做这个落地页，先给方向再动手。` |
| `diagram-design` | `插件` | 需要架构图、流程图、时序图等 | 要表达的结构 | 自包含 HTML/SVG 图 | `用 diagram-design 画一张 ___ 图，控制在 9 个节点以内。` |
| `archify` | `插件` | 需要可交互、带主题的架构/流程/ER 图 | 系统描述或 Mermaid | 独立 HTML 图或一页解释页 | `用 archify 把这个系统画成可交互 HTML 图。` |
| `native-feel-skill` | `插件` | 跨平台桌面端、WebView 壳、原生手感 | 平台、技术栈、性能要求 | 架构选型与反模式清单 | `用 native-feel-skill 评估这个桌面端架构，先跑决策树。` |
| `agent-browser` | `插件` | 需要真的开浏览器点击、截图、抓数据 | 目标 URL 与操作 | 操作结果、截图、抓取数据 | `用 agent-browser 打开 ___，登录后截图并抓取列表。` |

## 十点五、v2 新增（五闸门模型）

| Skill | 来源 | 使用场景 | 输入 | 输出 | 一句话 Prompt |
|---|---|---|---|---|---|
| `agent-delivery-router` | `插件` | 每个任务开始，先定车道 | 一句需求 | 车道 + 首个 skill + 适用闸门 | `用 agent-delivery-router 判断这个需求走哪条车道。` |
| `codebase-onboarding` | `插件` | 新仓库、新人接手 | 仓库 | 架构地图 + 起步 CLAUDE.md | `用 codebase-onboarding 给我一份两分钟能读完的仓库地图。` |
| `playwright-best-practices` | `插件` | 写/修 E2E，或测试不稳定 | 测试代码 | 稳定的测试与 CI 配置 | `用 playwright-best-practices 修这个 flaky 测试，先看 trace。` |
| `llm-evaluation` | `插件` | 设计或运行评测、比较模型/prompt | 失败模式 + 输出样本 | eval 集、rubric、基线与回归报告 | `用 llm-evaluation 为这个能力设计一套 eval，先定什么算过。` |
| `deployment-patterns` | `插件` | 容器化、CI/CD、发布策略 | 应用与部署目标 | Dockerfile、流水线、回滚方案 | `用 deployment-patterns 设计这个服务的发布与回滚。` |
| `deploy-checklist` | `插件` | 每次发布前 | 版本与变更 | 发布清单与回滚触发条件 | `用 deploy-checklist 过一遍这次发布。` |
| `observability-and-instrumentation` | `插件` | 上线前、排障后 | 功能与 on-call 问题 | 结构化日志、指标、追踪、告警 | `用 observability-and-instrumentation 为这个功能补上三条信号。` |
| `rag-implementation` | `插件` | 文档问答、知识库 | 语料与问题 | 检索方案、引用、评测指标 | `用 rag-implementation 设计这个知识库的检索与评测。` |
| `instrument-product-analytics` | `插件` | 上线后看使用 | 产品问题 | 事件表、漏斗、身份策略 | `用 instrument-product-analytics 定义这个功能的三个事件。` |

## 十一、不进入研发链路（备查）

`i-have-adhd`、`caveman`（输出风格）、`humanizer`（文风清洗）、`huashu-motion`（动效视频）、`replica-skill`（应用克隆）、`graphify` 的图数据库能力、`find-skills` 的安装能力——这些与"需求→交付"主干无关，按需单独调用。

## 十二、调用关系

以下 skill 会**间接调用**别的 skill，单独调用时要知道它背后还会拉起谁：

| 调用方 | 被调用 |
|---|---|
| `grill-me` | `grilling` |
| `grill-with-docs` | `grilling` + `domain-modeling` |
| `to-spec` / `to-tickets` / `triage` | `setup-matt-pocock-skills` 提供的 tracker 配置；缺失时退回本地 markdown |
| `improve-codebase-architecture` | `codebase-design` + `grilling` + `domain-modeling` |
| `subagent-driven-development` | `using-git-worktrees` + `verification-before-completion` |
| `implement` | `tdd` + `code-review` |
| `implement-spec` | `tdd` + `code-review` + `dispatching-parallel-agents` |
| `repo-gc` | `artifact-registry` + `test-suite-health` + `ponytail-audit` |
| `milestone-report` | `todo-ledger` + `architecture-decision-records` |
| `handoff` | `todo-ledger` |
