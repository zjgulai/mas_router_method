#!/usr/bin/env bash
# 构建 mas-router-site 镜像，并产出一个带 sha256 的 tar 包用于上传。
#
# 从 git archive 构建，不从工作区构建：这样进镜像的每个字节都能对应到一个提交，
# 也避免把本机的 .env / 未跟踪文件带进去。
#
#   deploy/build-image.sh                 # tag = 日期-短 SHA
#   deploy/build-image.sh 20261029-abc123
#
# 产物：dist/mas-router-site-<tag>-linux-amd64.tar.gz 与同名 .sha256
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
TAG="${1:-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)}"
IMAGE="mas-router-site:${TAG}"
DIST="${REPO}/dist"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/mas-router-site-build.XXXXXX")"
trap 'rm -rf "${WORK}"' EXIT

mkdir -p "${DIST}"

# 只导出被提交的内容。--prefix 让解包后就是仓库根。
git archive --format=tar --prefix=release/ HEAD -o "${WORK}/release.tar"
tar -xf "${WORK}/release.tar" -C "${WORK}"
RELEASE_DIR="${WORK}/release"

if [ ! -f "${RELEASE_DIR}/docs/site/index.html" ]; then
  echo "docs/site/index.html 不在提交里；站点还没生成或还没提交" >&2
  exit 1
fi

echo "== 构建 ${IMAGE}（linux/amd64，上下文来自 HEAD=$(git rev-parse --short HEAD)）"
docker build --platform linux/amd64 -f deploy/Dockerfile -t "${IMAGE}" "${RELEASE_DIR}"

ARCH="$(docker image inspect "${IMAGE}" --format '{{.Architecture}}')"
if [ "${ARCH}" != "amd64" ]; then
  echo "镜像架构是 ${ARCH}，服务器是 amd64；构建参数没有生效" >&2
  exit 1
fi

echo "== 校验容器内 nginx 配置"
docker run --rm --entrypoint nginx "${IMAGE}" -t

echo "== 冒烟：healthz + 首页"
CID="$(docker run -d --rm -p 127.0.0.1:0:8080 "${IMAGE}")"
trap 'docker rm -f "${CID}" >/dev/null 2>&1 || true; rm -rf "${WORK}"' EXIT
PORT="$(docker port "${CID}" 8080/tcp | awk -F: '{print $NF}')"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then break; fi
  sleep 0.2
done
curl -fsS "http://127.0.0.1:${PORT}/healthz" | grep -q '^ok' || { echo "healthz 失败" >&2; exit 1; }
curl -fsS "http://127.0.0.1:${PORT}/" | grep -q 'Agent Native Builder' || { echo "首页内容不对" >&2; exit 1; }
docker rm -f "${CID}" >/dev/null

TAR="${DIST}/mas-router-site-${TAG}-linux-amd64.tar.gz"
echo "== 导出镜像 ${TAR}"
docker save "${IMAGE}" | gzip -9 > "${TAR}"
( cd "${DIST}" && shasum -a 256 "$(basename "${TAR}")" > "$(basename "${TAR}").sha256" )

echo
echo "tag:    ${TAG}"
echo "image:  ${IMAGE}"
echo "tar:    ${TAR}"
echo "sha256: $(cut -d' ' -f1 < "${TAR}.sha256")"
