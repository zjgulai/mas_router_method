---
id: T-013
title: 数据产品第三个 skill：anb-data-conclude + 结论卡检查器 + 5 条提示词
kind: ticket
stage: build
cells: [需求·结论, 设计·结论, 验收·结论]
created: 2026-10-28
needs: [T-008, T-011]
evidence: [E-012]
---
## 做什么

`verify-conclusion.mjs` 只答「它被证伪了吗」，不答「它该不该存在」。一张主张为
「更好的表现」的卡能全绿通过。所以这一票补上另一个检查器，再写 skill。

1. `scripts/conclusion-card.mjs`：六项齐不齐 + 主张有没有数字和形容词 +
   范围有没有时间窗 + 区间是不是两个数 + 依据有没有版本 + 决策有没有动作动词
2. 补两条**缺失的证伪条件**：`lag-has-peak`（C2 需要的，原来没有）、
   `no-uncontrolled-events`（C1 与 C3 共用的）
3. `.claude/skills/anb-data-conclude/SKILL.md`：六问
4. 5 条提示词进「数据产品」分组

## 完成判据

- [x] 两个检查器分工明确，同一张卡一个全绿一个报八条
- [x] `conclusion-card` 的空卡集判 exit 2（不是 0，不是 1）
- [x] `lag-has-peak` 三态：末段最高 → 无法判断；lag 0 最高 → 触发；噪声内 → 触发
- [x] `no-uncontrolled-events` 缺事件清单 → 无法判断（空清单是「你看过了」的主张，要人给）
- [x] 31 项测试（11 + 20 + 6 里属本票的部分）
- [x] 201 个测试全过，十一道门禁全绿
- [ ] **没有真实结论卡**——C1–C4 一条都没写，卡在 §七 相关性检查
- [ ] `work/conclusions/` 没有 `work check` 校验

## 为什么补那两条条件

原来七条证伪条件里**没有一条能判滞后曲线**。C2 的卡片只能套用 C1 的条件，
而那些条件对滞后曲线一无所知，于是**静默通过**——这是「把 C1 的条件套给 C2
会怎样」这个问题唯一的答案。

发现方式是拿一张真实形状的 C2 去跑新检查器，它报「`lag-has-peak` 未注册」。
不是设计推导出来的，是跑出来的。

## 衔接

上游：T-008（链 C）、T-011（复用同一 skill 结构）
下游：`anb-data-source`（最后一个，检查器 `collect-audit.mjs` 已存在）
