# 01: Space + Agent 身份 + Space Rules

**What to build:** 一个严格隔离的 `mas-router` Space 和 `mas-router-dev` 守门身份，使任何挂载
该 Space 的会话开机即获得本仓库的工程守门规则。

**Blocked by:** None (can start immediately)

**Status:** done (2026-10-29)

- [x] `nmem spaces create "MAS Router Space" --id mas-router --description "..." --retrieval-mode strict` 成功
- [x] `nmem agents enroll mas-router-dev --name "MAS Router Dev" --role repo_guardian --default-space mas-router --description "..." --tags "repo-guardian,recipe-agent,main-agent"` 成功
- [x] P100 规则 `mas_router_dev_core_persona`：工程纪律人设 + 决策优先级（正确性/数据纪律 > 交付速度 > 文档完备），含核心红线（依赖单向、schema 边界、eval 即 spec）
- [x] P90 规则 `mas_router_dev_repo_boundary`：仓库物理边界（packages/shared 单源、双 surface 分工、`.scratch` 台账约定、数据不进仓）
- [x] `nmem context --space mas-router` 输出含 Space、Rules、身份
