#!/usr/bin/env bash
# 生产验收：对已部署的站点做一整套只读检查，并对照其他站点无回归。
#
#   deploy/accept.sh                          # 默认 https://main.luteos.com
#   deploy/accept.sh https://staging.example  # 其他地址
#
# 退出码 0 = 全部通过；非 0 = 有失败项（逐条打印）。
set -uo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"
BASE="${1:-https://main.luteos.com}"
HOST="$(printf '%s' "${BASE}" | sed -E 's#^https?://##; s#/.*$##')"
RANDOM_PATH="mas-router-site-accept-$RANDOM"
PASS=0; FAIL=0; SKIP=0

ok()   { PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; }
skip() { SKIP=$((SKIP+1)); printf '  \033[33mSKIP\033[0m %s\n' "$1"; }

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1"; }

echo "== 目标 ${BASE}（${HOST}）"

echo
echo "-- 1. 基础与健康检查"
[ "$(code "${BASE}/healthz")" = "200" ] && ok "GET /healthz -> 200" || bad "GET /healthz"
curl -fsS --max-time 15 "${BASE}/healthz" | grep -q '^ok' && ok "healthz 内容 = ok" || bad "healthz 内容"

echo
echo "-- 2. 所有页面 200（来自 docs/site 的实际产物清单）"
while IFS= read -r rel; do
  [ "${rel}" = "404.html" ] && continue
  c="$(code "${BASE}/${rel}")"
  if [ "${c}" = "200" ]; then ok "/${rel} 200"; else bad "/${rel} -> ${c}"; fi
done < <(cd docs/site && find . -name '*.html' | sed 's#^\./##' | sort)

echo
echo "-- 3. 404 行为"
c="$(code "${BASE}/${RANDOM_PATH}")"
[ "${c}" = "404" ] && ok "不存在的路径 -> 404" || bad "不存在路径 -> ${c}（期望 404）"
curl -fsS --max-time 15 "${BASE}/${RANDOM_PATH}" | grep -q '404' && ok "404 页是站点自己的页面" || bad "404 页内容"
c="$(code "${BASE}/404.html")"
[ "${c}" = "404" ] && ok "/404.html 直接访问 -> 404（internal 生效）" || bad "/404.html -> ${c}（期望 404）"

echo
echo "-- 4. 响应头（安全 / 缓存 / gzip）"
HEAD="$(curl -sI --max-time 15 "${BASE}/")"
for name in strict-transport-security x-content-type-options x-frame-options referrer-policy cache-control; do
  printf '%s' "${HEAD}" | grep -qi "^${name}:" && ok "头 ${name}" || bad "缺响应头 ${name}"
done
printf '%s' "${HEAD}" | grep -qi '^server: nginx' && bad "Server 头仍暴露 nginx（期望 server_tokens off）" || ok "Server 头已收敛"
GZ="$(curl -s -o /dev/null -D - --max-time 15 -H 'Accept-Encoding: gzip' "${BASE}/" | tr 'A-Z' 'a-z')"
printf '%s' "${GZ}" | grep -q 'content-encoding: gzip' && ok "gzip 生效" || bad "gzip 未生效"

echo
echo "-- 5. TLS"
CERT="$(echo | openssl s_client -connect "${HOST}:443" -servername "${HOST}" 2>/dev/null | openssl x509 -noout -subject -dates -ext subjectAltName 2>/dev/null || true)"
if printf '%s' "${CERT}" | grep -q "${HOST}"; then
  ok "证书覆盖 ${HOST}"
else
  bad "证书未覆盖 ${HOST}"
fi
if printf '%s' "${CERT}" | grep -q 'notAfter'; then
  EXPIRES="$(printf '%s' "${CERT}" | grep notAfter | cut -d= -f2)"
  ok "证书有效期至 ${EXPIRES}"
fi
VER="$(echo | openssl s_client -connect "${HOST}:443" -servername "${HOST}" 2>/dev/null | grep -m1 'Protocol' || true)"
printf '%s' "${VER}" | grep -qE 'TLSv1\.[23]' && ok "TLS 协商：${VER#*: }" || skip "无法读取 TLS 版本"

echo
echo "-- 6. HTTP -> HTTPS（80 未放行时跳过，记已知缺口）"
c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "http://${HOST}/" 2>/dev/null || echo timeout)"
case "${c}" in
  301|302|307|308) ok "HTTP ${c} -> HTTPS" ;;
  timeout|000)      skip "80 不可达（腾讯云安全组未放行；首次 HTTP 访问会超时）" ;;
  *)                bad "HTTP -> ${c}" ;;
esac

echo
echo "-- 7. 回归：其他站点不受影响"
for d in video.luteos.com xmind.luteos.com mas.luteos.com; do
  c="$(code "https://${d}/")"
  if [ "${c}" = "200" ]; then ok "https://${d}/ 200"; else bad "https://${d}/ -> ${c}"; fi
done

echo
printf '== 结果：\033[32m%d PASS\033[0m, \033[31m%d FAIL\033[0m, \033[33m%d SKIP\033[0m\n' "${PASS}" "${FAIL}" "${SKIP}"
[ "${FAIL}" -eq 0 ]
