---
id: E-009
ticket: T-010
at: 2026-10-28
kind: command
result: pass
---
## 命令

```bash
node scripts/matrix-check.mjs
node scripts/matrix-check.mjs --json | jq '.gaps'
node --test scripts/ticket-cells.test.mjs
node --test --test-concurrency=1 "scripts/**/*.test.mjs"
```

## 原始输出

```
票据 4 张认领了 22 格 · 6 格缺口（该有票却没有） · 21 格未到（还没到时候）
ok — 49 cells, 8 transitions, every checker resolves

gaps = [设计·打标, 设计·呈现, 开发·打标, 验收·打标, 交付·呈现, 交付·报告]

# tests 154 / pass 154 / fail 0
```

## 这条证据能证明什么

**「有票」与「没票」是算出来的，不是填出来的。** 票据状态从目录读
（`work/tickets/<state>/` 就是状态），矩阵只声明每张票认领哪几格。

**这个 join 一接上就查出两件事：**

1. **打标层整列没有票。** 设计、开发、验收三格全空——三条链选的正好都是绕过打标层的，
   而这个产品的情感维度依赖打标。这是方法层面漏掉的一整层，不是进度问题。
2. **通配符会造假覆盖。** `cells: [*·采集]` 让 T-006 看起来覆盖了
   管理·采集、迭代·采集——那些它从未碰过，因为「该层的票要等前面走完」。
   已改成显式列出六格。

**「没人做」分成两种，页面分开显示：** 运营/迭代/管理共 21 格未到（产品没上线，
那三层的票要等前面走完）；只有 6 格是缺口。合并成「27 格无人认领」会把真缺口淹掉。

`awaiting-verification` 映射为 `claimed` 而不是 `verified`：票说「做完了等人验收」
是一个主张；只有 `done`（schema 强制带 evidence ID）才算落地。

## 不能证明什么

**票据的 cells 声明是人写的，会撒谎。** 校验只能保证「这张票声明的格子存在」，
不能保证「它真的做了那些格子」。T-006 标了设计·采集，但它的设计产出实际上是
`docs/product/data-product-layers.md` 里的一段，不是一格设计记录。

**6 格缺口里没有一张票，也没有计划。** 这 6 格目前只出现在页面上，没有任何东西会
因为它们是红的而失败——`matrix-check` 把它们印出来，但不 exit 1。让缺口变红是下一
个决定（要不要把「正在进行阶段的缺口」当失败）。

因此本票不标 done。
