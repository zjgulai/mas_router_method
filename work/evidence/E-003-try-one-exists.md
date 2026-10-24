---
id: E-003
ticket: T-003
at: 2026-10-24
kind: command
result: partial
---
## 命令

```bash
ls packages/evals/src/try-one.ts
cd packages/evals && node_modules/.bin/tsx src/try-one.ts --help
```

## 原始输出

```
packages/evals/src/try-one.ts

try-one — run one request through the real runtime.
  --url <tiktok-url>        ad-hoc request: "clone this <url>"
  --eval-case <id>          run an eval case through the same path
  --brand <brand-id>        defaults to brd_00000000000001
                            seeded: brd_00000000000001, ... 00000000000004
```

## 这条证据能证明什么

脚本存在、能启动、参数解析正确、能列出四个种子品牌。

## 不能证明什么

**不能证明它跑通过。** 一次真实运行都没发生——缺 `ANTHROPIC_API_KEY` 与 `VOD_API_KEY`。
结果是 `partial` 而不是 `pass`，这也是为什么票停在 awaiting-verification。
