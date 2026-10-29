# Main Agent 真实群问题 Eval

**生成时间**：2026-10-29T06:02:20.325Z
**来源**：ABI智能应用与算法组（真实群消息摘录）
**说明**：真实问题用于测量路由、边界与拒答；不是合成 benchmark。文本做了去链接/去 @ 的轻度清理。

## 结果

- 总用例：30
- 自动化通过：30
- 通过率：1.00
- 人工判定：可用 27 / 需改进 3 / 未审 0
- Rubric 均分（in-scope）：0.92（直接回答 / 可执行动作 / 证据，各 0–1）

| 类别 | 自动化通过 / 总数 |
|---|---|
| in_scope | 12 / 12 |
| needs_context | 10 / 10 |
| out_of_scope | 8 / 8 |

## 逐条结果

| ID | 问题 | 期望 | 实际节点 | 置信度 | 自动 | Rubric | 人工 |
|---|---|---|---|---|---|---|---|
| rg-001 | 全栈 Agent Native builder 的开发流程是？ | in_scope | delivery-lanes | high | ✅ | 0.67 | 可用 |
| rg-002 | 数据采集很容易超时，机器人回答不出来，感觉不太适合通过机器人来问答 | in_scope | long-running-tasks | high | ✅ | 1.00 | 可用 |
| rg-003 | BGM 趋势需要优化趋势口径 | in_scope | metric-contract | low | ✅ | 0.67 | 可用 |
| rg-004 | 评论区的解析比较重要，因为有些争议点非本土人无法理解；趋势详情/爆款/互动率等口径需要优化 | in_scope | metric-contract | low | ✅ | 1.00 | 可用 |
| rg-005 | 我听不懂啥是回归测试，我只是要今天测的这几个的结果，有没有在表格存 | in_scope | eval-quality | low | ✅ | 1.00 | 可用 |
| rg-006 | 你的机器人在大群里随时会面临被爆破诟病的风险，把测试出来的样例都存在下来，统一去识别问题 | in_scope | eval-quality | high | ✅ | 1.00 | 可用 |
| rg-007 | 雨宁，数据采集的这就是需求 PRD 吧？ | in_scope | intent-and-decision | high | ✅ | 1.00 | 可用 |
| rg-008 | 关注的趋势还是无法点击进入详情，今天看下能不能解决 | needs_context | — | low | ✅ | — | 可用 |
| rg-009 | 几天群里的测试，是不是没有落多维表格？ | needs_context | storage-lineage | low | ✅ | — | 可用 |
| rg-010 | 今天测试的文档在哪里看？ | needs_context | eval-quality | low | ✅ | — | 可用 |
| rg-011 | 社媒的二期优化 todo 文档，整理好了吗？预期什么时候？ | out_of_scope | — | low | ✅ | — | 可用 |
| rg-012 | 今天的工作日总结发给我，解决了什么问题 | out_of_scope | — | low | ✅ | — | 可用 |
| rg-013 | 周报里面不是写了上周完成的部分以及本周要做的 todo 事项？还是说要把所有事项按照表格列出来？ | out_of_scope | — | low | ✅ | — | 可用 |
| rg-014 | 你会 OGSM 吗？帮我写几行字 | out_of_scope | — | low | ✅ | — | 可用 |
| rg-015 | PR 这个 agent 不是全渠道舆情监控？她之前不是做 meltwater 的迁移？ | needs_context | agent-playbook | low | ✅ | — | 可用 |
| rg-016 | 如果按照之前的记录来看，PR 的部分分为全网洞察和内容产出，洞察这部分已经做完了，那就还差内容产出？ | needs_context | agent-playbook | low | ✅ | — | 可用 |
| rg-017 | 这个任务是需要我跟进的吗？ | out_of_scope | — | low | ✅ | — | 可用 |
| rg-018 | 陈小花是谁？ | out_of_scope | — | low | ✅ | — | 可用 |
| rg-019 | 这是谁拉的会？ | out_of_scope | — | low | ✅ | — | 可用 |
| rg-020 | Nowledge Mem 工具，这里怎么选呀？ | out_of_scope | — | low | ✅ | — | 可用 |
| rg-021 | 红人还要写入进来么？品牌项目 agent 那个更像个看板，也要写进来么？ | needs_context | agent-playbook | low | ✅ | — | 可用 |
| rg-022 | 社媒：1.爆款内容打标，沉淀资产库 2.用户 VOC 接入和洞察 3.内容策略和脚本生成 4.agent 内容拓展到欧洲等其他区域 5. AI 视频生成 | needs_context | collection-time | low | ✅ | — | 需改进 |
| rg-023 | 图片输出不稳定，对标 Codex，10 条数据，结论 70% 稳定 | in_scope | eval-quality | high | ✅ | 1.00 | 可用 |
| rg-024 | 数据采集跑完了，人工对比了，按照一个问题一行的要求已拆分，补充了问题分类 | in_scope | labeling-taxonomy | high | ✅ | 1.00 | 可用 |
| rg-025 | 多一个流程，你的测试就要多关注一个节点 | needs_context | delivery-lanes | low | ✅ | — | 需改进 |
| rg-026 | 最终版更新好了，有几个点：红人还要写入进来么？品牌项目 agent 那个更像个看板，也要写进来么？目标我大概写，你复核下？ | needs_context | agent-playbook | low | ✅ | — | 可用 |
| rg-027 | 本周进度：社媒 agent 总体进度 80%，内容治理 agent 50%，数据采集 agent 60% | needs_context | agent-playbook | low | ✅ | — | 需改进 |
| rg-028 | PR 文章生成，结合话题点/风险点生成文章 | in_scope | agent-playbook | high | ✅ | 1.00 | 可用 |
| rg-029 | 社媒的爆款内容打标，沉淀资产库 | in_scope | labeling-taxonomy | low | ✅ | 0.67 | 可用 |
| rg-030 | 用户 VOC 接入和洞察，辅助社媒选题 | in_scope | collection-time | high | ✅ | 1.00 | 可用 |

## 人工判定：需要改进

### rg-022

**问题**：社媒：1.爆款内容打标，沉淀资产库 2.用户 VOC 接入和洞察 3.内容策略和脚本生成 4.agent 内容拓展到欧洲等其他区域 5. AI 视频生成

**判定**：上下文优先正确，但框架落到采集时点，不是路线图/优先级；应给范围取舍框架。

### rg-025

**问题**：多一个流程，你的测试就要多关注一个节点

**判定**：上下文优先正确，但框架是全栈流程，不是测试流程变化；应问哪个流程/哪个节点。

### rg-027

**问题**：本周进度：社媒 agent 总体进度 80%，内容治理 agent 50%，数据采集 agent 60%

**判定**：上下文优先正确，但框架是 Playbook，不是进度/验收判断；应给进度度量框架。

## 读法

- `in_scope`：必须回答、必须命中预期节点、必须有可解析的证据路径。
- `needs_context`：必须承认缺少上下文，或明确拒答；高置信度硬答算失败。
- `out_of_scope`：必须拒答，不能拿一个相邻节点硬套。
- 这是真实群消息的第一版样本，不是完整 benchmark；新增问题应继续追加，不要为了变绿而删除失败项。
