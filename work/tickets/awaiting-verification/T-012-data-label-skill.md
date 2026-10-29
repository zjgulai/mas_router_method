---
id: T-012
title: 数据产品第二个 skill：anb-data-label + 打标检查器 + 5 条提示词
kind: ticket
stage: build
cells: [*·打标]
created: 2026-10-28
needs: [T-011]
evidence: [E-011]
---
## 做什么

打标层是矩阵上唯一整列没有票据的层（T-010 的缺口之一）。它也是数据产品里唯一
「衡量标准本身是推断出来的」一层，所以先给它写检查器，再写 skill。

1. `scripts/label-audit.mjs`：准确率 + **Kappa** + 分档准确率 + 类别分布 + 多数类基线
2. `.claude/skills/anb-data-label/SKILL.md`：五问，对齐 `anb-data-metric`
3. 5 条提示词进「数据产品」分组
4. 更新 `data-product-layers.md` §五 的缺口表（指标层与打标层已不再是缺口）

## 完成判据

- [x] 三个门槛都有命令：准确率 ≥0.7、Kappa ≥0.6、高置信度档必须比低档准
- [x] Kappa 未定义时返回 NaN 而不是 0（0 是发现，未定义不是）
- [x] 类别分布与多数类基线固定输出——准确率必须跟它一起读
- [x] 金标准集 <30 行判「无法判断」；<200 行照算但标注「首次观察，不该被引用」
- [x] 单类金标准集判 exit 2 而不是 exit 1
- [x] 17 项测试（10 检查器 + 7 skill 一致性）
- [x] 177 个测试全过，九道门禁全绿
- [ ] **没有真实金标准集**——200–300 条两个人工标，没发生
- [ ] `work/labels/` 没有 `work check` 校验

## 实测撞出的一个真 bug

**单类金标准集报了「不通过」。** 第一版先填 failures 再填 blockers，verdict 优先取 failed。
于是「这批数据从没采过」被报成「标签定义有歧义」——一个让人去改定义，一个让人去补数据，
动作相反。已改为单类时整份报告判「无法判断」，并抑制 accuracy/Kappa 的失败判定。

## 这一层最值钱的发现

准确率 75.8% **过了**门槛，而 Kappa 0.515 不过、置信度还是反的（高 43.6% / 低 84.4%）。
**只看准确率的审查会放行一个所有筛选规则都反了的维度**，而每条规则单独看都合理。

## 衔接

上游：T-011（指标层 skill，共用同一结构）
下游：`anb-data-conclude`（`verify-conclusion.mjs` 已存在）、`anb-data-source`（`collect-audit.mjs` 已存在）
