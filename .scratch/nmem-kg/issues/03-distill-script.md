# 03: 四层记忆批量蒸馏脚本

**What to build:** `tools/dev/distill_memories_to_nmem.py` 一键把仓库真源蒸馏为四层记忆入库
`mas-router`，内容与 spec.md 的源映射一一对应。

**Blocked by:** 01

**Status:** done (2026-10-29)

- [x] 脚本含 `--dry-run`（只打印拟入库清单与字数，不调 nmem）
- [x] MEMORIES 按 SOP 四层：L1 decision@1.0（架构铁律 ~8 条）、L2 fact@0.9（业务口径 ~6 条）、L3 learning@0.85（避坑 ~5 条）、L4 context@0.7（演进画像 ~3 条），共 20±5 条
- [x] 全部 `unit_type` 取自 8 枚举；`when: timeless`（L4 用 `past`）；标签含业务关键词（recipe-agent、evals、feishu 等）
- [x] 按"实体聚合"原则：CLAUDE.md 一节聚为一条而非逐句拆分；每条标注真源出处（如 `src: CLAUDE.md#dependencies`）
- [x] `python3 tools/dev/distill_memories_to_nmem.py` 实跑成功，`nmem memories search "依赖方向" --space mas-router` Top1 ≥ 0.70
