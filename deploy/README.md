# `deploy/` — main.luteos.com 静态站部署

站点是 `docs/site`（由 `scripts/site` 生成、随提交入库）。这个目录只负责把它变成
一个独立容器，并接入服务器上已有的共享网关。

## 目标架构

```
Internet :443
  └─ ai_video_nginx            共享网关（compose 项目 lighthouse，现有，独占 80/443）
       └─ server_name main.luteos.com
            └─ 172.20.0.1:18890
                 └─ mas-router-site-web     新容器（nginx:1.27-alpine，只读、非 root）
                      └─ /usr/share/nginx/html = docs/site
```

- 新 compose 项目 `mas-router-site`，独立网络 `mas_router_site_internal`；
  与服务器上其他 30+ 个 compose 项目互不相干。
- 容器只发布到 `172.20.0.1`（lighthouse 网关的宿主侧地址），不监听公网。
- TLS 由共享网关用 `*.luteos.com` 泛域名证书终止；容器内只有 8080 明文。
- 共享网关的改动只有一处：向 `http { }` 插入一个带标记的 server block。
  主配置是「单文件只读 bind mount」，容器启动后固定当时的 inode；之后宿主上
  改文件，运行中的容器看不到，`nginx -t` 与 HUP reload 都不能证明候选生效。
  因此接入动作是**一次有界重启**（`docker restart ai_video_nginx`），且脚本
  自带候选验证、备份、32 域名基线与失败自动回滚。这是本仓库 xmind 部署
  Runbook 里已经记录过的同一个约束。

## 文件

| 文件 | 作用 |
|---|---|
| `Dockerfile` | `docs/site` + `nginx.conf` → 镜像；无构建步骤 |
| `nginx.conf` | 容器内配置：8080、gzip、缓存、安全头、`/healthz`、404 页 |
| `compose.yaml` | 服务器上的生产 compose（只 `docker load`，不 build） |
| `compose.local.yaml` | 本地覆盖：端口收到 `127.0.0.1:18890` |
| `main.luteos.com.conf` | 插入共享网关的 server block 片段 |
| `patch-ingress.py` | 生成候选配置；只生成，不写回 |
| `patch-ingress.sh` | 服务器侧：备份 → 容器内 `nginx -t` → 替换 → reload → 失败回滚 |
| `build-image.sh` | 本地：原生构建并在容器内验 `nginx -t`/healthz/首页 |
| `pack-context.sh` | 本地：从 `git archive HEAD` 打包构建上下文（+ sha256） |
| `deploy-release.sh` | 服务器侧：解包 → 原生构建 amd64 镜像 → 独立 compose 起容器 → 健康检查 |
| `accept.sh` | 本地：全量页面、404、响应头、TLS、其他站点回归 |

## 发布流程

以下命令都在仓库根目录执行。

```bash
# 1. 本地：构建并冒烟（原生架构；功能与生产镜像一致，Dockerfile 无架构相关步骤）
deploy/build-image.sh

# 2. 本地：打包构建上下文（对应 HEAD 的提交）
deploy/pack-context.sh
# 输出 dist/mas-router-site-<tag>-context.tar.gz（+ .sha256）

# 3. 上传
scp -i <key> -P 22222 dist/mas-router-site-<tag>-context.tar.gz* ubuntu@43.163.92.244:/tmp/

# 4. 服务器：原生构建 amd64 镜像并起容器（独立项目；先不碰网关）
scp -i <key> -P 22222 deploy/deploy-release.sh ubuntu@43.163.92.244:/tmp/
ssh -i <key> -p 22222 ubuntu@43.163.92.244 \
  "sudo bash /tmp/deploy-release.sh <tag> /tmp/mas-router-site-<tag>-context.tar.gz"

# 5. 服务器：接入共享网关（幂等保护；域名已存在会拒绝执行）
scp -i <key> -P 22222 deploy/patch-ingress.py deploy/main.luteos.com.conf deploy/patch-ingress.sh \
  ubuntu@43.163.92.244:/tmp/
ssh -i <key> -p 22222 ubuntu@43.163.92.244 \
  "sudo install -d /opt/mas-router-site/tools && \
   sudo install -m 0644 /tmp/patch-ingress.py /tmp/main.luteos.com.conf /opt/mas-router-site/tools/ && \
   sudo bash /tmp/patch-ingress.sh"

# 6. 本地：生产验收
deploy/accept.sh
```

> 生产镜像在服务器上构建（服务器是 amd64）。本机若支持交叉构建，也可以先
> `docker build --platform linux/amd64`，但当前这台机器的 Docker 是
> aarch64 + legacy builder，交叉构建会在导出层时报 content digest not found。

## 滚动更新与回滚

**更新内容**：改站点（提交 `docs/site`）→ 重新 `build-image.sh` → 重复第 2–3 步
（compose 会用新 tag 重建容器）→ `accept.sh`。网关不需要再改。

**回滚容器**：`/opt/mas-router-site/releases/<上一个 tag>/` 里重新
`docker compose up -d`，或

```bash
cd /opt/mas-router-site/current && docker compose down
```

**回滚网关**（同样需要一次有界重启，原因见上）：

```bash
sudo install -m 0644 /opt/mas-router-site/backups/nginx.conf.<时间戳> \
  /opt/ai-video/deploy/lighthouse/nginx.conf
docker restart ai_video_nginx
```

更新已存在的 server 块（例如改 header）：`patch-ingress.sh` 检测到部署标记时
会自动进入更新模式（`patch-ingress.py --replace`），重复执行是安全的。

## 监控

服务器 cron 每 10 分钟跑一次 `monitor/check.sh`（探活：healthz、首页内容、
最新页、sitemap、404 行为）。状态翻转（ok→fail 或 fail→ok）时推送飞书：

```bash
# 服务器上填一次 webhook（飞书群自定义机器人），下一轮探活即启用推送：
sudo tee /opt/mas-router-site/monitor/feishu-webhook.env >/dev/null <<'ENV'
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
ENV
sudo chmod 600 /opt/mas-router-site/monitor/feishu-webhook.env
```

- 日志：`/opt/mas-router-site/monitor/last-run.log`（保留 500 行）
- 状态：`/opt/mas-router-site/monitor/state`（ok / fail）
- 脚本来源：`deploy/monitor-check.sh`（改版后用
  `git show HEAD:deploy/monitor-check.sh | ssh ... 'cat > /tmp/...'` 同步）

## 已知缺口

- **80 端口未在腾讯云安全组放行**：`accept.sh` 第 6 项会 SKIP。首次用
  `main.luteos.com`（无协议）访问会超时；HTTPS 直接访问正常。
  放行后不需要改代码，`main.luteos.com.conf` 里的 80 → 443 跳转块已就位。
- 八个“未改一字”的原始文档里，`capability-map.html` 在 390px 窄屏下自身
  横向溢出（历史文档未做响应式）。这是冻结内容，按规则不改；其余生成页
  已全部通过 390px 无溢出检查。
- **证书是商业证书，到期要手动换**：`*.luteos.com`（GeoTrust/DigiCert 签发，
  放在 `/etc/letsencrypt/live/luteos.com/` 但没有 certbot renewal 配置，
  snap.certbot.renew 不会续它）。有效期至 **2027-03-07**；2027-02 前需购买
  续期并替换 fullchain/privkey，然后 `docker restart ai_video_nginx`。
