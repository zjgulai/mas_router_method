---
id: INC-001
title: 挂载目录上的 git 索引不可靠，git status 会报假的未提交改动
stage: any
opened: 2026-10-24
closed: 2026-10-24
needs: []
evidence: [E-004]
---
## 发生了什么

在 `/Users/lute/Project/mas_router_method`（沙箱里映射为 `/sessions/…/mnt/mas_router_method`）
上执行 `git add` 会报 `short read while indexing <file>`，`git status` 会稳定地报告
一批文件是 `M`（已修改），而 `git diff` 为空、逐字节比对内容与 HEAD 完全一致。

## 影响

- `git add -A` 直接失败，无法在挂载目录里提交
- `git status` 的输出不可信，会让人以为有大量未保存的改动
- 我因此误判过两次：一次以为文件被改了，一次以为提交没生效

## 根因（部分确认）

挂载层的文件读取与 git 的 stat 缓存假设不兼容。`core.filemode` 设成 false 也没解决，
说明不是权限位问题。**没有确认到底哪一层的问题**——这是这条事故的已知空白。

## 绕过的办法

1. **提交在 /tmp 做**：`cp -a` 复制 .git 和工作区到 `/tmp`，在那里 `git add` / `commit` 正常
2. **校验不用 git status**：用 `git ls-tree -r HEAD` 对比工作区文件是否存在、用
   `git show HEAD:<file> | md5sum` 对比内容

## 不要这样做

- 不要相信这个目录里 `git status` 的 `M`。先 `git diff <file>` 看有没有输出，没有就是假的。
- 不要用 `tar` 在两个路径之间复制：它给短文件补了 4096 个 NUL 字节，
  把几个 markdown 文件变成了二进制。用 `cp -a`。

## 仍然存在的风险

每次要提交都必须先复制到 /tmp。如果哪次忘了、直接在挂载目录 commit，
会得到"看起来成功但实际没提交"的结果——因为 `git add` 静默失败了。
