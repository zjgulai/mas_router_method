---
id: T-003
title: 端到端跑通一条配方并打印时间线
kind: ticket
stage: build
created: 2026-10-24
needs: [T-001, T-002]
evidence: [E-003]
---
## 做什么

一个脚本，吃品牌 id 和 URL，调 `createRuntime().run()`，打印步骤、成本、配方。

## 完成判据

- [x] 打真实模型、真工具、真分析器
- [x] 按顺序打印每一步：工具名、摘要、token 数
- [x] 打印总成本与耗时
- [x] 以可读文本打印配方，不是 JSON
- [x] 失败时退出码非零，打印 `outcome.reason`
- [ ] **一条真实 URL 上跑通过并贴出输出**
- [x] `baseline-beauty` 走同一条路径并报告确定性规则

## 为什么停在 awaiting-verification

脚本存在且能跑（`--help` 正常，28 个测试覆盖其依赖），但**从未有一次真实运行**。
原因是缺 `ANTHROPIC_API_KEY` 与 `VOD_API_KEY`。没有这两个，跑起来会停在第一次 `analyze_reference_video`。

按本方法的规矩：脚本存在 ≠ 跑通过。标 awaiting-verification，不标 done。

## 证据
`E-003` — 脚本存在性与参数解析
