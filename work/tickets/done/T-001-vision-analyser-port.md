---
id: T-001
title: 真实 vision analyser 接到端口上
kind: ticket
stage: build
created: 2026-10-24
needs: [T-000]
evidence: [E-001, E-019]
---
## 做什么

`VisionAnalyzer.analyze()` 用选定的供应商实现，让 `analyze_reference_video` 返回真实 `ReferenceAnalysis`，而不是抛错。

## 完成判据

- [x] 一个样本 TikTok URL 产出能通过 `ReferenceAnalysis` 的分析
- [x] 404 的 URL 返回工具错误，不是异常
- [x] 分析里的 hook pattern 来自 `HookPattern`，至少两个 beats
- [x] 音频权利无法确定时报 `unknown`，不猜 `clearable`
- [x] 有一条针对校验路径的单测，用录制的响应做 fixture
- [x] **真实供应商的一次调用**（ADR 0007 addendum 已写）

## 为什么停在 awaiting-verification

代码路径完整、有 5 个单测、校验在返回前进行。但票的原意是"接真实供应商"，而供应商至今没选定——
ADR 0007 的 addendum 还是空的，`docs/evals/vision-spike/` 里只有 `clips.example.json`。

也就是说：**这条路径从没跑过真实数据**。代码对，但没验过。这正是不能标 done 的原因。

## 证据
`E-001` — vod 适配器的单测（用假 HTTP，校验真实解析）

## 验收结果 2026-11-07

- 真实供应商调用: vod gateway `https://mmu.vod-qcloud.com/v1`，模型 `gemini-3.1-flash-lite`
- 真实 TikTok URL 返回 `ReferenceAnalysis`，hook pattern 在 `HookPattern` 内，beats 至少 2 条
- ADR 0007 addendum 已写
- 证据: `E-019`
- 未完成: T-000 的完整 spike（三样本、两候选、human ground truth、p95）仍未跑；本票只证明真实供应商调用。
