#!/usr/bin/env bash
# 本地构建并验收镜像（原生架构）。
#
# 这台机器上的 Docker 是 aarch64，不能交叉构建 amd64（legacy builder 会报
# content digest not found）。功能验证用原生构建完全等价：Dockerfile 没有
# 架构相关步骤，生产镜像由服务器原生构建（见 pack-context.sh / deploy-release.sh）。
#
#   deploy/build-image.sh [tag]
#
# 做四件事：构建 -> 容器内 nginx -t -> healthz -> 首页内容。
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
TAG="${1:-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)}"
IMAGE="mas-router-site:${TAG}-local"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/mas-router-site-build.XXXXXX")"
CID=""
cleanup() { [ -n "${CID}" ] && docker rm -f "${CID}" >/dev/null 2>&1 || true; rm -rf "${WORK}"; }
trap cleanup EXIT

git archive --format=tar --prefix=release/ HEAD -o "${WORK}/release.tar"
tar -xf "${WORK}/release.tar" -C "${WORK}"
RELEASE_DIR="${WORK}/release"
[ -f "${RELEASE_DIR}/docs/site/index.html" ] || { echo "docs/site/index.html 不在提交里" >&2; exit 1; }

echo "== 构建 ${IMAGE}（原生架构，上下文来自 HEAD=$(git rev-parse --short HEAD)）"
docker build -f deploy/Dockerfile -t "${IMAGE}" "${RELEASE_DIR}"

echo "== 容器内 nginx -t"
docker run --rm --entrypoint nginx "${IMAGE}" -t

echo "== 冒烟：healthz + 首页"
CID="$(docker run -d --rm -p 127.0.0.1:0:8080 "${IMAGE}")"
PORT="$(docker port "${CID}" 8080/tcp | awk -F: '{print $NF}')"
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1 && break
  sleep 0.2
done
curl -fsS "http://127.0.0.1:${PORT}/healthz" | grep -q '^ok' || { echo "healthz 失败" >&2; exit 1; }
curl -fsS "http://127.0.0.1:${PORT}/" | grep -q 'Agent Native Builder' || { echo "首页内容不对" >&2; exit 1; }
curl -s -o /dev/null -w '404 路径: %{http_code}\n' "http://127.0.0.1:${PORT}/no-such-page"

echo
echo "ok — 本地镜像 ${IMAGE} 可用（${PORT} 已回收）"
