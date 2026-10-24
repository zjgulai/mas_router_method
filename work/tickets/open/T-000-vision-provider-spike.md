---
id: T-000
title: 选定视频理解供应商（ADR 0007 的 addendum）
kind: ticket
stage: build
created: 2026-10-24
needs: []
evidence: []
---
## 做什么

按 `docs/evals/vision-spike.md` 跑三条样本、两个候选，把决定写进 ADR 0007 的 addendum。

## 完成判据

- [ ] 三条样本的人工 ground truth（hook/beat 边界、有无口播、音频权利）
- [ ] 两个候选都跑过三条样本，原始响应存在 `docs/evals/vision-spike/`
- [ ] 每道闸门都打分，失败即淘汰，不做加权平均
- [ ] 单次分析成本与 p95 延迟记录（喂给 ADR 0005 的预算说明）
- [ ] ADR 0007 addendum 写清供应商、价格、留存条款、证据路径

## 为什么还开着

`docs/evals/vision-spike/` 里只有 `clips.example.json`。ground truth、原始响应、评分表三份交付物都不存在。
**协议跑过零次。**

## 阻塞

它阻塞 T-001 的最后一格。T-001 的代码可以不依赖它先写完，但"接真实供应商"这件事依赖它。
