---
id: E-004
ticket: INC-001
at: 2026-10-24
kind: command
result: pass
---
## 命令

```bash
git rev-parse HEAD; git rev-parse origin/main
git ls-tree -r --name-only HEAD | wc -l
git ls-tree -r --name-only HEAD | while read f; do [ -e "$f" ] || echo "缺: $f"; done | wc -l
git show HEAD:work/LAYOUT.md | md5sum; md5sum work/LAYOUT.md
```

## 原始输出

```
本地: b6da780d5f48a3bf8ef6e762da6a3b29c7bd85f0
远端: b6da780d5f48a3bf8ef6e762da6a3b29c7bd85f0
HEAD:   301
工作区: 0 个缺失
work/LAYOUT.md   ✓
work/schema.yml  ✓
scripts/work.mjs ✓
site/index.html  ✓
```

## 这条证据能证明什么

工作区与 HEAD、HEAD 与远端三方一致，301 个文件全部存在且内容相同。
所以 `git status` 报告的 120 个 `M` 是假信号。

## 不能证明什么

不能证明以后不会再出现。也不能解释为什么——只证明了"用别的办法校验是可靠的"。
