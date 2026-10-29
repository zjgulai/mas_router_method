# Main Agent 能力图谱：从「方法文档」到「群里可用的咨询 Agent」

**状态**：v1.0，已落地可运行
**日期**：2026-10-29
**对象**：`packages/consult`（咨询引擎）+ `apps/bot-gateway`（飞书入口）
**结论先行**：这个项目最值钱的能力不是「写代码」，而是**把数据产品 / Agent 产品从想法推到可验收**的判断与证据体系。Main Agent 把这套体系变成可路由、可引用、可拒绝的能力图谱，而不是一个通用聊天机器人。

---

## 一、能力图谱是什么：四条轴，十六个节点，十三条问题路线

### 1.1 四条轴

| 轴                  | 取值                                                  | 回答什么问题                                       |
| ------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| **生命周期**（7+1） | 需求 → 设计 → 开发 → 验收 → 交付 → 运营 → 迭代 → 管理 | 现在处在哪一步？这一步的关门条件是什么？           |
| **数据产品层**（8） | 采集 → 存储 → 打标 → 指标 → 分析 → 呈现 → 结论 → 报告 | 问题卡在哪一层？这一层的输入/输出/失败模式是什么？ |
| **横切柱**（3）     | 口径 / 质量 / 血缘                                    | 这个数字的定义、可信度、来路能不能说清？           |
| **Agent 交付**      | 7 阶段 + 四车道 + G1–G5                               | 这是能力问题还是确定性问题？最少要过哪几道门？     |

这四条轴不是并列的流程图。**生命周期是时间，数据层是空间，三柱是每层都要回答的义务，交付车道是入口。** 把四者混成一条瀑布，是这类项目最常见的死法。

### 1.2 十六个能力节点

| 节点                      | 一句话                                       | 主要证据                             |
| ------------------------- | -------------------------------------------- | ------------------------------------ |
| `navigate-capabilities`   | 先判断问题属于哪条轴                         | `ANB-README.md`、`skill-chain.md`    |
| `intent-and-decision`     | 先写「要改变哪个动作」和停止信号             | `data-product-design.md §一`         |
| `data-conclusion-card`    | 结论卡六项，证伪条件可执行                   | `data-product-layers.md §4`          |
| `metric-contract`         | 一个指标一个定义，口径变更不重算             | `data-product-design.md §二`         |
| `collection-time`         | `first_seen_at` 是锚，抓得晚会被读成「更热」 | `data-product-design.md §三·三`      |
| `storage-lineage`         | 只追加、读侧迁移、版本四元组                 | `data-product-layers.md §二`         |
| `labeling-taxonomy`       | 标签带版本、标注带置信度、金标准集           | `data-product-design.md §三·四`      |
| `analysis-identification` | 先跑 §七 相关性门禁，再谈面板                | `data-product-design.md §七`         |
| `presentation-drilldown`  | 每个聚合数都能下钻，三态可见                 | `data-product-design.md §四`         |
| `reporting-falsification` | 主动报「这条不成立了」                       | `data-product-layers.md §4.2`        |
| `agent-playbook`          | 锁目标，不锁机制；guardrail 在工具层         | `PLAYBOOK.md §4`                     |
| `eval-quality`            | eval set 就是 spec；should_fail 100% 拒绝    | `docs/evals/recipe-quality.md`       |
| `agent-failure-diagnosis` | 修复顺序 eval → 数据 → 工具 → prompt         | `CLAUDE.md`、`adr/0003`              |
| `delivery-lanes`          | 一个前门、四车道、五道硬门                   | `skill-chain.md`                     |
| `method-governance`       | 没有能变红的命令，就是愿望                   | `data-product-layers.md §一`         |
| `feishu-surface`          | 事件 → 验签 → 幂等 → 队列 → 回复             | `packages/feishu`、`docs/roadmap.md` |

### 1.3 节点之间的边（关键链路）

