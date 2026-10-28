---
id: T-008
title: 链 C：结论→报告（证伪条件可执行化）
kind: ticket
stage: build
created: 2026-10-28
needs: [T-007]
evidence: [E-007]
---
## 做什么

按 `docs/product/data-product-sop.md` §2.7/2.8，打穿结论和报告两层：

1. 结论卡 schema 加 `status`（active / superseded）
2. 每条结论的证伪条件写成 `scripts/verify-conclusion.mjs` 中可调用的检查函数
3. 写证伪检查跑批脚本（weekly cron）；失败时 exit 1 + 输出触发了哪一条
4. 人为造一次触发，验证它报告

## 完成判据

- [x] 结论卡有 `status` 字段（active / superseded）
  - [ ] `superseded` 可被 `work-move.mjs` 迁移 —— **未做**，结论卡还不是 work 实体
- [x] 七条证伪条件被实现为可执行函数（`scripts/conclusion-conditions.mjs`）
- [x] 人为触发测试：造一个满足证伪条件的数据，确认脚本 exit 1 并输出原因
- [ ] 推送通道（飞书或邮件）能在 CI 环境可达 —— **未做**，只有 `--dry-run`

## 衔接

上游：T-007（需要结论格式）
下游：整个 8+3 产品的闭环
