# Skill 节点地图：需求澄清 → 产品交付

> **来源**：`npx skills`（skills.sh 生态）上游，四个仓库。
> **位置**：`.claude/skills/`。每个 skill 一个目录，含 `SKILL.md`。（原文件写的是 `mas-router-method/skills/`，该路径从来没有存在过——2026-10-24 修正）
> **当前数量**：仓库 46 个目录 = 34 个上游 + 12 个本方法新增（`anb*`）。原文件写的「38 个」是安装当时的快照。
> **定位**：本文是一份**选型笔记**，不是现状清单。要看现在实际有什么、每个从哪来，以 [`docs/skills/skill-catalog.md`](./docs/skills/skill-catalog.md) 的「来源」列为准。

---

## 零、先说三件你该知道的事

**第一，`grill-me` 是个 7 行的壳。** 它的全文是"Call the Skill tool with 'grilling'"。真正干活的是 `grilling`。`grill-with-docs` 同理，它调用两个：`grilling` + `domain-modeling`。所以**别只装 `grill-me`**——我已经把 `grilling` 和 `domain-modeling` 一起装了。

**第二，有 6 个 skill 在 skills.sh 网站上列出了，但上游仓库里根本不存在。** 我实测确认的：`to-prd`、`to-issues`、`resolving-merge-conflicts`、`zoom-out`、`ubiquitous-language`、`request-refactor-plan`。网站列表过期了。别去找它们，不在。

**第三，有 6 个 skill 需要 `setup-matt-pocock-skills` 提供的追踪器配置才能跑全功能**：`code-review`、`implement-spec`、`to-spec`、`to-tickets`、`triage`、`wayfinder`。没配的话它们会提示你去跑那个 setup。**但它们有 fallback**——`to-tickets` 明确说了"若未提供 tracker，默认用本地 markdown tracker"。这对你其实是好事：本地 markdown 正好和你现有的 `configs/tickets/*.json` 是同一种思路。

---

## 一、节点地图：你的 mindmap 五层 × 实际 skill

你 mindmap 里的节点名几乎能一一对上。这是我按你的结构重排的，不是通用流程。

### 调研层

| 你的节点 | 对应 skill | 来源 | 装量 | 说明 |
|---|---|---|---|---|
| 人调研 | `research` | mattpocock | 703K | 派**后台 agent** 去读一手来源（官方文档/源码/spec），结论落成一个 Markdown 文件并逐个标注来源 |
| `/grilling` | `grilling` | mattpocock | 966K | 真正干活的审讯器。反复追问直到计划没有含糊处 |
| （你的 `/grill-me` 入口） | `grill-me` | mattpocock | **1.4M** | 7 行壳，转调 `grilling` |
| 压 PRD / 压文档 | `grill-with-docs` | mattpocock | 1.2M | 壳，转调 `grilling` + `domain-modeling` |
| （你没写的） | `interview-me` | addyosmani | 54.6K | 和 grilling 互补：grilling 攻击计划，这个采访**你**，把隐性需求问出来 |

**关键区别**：`grilling` 攻击的是**已有计划**（你需要先有 draft），`interview-me` 是从零把需求问出来。你 mindmap 里"人-PRD draft"在 `/grilling` 之前——这个顺序是对的，但**如果 draft 本身是从模糊想法来的，前面应该先有 `interview-me`**。

### 方案层

| 你的节点 | 对应 skill | 来源 | 装量 | 说明 |
|---|---|---|---|---|
| PRD-Agent | `to-spec` | mattpocock | — | 把对话/计划转成 spec |
| （你没写的，但缺） | `codebase-design` | mattpocock | — | 设计模块边界和接口。**这是你 plan 里"契约先行"的落地工具** |
| （你没写的，但缺） | `domain-modeling` | mattpocock | — | 领域建模。`grill-with-docs` 依赖它 |
| spec&ticket-Agent | `to-tickets` | mattpocock | 702K | **把计划拆成 tracer-bullet 纵向切片**，每个声明它被谁 block |
| （原 Playbook 层） | `writing-plans` | obra/superpowers | 281K | 写实施计划。**我建议这个替代你的 Playbook 层**——它比"Playbook"更具体，且是现成的 |
| （你问的"1+N→N=?"） | `dispatching-parallel-agents` | obra/superpowers | — | 派并行 agent 的判据与方式。直接回答你 mindmap 里那个问题 |