```text
需求/决策 ─→ 结论卡 ─→ 指标契约 ─→ 分析识别 ─→ 呈现
                 │                         │
                 └────────→ 报告 ←─────────┘
                              │
                        证伪触发 → 旧结论 superseded

采集时点 ─→ 存储/血缘 ─→ 打标版本 ─→ 指标契约
Agent Playbook ─→ Eval ─→ 失败诊断 ─→ 回写 Playbook
交付车道 ─→ Eval（G2）─→ 发布（G5）
方法治理 ─→ 验证所有 gate 的证据
飞书入口 ─→ 能力导航 ─→ 各节点
```

**这张图最重要的三条边**：

1. **结论 → 指标 → 分析**：没有指标契约，分析就是在一个不稳定的分母上做回归；没有结论卡，分析结果没人能用。
2. **采集 → 存储 → 打标**：`first_seen_at` 和 `taxonomy_version` 是静默错误的两大来源，错了不会报错，只会让结论看起来很正常。
3. **Playbook → Eval → 诊断**：Agent 行为不对时，先补 case，再查数据/工具，最后才改 prompt。

---

## 二、它能回答哪些关键问题

### 2.1 决策类（最上游，先问这些）

| 问题                                     | 回答的核心                              | 输出物            |
| ---------------------------------------- | --------------------------------------- | ----------------- |
| 我有一个数据产品想法，第一步做什么？     | 先写要改变的动作 + 停止信号，再定 C1–C4 | 需求重构          |
| 这个需求值不值得做？                     | 写不出「不投」的条件，就还没通过需求    | 决策 + 停止信号   |
| 老板问「声量到底带来多少 GMV」，能答吗？ | 先看区域相关性；>0.8 不能做区域归因     | §七 检查结果      |
| 报告应该长什么样？                       | 结论卡六项，不是 dashboard              | 结论卡模板        |
| 这个结论能不能信？                       | 区间、依据、证伪条件三件套              | 结论卡 + 证伪检查 |

### 2.2 数据产品层（按层定位）

| 层   | 典型问题                             | 首检                               |
| ---- | ------------------------------------ | ---------------------------------- |
| 采集 | 不同区域抓取时间不同，数据还能比吗？ | `collect-audit` + `first_seen_at`  |
| 存储 | 重跑把历史覆盖了怎么办？             | `collect-store verify`             |
| 打标 | 标签改版后历史不可比怎么办？         | `taxonomy_version` + `label-audit` |
| 指标 | 两个报表同一个指标对不上怎么办？     | `metric-card check` + 两处对账     |
| 分析 | 区间跨 0 是不是说明效应弱？          | `panel-fit` 退出码 3 = 无结论      |
| 呈现 | 看板上线没人用，是产品还是运营问题？ | 下钻深度 + 访问日志                |
| 结论 | 证伪条件怎么写？                     | 已注册函数名                       |
| 报告 | 造了证伪触发但不报怎么办？           | `verify-conclusion --notify`       |

### 2.3 Agent 产品类

| 问题                              | 回答的核心                                      |
| --------------------------------- | ----------------------------------------------- |
| 怎么设计 Agent 的行为边界？       | Playbook 只锁目标/边界/质量/预算/兜底/非目标    |
| 怎么给 Agent 写评测？             | 确定性 60% + rubric 40% + should_fail 100% 拒绝 |
| Agent 答错了，是不是该改 prompt？ | 不是。顺序是 eval → 数据 → 工具 → prompt        |
| 工具失败了应该重试吗？            | `retryable` 最多一次；非 retryable 直接终止     |
| 低置信度时怎么办？                | 重跑一次，仍低则终止并说明缺什么                |
| 模型升级后怎么判断没变差？        | 记录模型版本 + 基线，重跑 eval                  |

### 2.4 交付与治理类

| 问题                       | 回答的核心                                             |
| -------------------------- | ------------------------------------------------------ |
| 这个需求走哪条链？         | 四问判车道：Incident / Exploration / Capability / Fast |
| 五道硬门分别要什么？       | G1 意图、G2 验收、G3 tracer、G4 审查、G5 回滚          |
| 流程太重，能跳过吗？       | 只有 G1–G5 是硬门，其余是清单                          |
| 检查总是通过，绿点可信吗？ | 拆成「有没有检查器 / 跑没跑 / 退出码 / 证据」          |
| 文档之间互相矛盾怎么办？   | 单一来源 + 生成/校验，不手写第四份                     |

