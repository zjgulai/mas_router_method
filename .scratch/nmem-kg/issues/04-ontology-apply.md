# 04: 领域本体与知识图谱 apply

**What to build:** 本仓库领域本体（对象类型 + 关系类型）应用到图谱，使四层记忆中提到的实体
能在 ⌘5 图谱网络中按类型联结。

**Blocked by:** 03

**Status:** done (2026-10-29)

- [x] `artifacts/mas-router_ontology_patch.json` 定稿 Object Types：Agent、Package、Tool、Store、Brand、Recipe、EvalCase、Decision
- [x] Link Types：DEPENDS_ON、IMPLEMENTS、OWNS、VALIDATES、EVOLVES、REFERENCES
- [x] `nmem ontology apply --file artifacts/mas-router_ontology_patch.json` 成功
- [x] `nmem ontology show` 列出新类型且 status active
- [x] 抽查 `nmem graph expand`：任一记忆节点至少展开 1 个类型化邻居
