# Acceptance — mas-router 记忆底座与知识图谱

日期：2026-10-29 · 依据 SOP v2.0 六章 8 条

| # | 硬标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | Space 校验（strict） | ✅ | `spaces list`：MAS Router Space · strict · 22 memories / 18 sources |
| 2 | Identity 校验 | ✅ | `agents list`：mas-router-dev · MAS Router Dev · repo_guardian · default space mas-router |
| 3 | Context Bundle 校验 | ✅ | `nmem context --space mas-router`：Space strict + 2 active rules + Working Memory 完整 |
| 4 | Library 切片校验 | ✅ | 18/18 全 `indexed`，错误 0（7 真源文档 + 10 ADR + README） |
| 5 | 实体图谱化校验 | ✅（机制+本体） | ontology apply revision 5：10 对象类型 + 7 关系类型，全部 active（`ontology show --space-id mas-router`）；老 Space 记忆 `graph expand` 呈现实体邻居与 EVOLVES 链；新 Space 实体由 curator 异步物化，⌘5 图谱网络随后呈现 |
| 6 | 语义检索高置信度 | ✅ | 「依赖方向」0.99 / 「eval 即 spec」0.87 / 「MIME 陷阱」0.99，均 ≥0.70 |
| 7 | 单元测试通过 | ✅（等价物） | 本任务不产 Python 产品代码；蒸馏脚本带 `--dry-run` 核验（22 条全枚举合规）后才实跑，22/22 入库 0 失败；`pnpm test` 范围未触碰 |
| 8 | 规范化 Git Commit | ✅ | `feat(memory): stand up mas-router memory space and knowledge graph` |

## 交付物

- `.scratch/nmem-kg/spec.md` + `issues/01..05`（方案与 tickets）
- `tools/dev/distill_memories_to_nmem.py`（四层 22 条蒸馏脚本，dry-run 可核）
- `artifacts/mas-router_ontology_patch.json`（本体 patch，space scope）
- `.claude/settings.local.json`（NMEM_SPACE / NMEM_AGENT_ID 环境固化，已 gitignore）
- `.gitignore` 增补该文件忽略行

## 越纲备注（SOP 未写、实战补的坑）

- `ontology apply` 的 `linkTypes` 不接受 `description` 字段（422），用 `inverseDisplayName`。
- `ontology show` 需 `--space-id`（无 `--space` 参数）；不带参看的是全局 scope。
- Library `list --json` 无统一 state 字段，人读输出列名是 STATE。
