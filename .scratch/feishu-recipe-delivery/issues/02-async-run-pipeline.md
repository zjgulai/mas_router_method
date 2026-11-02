# 02: 异步 run 管线

**What to build:** `apps/bot-gateway/src/recipe-runner.ts` — 编排 ack → queue → run → 投递。handler 的 `processRecipe` 从 stub 换成真编排：立即 reply ack（含队列深度提示）→ 后台跑 recipe agent → 完成 send 卡片+全文 / 失败 send 原因。卡片与全文格式化在 ticket 03，本轮用占位文本 payload。

**Blocked by:** 01 (done, f2cb913)

**Done when:**
- [ ] ack 先于 run 开始（fake runtime 断言时序）
- [ ] run 成功 → send 收到含 recipeId 的结果消息
- [ ] run 失败 → send 收到含原因的失败消息，不静默
- [ ] 同 chat 第二单排队，ack 报队列深度（「前面还有 1 单」）
- [ ] 全程不打真模型（fake runtime），bot-gateway 测试全绿 + typecheck

**Status:** in progress
