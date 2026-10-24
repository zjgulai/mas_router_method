# Agent Native Builder

一套给**不会写代码的产品开发者**用的方法。六步闭环、五个检查、四页文档。

## 这是什么，不是什么

**是**：让你能判断「agent 做出来的东西是不是真的能用」的一套动作。
**不是**：教你写代码。代码由 agent 写。

这个区别是整个方法的前提。不写代码的人不缺代码，缺的是判断——面对一个正在运行的东西，不知道哪里会坏、坏了看不出来、好了也不确定。

## 四页文档

| 文档 | 什么时候看 |
|---|---|
| `failure-atlas.html` | 看到「全部通过」但心里没底时（六类信号 + 七问句 + 四质量问句 + 附录） |
| `decision-tree.html` | 不知道下一步做什么时 |
| `terms.html` | 报告里出现看不懂的词时 |
| `atlas-test-report.html` | 想知道这套方法自己的证据时 |

## 六步

想法 → 能跑 → **能判断** → 能交付 → 能观测 → 能复用

第三步是唯一的硬门：判断标准建不起来，不要往下做。其余都可以回头。

## Skill 包

`.claude/skills/anb*` 共 13 个：

- **`anb`** — 路由。你说「不知道下一步做什么」或「感觉不对」，它定位到一步或一个检查。
- **六个阶段** — `anb-idea`、`anb-runnable`、`anb-judgeable`、`anb-shipable`、`anb-observable`、`anb-reusable`。每个以「这一步的验收是什么」开场，答不出来不许往下。
- **六个检查** — `anb-check-break`（故意弄坏）、`anb-check-offline`（断网）、`anb-check-readback`（逐条念）、`anb-check-otherdevice`（换设备）、`anb-check-output`（看三个真实输出）、`anb-check-reconcile`（把总数拆开加一遍）。

## 证据

这套方法不是推演出来的，是从一个真实项目里挖出来的。六个事故全部可查：

- `packages/core/src/run-agent.ts` — 预算检查恒假、截断超限
- `packages/evals/src/rules.ts` — 护栏把崩溃当通过
- `packages/evals/src/fixtures.ts` — 假环境比真环境宽松
- `packages/feishu/src/events.ts` — @ 判定认错人

另外有一个自测样本：`anb-experiment-linkdigest/`（403 行源码、358 行测试、31 个检查全过），它就是「机制全绿但产出不可用」的活例子——`node test/run-tests.js` 可复现。

## 已知不足

- 六步是按「能拦下什么错误」切的，不是按真实使用数据切的。
- 「故意弄坏」这个动作在非工程师身上还没验证过，可能有心理阻力。
- 模板仓库还没做——它必须从一个真实跑通的产品里长出来，目前没有。
