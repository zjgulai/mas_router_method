# 静态站生产部署：检查、部署、验收

日期：2026-10-29
对象：`docs/site`（Agent Native Builder 生成站），域名 `main.luteos.com`
运行手册：`deploy/README.md`（命令级细节）

## 一、范围与判断

这次部署只处理**静态站**（`docs/site`，24 个生成页 + 8 个手写原件）。
不部署 `apps/workbench`（Next.js）和 `apps/bot-gateway`（飞书网关）；
它们需要的不是静态托管的验收，混进来会让“通过”说不清是什么通过。

## 二、部署前检查发现的问题与处理

| # | 问题 | 处理 | 验证 |
|---|---|---|---|
| 1 | 645 个内链硬编码 `/mas_router_method/site/`，根路径部署会全断 | 生成器改为相对链接；`links.mjs` 把旧前缀直接判红 | 32 页链接检查通过；新增回归测试 |
| 2 | `matrix.html` 窄屏整页溢出（603px @390px） | 八跳表包滚动容器 | 390px 全页扫描 0 溢出 |
| 3 | 若干表格在窄屏溢出（manage/skills） | `page()` 统一给表格包 `.tablewrap` | 同上 |
| 4 | 导航分组标题对比度 4.18、品牌链接点击区 22px、缺 meta description | 改色值到 4.5+；点击区 ≥26px；每页加 meta description | Lighthouse 桌面/移动 100/100/100 |
| 5 | 缺 404 页与 favicon | 生成站内 404；内联 SVG favicon | `accept.sh` 检查 404 与 `/404.html` internal |
| 6 | 品牌链接嵌在 `<summary>` 里（控制台 issue） | 品牌移出折叠标题，折叠标题改为“导航” | 控制台无消息 |
| 7 | 本地生成会读到加密/缓存旧视图，产物带误告警 | 提交与镜像统一从 `git archive` / 干净树构建 | 生成器输出与提交逐字节一致（CI 检查） |

## 三、Git 状态与处理

- 本地 `main` 落后 `origin/main` 39 个提交，同时有 94 个文件的本地方案
  （左栏改版、Main agent/`packages/consult`、bot-gateway、十三个表）。
- 处理：把本地方案做成快照提交，与 `origin/main` 合并；冲突 18 处，
  全部集中在站点产物与生成器，按“产物重新生成、生成器叠加”解决；
  远端新增的 `pages.yml` 保留。
- 合并后完整 CI（记录、xref、facts、站点重建、矩阵、SOP、脚本测试）
  全绿后推送 `main`，不使用 force push。

## 四、部署架构与隔离

- 新容器 `mas-router-site-web`，镜像 `mas-router-site:<tag>`（linux/amd64），
  只读文件系统、非 root、`cap_drop: ALL`、内存/CPU/pid 限额、日志轮转。
- 只发布 `172.20.0.1:18890`（宿主侧），不占公网端口；独立 compose 项目与网络。
- 共享网关 `ai_video_nginx` 只增加一个 `main.luteos.com` server block 并
  graceful reload；有标记、有备份、失败自动回滚；不重启任何既有容器。
- 证书复用 `*.luteos.com` 泛域名证书（有效期到 2027-03-07）。

## 五、验收标准

部署前（本地）：
1. `node scripts/site/build.mjs && git diff --exit-code docs/site/`
2. `node scripts/site/links.mjs`（32 页 0 断链）
3. `node --test scripts/site/*.test.mjs`（19 项，含 4 个“必须变红”的反例）
4. `deploy/build-image.sh`：容器内 `nginx -t`、healthz、首页；生产镜像由
   `deploy-release.sh` 在服务器上原生构建（amd64）
5. Lighthouse 桌面与移动：四个类别全 100；390px 全页无横向溢出

部署后（生产，`deploy/accept.sh`）：
1. `/healthz` 200 且内容为 `ok`
2. `docs/site` 全部页面 200
3. 不存在路径 404 且返回站点自己的 404 页；`/404.html` 直接访问也是 404
4. 响应头：HSTS、nosniff、X-Frame-Options、Referrer-Policy、Cache-Control、gzip
5. TLS 证书覆盖域名且在有效期内
6. `video.luteos.com`、`xmind.luteos.com`、`mas.luteos.com` 回归 200
7. 容器 `healthy`、restart policy、日志无异常；其他容器无重启

## 六、已知缺口（明确记录，不当作通过）

- 腾讯云安全组未放行 80：首次 HTTP 访问会超时；HTTPS 正常。
  跳转配置已就位，放行 80 后无需改代码。
- `docs/site/originals/capability-map.html` 在 390px 下自身溢出；
  原件按“未改一字”规则冻结，不修改。
