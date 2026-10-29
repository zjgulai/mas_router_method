---
id: E-015
at: 2026-10-29
kind: command
result: pass
---
## 命令

```bash
# 干净导出副本内构建与检查（避开本机加密视图）
node scripts/site/build.mjs          # 27 pages
node scripts/site/links.mjs          # 35 pages, every internal link resolves
node --test --test-concurrency=1 scripts/site/*.test.mjs   # 19/19
node scripts/work.mjs check && node scripts/layout.mjs && \
  node scripts/facts.mjs --check && node scripts/xref.mjs docs/product/tables.json && \
  node scripts/matrix-check.mjs && node scripts/sop-render.mjs --check

# 提交并部署
git push origin main                 # ac20938 + 3a9933d
bash deploy/pack-context.sh          # tag=20261029-171650-3a9933d
# scp 上下文；服务器：
sudo bash /tmp/deploy-release.sh 20261029-171650-3a9933d \
  /tmp/mas-router-site-20261029-171650-3a9933d-context.tar.gz
bash deploy/accept.sh https://main.luteos.com
```

## 原始输出

```
ok — 27 pages generated into docs/site/
ok — 35 pages, every internal link resolves
site tests 19 / pass 19；完整 CI 子集全绿

生产验收：51 PASS, 0 FAIL, 1 SKIP（80 未放行，已知缺口）
  新页：/agent-graph.html 200 · /data-design.html 200 · /data-layers.html 200

sha256 抽查（生产 vs 仓库）：agent-graph / data-design / data-layers /
  index / matrix / need 全部 MATCH

Lighthouse（https://main.luteos.com/agent-graph.html，desktop）：
  Accessibility 100 / Best Practices 100 / SEO 100 / Agentic 100
  console: no messages

容器：mas-router-site-web 重建为镜像
  mas-router-site:20261029-171650-3a9933d，healthy；
  共享网关与其它容器本次未触碰（内容更新不涉及入口变更）
```

## 这条证据能证明什么

**「另一个 agent 改了生成器」可以安全上生产。** 三个新生成器
（agent-graph / data-design / data-layers）走的是同一个 `build_shell.page()`，
相对链接、meta description、表格滚动容器全部继承；干净导出副本里构建出
27 个生成页，链接与测试全绿，生产上与仓库逐字节一致。

**发布流程可重复。** 第二次内容更新只走了 `pack-context.sh → scp →
deploy-release.sh → accept.sh` 四步，网关配置零改动。

**本页锚点的触达面积修掉了。** 侧栏「本页」锚点 23.5px 差 0.5px 不达标，
是老问题、被第一个带足量子导航的新页面暴露；padding 修正后该页
Lighthouse 回到全 100。

## 不能证明什么

**`deploy-release.sh` 的 `--wait` 改造是在这次部署之后加的。** 本次第二次
执行（幂等重跑、无 recreate）验证了脚本退出码为 0，但「recreate 窗口里
轮询误报」的原始问题只被绕过、没有被复现验证——下次真正换镜像的部署
（recreate 发生时）才是对 `--wait` 的实测。

**数据本身的正确性不在此证据范围内。** 三个新页面的数字来自
`docs/product/*` 与矩阵数据，`matrix-check`/`facts`/`xref` 只保证引用与
格式一致；业务结论对不对，要靠对应的数据产品验收。