### 执行层

| 你的节点 | 对应 skill | 来源 | 装量 | 说明 |
|---|---|---|---|---|
| 编排器-Agent | `subagent-driven-development` | obra/superpowers | 236K | **这是你 mindmap 执行层最该读的一个**。它的原则：每个任务派一个全新 subagent，任务后做 spec+质量双审，最后做全分支审。原话："它们不该继承你 session 的上下文或历史——你精确构造它们需要的东西" |
| 并行会话隔离 | `using-git-worktrees` | obra/superpowers | 216K | 就是我上一份文档说的 worktree 物理隔离，这是现成实现 |
| 前端/后端/数仓开发 | `executing-plans` | obra/superpowers | 241K | 按计划执行，带检查点 |
| 任务实现 | `implement` / `implement-spec` | mattpocock | — | 17 行，但把顺序写死了：先读 ticket → 用 tdd → 常跑 typecheck → 最后调 code-review → commit |
| 测试器-Agent | `tdd` | mattpocock | **1.1M** | 红-绿-重构 |
| （备选） | `test-driven-development` | obra/superpowers | 258K | 同一主题的另一个实现，比 mattpocock 的 `tdd` 更啰嗦 |

**两个 tdd 二选一。** `mattpocock/skills@tdd` 装量 1.1M 且更短；`obra/superpowers@test-driven-development` 258K 但更详细。我两个都装了，你读完选一个，删另一个。

### 部署层

| 你的节点 | 对应 skill | 来源 | 装量 | 说明 |
|---|---|---|---|---|
| 测评-Agent | `llm-evaluation` | wshobson | 12.7K | LLM 评测集设计、LLM-as-judge 的偏差 |
| 代码审核优化-Agent | `code-review` | mattpocock | 780K | 比通用 review 更结构化 |
| （审查的另一半） | `requesting-code-review` | obra/superpowers | 260K | 如何**请求**审查（怎么切分、给什么上下文） |
| （审查的另一半） | `receiving-code-review` | obra/superpowers | — | 如何**接收**审查（防止"什么都改"或"什么都不改"） |
| 测试-Agent | `verification-before-completion` | obra/superpowers | — | **这条直接对应你的证据分层**。原话："Evidence before claims, always. Violating the letter of this rule is violating the spirit of this rule." |
| 部署上线-Agent | — | — | — | **生态里没有好的部署 skill**。你的 8 阶段 SOP 比任何现成的都强，不要换 |
| （你没写的，但缺） | `observability-and-instrumentation` | addyosmani | 52K | 可观测性。agent 产品最容易漏的一块 |

### 协议层 + 其他

| 用途 | skill | 来源 | 装量 | 说明 |
|---|---|---|---|---|
| 卡住时的诊断 | `diagnosing-bugs` | mattpocock | 825K | 系统性调试 |
| （备选） | `systematic-debugging` | obra/superpowers | 304K | 同一主题，更详细 |
| （备选） | `debugging-and-error-recovery` | addyosmani | 60K | 第三份，偏"错误恢复"而非"找根因" |
| 会话间交接 | `handoff` | mattpocock | — | 16 行，写交接文档给下一个 session。**直接对应我 §7.2 说的交接** |
| 方向不清时 | `wayfinder` | mattpocock | 710K | 目标模糊时先探路再规划 |
| 探索式实现 | `prototype` | mattpocock | — | 一次性原型回答设计问题 |
| 复盘 | `retro` | mattpocock | — | 回顾 |
| PR 描述 | `pr` | mattpocock | — | 生成 PR |
| 分诊 | `triage` | mattpocock | — | 问题分诊 |
| 架构改进 | `improve-codebase-architecture` | mattpocock | **1.2M** | 找架构里的深化机会（结合 domain model 和 ADR） |
| 决策记录 | `documentation-and-adrs` | addyosmani | 61.1K | ADR 写法。**对应你 mindmap 里"落 ADR"** |
| 上下文管理 | `context-engineering` | addyosmani | 59K | 上下文四操作。对应会话语境快满时的处理 |
| 提示词设计 | `prompt-engineering-patterns` | wshobson | 23.3K | 写 prompt 的模式库 |
| 需求发散 | `brainstorming` | obra/superpowers | 402K | 发散阶段 |

