# Agent 产品交付 SOP（第二链路）

> **入口**：先用 `agent-delivery-router` 判断车道。本文件是「能力车道」（P0–P9）的详细展开；G1–G5 是唯一强制闸门。

面向"能力不确定"的需求：需要模型判断、生成质量、工具调用或知识库的功能。确定性功能走第一条链路（`docs/skills/skill-sop.md`）。

## 0. 决策摘要

三条已经确定的原则：

1. **Playbook 锁目标与约束，不锁机制。** 冻结：目标、用户、行为边界、质量门槛、成本/延迟预算、人工兜底、非目标。留白：交互步骤、prompt 措辞、工具编排——这些由 tracer 和评测迭代出来。
2. **验收 = eval gate + PM 确认。** 确定性检查是硬门槛；rubric 看趋势；PM 确认 pilot 的真实使用结果。三者都过才算通过，任何单一签字都不算。
3. **双轨制。** 涉及模型判断的走 P0–P9；纯 UI、CRUD、webhook、定时任务走原链路。混合需求拆成两个交付物，分别走，共用同一份账本与发布门。

## 1. 判定：走哪条链

| 判定问题 | 是 → | 否 → |
|---|---|---|
| 输出质量需要"判断"，而不只是"断言"？ | P 链 | 原链 |
| 需求会改动 prompt、工具、模型、知识库或上下文策略？ | P 链 | 原链 |
| 失败模式包含"答得不对/不该答却答了"？ | P 链 | 原链 |
| 能用确定性测试完整验收（字段、状态码、页面元素）？ | 原链 | P 链 |
| 上线后需要靠真实使用才能判断好坏？ | P 链 | 原链 |

**混合需求的拆法**：workbench 的"审核按钮"是原链（确定性），"审核建议的质量"是 P 链（判断）。拆成两个交付物，不要用一条链硬套。

## 2. 两条链共享什么

- 同一份 `.agent/ledger.md`
- 同一套票据与阻塞关系
- 同一个 PR 审查门（`code-review` + `security-review`）
- 同一个发布门与回滚要求
- 同一份里程碑报告（`milestone-report`）
- 同一套熵控制（`repo-gc`、`artifact-registry`）

差别只在中间：P 链多两个前置产物（Playbook、Eval），少一个"前后端并行"的阶段。

## 3. P0–P9

| 阶段 | 动作 | 产物 | 通过条件 | 衔接 Prompt |
|---|---|---|---|---|
| **P0 PRD 重构** | 把功能清单翻译成问题与失败模式 | `docs/product/<feature>.md` | PM 与工程对"解决什么问题、不做什么"达成一致 | `用 interview-me 和 grilling 把这份 PRD 重构成 Job story、行为契约、失败模式和非目标。` |
| **P1 Playbook 锁定** | 固化目标与约束，版本化 | `PLAYBOOK.md` | PM + 工程 + 评测负责人三方签字 | `用 spec-driven-development 写 Playbook：只锁目标、边界、预算、兜底和非目标，机制留白。` |
| **P2 评测先行** | 从失败模式生成 case，定通过线与基线 | `docs/evals/<feature>.md` + `packages/evals/src/cases/` | 没有实现也能说清"什么算过" | `按 Playbook 的失败模式写 eval：确定性检查、rubric、should_fail，先定通过线。` |
| **P3 技术倒推** | 在 eval 与预算约束下选型 | ADR + 接口/schema | 每个难回退选择有 ADR；方案能解释如何满足 eval 与预算 | `用 architecture-decision-records 倒推技术方案：模型、上下文、工具契约、数据源、护栏、观测。` |
| **P4 Tracer 切片** | 一条端到端最小路径 | 可运行闭环 | 真实输入跑通，eval 打印 pass/fail | `用 writing-plans 和 to-tickets 切出第一条 tracer：一个输入、一个工具、一个 surface、一个 case。` |
| **P5 并行开发** | 按 loop / tools / surfaces 拆，不按 FE/BE 拆 | 代码 + 测试 | 每个切片独立可验收 | `用 dispatching-parallel-agents 判断哪些切片能并行，其余串行。` |
| **P6 验证** | 单测/集成 + eval 双轨 | 命令输出 + 评测表 | 证据齐全；回归可解释 | `用 verification-before-completion 跑验证，再跑 eval 对比基线。` |
| **P7 审查** | 规范、规格、精简、安全 | 三份报告 | 无 Critical；无高置信漏洞 | `用 code-review、ponytail-review、security-review 依次过一遍。` |
| **P8 验收** | eval 硬 gate + pilot 使用 + 一页汇报 | `reports/*.html` | 确定性检查全过；rubric 不退化；PM 确认真实使用 | `用 milestone-report 出验收页，把 eval 结果和 pilot 证据放进去。` |
| **P9 上线迭代** | 观测三条线，更新 Playbook 与 eval | 下一轮输入 | 每项有 owner 和复查日期 | `用 retro 复盘，把结论回写到 Playbook 的变更记录和 eval cases。` |

