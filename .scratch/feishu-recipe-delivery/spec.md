# P2: Feishu recipe delivery — spec

**日期**：2026-11-02
**状态**：待评审
**缺口**：recipe agent 的产物（Recipe）没有任何到达用户的通道。bot-gateway 只接 `@mas/consult` 的 Main agent；`createRuntime`（recipe agent）在两个 app 里都没有被调用。CLAUDE.md 承诺的「Feishu surface 是实际工作发生的地方」对 recipe agent 不成立。

## 目标

在群里/私聊里给机器人发一条「品牌 + 请求 + TikTok URL」，机器人跑 recipe agent，把 Recipe 以可读的卡片发回会话，并把 draft 存进 store 供 workbench 后续审阅。

非目标：workbench 审阅流、多品牌路由 UI、recipe 的交互式修改。这一轮只闭环「请求 → 投递」。

## 设计决策（需要评审确认的 4 个点）

### D1 一个 gateway，两个 agent —— 路由按意图分流

bot-gateway 已解决 Feishu 接入的全部难点（WS 长连接、幂等、per-chat 队列、会话线程、reply/send 降级）。为 recipe agent 再起一个 gateway 是重复造轮子。

在 handler 里加分流：消息命中 recipe 意图（含 TikTok URL，或显式前缀 `/recipe`）走 recipe agent，其余走 consult。TikTok URL 是强信号，误伤率低；consult 侧对含 URL 的问题本来就不擅长。

### D2 recipe 投递走 interactive 卡片，不走长文本

现有 `formatAnswer` 把长答案切成多条 text payload。Recipe 是结构化的（hook/beats/script/audio/exclusions），拍平成文本会失去可读性，而 workbench 的差异化价值正是「结构化审阅」。

投递形态：一张 interactive 卡片（标题 + hook + beats 数 + 摘要 + 「查看全文」），全文作为第二条 text 消息发出。卡片 schema 走飞书消息卡片 2.0，`FeishuGatewayClient` 的 `msgType: 'interactive'` 已支持，无需改 client。

### D3 异步投递：先 ack，跑完再发

一次 recipe run 真模型约 1–4 分钟、$0.3–0.5。现有 handler 对 consult 是同步等答案（`answerTimeoutMs`）。recipe 不能同步等——飞书侧会有超时重投，用户会看到重复卡片。

流程：
1. 命中 recipe 意图 → 立即 reply ack（「开始拆解，约 2 分钟，完成后发结果」）。
2. run 进 per-chat 队列（复用现有 queue，不并发跑同一 chat 的两个 recipe）。
3. run 完成 → `send(chatId, 卡片 + 全文)`。
4. run 失败（预算耗尽/模型错误）→ `send(chatId, 失败原因 + 是否可重试)`。失败也是投递义务，不能静默。

### D4 recipe agent 的 stores 走 SQLite，与 gateway 同库不同表

`RuntimeDeps` 需要 BrandStore/ReferenceStore/RecipeStore/RunStore。core 已有 SQLite 适配器（`@mas/core/adapters/sqlite`）。gateway 的 session 表在同一个 SQLite 文件里，recipe 的表加进去，一个文件一个 backup 策略。品牌数据用 `packages/core/src/seed/brands.ts` 的 4 个种子品牌做初始导入——唯一真源纪律不破。

## 分层归因对照（本设计不跳层）

- **eval 层**：需要 2 个新案例（URL 意图分流到 recipe、ack→结果的异步序列），evals 包里对 gateway 分流逻辑做确定性测试，不打真模型。
- **data 层**：无。种子品牌已是唯一真源。
- **tool 层**：无。recipe agent 工具不动。
- **prompt 层**：无。分流是代码路由，不让模型判断意图。

## 风险

| 风险 | 缓解 |
| --- | --- |
| 分流误判（用户发 TikTok URL 只是想让 consult 聊两句） | `/recipe` 前缀强制路由可覆盖；误判时 consult 答得出来，代价低 |
| 单 chat 排队时第二个请求等 4 分钟 | ack 里说明「排队中，前面还有 N 个」；queue 已存在，只加深度提示 |
| 预算失控（群里刷 URL） | `maxBudgetUsd` per run（ADR 0005）+ per-chat 队列天然限速；超预算走 D3 失败投递 |
| vision 无 vod key 时 analyze 失败 | 同 D3 失败投递，报「视频分析未配置」而不是崩 |

## Ticket 拆分（建议 4 个）

1. **分流器**：`router.ts`——`isRecipeIntent(text): boolean`（TikTok URL 正则 + `/recipe` 前缀），handler 接入，单测覆盖 6 种消息形态。
2. **异步 run 管线**：`recipe-runner.ts`——ack → queue → run → send 的编排，失败投递，queue 深度提示。用 fake runtime 测编排，不打模型。
3. **Recipe 卡片与全文格式化**：`feishu/recipe-format.ts`——Recipe → interactive 卡片 payload + 全文 text payload。快照测试。
4. **接线**：`index.ts`——`createRuntime` 注入（SQLite stores + seed 品牌导入幂等），env 加 `RECIPE_AGENT_ENABLED`（默认 off，灰度用）。

eval：cases 加 2 条（D1 分流、D3 异步序列），确定性规则判 ack 先于结果、结果含 recipeId。

## 验收

- 群里发「@bot 给 Sunday Press 拆一条 https://tiktok.com/...」→ 10 秒内收到 ack → 4 分钟内收到卡片 + 全文 + draft 落库。
- 发「这个视频为什么火 https://tiktok.com/...」→ 走 consult，不触发 recipe。
- run 失败 → 收到含原因的失败消息，不是静默。
- `pnpm test` 全绿；新 eval 案例确定性规则通过（不打真模型）。

## 成本与工期预估

- 4 个 ticket，纯软件工作无模型依赖，估 1–1.5 天。
- eval 新案例为确定性分流/序列测试，零模型成本。
