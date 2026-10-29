---
id: E-017
at: 2026-10-30
kind: command
result: pass
---
## 命令

```bash
# robots/sitemap：生成 → 测试 → 提交 → 部署 → 线上验收
node scripts/site/build.mjs                 # 28 pages (+2 non-page files)
node --test --test-concurrency=1 scripts/site/*.test.mjs   # 23/23（含 4 条 meta）
bash deploy/pack-context.sh                 # tag=20261030-003320-257488e
sudo bash /tmp/deploy-release.sh 20261030-003320-257488e ...
bash deploy/accept.sh https://main.luteos.com

# 监控：自测（ok → fail → recovery）→ 推送 → 服务器安装 → cron
MONITOR_STATE_DIR=... bash deploy/monitor-check.sh
MONITOR_BASE=http://127.0.0.1:9 MONITOR_STATE_DIR=... bash deploy/monitor-check.sh  # 预期 rc=1
# crontab: */10 * * * * /opt/mas-router-site/monitor/check.sh

# 并行 agent 的 WIP 收口：快照提交 → git archive 验证 → 推送
git add -A -- . ':(exclude)ANB全照*'   # 临时 index；zip 与导出 Playbook 不进仓
git commit-tree ... && git push origin main   # 8ddec49

# 线上内容一致性
for p in ...; do sha256(生产) == sha256(仓库); done
```

## 原始输出

```
robots/sitemap:
  28 pages generated into docs/site/ (+2 non-page files)
  sitemap URLs: 35（根 URL 首位；404 排除；originals 8 页在列；无重复）
  meta 测试 4/4；站点测试 23/23
  生产 accept: robots 200/指向 sitemap、sitemap 200/35 URL —— PASS

监控自测:
  run1 ok → run2 fail(rc=1, healthz=000...) → run3 recovery ok
  期间修掉两个自身 bug：code() 拼出 000000；grep -q+pipefail 的 SIGPIPE 误判
  （accept.sh 404 内容检查里的同款一并修掉）

生产验收: 55 PASS / 2 FAIL(瞬时 000) → 复测 4 次全 200 且 sha256 MATCH
WIP 快照 8ddec49:
  pnpm install/typecheck 11/11 · test 11/11（core31/evals98/consult39 等）
  work/layout/naming/xref/facts/matrix/sop 全 OK
  scripts 测试 218/218；docs/site 与生成器产物 diff = IDENTICAL
  CI: check #45 success · main-agent #3 success
服务器 /tmp 部署残留与本地临时分支/副本已清
```

## 这条证据能证明什么

**站点对搜索引擎不再是隐形的。** robots.txt 与 sitemap.xml 由生成器产出、
随镜像发布，线上 200 且内容与仓库一致；404 不被广告、单一起源、35 个 URL
与页面集合对账，四条测试钉住。

**站点死了会有人知道。** 探活脚本装机并进 cron（每 10 分钟），自测覆盖了
ok→fail→恢复的完整翻转路径；飞书 webhook 填入即启用推送。

**并行 agent 的 55 个文件收口且可复现。** 8ddec49 在干净归档副本里通过
TS（typecheck/test 11/11）与全部记录/站点检查后推送，GitHub 上 check 与
main-agent 两个 workflow 双绿。

## 不能证明什么

**飞书推送没有实测。** webhook URL 还没填，状态翻转的推送路径只走通了
"不推送"的分支；填入后第一轮探活才算验证。

**「瞬时 000」归因不在本证据内。** 两次验收各出现 1-2 次单请求超时，复测
即恢复——更像本机到服务器的链路抖动，但没有网关 log 对时刻佐证。

**评测数据本身的业务正确性归 E-015/对应数据证据管。** 本轮只证明
8ddec49 的代码可编译、单测全绿、站点/记录检查一致。
