---
id: E-008
ticket: T-009
at: 2026-10-28
kind: command
result: pass
---
## 命令

```bash
node scripts/matrix-check.mjs
node scripts/sop-render.mjs --check
node --test scripts/matrix-check.test.mjs
node --test scripts/site/build_matrix.test.mjs
node --test --test-concurrency=1 "scripts/**/*.test.mjs"
```

## 原始输出

```
矩阵  8 阶段 × 8 层 = 64 个位置，其中 49 格有内容
  验 6 verified · 43 contract · 0 hole · 8 跳衔接
ok — 49 cells, 8 transitions, every checker resolves

ok — SOP §二 matches matrix.json (49 cells)

# tests 13 / pass 13
# tests  6 / pass  6
# tests 145 / pass 145 / fail 0
```

## 这条证据能证明什么

**矩阵是三处共用一个来源，而且不一致会失败。**

- `docs/product/matrix.json` 是唯一来源；SOP §二 由 `sop-render` 生成，`--check` 校验
- 矩阵文档里的散文数字（「N 格有内容」「64 减 N，空 M 格」「SOP 标题的格数」）
  与 JSON 核对，不一致就报错
- 每格状态由脚本算：有检查器且脚本存在 = 验；三件事齐无检查器 = 约；有缺 = 空
- 检查器指向已删除的脚本 → 报错，**不会静默降级成「约」**
- 三件事里写「同上」「上面的方案」→ 判为洞

**交互页与数据一致。** 49 个格子坐标唯一、状态逐个与 `matrix-check --json` 比对一致、
内联 JS 通过 `node --check`、无模板残留标记。

**交互本身用真实 DOM 验过**（jsdom，一次性，不进 CI）：点格子填面板、再点取消、
筛选「验」压暗其余 43 格、链 A 只亮采集与存储、回车键可选中 —— 17 项全过。

## 截图查出一个真 bug

第一版截图暴露了列顺序错误：表头是 **指标 · 结论 · 采集 · 存储 · …**。
原因是 `build_matrix.py` 用 `dict.fromkeys` 从 cells 推导层顺序，而 cells 按阶段排序，
「需求」行的两格（指标、结论）于是排到了最前——表读起来像流水线从指标层开始。

修法：顺序从 `matrix.json` 声明里读，不从数据的出现顺序推导。
已加回归测试「列顺序必须等于 matrix.json 的 layers」。

**这个 bug 是截图查出来的，不是任何测试查出来的。** 结构测试只验了「49 个格子坐标唯一」，
列顺序错的时候它照样全绿。一条只验存在性的检查，看不见顺序错。

## 不能证明什么

**窄屏折行没验。** 只有一张 841px 宽的截图。860px 以下转单列的断点没有目视确认。
配色与可读性只看了首屏，下半部分（八跳衔接表）没有在渲染后看过。

**jsdom 不进 CI。** 它只是我一次性核对用的，仓库没有加这个依赖：为一个页面引入一棵
依赖树，代价大于它防的风险。CI 里拿 `matrix.json` 与页面 payload 比对，覆盖的是真正
会漂移的那部分（状态）。

**49 格里只有 6 格真有可执行验收。** 43 格是「契约写了、没有检查器」。页面把这两者
显示成不同颜色，是为了不让「三件事齐」被读成「这一格能用」。

因此本票不标 done。
