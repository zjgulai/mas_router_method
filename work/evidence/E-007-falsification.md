---
id: E-007
ticket: T-008
at: 2026-10-28
kind: command
result: pass
---
## 命令

```bash
node --test scripts/conclusion.test.mjs
node scripts/verify-conclusion.mjs --demo; echo "exit=$?"
node scripts/verify-conclusion.mjs --demo --notify feishu --dry-run
```

## 原始输出

```
# tests 13
# pass 13
# fail 0

✓ C1  声量每提升 10%，US 的 GMV 提升 1.7%（1.2–2.2）
✗ C2  效应在第 3 周达峰（2–4）
    fired ci-excludes-zero — interval [-0.004, 0.011] contains 0
? C3  某次投放带来增量 GMV 42 万
    unmeasurable region-coverage-sufficient — no coverage in the input
合计  1 active · 1 falsified · 1 unmeasurable
exit=1

would send via feishu:
  │ 证伪检查触发 1 条结论
  │ C2 效应在第 3 周达峰（2–4） — ci-excludes-zero: interval [-0.004, 0.011] contains 0
  │ 这几条结论必须立即标为 superseded，而不是留在看板上。
  │ 「效应弱」不是「无结论」。
not delivered — dry run
```

## 这条证据能证明什么

**报告层唯一的实质验收通过了：人为造一次证伪触发，它报了。**

- 七条证伪条件各是一个可执行函数，每条都有「成立 / 触发 / 无法测量」三个判定
- 跨 0 的区间 → 触发并 exit 1；边界情形（`hi == 0`、`lo == 0`）也判为触发
- 缺字段 → `unmeasurable`，不是成立；CLI 因此 exit 2 并明说「这不是通过」
- 未注册的条件名 → 不能被当作通过
- `falsified` 压过 `unmeasurable`：已错的结论不会因为另一项缺数据变成「也许」
- `superseded` 的结论不被重复检查——对一条已死的结论反复告警会把渠道静音

## 不能证明什么

**推送通道没接。** 没有飞书 webhook，没有邮件。`--dry-run` 打印将要发送的内容，
真实发送在未配置时返回错误而不是成功——故意如此，因为一个假装送达的通道会让这条验收
通过而产品失败。**「交付·报告：飞书/邮件可达」这一条没有通过，只有 dry-run。**

**证伪检查没有跑批。** 没有 cron，没有周频调度。脚本能跑，但没人每周跑它。

结论卡本身也还没落进 `work/designs/`——`status: active / superseded` 的存储是
JSON 输入，不是状态机。用 `work-move.mjs` 迁移 `superseded` 这一条**没有实现**，
因为结论卡还不是一种 work 实体。

因此本票不标 done，进 awaiting-verification。
