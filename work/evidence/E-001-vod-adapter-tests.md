---
id: E-001
ticket: T-001
at: 2026-10-24
kind: command
result: pass
---
## 命令

```bash
cd packages/core && node_modules/.bin/vitest run src/adapters/vod
```

## 原始输出

```
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

## 这条证据能证明什么

vod 适配器的解析与校验路径：JSON 抽取、`ReferenceAnalysis.safeParse` 失败时抛错、
响应为空时抛错、超时与 HTTP 错误转成可读错误。

## 不能证明什么

**不能证明真实供应商可用。** 五个测试全部用假 HTTP。真实调用一次都没发生过。
这条票因此停在 awaiting-verification，不标 done。
