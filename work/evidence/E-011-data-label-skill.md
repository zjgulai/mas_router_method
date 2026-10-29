---
id: E-011
ticket: T-012
at: 2026-10-28
kind: command
result: pass
---
## 命令

```bash
node scripts/label-audit.mjs --demo
node --test scripts/label-audit.test.mjs
node --test scripts/skill-data-label.test.mjs
node --test --test-concurrency=1 "scripts/**/*.test.mjs"
```

## 原始输出

```
240 rows, 182 correct
accuracy  75.8%  (floor 70%)
Kappa     0.515  (floor 0.6)

标签分布
  positive       126   52.5%
  negative       114   47.5%
  majority share 52.5%

按置信度分层
  低 <0.6       147 rows  84.4%
  中 0.6–0.8     54 rows  75.9%
  高 >0.8        39 rows  43.6%

不通过 — 2 failure(s)
  • Kappa 0.515 < 0.6 — 标签定义有歧义，这是定义的问题，不是标注员的问题
  • confidence is inverted — 高置信度 band 是 43.6%，低置信度是 84.4%
exit=1

# tests 10 / pass 10    （label-audit.test.mjs）
# tests  7 / pass  7    （skill-data-label.test.mjs）
# tests 177 / pass 177
```

## 这条证据能证明什么

**三个门槛，不是两个。** demo 里准确率 75.8% **过了** 0.7 的门槛，而这一层依然不能用：
Kappa 0.515 不过，且置信度是反的（高置信度那档 43.6%，低置信度那档 84.4%）。

**这一条是本次最值钱的发现**：只看「准确率达标」的审查会放行一个所有筛选规则都反了的维度，
而每条规则单独看都合理。`label-audit` 把三档分别算出来，反转会直接判失败。

**准确率和类别分布必须一起读。** 输出里固定印 majority share（52.5%）——永远答最常见那类的
基线。十项测试里有一条专门造 80% 单类数据，验准确率 ≥0.7 而 Kappa <0.6。

**单类金标准集判「无法判断」而不是「不通过」。** 这是实测中撞到的真 bug：第一版先算 failures
再算 blockers，而 verdict 优先取 failed——于是一个单类金标准集报「不通过」，把人送去改标签定义，
而实际问题是这批数据从没采过。**两者的动作相反，代码选错了那个。**

**18 项断言盯着 skill 与检查器的一致性**，其中一条引用了 demo 的四个具体数字
（0.758 / 0.515 / 0.844 / 0.436）——skill 里写的就是这四个，检查器一变就红。

## 不能证明什么

**没有真实金标准集。** demo 的 240 行是合成的，情感分布和「高置信度反而错」的构造都是编的。
真实母婴内容上 Kappa 是多少，完全未知——这正是设计里「情感打标在母婴黑话上的准确率未知」
那条未解问题。

**没有人工标过一条。** 200–300 条两个人工标，这件事没发生。`label-audit` 的能力是「有了数据能算」，
不是「有数据」。

**`work/labels/` 没有校验器。** 标签体系落盘之后，`work check` 不管它——已记进
`data-product-layers.md` §五 的缺口表。

**skill 一次都没跑过真实会话。** 七条断言验的是它与检查器是否一致，不验问题问得对不对。

因此本票不标 done。
