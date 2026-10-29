# 02: Working Memory 初始化 + 真源归档 Library

**What to build:** `mas-router` Space 的每日工作记忆（Focus Areas + Briefing）和可检索的权威
真源文档库，使开机简报与全文检索都有据可依。

**Blocked by:** 01

**Status:** done (2026-10-29)

- [x] `nmem working-memory edit --space mas-router -m "## Focus Areas\n- ...## Briefing\n- ..."`：Focus Areas 覆盖 recipe agent 主线、main agent 已交付状态、待办（rubric judging、evals 真模型运行）
- [x] 真源清单定稿：CLAUDE.md、GLOSSARY.md、docs/adr/*.md（10 篇）、docs/agents/domain.md、docs/agents/issue-tracker.md、docs/product/main-agent-capability-graph.md、docs/evals/main-agent-real-qa.md
- [x] 每份复制为 `/tmp/<name>.markdown` 后 `nmem library add --space mas-router`，打标签（adr/pitfall/caliber 等）
- [x] `nmem library list --space mas-router`：状态全 `indexed`、错误数 0