### 2.5 飞书入口类

| 问题                       | 回答的核心                                                    |
| -------------------------- | ------------------------------------------------------------- |
| 飞书机器人怎么接事件回调？ | 长连接或 webhook；3 秒内返回，异步处理                        |
| 群聊 @ 了没反应？          | 检查事件订阅、scope、bot 是否在群、mention open_id 是否匹配   |
| 为什么重复回复？           | 按 `event_id` 幂等；忽略 `sender_type=app`                    |
| 本地怎么调试？             | `FEISHU_EVENT_MODE=ws` + `pnpm --filter @mas/bot-gateway dev` |

**不回答什么**：新闻、天气、通用编程、具体品牌的业务数字、没有仓库证据的「最佳实践」。没有依据时明说，不编造命令或路径。

---

## 三、问题解决能力图谱：症状 → 首检 → 处方

这张图是 Main Agent 的「急诊分诊台」。用户不需要知道 8 层或 7 阶段，只需要描述症状。

| 症状                     | 路由                     | 第一检查             | 处方（前两条）               |
| ------------------------ | ------------------------ | -------------------- | ---------------------------- |
| 有个想法，不知道从哪开始 | `route-idea`             | 写「要改变哪个动作」 | 写停止信号；先定 C1–C4       |
| 声量→GMV 归因不可信      | `route-attribution`      | `region-corr`        | >0.8 停；补缺货/促销控制变量 |
| 两个报表数字对不上       | `route-metric-drift`     | `metric-card check`  | 两处对账；口径版本化         |
| 不同区域数据不可比       | `route-collection-lag`   | `collect-audit`      | 两个时点；折算帖子年龄       |
| 标签改版后历史不可比     | `route-label-version`    | `label-audit`        | 旧数据不重写；显式映射       |
| 报告没人看 / 结论没人信  | `route-report-theater`   | 结论卡六项 + 造触发  | 证伪条件函数化；下钻         |
| Agent 答错 / 不稳定      | `route-agent-quality`    | 找可复现 eval case   | eval→数据→工具→prompt        |
| Playbook 不知道写什么    | `route-agent-scope`      | 七项模板检查         | 只锁约束；guardrail 工具层   |
| 流程太重 / 不知道走哪条  | `route-delivery-process` | 四问判车道           | 只守 G1–G5                   |
| 检查总是绿，但心里没底   | `route-fake-green`       | 查 `checks.jsonl`    | 单一来源；能变红的命令       |
| 飞书没反应 / 重复回复    | `route-feishu`           | `bot-gateway check`  | 事件订阅；幂等；异步         |

**路由规则**：症状匹配优先于关键词；如果同时命中多条，取「首检最便宜」的那条。能用一个命令排除的，先排除，不要先讨论方案。

---

## 四、转化为 Main Agent 的能力

### 4.1 Agent 的五个动作

| 动作             | 实现                                                                    | 失败时的行为                                |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| **分类**         | 16 个节点的关键词/别名/ canonical question + 检索证据加权               | 低于阈值 → 追问一层，或明确超出范围         |
| **检索**         | 1128 个 chunk 的 BM25（CJK bigram + 英文词），路径/标题加权，路径多样性 | 无结果 → 只给节点动作，不编造证据           |
| **路由**         | 13 条症状路线，取首检最便宜的一条                                       | 无路由 → 用节点默认动作                     |
| **成文**         | 固定结构：结论/定位/依据/下一步/边界/证据                               | 超长 → 先删「还可以看」、再压证据，不删结论 |
| **合成（可选）** | Anthropic / OpenAI-compatible；只允许改写，不允许新增事实               | 失败/无 key → 直接用 grounded 答案          |

### 4.2 回答契约

每条回答必须包含：

```text
【结论】一句话，可执行
【定位】能力节点（数据产品 / Agent / 交付 / 飞书）
【依据】2–3 条来自仓库的短引文 + 文件路径
【下一步】1–6 条可执行动作，尽量带命令
【边界】这条建议不能回答什么
【证据】文件路径 + 标题
```

