---
id: ART-001
title: 站点生成器与重建入口
owner: lute
stage: operate
delete_when: 站点改为 Actions 部署、且 docs/site 不再放在仓库里时（届时生成器与产物不再同仓）
---
## 这是什么

`scripts/site/` 下的 6 个 Python 生成器，加入口 `scripts/site/build.mjs`。
它们从仓库内的源文件重建 `docs/site/` 的 13 个生成页。

## 为什么有持续成本

它是代码，而且必须随内容更新：`build_pages.py` 里存着每个阶段页的分支、验收动作与
skill 归属。skill 或阶段一变而这里不同步，站点就开始说旧话——这个仓库已经因为
「同一个事实存两份」错过一次。

## 怎么用

```bash
node scripts/site/build.mjs   # 重建；发现生成器不产出的页时报错
```

八份手写原件住在 `docs/site/originals/`，不参与生成，也不参与孤儿检测。

## 什么时候删

站点若改为 Actions 部署、`docs/site/` 移出仓库，生成器与产物就不再同仓，
这份登记随之失效。
