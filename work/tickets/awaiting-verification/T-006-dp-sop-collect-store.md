---
id: T-006
title: 链 A：采集→存储契约与检查器
kind: ticket
stage: build
cells: [设计·采集, 开发·采集, 验收·采集, 设计·存储, 开发·存储, 验收·存储]
created: 2026-10-28
needs: []
evidence: [E-005]
---
## 做什么

按 `docs/product/data-product-sop.md` §2.1/2.2，打穿采集和存储两层：

1. 定义 adapter 接口契约：每个源输出 `{raw, first_seen_at, fetched_at, source_task_id}`
2. schema 加三个版本字段：`schema_version` / `taxonomy_version` / `metric_version`
3. 写 `scripts/collect-audit.mjs`：时滞检查 + 去重率 + 缺抓率
4. 重跑幂等测试：第二次重跑不改写 `first_seen_at`

## 完成判据

- [x] adapter 契约有文档（`docs/product/data-product-layers.md` §二），且有测试覆盖「第二次抓取不覆盖 first_seen_at」
- [x] schema 迁移脚本产出旧版本仍可查（`collect-store migrate`，写入前试读，丢记录就拒绝）
- [x] `scripts/collect-audit.mjs` 能输出时滞分布与去重召回率
  - [ ] 对**真实载荷**跑过 —— 未做，只有 demo
- [x] 去重召回率异常（<10%）或指纹过度合并（>90%）时 exit 1

## 衔接

上游：§七 相关性检查（T-005 的前置，不依赖本票）
下游：T-007 链 B 可以和本票并行，但链 B 的分析层需要本票的「已知偏差」字段
