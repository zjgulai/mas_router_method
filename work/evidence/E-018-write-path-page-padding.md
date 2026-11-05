---
id: E-018
ticket: INC-002
at: 2026-11-05
kind: command
result: pass
---
## 命令

```bash
# 诊断：Node 与 Python 对同一文件的视图
node -e "const fs=require('fs');console.log(fs.statSync('apps/workbench/src/app/layout.tsx').size)"
python3 -I -c "print(len(open('apps/workbench/src/app/layout.tsx','rb').read()))"

# 全仓门禁与归一化
node scripts/check-padded.mjs --all
node scripts/check-padded.mjs --all --fix
node scripts/check-padded.mjs --all

# 真实验收面
for d in packages/* apps/bot-gateway apps/workbench; do
  ./node_modules/.bin/tsc -p "$d/tsconfig.json" --noEmit || exit 1
done
```

## 原始输出

```
layout.tsx: node stat = 8864, python read = 4768, diff = 4096
check-padded --all (before): 122 file(s) carry a padded tail
check-padded --all (after):  571 files, 0 padded
typecheck: consult 0, core 0, evals 0, feishu 0, shared 0, bot-gateway 0, workbench 0
tests: core 32, feishu 24, consult 58, evals 105, bot-gateway 61 = 280 passed
```

## 这条证据能证明什么

1. 工作树里的 122 个已跟踪文件带一页 4096 字节的未初始化尾巴；它们的干净视图与
   Git `HEAD` blob 逐一 SHA-256 相等，尾巴是唯一差异。
2. `scripts/check-padded.mjs` 能稳定识别该签名，`--fix` 能原子恢复干净内容。
3. 归一化后 typecheck 与 280 个单测全过——修复没有改变任何业务代码的语义。

## 不能证明什么

**不能证明写入路径已被修好。** Write/Edit 工具仍可能在下次写入时重新加上这一页；
门禁只是探测器，不是解药。也不能证明 Git 提交会带毒：Git 存的是干净 blob，
CI 检出看不到尾巴，所以这条门禁必须跑在工作树/提交前。
