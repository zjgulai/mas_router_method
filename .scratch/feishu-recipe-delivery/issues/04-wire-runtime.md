# 04: 接线 createRuntime

**What to build:** `apps/bot-gateway/src/index.ts` 在 `RECIPE_AGENT_ENABLED=true` 时构造
`createRuntime`（`SqliteStore` 实现 brands/references/recipes/runs，`seedBrands()` 幂等导入），
用 `recipe-runtime.ts` 把 `AgentRunResult` 映射成 `RecipeRunOutcome`（成功取该品牌最新 draft），
并注入 `RecipeRunner`。默认关闭，关闭时 consult 路径完全不变。vision 缺 `VOD_API_KEY` 时
不崩，走失败投递并说明「视频分析未配置」。

**Blocked by:** 01, 02, 03

**Done when:**
- [x] `RECIPE_AGENT_ENABLED` 默认 false；开启时构造 runtime + seed 品牌
- [x] 成功 run 用 `listRecipes(brandId, 1)` 取最新 draft 并投递卡片 + 全文
- [x] 失败 run 投递原因 + 是否可重试；无 draft 的成功 run 也投递失败说明
- [x] 飞书触发类型区分 `feishu-dm` / `feishu-group`，actor 用发送者 open_id
- [x] `recipe-runtime.test.ts` 覆盖成功/失败/无 draft/trigger 映射
- [x] bot-gateway typecheck + 85 测试全绿

**Status:** code complete (2026-11-05); real Feishu recipe run pending

- [x] `createRuntime` + `SqliteStore` + `seedBrands()` wiring
- [x] `recipe-runtime.ts` adapter + tests
- [x] `RECIPE_AGENT_ENABLED` config + test
- [ ] 真实群发 TikTok 链接：10 秒 ack → 4 分钟卡片 + 全文 + draft 落库