**置信度**：`high` / `medium` / `low`。`low` 时追加「需要你补充」，问清在哪一层、跑过哪个检查。**不把低置信度包装成确定结论。**

### 4.3 工具面（可被其他 surface 复用）

`@mas/consult` 暴露：

- `MainConsultAgent.fromRepo()` — 加载图谱 + 语料 + 可选 LLM
- `agent.answer(question)` — 返回 `ConsultAnswer`（文本、节点、路线、置信度、来源、检索、步骤）
- `agent.menu()` — 能力菜单
- `agent.routeFor(question)` — 只做症状路由
- `agent.capabilities()` — 16 个节点及其边界/检查器
- `KnowledgeCorpus.load()` / `.search()` — 独立检索
- `capabilityGraph` — 机器可读的能力图谱

workbench、CLI、飞书网关都调用同一个 `agent.answer()`，不各自实现一套。

---

## 五、飞书事件回调：两条通道，一套处理

### 5.1 为什么默认长连接

|           | 长连接（WebSocket） | Webhook                          |
| --------- | ------------------- | -------------------------------- |
| 公网地址  | 不需要              | 需要 HTTPS                       |
| 本地调试  | 直接可跑            | 需要内网穿透                     |
| 验签/解密 | SDK 内置            | 自己做（已有 `packages/feishu`） |
| 适用      | 开发、内网、单实例  | 生产、多实例、需要网关           |

`FEISHU_EVENT_MODE=ws` 是默认值；`http` 是生产备选。

### 5.2 事件处理序列

```text
Feishu
  │  im.message.receive_v1
  ▼
[WSClient / HTTP POST /events]
  │  验签/解密（HTTP）或 SDK 内置（WS）
  ▼
normaliseMessageEvent
  │  只保留 text/post；忽略 app 发送者、图片、空文本
  ▼
幂等（event_id + message_id，TTL 10 分钟）
  │  重复 → 直接返回
  ▼
准入（allow-list / 群聊 @ 本 bot 的 open_id）
  │  不满足 → 丢弃
  ▼
ChatQueue（全局并发 2，同群串行）
  │  3 秒内返回 Feishu
  ▼
MainConsultAgent.answer
  │  classify → retrieve → route → compose → optional synth
  ▼
reply(message_id)（失败则 send(chat_id)）
```

### 5.3 必须的飞书配置

最快路径（脚本会打印一次性授权链接，确认后自动把订阅方式设为长连接并添加事件）：

```bash
python3 scripts/feishu-onboard.py
```

手工路径：

1. 开启机器人能力。
2. 添加事件 `im.message.receive_v1`。
3. 订阅方式选「使用长连接接收事件」（或填 webhook URL）。
4. 最小 scope：
   - `im:message`（收发消息）
   - `im:message:send_as_bot`（以机器人身份发送）
   - `im:message.group_msg`（读取群消息）
   - `im:message.p2p_msg`（读取单聊消息）
   - `im:chat:readonly`（可选，列群/doctor）
   - `application:application:patch`（可选，脚本自动配置事件订阅）
5. 发布版本，把机器人加入群。
6. 群里 @ 机器人提问。

### 5.4 权限诊断

```bash
pnpm --filter @mas/bot-gateway check
```

输出：tenant token、bot identity、长连接实例数、群列表（若有权）、一个 canonical 问题的回答、缺失 scope 的授权链接。**不会发送任何消息。**

---

## 六、验收：什么样的回答算「能用」

### 6.1 单元/集成测试

- `packages/consult`：33 个测试
  - 图谱完整性：节点唯一、边有效、来源文件存在、检查器脚本存在
  - 语料：1128 chunks，矩阵/文档/能力节点都在
  - 路由：14 个 canonical 问题命中预期节点
  - 回答：结构、证据、长度、越界拒答、菜单
- `apps/bot-gateway`：34 个测试
  - 配置、幂等、队列、mention 匹配、allow-list
  - 回复失败 fallback、长答案拆分、agent 失败提示
- `packages/feishu`：21 个测试（含新增 post 消息与 mention open_id）

### 6.2 活体验收

