# Spec: 按 SOP 为本项目创建 Nowledge Mem 记忆与知识图谱

依据：`.lody/attachments/0eda3844-SOP_Nowledge_Mem_智能体记忆系统与知识图谱构建规范.md`（v2.0）。

## 目标

为本仓库建立专属 Memory Space（`mas-router`，strict 模式），按 SOP 六步法完成：
Space/身份 → Space Rules → Working Memory + Library → 四层记忆蒸馏 → 领域本体图谱 →
环境固化与验收。

## 硬约束

1. **不干扰并行后台任务**：只新增文件（`.scratch/`、`tools/dev/`、`artifacts/`）与调用
   `nmem` CLI；不改动 `packages/`、`apps/`、`scripts/`、CI、`.claude/skills/` 下任何现有代码。
2. `unit_type` 只用 8 个合法枚举：`fact / preference / decision / plan / procedure / learning / context / event`。
3. Library 归档一律复制为 `.markdown` 后缀（MIME 解析陷阱），从 `/tmp` 传入。
4. 记忆内容全部从仓库真源（CLAUDE.md、docs/adr/、docs/agents/、docs/evals/、GLOSSARY.md）蒸馏，
   单源维护，不凭对话记忆编造口径。
5. 本 Space 面向**本仓库的开发者记忆**（recipe agent + main agent 两个产品线），不是给某个
   客户端 Agent 用的人设空间；守门规则写工程纪律，不写业务话术。

## 关键设计决策

| 决策 | 取值 | 理由 |
| --- | --- | --- |
| Space id | `mas-router` | 仓库/产品名；与已有 `default`、`audit-multi-content` 隔离 |
| Agent id | `mas-router-dev`，role `repo_guardian` | 开发者守门身份，与 content-guardian 模式一致 |
| Rules | P100 人设+决策优先级；P90 仓库边界与数据纪律 | SOP 第 2 步标准两级 |
| 蒸馏脚本位置 | `tools/dev/distill_memories_to_nmem.py` | SOP 附录 A 指定位置（`tools/dev/` 为新增目录） |
| 本体 patch 位置 | `artifacts/mas-router_ontology_patch.json` | SOP 第 5 步指定位置 |
| 运行时 Recall | 不新建 Python 插件；依赖既有 Nowledge hooks + 环境变量 | 本仓库无 Python 问答主链路；SessionStart/UserPromptSubmit hook 已提供 recall 通道 |
| 环境固化 | `.claude/settings.local.json`（gitignore 内）注入 `NMEM_SPACE`/`NMEM_AGENT_ID` | SOP 第 6.1 步；已存在则合并，不覆盖 |

## 四层记忆源映射（蒸馏脚本的 MEMORIES 数据来源）

- **L1 核心准则（1.0, decision）** ← CLAUDE.md 架构铁律：依赖单向（shared←core←apps）、
  run-agent 单文件循环、工具定义走 ports、失败是值不是异常、`dontAsk`/`settingSources: []`、
  预算双保险、schema 边界、双测试纪律、TS 钉死 5.9.3。
- **L2 业务口径（0.9, fact）** ← CLAUDE.md Current state + docs/product/：两 surface 分工、
  consult 能力图（20 节点 17 路由）、eval 集 150 案例、包结构清单、`materialize-main-knowledge.py`
  的存在原因。
- **L3 避坑实证（0.85, learning）** ← 实战教训：unit_type 枚举报错、`.md` MIME 陷阱、
  eval 从未触达真模型（无 key）、skill 三源表易判错（42 个"假 skill"误报）、
  工作区部分 Markdown Node 读为二进制。
- **L4 沉淀纪要（0.7, context）** ← 演进画像：2026-10-29 main agent 里程碑、review packet、
  验收与限制文档索引。

## 本体草案（apply 前在 T-05 定稿）

Object Types：`Agent`（产品 Agent：Recipe/Main）、`Package`、`Tool`、`Store`（port 实现）、
`Brand`、`Recipe`、`EvalCase`、`Decision`（ADR 记录）。
Link Types：`DEPENDS_ON`、`IMPLEMENTS`、`OWNS`、`VALIDATES`、`EVOLVES`、`REFERENCES`。

## 验收（对应 SOP 六章 8 条）

Space strict ✓ / agents 默认 Space ✓ / context bundle 完整 ✓ / Library 全 indexed 0 错误 ✓ /
⌘5 图谱网络（ontology show 显示新类型生效）✓ / 语义检索 Top1 ≥0.70 ✓ / 蒸馏脚本 dry-run
校验（不写单测文件，`pnpm test` 不受影响）✓ / 约定式 commit `feat(memory): ...` ✓。

## Non-goals

- 不给 `packages/consult` 加运行时记忆调用（产品行为变更，走独立需求）。
- 不动 `default` 与 `audit-multi-content` 两个既有 Space。
- 不做历史会话线程回灌（`nmem t save`），仅项目知识蒸馏。
