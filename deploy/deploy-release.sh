#!/usr/bin/env bash
# 服务器侧：加载镜像并启动 mas-router-site。只动这个项目，不碰其他容器。
#
# 用法（在服务器上，镜像 tar 已上传到 /tmp）：
#   sudo bash deploy-release.sh <IMAGE_TAG> /tmp/mas-router-site-<tag>-linux-amd64.tar.gz
#
# 目录：/opt/mas-router-site/releases/<tag>/
set -euo pipefail

TAG="${1:?IMAGE_TAG}"
TARBALL="${2:?镜像 tar 路径}"
ROOT=/opt/mas-router-site
RELEASE="${ROOT}/releases/${TAG}"
IMAGE="mas-router-site:${TAG}"

if [ ! -f "${TARBALL}" ]; then echo "找不到 ${TARBALL}" >&2; exit 1; fi

# 校验上传时的 sha256（如果同名 .sha256 也上传了）
if [ -f "${TARBALL}.sha256" ]; then
  echo "== 校验 tar 的 sha256"
  ( cd "$(dirname "${TARBALL}")" && shasum -a 256 -c "$(basename "${TARBALL}").sha256" )
fi

echo "== 载入镜像 ${IMAGE}"
docker load -i "${TARBALL}"

echo "== 落盘到 ${RELEASE}"
install -d "${RELEASE}"
install -m 0644 "${TARBALL}" "${RELEASE}/$(basename "${TARBALL}")"
if [ -f "${TARBALL}.sha256" ]; then
  install -m 0644 "${TARBALL}.sha256" "${RELEASE}/$(basename "${TARBALL}").sha256"
fi
install -m 0644 "$(dirname "$0")/compose.yaml" "${RELEASE}/compose.yaml"
printf 'IMAGE_TAG=%s\n' "${TAG}" > "${RELEASE}/.env"
ln -sfn "${RELEASE}" "${ROOT}/current"

echo "== 启动（独立 compose 项目 mas-router-site）"
cd "${RELEASE}"
docker compose -f compose.yaml --env-file .env up -d

echo "== 等待 healthy"
for _ in $(seq 1 40); do
  STATE="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' mas-router-site-web 2>/dev/null || echo missing)"
  [ "${STATE}" = "healthy" ] && break
  sleep 0.5
done
STATE="$(docker inspect --format '{{.State.Health.Status}}' mas-router-site-web)"
if [ "${STATE}" != "healthy" ]; then
  echo "容器未进入 healthy：${STATE}" >&2
  docker logs --tail 50 mas-router-site-web >&2 || true
  exit 1
fi

echo "== origin 验收（172.20.0.1:18890）"
curl -fsS http://172.20.0.1:18890/healthz | grep -q '^ok'
curl -fsS http://172.20.0.1:18890/ | grep -q 'Agent Native Builder'
curl -s -o /dev/null -w 'origin 根路径: %{http_code}\n' http://172.20.0.1:18890/
echo
echo "ok — mas-router-site ${TAG} 已启动并 healthy"
docker ps --filter name=mas-router-site-web --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