## 4. PRD 重构模板（P0 产物）

PM 的原始 PRD 通常按功能组织；重构后按"问题与失败"组织，五个部分：

```markdown
# <Feature> — 需求重构

## 1. Job stories
- 当 <情境>，我想 <动机>，以便 <结果>。
（每条都要能对应一个可观察的行为，不是一句愿望）

## 2. 行为契约
- 必须：<Agent 必须做到的事>
- 禁止：<绝不能发生的事>
- 升级：<什么情况下停下来问人，而不是猜>

## 3. 失败模式
| 失败 | 用户会看到什么 | 为什么危险 | 怎么发现 |
|---|---|---|---|

## 4. 非目标
<这次明确不做什么，以及为什么>

## 5. 成功指标
<可测的数字；没有数字的指标不算指标>
```

## 5. Playbook 模板（P1 产物）

```markdown
# Playbook: <产品/能力> v<n>

## 目标
一句话。什么变了才算成功。

## 用户
谁、在什么场景、多久用一次。

## 任务
Job stories（来自 P0），按优先级排序。

## 行为契约
- 必须 / 禁止 / 何时升级给人

## 工具与数据
- 可用工具及其权限边界
- 数据来源、新鲜度、缺失时的行为

## 质量门槛
- 确定性检查的通过线
- rubric 的最低分与趋势要求
- should_fail 必须 100% 拒绝

## 预算
- 单次运行成本上限
- p95 延迟上限
- 每日/每月总预算

## 人工兜底
什么情况下必须有人介入，以及介入后发生什么。

## 非目标
这次不做，以及原因。

## 变更记录
| 版本 | 日期 | 改了什么 | 为什么 | 谁批准 |
```

**版本规则**：改目标、边界、预算、质量门槛 = 主版本，需要重新签字并重跑基线；改措辞、示例、工具说明 = 次版本，记录即可。

## 6. Eval 模板（P2 产物）

三类检查，比例按风险定，默认参考本仓库 `docs/evals/recipe-quality.md` 的 60/40：

| 类型 | 占比 | 特点 |
|---|---|---|
| 确定性 | ~60% | 免费、稳定、能抓住真正上线的失败 |
| Rubric（LLM judge） | ~40% | 覆盖质量维度，但有噪声，只做趋势 |
| 人工 | 只在 gate | 法务、品牌、should_fail 抽检 |

每个 case 必须有 `why`：它防住哪个真实世界的失败。`why` 写成"覆盖率"的 case 不测任何东西。

通过线要写死数字：

```
1. 所有 should_fail case 必须拒绝（无部分分）
2. 正例的确定性检查全部通过
3. rubric 均分不低于基线，且没有单项跌破阈值
```

基线必须记录模型版本与日期，否则"没有退化"无法判断。

## 7. 角色

| 角色 | 负责 | 签字点 |
|---|---|---|
| PM | 问题、优先级、非目标、pilot 结果 | P0、P1、P8 |
| 工程负责人 | 机制、技术方案、预算可行性 | P1、P3 |
| 评测负责人 | case 设计、通过线、基线 | P1、P2、P8 |
| 审查者 | 规范、规格、安全 | P7 |

