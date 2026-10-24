---
id: E-002
ticket: T-002
at: 2026-10-24
kind: command
result: pass
---
## 命令

```bash
cd packages/core && node_modules/.bin/vitest run src/adapters/sqlite
cd packages/evals && node_modules/.bin/vitest run src/fixtures.contract.test.ts
```

## 原始输出

```
packages/core
 Test Files  2 passed (2)
      Tests  15 passed (15)

packages/evals
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## 这条证据能证明什么

契约套件在 SQLite 与 eval fake 两侧都通过：品牌隔离、参考往返、存储的分析、跨品牌写入被拒、配方校验、run 校验、列表顺序。

## 不能证明什么

不能证明并发安全（SQLite 单写），也不能证明 Postgres 迁移后会通过——那要等新适配器写出来。
