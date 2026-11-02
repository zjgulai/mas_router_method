# 01: 意图分流器

**What to build:** `apps/bot-gateway/src/router.ts` — `isRecipeIntent(text): boolean`。命中条件：消息含 TikTok URL（`tiktok.com/.../video/` 或 `vt.tiktok.com` 短链），或以 `/recipe` 前缀开头。handler 接入分流：命中 → recipe 分支（ticket 02 实现，本轮先留 stub 返回「recipe 功能未启用」）；未命中 → 现有 consult 分支不变。

**Blocked by:** 无

**Done when:**
- [ ] router.ts 单测覆盖 6 种形态：含 video URL、含短链、`/recipe` 前缀、纯文本咨询、含非 TikTok URL、URL 在句中
- [ ] handler 分流后 consult 路径行为不变（现有 handler 测试全绿）
- [ ] recipe 分支 stub 消息可达（fake client 断言收到了 stub 回复）
- [ ] `pnpm --filter @mas/bot-gateway test` 与 typecheck 全绿

**Status:** done (2026-11-02, commit f2cb913)

- [x] router.ts 单测 6 形态全绿
- [x] handler 分流后 consult 路径不变（45 原有测试全绿）
- [x] recipe 分支 stub 可达（fake client 断言）
- [x] bot-gateway 53 测试 + typecheck 全绿
