---
id: E-016
at: 2026-10-29
kind: command
result: pass
---
## 命令

```bash
# 干净导出副本内构建与检查
node scripts/site/build.mjs          # 28 pages（含新 cheatsheet.html）
node scripts/site/links.mjs          # 36 pages, every internal link resolves
node --test --test-concurrency=1 scripts/site/*.test.mjs   # 19/19
node scripts/layout.mjs && node scripts/work.mjs check && \
  node scripts/facts.mjs --check && node scripts/xref.mjs docs/product/tables.json

# 提交树可复现验证（等价 CI 的重建检查）
git archive --format=tar --prefix=src/ HEAD | tar -x -C "$V"
cd "$V/src" && node scripts/site/build.mjs && diff -r docs/site <仓库>/docs/site

# 提交并部署
git push origin main                 # 4a93aaf + 9274430(并行) + 63778ca
bash deploy/pack-context.sh          # tag=20261029-225212-63778ca
# scp + 服务器：
sudo bash /tmp/deploy-release.sh 20261029-225212-63778ca \
  /tmp/mas-router-site-20261029-225212-63778ca-context.tar.gz
bash deploy/accept.sh https://main.luteos.com
```

## 原始输出

```
ok — 28 pages generated into docs/site/
ok — 36 pages, every internal link resolves
site tests 19 / pass 19；layout 547 files 全部归位

diff -r（提交树构建产物 vs 提交的 docs/site）: IDENTICAL

生产：mas-router-site:20261029-225212-63778ca 重建后 healthy（--wait 生效）
accept.sh: 51 PASS, 1 FAIL(data-design 000) → 复测 4 次全 200 且 sha256 MATCH
  （瞬时网络抖动；单一请求超时不构成页面缺陷）
sha256 抽查（生产 vs 仓库）: cheatsheet / index / design / prompts /
  agent-graph 全部 MATCH；首页 cheatsheet 入口 ×2、prompts 页战斗专区在位
```

## 这条证据能证明什么

**第二个内容更新走了全流程，且发布产物与提交逐字节一致。** 作战手卡页
（36 卡、6 主题）与 8 个阶段页中 7 个的「实战避坑」区块上线；
`battle_tips_data.py` 作为数据模块随生成器一起进仓，阶段归属是字段不是散文。

**提交边界被守住了一次。** 并行 agent 在索引里暂存的 12 个非站点文件
（.scratch/、artifacts/、tools/、.gitignore）被显式移出提交——其中
artifacts/ 与 tools/ 未在 LAYOUT 声明，混进去会让 CI layout 检查变红；
随后用 63778ca 按仓库规则正式声明了这两个目录。

**`--wait` 的待验证项清账。** E-015 留的「recreate 窗口轮询误报」这次在
真实 recreate 中由 `docker compose up -d --wait` 一次通过。

## 不能证明什么

**验收里那一次 000 只能证明「当时那次请求失败」。** 复测 4 次全 200 且内容
一致，指向客户端瞬时抖动；若要归因到服务端，需要网关/access log 对时刻。

**视觉回归没有跑。** 本会话的浏览器审计工具在中途被移除，本轮页面检查是
静态结构校验（标题/description/锚点/卡片数/链接分类）+ 生产验收脚本；
截图与 Lighthouse 记录停留在上一轮。

**manage 阶段的卡片只在手卡页展示。** 数据里 6 张卡标了 `stage: manage`，
但 manage 页由独立生成器渲染、没有 battle-tips 区块——不是坏页，是内容
编排上的一次取舍，记录在此。
