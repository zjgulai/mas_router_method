---
name: eval-triage
description: Triage a real-model eval failure to the right layer before touching anything. Use when an eval case fails against the real model and the fix could live in fixture data, tool schema descriptions, or the system prompt. Encodes the layered-attribution discipline (eval → data → tool → prompt) with the pitfalls found in the 2026-10 eval-fix-2601 cycle: undescribed tool-schema fields as variance magnets, lying fixtures, and preset context for history-dependent cases.
---

# eval-triage：eval 失败分层归因

真实模型 eval 失败时，按层归因，不跳层修。顺序：**eval → data → tool → prompt**。
跳层修（直接改 prompt）是 agent 工作慢的主因。

## 流程

1. **先确认失败是真的行为失败，不是规则误报**
   - 读该案例的确定性规则，确认期望值写在规则里还是只在案例注释里。
   - 模型不可见的期望值（只存在于 cases/index.ts 的规则参数）不是模型的错——这是 eval 层问题。

2. **拿真实产物诊断**
   - 用 `packages/evals` 的 `try-one --db <独立库>` 跑单案例，拿到模型实际产出的 recipe。
   - 对比产物与期望，确定偏差落在哪个字段。

3. **按层归因**（命中哪层修哪层，上层不背下层的锅）：

   | 层 | 症状 | 修法 |
   | --- | --- | --- |
   | eval（规则/案例） | 期望只在规则参数里，模型不可见；案例语义依赖历史但 fixture 没预置 | 案例请求里显式声明要求；EvalCase 加 preset 预置上下文 |
   | data（fixture） | fixture 内容与案例意图矛盾（如无声视频参考写 `audio.source: 'original voiceover'`） | 修 fixture，让数据不撒谎 |
   | tool（schema describe） | 模型把正确判断写进自由文本、结构化字段留 unknown/默认值；数值字段报阈值边缘值 | 给字段补 describe：枚举每值的语义、数值的锚点、字段间的互斥/一致约定 |
   | prompt（系统提示） | 某类请求整体没有行为契约（如 terse/比较类请求要不要落 recipe） | SYSTEM_PROMPT 补行为契约，一条规则管一类 |

4. **复验是完成的必要条件**
   - 单测绿 ≠ ticket 完成。prompt/tool 改动 = 行为变更，必须真模型复验该案例 PASS。
   - 全量修复后刷新基线（--save-baseline），基线的价值是抓单次跑看不到的方差。

## 坑点清单（2026-10 eval-fix-2601 实证）

- **tool schema 无 describe = 方差温床**。`audio.rights` 枚举没 describe 时，首轮 PASS、刷新 FAIL（bbbeb5e 修复）。`abstractionDistance` 没锚点时模型报 0.55（8ec78cc 修复）。**prompt 是背景，tool schema 是行动契约。**
- **fixture 会撒谎**。模型信任 fixture 胜过 case 意图；无声参考必须写真实的 audio 数据。
- **历史依赖案例必须 preset**。terse-request 修复方式：EvalCase 加 `preset` 可选字段，runner 在 run 前写入 fake env。否则测的是 store 的空，不是 agent 的判断。
- **模板串里别用反引号**。prompt 文本内的 backtick 截断 JS 模板串（TS1005）。TS 文件里写 prompt 用字符串拼接或避免围栏。
- **二轮修很正常**。4 个失败里 2 个需要第二轮：第一轮修完复验，看新失败形态再定位下一层。不要指望一次修对。
- **自报数值的硬阈值会打自己的契约**（2026-11-02 实证）。tool describe 教模型「结构保留不计距离、只算换掉的层」，high-abstraction 案例又要求「keep the structure」——诚实读数落在 0.4–0.55，与 0.6 硬阈值天然冲突。两轮 FAIL（0.55→0.45）且修复后变差是期望层 bug 的信号：此时用 rubric 维度（transferability）判质量，硬阈值只保留「是否申报」的诚实检查。裁决方法：把产物喂给 judge 拿维度分，judge 说「距离属实」即证模型无错。
- **修改后的文件报 TS1490 'File appears to be binary' 但磁盘内容干净**：换 inode（`cat f > f.new && mv f.new f`）。esbuild/tsc 的读取缓存会记住旧 inode 的坏读数。

## 成本纪律

- 单案例复验 ~$0.3–0.5；全量基线 ~$2.7–5.2。花前批准，花后记账进 spec。
- 诊断（try-one）也走真模型，计入验证预算。

## 环境坑（本机实证 2026-11-02）

- **run-evals/try-one 在后台 shell 可能零 TCP 挂起**：进程活着、无网络连接、输出为 0 字节。10 分钟无输出即杀，不要等。基线跑能成功、单案例反复挂，原因未明（疑似长连接被环境代理静默丢弃）。绕法：用 `tsx -e` 内联调 judge 评已存产物，一次几十秒、几分钱。
- **judge 需要 `EVAL_RUBRIC=on` + `ANTHROPIC_API_KEY` 两个条件**，`--rubric` flag 只管 runner 不管 judge 凭证。
- runner 要的是 `ANTHROPIC_API_KEY`；本机只有 `ANTHROPIC_AUTH_TOKEN` 时显式映射 `ANTHROPIC_API_KEY=$ANTHROPIC_AUTH_TOKEN`。
