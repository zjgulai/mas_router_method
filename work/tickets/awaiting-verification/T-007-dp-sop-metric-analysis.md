---
id: T-007
title: 链 B：指标→分析（含 §七 kill switch）
kind: ticket
stage: build
created: 2026-10-28
needs: []
evidence: [E-006]
---
## 做什么

按 `docs/product/data-product-sop.md` §2.4/2.5，打穿指标和分析两层：

1. 写指标卡模板（八项必有字段），含 A2+/A2− 拆分
2. 写 `scripts/region-corr.mjs`：按区域算周度序列的两两相关系数矩阵
   - 输出矩阵 + 最大相关系数
   - 最大相关 > 0.8 → exit 1 并输出「识别不成立，停」
3. 最小版面板回归（待真实数据）：2 区域 × 12 周，输出弹性 + 95% 区间
4. 区间跨 0 时输出「无结论」，不是「效应弱」

## 完成判据

- [x] 指标卡模板存在且有八项字段，缺一项 `metric-card check` 报错（`scripts/metric-card.mjs`）
- [x] `scripts/region-corr.mjs` 对模拟数据跑通，相关性 > 0.8 时 exit 1
- [x] 最小版回归对模拟数据输出区间（真 β 0.35 → 估回 0.371，CI [0.306, 0.436]）
- [x] 区间跨 0 的输出标记为「无结论」，exit 3

## 衔接

上游：无（可和 T-006 并行）；需要真实数据时依赖 T-006
下游：T-008（链 C）依赖本票的「证伪条件」格式
