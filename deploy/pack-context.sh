#!/usr/bin/env bash
# 从 HEAD 打出一个只含构建上下文的 tar（不含 .git），供服务器原生构建。
#
#   deploy/pack-context.sh [tag]
#   -> dist/mas-router-site-<tag>-context.tar.gz(+ .sha256)
#
# 为什么不让服务器 git clone：服务器上没有仓库的 GitHub 凭据，而且部署产物
# 必须对应一个确定提交；git archive 让“上传的就是这个提交”成为事实。
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
TAG="${1:-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)}"
DIST="${REPO}/dist"
mkdir -p "${DIST}"

TAR="${DIST}/mas-router-site-${TAG}-context.tar.gz"
git archive --format=tar --prefix=src/ HEAD | gzip -9 > "${TAR}"
if command -v sha256sum >/dev/null 2>&1; then
  ( cd "${DIST}" && sha256sum "$(basename "${TAR}")" > "$(basename "${TAR}").sha256" )
else
  ( cd "${DIST}" && shasum -a 256 "$(basename "${TAR}")" > "$(basename "${TAR}").sha256" )
fi

echo "tag:     ${TAG}"
echo "context: ${TAR}"
echo "sha256:  $(cut -d' ' -f1 < "${TAR}.sha256")"
echo
echo "下一步："
echo "  scp ${TAR}* ubuntu@43.163.92.244:/tmp/"
echo "  ssh ubuntu@43.163.92.244 \"sudo bash /tmp/deploy-release.sh ${TAG} /tmp/$(basename "${TAR}")\""
