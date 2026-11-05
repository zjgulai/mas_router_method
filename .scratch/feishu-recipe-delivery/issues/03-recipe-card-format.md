# 03: Recipe 卡片与全文格式化

**What to build:** `apps/bot-gateway/src/feishu/recipe-format.ts` — Recipe → 两条 payload：① interactive 卡片（标题 + hook + beats 数 + 成本 + recipeId）② 全文 text（beats/visual/script/audio/exclusions 拍平成可读文本，走 maxChars 截断）。RecipeRunner 的 deliver 从占位文本换成卡片+全文。

**Blocked by:** 02 (done, 89b32f9)

**Done when:**
- [ ] 卡片 payload 是合法 interactive msgType，含标题/hook/recipeId
- [ ] 全文含全部 beats 的 description + visual、audio、exclusions
- [ ] 全文超 maxChars 时截断且截断处可读（不截断在词中间）
- [ ] RecipeRunner outcome 扩展为携带 Recipe 对象（succeeded 分支），格式化失败时降级为纯文本摘要不丢投递
- [ ] 快照/断言测试全绿，bot-gateway 全套 + typecheck 绿

**Status:** done (2026-11-03, commit 309060c)

- [x] interactive 卡片先行（标题/hook/recipeId/beats 数/距离/成本）
- [x] 全文含 beats(script/visual/onScreenText)/caption/audio/exclusions
- [x] 超 maxChars 按行边界截断 + workbench 指引
- [x] runner outcome 携带 Recipe；recipe 缺失时降级摘要文本不丢投递
- [x] 61 测试 + typecheck 绿；修正了测试夹具误用不存在字段 description（实为 kind）
