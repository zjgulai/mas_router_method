---
id: E-006
ticket: T-007
at: 2026-10-28
kind: command
result: pass
---
## 命令

```bash
node --test scripts/analysis.test.mjs
node scripts/region-corr.mjs --demo; echo "exit=$?"
node scripts/panel-fit.mjs --demo; echo "exit=$?"
```

## 原始输出

```
# tests 14
# pass 14
# fail 0

识别不成立 — stop
  max |r| = 0.995 between DE and US (limit 0.8)
exit=1

β = 0.371  95% CI [0.306, 0.436]
df 10 · R² 0.999 · 24 obs, 14 parameters
the demo's true β is 0.35 — recovered, and the shared trend is not the answer
exit=0
```

## 这条证据能证明什么

**§七 能说「停」，而且它能区分「停」和「不知道」。**

- 区域同步 → exit 1，输出 max |r| 与判据
- 区域独立 → exit 0；边界带（0.5–0.8）→ exit 0 但输出「有效变异有限」
- 一次以上抓取批次 → exit 2（不是 0，也不是 1）
- 共同周数不足 / 某区域序列平坦 → exit 2，且说明平坦序列为何不能按 0 处理

**面板最小版能产出一个带区间的数，并且认得自己没结论。**

- demo 里种下的真 β = 0.35 被估回 0.371，区间 [0.306, 0.436] 不含 0
- 共有趋势（两条都上升）没有成为答案——这是周固定效应生效的证明
- 区间跨 0 → exit 3 且输出「这不是效应弱」；测试用它做了一次人为触发
- 声量在某周内无区域间变异 → exit 2，指出周固定效应吸收了整个回归元

## 不能证明什么

**没有真实数据。** 弹性 0.35 是我编的，两条序列的噪声是我编的。真实 ERP GMV 与真实
声量的弹性**未知**，区间宽度**未知**。

**标准误是古典的，不是聚类稳健的。** 24 个观测上做聚类稳健推断会比数据本身更强的
断言，所以没做。真实数据上按周聚类后有效 N 会明显小于观测数——那时区间会更宽，
可能宽到无信息。

**控制变量那一步没跑过。** demo 里 promo 是常数，被脚本剔除了。真正加控制变量
（促销、价格、库存、PPC）需要真实数据，而库存那一列设计里写明「拿不到就全部不可信」。

因此本票不标 done，进 awaiting-verification。
