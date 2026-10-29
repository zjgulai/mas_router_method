#!/usr/bin/env bash
# 服务器侧：把 main.luteos.com 的 server block 插入共享网关，并 graceful reload。
#
# 前置条件（脚本会自己检查前两项）：
#   1. mas-router-site-web 已在 172.20.0.1:18890 上 healthy
#   2. /opt/mas-router-site/tools/ 下有 patch-ingress.py 和 main.luteos.com.conf
#
# 这个脚本是唯一会动共享网关的步骤。备份、nginx -t、失败回滚都在里面。
#   用法：sudo bash patch-ingress.sh
set -euo pipefail

BASE=/opt/ai-video/deploy/lighthouse/nginx.conf
CONTAINER=ai_video_nginx
ROOT=/opt/mas-router-site
TOOLS="${ROOT}/tools"
CAND="/tmp/nginx.conf.mas-router-site.$(date +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${ROOT}/backups"
BACKUP="${BACKUP_DIR}/nginx.conf.$(date +%Y%m%dT%H%M%SZ)"
DOMAIN=main.luteos.com

command -v python3 >/dev/null || { echo "需要 python3" >&2; exit 1; }
[ -f "${TOOLS}/patch-ingress.py" ] || { echo "缺少 ${TOOLS}/patch-ingress.py" >&2; exit 1; }
[ -f "${TOOLS}/main.luteos.com.conf" ] || { echo "缺少 ${TOOLS}/main.luteos.com.conf" >&2; exit 1; }
[ -f "${BASE}" ] || { echo "找不到共享网关配置 ${BASE}" >&2; exit 1; }

echo "== 0. 上游必须已经 healthy"
curl -fsS http://172.20.0.1:18890/healthz | grep -q '^ok' \
  || { echo "172.20.0.1:18890 不健康，先把容器起来" >&2; exit 1; }

echo "== 1. 生成候选配置"
python3 "${TOOLS}/patch-ingress.py" \
  --base "${BASE}" \
  --snippet "${TOOLS}/main.luteos.com.conf" \
  --output "${CAND}"

echo "== 2. 在容器内测试候选配置（不影响运行中的配置）"
docker cp "${CAND}" "${CONTAINER}:/tmp/nginx.conf.candidate"
docker exec "${CONTAINER}" nginx -t -c /tmp/nginx.conf.candidate

echo "== 3. 备份当前配置"
install -d -m 0755 "${BACKUP_DIR}"
install -m 0644 "${BASE}" "${BACKUP}"
echo "backup: ${BACKUP}"

rollback() {
  echo "!! 回滚共享网关配置" >&2
  install -m 0644 "${BACKUP}" "${BASE}"
  docker exec "${CONTAINER}" nginx -t
  docker exec "${CONTAINER}" nginx -s reload
}

echo "== 4. 替换并 reload"
if ! install -m 0644 "${CAND}" "${BASE}"; then
  echo "替换失败" >&2; exit 1
fi
if ! docker exec "${CONTAINER}" nginx -t; then
  rollback
  exit 1
fi
if ! docker exec "${CONTAINER}" nginx -s reload; then
  rollback
  exit 1
fi

echo "== 5. 本机验证（SNI 指向 127.0.0.1，绕过 DNS 缓存）"
sleep 1
curl -fsS -k --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/healthz" | grep -q '^ok' || {
  echo "HTTPS healthz 失败，回滚" >&2
  rollback
  exit 1
}
curl -fsS -k --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/" | grep -q 'Agent Native Builder'

echo
echo "ok — ${DOMAIN} 已接入共享网关（候选配置：${CAND}，备份：${BACKUP}）"