---

## 二、按阶段串起来的最小可用链

不是全部都要用。这是我认为对你的流程最省事的一条链：

```
【需求澄清】
  interview-me          ← 从模糊想法问出需求（你没写但缺）
    ↓
  人写 PRD draft
    ↓
  grilling              ← 攻击 draft（你原来的 /grill-me 实际调这个）
    ↓
  grill-with-docs       ← 再攻击一次，带领域模型（grilling + domain-modeling）
    ↓
【方案】
  codebase-design       ← 定模块边界和接口（契约先行的落地工具）
    ↓
  to-spec               ← 成 spec
    ↓
  writing-plans         ← 成实施计划（替代你的 Playbook 层）
    ↓
  to-tickets            ← 拆成带 blocking edges 的 tracer-bullet 票据
    ↓
【执行】
  dispatching-parallel-agents   ← 判据：哪些能并行
    ↓
  using-git-worktrees          ← 物理隔离
    ↓
  subagent-driven-development  ← 编排：每任务一个 fresh subagent + 双审
    ↓
  implement / implement-spec   ← 单个任务的执行纪律（先 tdd）
    ↓
  tdd                          ← 红绿重构
    ↓
【部署】
  verification-before-completion ← 证据先于声明（对应你的 L1/L2/L3）
    ↓
  code-review + requesting/receiving-code-review
    ↓
  llm-evaluation               ← agent 产品专属
    ↓
  observability-and-instrumentation
    ↓
  你的 8 阶段 SOP              ← 不要用现成的，你这个更好
```

**贯穿全程**：`handoff`（会话交接）、`diagnosing-bugs`（卡住时）、`documentation-and-adrs`（落决策）、`context-engineering`（上下文快满时）。

---

## 三、和你既有资产的冲突点（必须处理）

**这是本节最重要的部分。这些 skill 不是为中英双语/多层证据治理的仓库写的，直接用会和你现有的东西打架。**

| 冲突 | 具体表现 | 处理 |
|---|---|---|
| **票据 schema 不一致** | `to-tickets` 用 `blocking edges`（哪个票 block 哪个票）；你的 `configs/tickets/*.json` 用 `blocked_by` + `capabilities` + `allowed_effects` + `acceptance` | **以你的 schema 为准**。用 `to-tickets` 的**拆法**（tracer-bullet 纵向切片），产出填进**你的字段**。不要让它新建一套票据格式 |
| **证据标准不同** | `verification-before-completion` 要求"跑命令看输出"，但**它不知道 L1/L2/L3**。它可能把 L2 当充分证据 | 用它强制"附输出"，用你的 `AGENTS.md §2` 强制"标层级"。**两者都要，不能只用前者** |
| **"subagent 不继承上下文"和你多会话现实** | `subagent-driven-development` 假设 subagent 由**同一 session 派发**，共享工具环境。你的现实是**多个独立会话**（不同 worktree、不同进程） | 它的**原则**（fresh context + 每任务双审）适用；它的**机制**（同 session dispatch）不适用。用你的 worktree + 票据机制替代机制，保留原则 |
| **tracker 配置缺失** | 6 个 skill 会提示去跑 `setup-matt-pocock-skills` | 走 fallback（本地 markdown）。**不要跑那个 setup**——它会试图建一套新的 tracker 约定，和你 `configs/` 重复 |
| **语言** | 全部 skill 是英文 | 不要翻译。英文 skill 的条款措辞往往是 load-bearing（如 "Violating the letter of this rule is violating the spirit of it"），翻译会削弱。**你的 PRD/票据用中文写，skill 保持英文**，混用没问题 |

