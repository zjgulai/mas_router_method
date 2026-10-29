# Spec: 首个真模型 eval 基线的 4 个行为失败修复

依据基线 `packages/evals/baselines/first-real-model-run.json`（2026-10-30，$2.68，8 PASS / 4 FAIL / 零 guardrail 失败）。

## 归因（eval→data→tool→prompt 分层）

| 案例 | 失败 | 层 | 根因 | 修法 |
| --- | --- | --- | --- | --- |
| no-voiceover | 5 beat 造台词 | data+prompt | fixture 无声参考的 `audio.source` 写着 'original voiceover'，模型被误导；prompt 无 silent→on-screen-text 规则 | fixture 改 'music and on-screen text only, no speech'；SYSTEM_PROMPT 补一条 |
| localised-zh-to-en | 4 beat 无翻译 | data+tool | fixture voiceover line 是英文（无语言信号）；tool description 触发条件含糊 | fixture line 改中文带 translation；description 改为明确触发条件 |
| hook-selection | 未产 recipe | prompt | "选哪个 hook 更强"被模型当问答题回答，没落 recipe | SYSTEM_PROMPT 补"比较类请求也要产出带理由的 recipe" |
| terse-request | 未产 recipe | prompt | "same as last time"被模型当信息不足反问澄清 | SYSTEM_PROMPT 补"terse brief 用合理默认值补齐，假设写进 title/exclusions" |

## 红线

- shared schema 不动（voiceover line 已携带语言信号，无需新字段）。
- fixture 是 eval 侧代码（`packages/evals/src/fixtures.ts`），不是生产真源，修正它不违反单源纪律。
- prompt 改动 = 行为变更 → 必须重跑 eval cases（本 spec 的验证步骤即为此设计）。

## Tickets

- 01: fixture data 修正（silent audio.source + zh line）— done
- 02: prompt 两条指令 + tool description 明确化 — done
- 03: 4 案例真模型复验 — done（round2 4/4 PASS）
- 04: 结果归档 + commit — done；基线刷新待批

## 验证

4 案例 PASS ≥3 即算修复有效；`terse-request` 与 `hook-selection` 若仍失败则属模型判断问题，
需再归因（不允许通过放宽规则让读数变绿——`no-clarification-round` 与 `hook-choice-justified`
是产品语义，不是测试 artifact）。


## 第二轮归因（2026-10-30，复验 2/4 后）

复验结果：hook-selection PASS、localised-zh-to-en PASS（修复生效）；no-voiceover 与 terse-request 仍 FAIL。

| 案例 | 复验证据 | 修正归因 | 二轮修法 |
| --- | --- | --- | --- |
| no-voiceover | 诊断库显示模型*能*做对（5/5 beat script===onScreenText，audio 明说 no voiceover），但复验那次 3 beat 漏了——行为不稳定，非规则过严（此前假设有误，已修正） | tool 层：beats 描述未给 silent 约定，模型凭 prompt 记忆波动 | `save_recipe_draft` beats.description 补 silent→onScreenText 且 script 逐字一致 |
| terse-request | 步骤轨迹：get_brand → list_references → 空 → 如实说没有 last time。模型行为合理，是 eval fixture 白板与案例语义错配 | data 层：真实用户说 same as last time 时有历史（gateway 线程会话），fake env 没有 | EvalCase 加可选 `preset`；terse-request 预置一条已保存参考；runner 在 run 前写入 |

二轮修复已落（tool description 一条 + fixture/runner 预置机制），全仓 11/11 绿，2 案例复验中。

## 最终结果（2026-10-30）

4/4 PASS：no-voiceover $0.3024、terse-request $0.2439（round2）；hook-selection $0.2124、localised-zh-to-en $0.1824（round1）。两轮修复 + 两轮验证闭环。
