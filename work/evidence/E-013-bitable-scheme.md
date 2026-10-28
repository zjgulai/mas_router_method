---
id: E-013
ticket: T-014
at: 2026-10-28
kind: command
result: pass
---
## 命令

```bash
node scripts/matrix-check.mjs
node scripts/matrix-check.mjs --json | jq '.byDoor'
node --test scripts/matrix-check.test.mjs
node --test --test-concurrency=1 "scripts/**/*.test.mjs"
```

## 原始输出

```
byDoor = {"命令关门":6, "人开门":2, "无人关门":9, "人关门":32}

ok — 49 cells, 8 transitions, every checker resolves

# tests 15 / pass 15   matrix-check.test.mjs
# tests 203 / pass 203
```

故意把文档里的 6 改成 99：

```
1 problem(s)
  • ops-bitable.md: says 99 cells are 命令关门, disk has 6
```

## 这条证据能证明什么

**HITL 分类是从磁盘算出来的，不是文档里写的。**

四类的判据是「这一格靠什么才能从『未完成』推到『已完成』」，而判定用的不是类别，
是**有没有检查器**：

- 命令关门 6 格 = 恰好是验收行有检查器的那六格
- 人开门 2 格 = 需求阶段的指标与结论
- 无人关门 9 格 = 运营八层 + 管理·采集
- 人关门 32 格 = 其余

**这个规则改过一次，因为第一版是错的。** 按类别推（工程类 → 命令关门）会把
「开发·采集」判成命令关门——而写 adapter 这件事没有任何命令能关它。判据必须是
`checker` 存在与否，不是类别。测试第 14 条就是钉这个的。

**文档里四个数字与磁盘核对，改一个就报错。** 这一条我实测过：把 6 改成 99，
`matrix-check` 报「says 99 cells are 命令关门, disk has 6」。

**方案本身没跑过。** 这是本次证据最大的边界——见下。

## 不能证明什么

**`docs/product/ops-bitable.md` 是一个方案，一行代码都没落。** 它描述的
`checks.jsonl`、`check-run.mjs`、`bitable-sync.mjs`、飞书多维表格 API 对接，
**全部不存在**。验的只有它引用的四个分类数字和磁盘一致。

**没有建过任何一张多维表格。** 字段类型、单选值、五个视图的筛选表达式、
`关联证据` 能不能跨两跳——全部没在真表上试过。第十一节已经把这几点列为未解决。

**`checks.jsonl` 格式没被任何脚本写过。** 退出码映射（0/1/2/3 → 四个 verdict）
是从现有 14 个脚本的源码推出来的，不是跑出来的。

**CI 周频只会有 1 条真实结果。** 现有 5 步与检查器有关的 CI 里，4 步跑的是 `--demo`，
断言的是「demo 仍然会失败」；写进 checks.jsonl 会是假数据。只有 `metric-card check`
跑真实数据。这一条是核对 CI 时发现的，不是设计出来的。

因此本票不标 done——它交付的是方案，不是实现。