---

## 四、我建议你删掉的

装了不等于要用。这几个对你大概率是噪音，理由是具体的：

| 建议删 | 理由 |
|---|---|
| `test-driven-development`（obra） | 和 `tdd`（mattpocock，1.1M）重复。留装量高的那个 |
| `systematic-debugging`（obra） | 和 `diagnosing-bugs`（mattpocock，825K）重复，后者更短 |
| `debugging-and-error-recovery`（addyosmani） | 第三份调试 skill，重复 |
| `grill-me` | 7 行壳，直接调 `grilling` 即可。**但如果你想保留 `/grill-me` 这个命令名，就留着**——它就是个别名 |
| `brainstorming`（obra） | 你的流程已经从 PRD 起步，不需要发散阶段。除非你真的在做新方向 |
| `prototype` / `retro` / `pr` / `triage` | 这四个是好东西但和你的当前瓶颈无关。先放着，用到再读 |

保留 38 个也不是问题——它们不占上下文，除非被调用。

---

## 五、怎么用（技术上）

**这些 skill 现在只是文件，还没挂到你的 agent 上。** 三种挂法：

**方式 A：直接用（最简单）**
你的 AI 工具如果支持读 `skills/` 目录，把需要的 `SKILL.md` 路径告诉它即可。比如"按 `skills/grilling/SKILL.md` 的方法审讯我这个 PRD"。

**方式 B：软链到工具约定目录**
```bash
# Claude Code / Codex 类工具
ln -s "$PWD/skills" .claude/skills
```
（注意：`skills add` 默认会往 55 个 agent 目录散装 55 份，我特意用 `--copy` 装到临时目录再合并，就是为了避免那个。）

**方式 C：需要时再装**
原命令（会装到工具约定位置，但会在仓库里铺开很多目录）：
```bash
npx skills add mattpocock/skills -s grilling -y
```

**我不建议方式 C**，因为 `npx skills add` 会在仓库根目录创建 `.adal`、`.augment`、`.windsurf` 等约 55 个隐藏目录。你仓库已经有严格的目录治理（`AGENTS.md §6` 明确说"不在根目录发明新目录"），那些会被当成违规。方式 A 或 B 更干净。

---

## 六、上游仓库与更新

| 仓库 | skill 数 | 装量量级 | 备注 |
|---|---|---|---|
| `mattpocock/skills` | 20 | 700K–1.4M | 主力。Matt Pocock（TypeScript 教育者），skill 短、锐、可组合 |
| `obra/superpowers` | 12 | 200K–400K | 工程流程主力。偏"方法论 + 强制纪律" |
| `addyosmani/agent-skills` | 4 | 52K–61K | Google 的 Addy Osmani。质量高但装量低一档 |
| `wshobson/agents` | 2 | 12K–23K | 评测与 prompt 模式，装量最低，**用前自己读一遍** |

更新：
```bash
npx skills check      # 查有无更新
npx skills update     # 更新
```

---

## 七、诚实说明

**一，`to-spec`、`codebase-design`、`domain-modeling`、`handoff`、`pr`、`retro`、`triage`、`prototype`、`wayfinder` 的装量我没逐个查到**（npx 搜索只返回前若干条）。它们的装量未知，但同仓库其他 skill 在 700K–1.4M，推测同量级。

**二，`wshobson/agents` 的两个（12.7K / 23.3K）是按 skills.sh 的"宁缺勿滥"标准偏低的。** 我保留它们是因为 LLM 评测这个主题在生态里几乎没有别的选择，不是因为它们质量已验证。用前自己读。

**三，我没有实测任何一个 skill 的实际效果。** 我只验证了：文件存在、`SKILL.md` 可读、frontmatter 完整、依赖关系（壳文件转调）、以及 6 个网站列表但仓库不存在的。**效果必须你自己跑过才知道。**

**四，6 个"网站上列出但仓库不存在"的 skill，我是通过 `git clone` 上游并用 `find -type d` 实测确认的，不是搜索推测。** 但上游可能在我克隆之后又改了。
