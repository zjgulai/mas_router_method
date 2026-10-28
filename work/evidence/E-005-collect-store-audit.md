---
id: E-005
ticket: T-006
at: 2026-10-28
kind: command
result: pass
---
## 命令

```bash
node --test scripts/collect.test.mjs
node --test scripts/collect-audit.test.mjs
node scripts/collect-audit.mjs --demo; echo "exit=$?"
```

## 原始输出

```
# tests 14
# pass 14
# fail 0

# tests 7
# pass 7
# fail 0

不通过 — 1 failure(s)
  • 时滞 spread is 4.0 days across regions (limit 3) ...
  • 去重率 (recall) is 0.0% ... the fingerprint flagged only 0
exit=1
```

## 这条证据能证明什么

**链 A 的三个静默错误各自有检查，而且检查能变红。**

- `first_seen_at` 在重跑时不动（第二次抓取 likes 从 10 涨到 99，锚点仍是首次）
- 空抓留 run 记录：`ok` + 0 items 的 run 存在，且**不被判为失败**
- 迁移是读侧的：磁盘字节不变，带透镜与不带透镜都能读
- 时滞跨区域 4 天 → exit 1；指纹漏检真实重复 → exit 1
- 无法判断的情形（只见过一次、没有粗键字段）→ exit 2，不是 0

## 不能证明什么

**不能证明真实 Apify 数据的时滞分布。** demo 里的增长曲线是编的（每天 8%）。
真实互动量增长曲线、真实跨源重复率、真实指纹召回率都还没有数字。

**不能证明适配器可用。** 没有任何一个真实源接进来。「adapter 契约有文档」这一条
在 `docs/product/data-product-layers.md` §二，但契约的实现只有测试里的假数据。

去重率的下限（10%）与上限（90%）是「结构性坏掉」的边界，**不是标定值**。
设计明说跨源去重阈值要拿真实数据标定，这一步没做。

因此本票不标 done，进 awaiting-verification。