- `bot-gateway check` 退出 0
- WebSocket 状态 `connected`
- 群里 @ 机器人问「区域间声量相关性 0.9 还能做归因吗？」→ 回复包含 §七 门禁、`region-corr` 命令、设计文档路径
- 问「今天天气怎么样？」→ 明确拒答并给可问范围

### 6.3 回答质量的最低线

1. 有结论、有下一步、有证据路径。
2. 不编造命令、数字、文件路径。
3. 低置信度时承认，并问一个能改变答案的问题。
4. 超出范围时拒答，不即兴发挥。
5. 不超过 3400 字；超长拆成多条。

---

## 七、当前实现与后续

### 已落地

- `packages/consult`：能力图谱、语料加载、BM25 检索、分类、路由、回答、可选 LLM
- `packages/consult/data/sources.json`：111 个源文件的便携快照（Markdown 在本机被压缩存储，Node 读不到原文；Python 物化后由 TS 分块）
- `apps/bot-gateway`：WS + HTTP、幂等、队列、回复/降级、doctor、授权/配置脚本
- `packages/feishu`：post 消息、mention open_id
- 飞书侧：`im:message` / `im:message:send_as_bot` / `im:message.group_msg` / `im:message.p2p_msg` / `im:chat:readonly` 已授权；`im.message.receive_v1` 已设为长连接；已发布 v1.0.3（events: 接收消息）；长连接在线数 1
- 活体验收：群内 @Main 的真实事件已走通 `ws event received → ws event normalised → question received → answer delivered`，回复落在原消息线程
- 事件解析已兼容飞书返回的 `user_id: null`、mention id 的字符串/对象两种形状；此前 `z.string().optional()` 会把整条事件判为非法并静默丢弃
- 已向目标群 “ABI智能应用与算法组” 发送上线通知
- 真实群问题 eval：20 条，自动检查 20/20；人工判定 15 可用 / 5 需改进；报告 `docs/evals/main-agent-real-qa.md`
- 测试：103 个（39 + 41 + 23），工作区 typecheck/test/build 全过

### 还没做

1. **更多真实问题覆盖**：首条群内问答已跑通；下一步是积累 20 条真实问题，观察路由与回答质量。
2. **生产部署**：长连接是单实例；多实例要换 webhook + 共享幂等存储。
3. **持久化幂等**：当前是进程内 TTL；重启后 Feishu 重试可能重复回复。
4. **多轮对话**：当前每条消息独立；需要 thread 级 session。
5. **权限分级**：当前 allow-list 是静态配置；没有按用户/群的能力分级。
6. **评测**：Main Agent 还没有自己的 eval set；当前用 14 个 canonical 问题做路由测试，不是完整 eval。

### 下一步建议（按风险排序）

1. 在目标群 @Main 跑通第一条真实问答，并查看 `/tmp/main-agent-gateway.log` 的 `question received` / `answer delivered`（最高风险：飞书侧事件是否真的送达）。
2. 记录 20 条真实问题与回答，标「可用/不可用」，形成 Main Agent 的第一版 eval。
3. 加 thread session，让「接着上一个问题」可用。
4. 把 `checks.jsonl` 接进来：回答里能引用「这个检查最近一次跑是什么时候」。
5. 多实例前把幂等和队列换成持久化存储。

---

## 八、这份能力图谱自己的证伪条件

以下任一出现，说明这套设计错了：

1. **群里连续 10 个问题，有 3 个以上被路由到错误节点** → 关键词/路线需要重做，不是加文档。
2. **回答被用户评价为「像文档摘抄，不能行动」** → 动作层不够具体，需要把检查器/命令前置。
3. **用户反复问同一类问题，但回答没有改变其动作** → 能力图谱覆盖了「知道」，没覆盖「做到」。
4. **为了回答更多问题而不断加节点，但每个节点都没有检查器** → 退化成百科，不再是咨询平台。
5. **LLM 合成层引入仓库里没有的事实** → 关闭合成，回到 grounded 答案。

**维护规则**：新增节点必须同时有 `sources`、`actions`、`boundaries`；新增动作必须能指向一个命令或一个可判定的人审动作。否则不加。
