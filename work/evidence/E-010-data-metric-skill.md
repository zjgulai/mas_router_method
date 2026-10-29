---
id: E-010
ticket: T-011
at: 2026-10-28
kind: command
result: pass
---
## 命令

```bash
node --test scripts/skill-data-metric.test.mjs
node scripts/site/build.mjs
node scripts/facts.mjs --check
node scripts/site/links.mjs
node --test --test-concurrency=1 "scripts/**/*.test.mjs"
```

## 原始输出

```
# tests 6 / pass 6

build_skills.py exited 1
these repo skills are in .claude/skills/ but not in map.py: ['anb-data-metric']
    ← 加完 skill、还没登记进 map.py 时，构建立刻失败（预期）
    ← 修完之后：
ok — 14 pages generated into docs/site/

ok — 7 quoted numbers match disk
ok — 22 pages, every internal link resolves
# tests 160 / pass 160 / fail 0
```

## 这条证据能证明什么

**skill 里关于检查器的每一句话都被一条测试盯着。** `skill-data-metric.test.mjs`
六条断言，全部在测「skill 说的」与「检查器做的」是否一致：

- 断言 skill 里写的命令真的存在
- 断言「跨层比率能通过检查器」——**这是 skill 立论的那一条**
- 断言八项缺一项会失败
- 断言 skill 要求加的两节不会反过来让检查失败
- 断言「无」被拒
- 断言日期型版本号**能通过**（这条把 skill 原来过强的措辞改准了）

如果检查器行为变了，这六条会红，skill 必须跟着改。**一个描述检查器的 skill，
如果它说的边界面与实际不符，比不写更糟**——人会把绿当成"这一项检查过了"。

**两个真实边界是实测出来的，不是推的：**

1. 一个 `GMV ÷ 提及量 × 互动率` 的指标，八项全填、无空话、版本规范，**检查器全绿**。
2. `口径版本: 2026-10-28` 也能过——日期里有数字，满足「有版本号」的判据。

这两条决定 skill 的重心在问题 1（分子分母同层）和问题 5（和谁一起看），
不在「帮你填满八项」。

**接线时两个检查器各抓到一次真错：**

- `build_skills.py`：「`.claude/skills/` 里有、`map.py` 里没有」→ 直接报错退出
- `links.mjs`：模块卡片拼出了 `data.html#skills`，那个页面不存在 → 报错
  修法是把数据产品的落点指向 `matrix.html`（唯一按层组织的视图）

## 不能证明什么

**没有真人用过这个 skill。** 六条断言验的是它和检查器是否一致，不验它**问得对不对**。
`anb-design` 的证据是两轮真实试跑（12/6、8/9、7/7），这个 skill 一次都没跑过。

**六个问题里只有两个有检查器托底**（问题 1 的「能不能算出同一个数」靠人判，
问题 3/4 的强弱靠 `metric-card` 的空话表兜底）。其余四个的判据是句子，不是命令。

**提示词 5 条也只写没测。** 没有拿真实会话跑过，不知道它们是否真的把答案逼到具体。

因此本票不标 done。
