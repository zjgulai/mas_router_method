---
id: E-012
ticket: T-013
at: 2026-10-28
kind: command
result: pass
---
## 命令

```bash
node scripts/conclusion-card.mjs --demo
node scripts/verify-conclusion.mjs <card.json>
node scripts/conclusion-card.mjs <card.json>
node --test scripts/conclusion-card.test.mjs
node --test scripts/conclusion.test.mjs
node --test scripts/skill-data-conclude.test.mjs
node --test --test-concurrency=1 "scripts/**/*.test.mjs"
```

## 原始输出

同一张卡，两个命令，两个答案：

```
$ node scripts/verify-conclusion.mjs both.json
✓ C9  更好的表现
    holds ci-excludes-zero — interval [0.012, 0.022] excludes 0
合计  1 active · 0 falsified · 0 unmeasurable
全部成立
exit=0

$ node scripts/conclusion-card.mjs both.json
✗ C9  更好的表现
    • 主张 has no number
    • 主张 contains the hedge "更好"
    • 主张 is 5 characters
    • 范围 names no time window — "全部市场"
    • 区间 is a single number (0.017)
    • 依据 names no traceable artefact — "看了很多数据"
    • 决策含义 says "有助于决策" — that is a state of mind
    • 决策含义 names no action verb
1 of 1 card(s) not publishable
exit=1
```

```
# tests 11 / pass 11   conclusion-card.test.mjs
# tests 20 / pass 20   conclusion.test.mjs
# tests  6 / pass  6   skill-data-conclude.test.mjs
# tests 201 / pass 201
```

## 这条证据能证明什么

**两个检查器回答两个不同的问题，而且这一点被一条测试盯着。**

`verify-conclusion` 问「它被证伪了吗」，`conclusion-card` 问「它该不该存在」。同一张卡：
前一个 exit 0 并打印「全部成立」，后一个 exit 1 并列出**恰好八条**问题——测试断言的
就是这个数字，skill 里引用的也是这个数字。

**这就是「先制定方案再靠案例迭代」需要的形状**：结论层的判据原来是「六项模板」，
一张表，没有执行者。现在有两半，各自能变红。

**补了一条不存在但必需的证伪条件。** 原来七条条件里没有一条能判 C2 的滞后曲线，
把 C1 的条件套给 C2 会**静默通过**——那些条件对滞后曲线一无所知。写检查器时拿一张
真实 C2 试才暴露出来。已补 `lag-has-peak` 与 `no-uncontrolled-events`，各带四条测试。

`lag-has-peak` 本身有三态：曲线在最后一段最高时判「无法判断」（可能还没转），
不是判成立也不是判触发。

## 不能证明什么

**没有真实结论卡。** demo 三张卡是编的：一张合格、一张全是伪装、一张滞后结构。
真实 C1–C4 一条都还没写——它们依赖 §七 相关性检查先通过，而那个还没跑过真实数据。

**`work/conclusions/` 没有 `work check` 校验。** 卡落对了没有，目前没人管。

**九条证伪条件里，只有 `lag-has-peak` 和 `no-uncontrolled-events` 有过真正的测试**
（各四条）。其余七条只有「成立 / 触发 / 无法判断」各一次的基本覆盖，
没验过边界值。

**skill 一次都没跑过真实会话。** 六条断言验的是它与两个检查器是否一致。

因此本票不标 done。