一个人可以兼多个角色，但 P8 的"PM 确认"不能由实现者自己代签。

## 8. 示例：Milestone 1 走一遍

以 `docs/roadmap.md` 的第一条 tracer 为例：

- **P0**：把"做一个 Recipe 生成器"重构成"输入一条真实 TikTok 链接，输出一个通过 schema 校验、可被 shooter 执行的 Recipe；失败模式包括时长抄原片、静音视频编造口播、跨品类只换名词"。
- **P1**：Playbook 锁定目标（抽象可迁移）、边界（不做视频生成）、预算（单次成本上限）、兜底（低置信度转人工）。
- **P2**：直接对应 `docs/evals/recipe-quality.md` 的 10 正例 + 4 护栏；先写 case，再写实现。
- **P3**：ADR 0001–0003 已经记录了运行时、schema 边界、工具失败即值三个选择。
- **P4**：一条链接 → `get_brand_profile` → `analyze_reference_video` → 校验 → 持久化 → 时间线 → 一个 eval case。
- **P5**：此时没有前端；并行的是工具实现与 eval harness，不是 FE/BE。
- **P8**：eval 打印 pass/fail + 一条真实链接跑通 + PM 确认输出"shooter 愿意用"。

这与 `docs/roadmap.md` 的 Milestone 1 六条要求完全对齐，不需要改路线图。

## 9. 反模式

| 反模式 | 后果 | 纠正 |
|---|---|---|
| Playbook 写成交互脚本 | 锁死机制，tracer 无法证伪 | 只锁目标与约束 |
| eval 放在测试阶段 | 用已有输出倒推标准，测试变成自我描述 | P2 前置 |
| 先搭前端再验证能力 | 为不存在的价值做界面 | 先 tracer，后 surface |
| 用 demo 代替验收 | 演示能过，真实使用失败 | eval gate + pilot |
| 没有 baseline | "没变差"无法判断 | 记录模型版本与分数 |
| 每次需求重写 Playbook | 契约失去稳定性 | PRD 产生变更集，不重写契约 |
| rubric 当硬 gate | 噪声导致门被静音 | rubric 看趋势，确定性检查做硬 gate |

## 10. 与 skill 链的映射

| 阶段 | Skill | 缺口 |
|---|---|---|
| P0 | `interview-me`、`grilling`、`domain-modeling` | — |
| P1 | `spec-driven-development`、`architecture-decision-records` | 无 Playbook 专用 skill，用 spec 模板改写 |
| P2 | 项目 `docs/evals` 约定 | **无 `llm-evaluation` skill（未安装）** |
| P3 | `codebase-design`、`api-and-interface-design`、`database-schema-designer`、`auth-implementation-patterns`、`architecture-decision-records` | — |
| P4 | `writing-plans`、`to-tickets` | — |
| P5 | `dispatching-parallel-agents`、`using-git-worktrees`、`subagent-driven-development`、`implement`、`tdd`、`reuse-first` | — |
| P6 | `verification-before-completion`、`test-suite-health`、`diagnosing-bugs` | 无 E2E 专用 skill（`playwright-best-practices` 未安装） |
| P7 | `code-review`、`ponytail-review`、`security-review` | — |
| P8 | `milestone-report` | — |
| P9 | `retro`、`tech-debt`、`repo-gc`、`artifact-registry` | 无部署 skill（`deployment-patterns` 未安装） |

## 11. 两条链如何汇合

```
P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9
                                              ↓
                                    共用 ledger / PR / 发布门
                                              ↑
原链：PRD → spec → 开发 → 测试 → 验收 ─────────┘
```

- 汇合点在 P8 之前：两条链的产物都要过同一个 `code-review` 与发布门。
- 里程碑报告同时收录两条链的结果，不分开写。
- 账本只有一个；P 链的 Playbook 版本与 eval 基线作为 `Decisions` 的一部分记录。
