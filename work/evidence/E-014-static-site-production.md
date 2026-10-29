---
id: E-014
at: 2026-10-29
kind: command
result: pass
---
## 命令

```bash
# 本地：站点与工具链
node scripts/site/build.mjs && git diff --exit-code docs/site/
node scripts/site/links.mjs
node --test --test-concurrency=1 "scripts/**/*.test.mjs"

# 本地：镜像冒烟（容器内 nginx -t、healthz、首页、404）
bash deploy/build-image.sh
SKIP_TLS=1 SKIP_REGRESSION=1 bash deploy/accept.sh http://127.0.0.1:18890

# 生产：打包上下文 -> 服务器原生构建 -> 起容器 -> 接入网关
bash deploy/pack-context.sh
# scp dist/*.tar.gz* + deploy-release.sh；服务器上：
sudo bash /tmp/deploy-release.sh 20261029-140356-f9759f0 \
  /tmp/mas-router-site-20261029-140356-f9759f0-context.tar.gz
sudo bash /tmp/patch-ingress.sh

# 生产验收 + 线上 Lighthouse（desktop / mobile）
bash deploy/accept.sh https://main.luteos.com
```

## 原始输出

```
# 站点
ok — 24 pages generated into docs/site/
ok — 32 pages, every internal link resolves
site tests 19 / pass 19；完整 CI（work/layout/facts/xref/matrix/sop + scripts 测试）全绿

# 本地镜像
nginx: configuration file /etc/nginx/nginx.conf test is successful
404 路径: 404
== 结果：42 PASS, 0 FAIL, 4 SKIP（本地 origin 无 TLS/回归）

# 生产
ok — mas-router-site 20261029-140356-f9759f0 已启动并 healthy
ok — main.luteos.com 已接入共享网关（32 域名回归无变化）
accept.sh: 48 PASS, 0 FAIL, 1 SKIP
  SKIP = 80 未放行（腾讯云安全组；跳转块已就位）

# Lighthouse（https://main.luteos.com/）
desktop: Accessibility 100 / Best Practices 100 / SEO 100 / Agentic 100
mobile:  Accessibility 100 / Best Practices 100 / SEO 100 / Agentic 100
console: no messages; 390px 全页无横向溢出

# 容器影响面（StartedAt >= 本次操作开始）
2026-10-29T06:04:34Z  mas-router-site-web   （新增）
2026-10-29T06:14:17Z  ai_video_nginx       （批准的共享入口有界重启）
其他容器未重启；新增独立网络 mas_router_site_internal，端口只发布到 172.20.0.1:18890
```

## 这条证据能证明什么

**站点可以部署到根路径，并已经在生产上验收。** 645 个硬编码
`/mas_router_method/site/` 链接改成相对链接后，31 个页面在
`https://main.luteos.com/` 上全部 200，404 行为正确，TLS 由
`*.luteos.com` 泛域名证书覆盖，7 项响应头与 gzip 全部通过。

**隔离是真的。** 新站点是独立 compose 项目与独立网络，只发布到宿主
bridge gateway 的 18890，不占公网端口；容器只读、非 root、有资源限额。
共享入口只有一次批准过的配置切换重启，32 个既有域名在切换前后逐条对比，
没有一条变差。

**回滚路径真的被走过。** 第一次接入时因为单文件 bind mount 固定旧 inode，
reload 后仍是旧配置，脚本按设计自动恢复备份并再次重启；修正为
「原地写入 + 有界重启 + 校验容器内 hash」后成功。回滚不是写在文档里的意图，
是这次实际执行过的分支。

## 不能证明什么

**只证明了静态站。** `apps/workbench` 与 `apps/bot-gateway` 的 TS 构建/测试
没有跑：这台机器的 PATH 里没有 pnpm，无法 `pnpm install && pnpm test`。
本证据不包含那部分代码的正确性。

**80 端口未验证。** 安全组未放行，`http://main.luteos.com/` 仍会超时；
`main.luteos.com.conf` 里的 80 -> 443 跳转块已就位，放行后需要再跑一次
`patch-ingress.sh`（更新模式）并用 `accept.sh` 复验这一项。

**`docs/site/originals/capability-map.html` 在 390px 下自身横向溢出。**
这是八份「未改一字」的冻结原件之一，按规则不改；其余生成页无溢出。
