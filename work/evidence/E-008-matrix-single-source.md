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

## 不能证明什么

**没有截图。** 这个环境是 Linux ARM64，Chrome for Testing 不提供该架构的构建，
系统也没有 chromium，装不上也起不来。**页面长什么样我没看见**——只验了结构与交互
行为，没验视觉。配色、间距、窄屏折行都可能有问题。

**jsdom 不进 CI。** 它只是我一次性核对用的，仓库没有加这个依赖：为一个页面引入一棵
依赖树，代价大于它防的风险。CI 里拿 `matrix.json` 与页面 payload 比对，覆盖的是真正
会漂移的那部分（状态）。

**49 格里只有 6 格真有可执行验收。** 43 格是「契约写了、没有检查器」。页面把这两者
显示成不同颜色，是为了不让「三件事齐」被读成「这一格能用」。

因此本票不标 done。
