---
id: T-011
title: 数据产品第一个 skill：anb-data-metric + 5 条提示词
kind: ticket
stage: build
cells: [设计·指标, 验收·指标]
created: 2026-10-28
needs: [T-007, T-009]
evidence: [E-010]
---
## 做什么

按 `data-product-sop.md` §零，8+3 里只有「决策类」格子该做成 skill。指标层是
打标与结论之间的枢纽，且它已经有能跑的检查器（`metric-card.mjs`），
所以第一个做它——skill 的每条要求都能当场试出真假。

1. `.claude/skills/anb-data-metric/SKILL.md`：六问，对齐 `anb-design` 的结构
2. `scripts/site/build_prompts.py`：新增「数据产品」分组，5 条提示词
3. `scripts/site/map.py` + `build_skills.py`：新增「数据产品」归属单位
4. `docs/skills/skill-catalog.md`：17 个新增（`facts` 当场抓到数字过时）

## 完成判据

- [x] skill 六问，每问先给推荐答案，每个问题有判据
- [x] skill 明写「检查器管什么／判不了什么」，并列两张表
- [x] 六条测试盯住 skill 与检查器的一致性
- [x] 提示词 5 条落进提示词库，新增数据产品分组
- [x] 站点构建、facts、links、160 个测试全过
- [ ] **没跑过真实会话**——与 `anb-design` 的两轮实测比，这个 skill 一次都没用

## 实测出来的两个边界（写进 skill 了）

1. `GMV ÷ 提及量 × 互动率` 这种跨层复合指标，**八项全填、检查器全绿**。
2. `口径版本: 2026-10-28` 也过——日期里有数字。

所以 skill 的重心不在「帮你填满八项」，在问题 1（分子分母同层）与问题 5（和谁一起看）。

## 接线时两个检查器抓到的真错

- `build_skills.py`：仓库里有、`map.py` 里没有 → 退出 1
- `links.mjs`：`data.html#skills` 指向不存在的页面 → 修成指向 `matrix.html`

## 衔接

上游：T-007（指标链）、T-009（矩阵）、`metric-card.mjs`
下游：`anb-data-label` / `anb-data-conclude` / `anb-data-source` 三个 skill
——按同一结构做，同样要有一个能跑的检查器托底（打标有金标准集可算 Kappa，
结论有 `verify-conclusion.mjs`，采集有 `collect-audit.mjs`）
