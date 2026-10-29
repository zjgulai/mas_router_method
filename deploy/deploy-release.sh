#!/usr/bin/env bash
# 服务器侧：从构建上下文原生构建镜像，并启动 mas-router-site。
# 只动这个项目，不碰其他容器。
#
# 用法（在服务器上；上下文 tar 已上传到 /tmp）：
#   sudo bash deploy-release.sh <IMAGE_TAG> /tmp/mas-router-site-<tag>-context.tar.gz
#
# 目录：/opt/mas-router-site/releases/<tag>/{src,compose.yaml,.env}
set -euo pipefail

TAG="${1:?IMAGE_TAG}"
CONTEXT_TAR="${2:?构建上下文 tar 路径}"
ROOT=/opt/mas-router-site
RELEASE="${ROOT}/releases/${TAG}"
SRC="${RELEASE}/src"
IMAGE="mas-router-site:${TAG}"

[ -f "${CONTEXT_TAR}" ] || { echo "找不到 ${CONTEXT_TAR}" >&2; exit 1; }

if [ -f "${CONTEXT_TAR}.sha256" ]; then
  echo "== 校验上下文 sha256"
  ( cd "$(dirname "${CONTEXT_TAR}")" && sha256sum -c "$(basename "${CONTEXT_TAR}").sha256" )
fi

echo "== 解包到 ${SRC}"
install -d -m 0755 "${SRC}"
tar -xzf "${CONTEXT_TAR}" -C "${SRC}" --strip-components=1
[ -f "${SRC}/docs/site/index.html" ] || { echo "上下文里没有 docs/site/index.html" >&2; exit 1; }

echo "== 服务器原生构建 amd64 镜像 ${IMAGE}"
cd "${SRC}"
docker build --platform linux/amd64 -f deploy/Dockerfile -t "${IMAGE}" .

echo "== 容器内 nginx -t"
docker run --rm --entrypoint nginx "${IMAGE}" -t

echo "== 落盘 compose 并启动"
install -m 0644 "${SRC}/deploy/compose.yaml" "${RELEASE}/compose.yaml"
printf 'IMAGE_TAG=%s\n' "${TAG}" > "${RELEASE}/.env"
ln -sfn "${RELEASE}" "${ROOT}/current"
cd "${RELEASE}"
docker compose -f compose.yaml --env-file .env up -d

echo "== 等待 healthy"
for _ in $(seq 1 240); do
  STATE="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' mas-router-site-web 2>/dev/null || echo missing)"
  [ "${STATE}" = "healthy" ] && break
  sleep 0.5
done
STATE="$(docker inspect --format '{{.State.Health.Status}}' mas-router-site-web 2>/dev/null || echo missing)"
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
