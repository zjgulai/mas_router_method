---
id: T-002
title: SQLite stores, 校验, 与共享契约套件
kind: ticket
stage: build
created: 2026-10-24
closed: 2026-10-24
needs: []
evidence: [E-002]
---
## 做什么

用 SQLite 实现四个端口，并在写入时校验；同时建一套契约测试，同时跑在 SQLite 与 eval fake 上。

## 完成判据

- [x] 一个真实品牌档案被种下，含 voice、audience、至少一条 regulated claim
- [x] `saveDraft` 在写入前过 `Recipe.parse`，非法配方报错并指出字段
- [x] `list` 返回参考及其已分析状态
- [x] 同一套契约测试跑在 SQLite 与 fake 上
- [x] 保存的 run 与 steps 在进程重启后仍在
- [x] 非法配方被拒绝，错误里指名了字段

## 实际做了什么（超出原票）

原票只要求"同一套契约测试跑在 SQLite 与 fake 上"。实现时发现 fake 比 SQLite **更宽松**，抓出五处不一致：
`list()` 恒返回空、伪造未知品牌、不校验配方、不校验 run、reference id 从 URL 推导导致跨品牌撞 id。
另外抓出一个 SQLite 真 bug：`listRecipes` 按 `created_at` 排序，毫秒并列时会串序，改成 `seq` 单调序号。

这几处都是原票没预料到的，但都属于"fake 不能比生产宽松"这条要求。

## 证据
`E-002` — 契约套件在两侧各跑一遍
