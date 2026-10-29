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
HOSTNAME_ONLY="${HOST%%:*}"
SKIP_TLS="${SKIP_TLS:-0}"
SKIP_REGRESSION="${SKIP_REGRESSION:-0}"
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
curl -sS --max-time 15 "${BASE}/${RANDOM_PATH}" | grep -q '404' && ok "404 页是站点自己的页面" || bad "404 页内容"
c="$(code "${BASE}/404.html")"
[ "${c}" = "404" ] && ok "/404.html 直接访问 -> 404（internal 生效）" || bad "/404.html -> ${c}（期望 404）"

echo
echo "-- 4. 响应头（安全 / 缓存 / gzip）"
HEAD="$(curl -sI --max-time 15 "${BASE}/")"
for name in strict-transport-security x-content-type-options x-frame-options referrer-policy cache-control; do
  if [ "${name}" = "strict-transport-security" ] && [ "${SKIP_TLS}" = "1" ]; then
    skip "HSTS 在共享网关加，origin 本地验收不检查"
    continue
  fi
  printf '%s' "${HEAD}" | grep -qi "^${name}:" && ok "头 ${name}" || bad "缺响应头 ${name}"
done
printf '%s' "${HEAD}" | grep -qiE '^server: nginx/[0-9]' && bad "Server 头暴露版本号（期望 server_tokens off）" || ok "Server 头已收敛"
GZ="$(curl -s -o /dev/null -D - --max-time 15 -H 'Accept-Encoding: gzip' "${BASE}/" | tr 'A-Z' 'a-z')"
printf '%s' "${GZ}" | grep -q 'content-encoding: gzip' && ok "gzip 生效" || bad "gzip 未生效"

echo
echo "-- 5. TLS"
if [ "${SKIP_TLS}" = "1" ]; then
  skip "TLS 检查已跳过（本地 HTTP 验收）"
else
# 用 curl 的系统信任链验证：通配符证书的 SAN 是 *.luteos.com，
# 字面 grep 主域名会误报，必须让校验器做主机名匹配。本脚本在公网侧运行，
# 直接走 DNS；SNI 指向 127.0.0.1 的写法是服务器侧脚本用的，放在这里会连到本机 443。
TLS_OUT="$(curl -s -o /dev/null -w '%{ssl_verify_result} %{http_code}' \
  --max-time 15 "https://${HOSTNAME_ONLY}/" 2>/dev/null || echo '1 000')"
VERIFY="${TLS_OUT%% *}"; CODE="${TLS_OUT##* }"
if [ "${VERIFY}" = "0" ] && { [ "${CODE}" = "200" ] || [ "${CODE}" = "301" ] || [ "${CODE}" = "302" ]; }; then
  ok "证书链与主机名验证通过（${HOSTNAME_ONLY}，HTTP ${CODE}）"
else
  bad "TLS 验证失败：ssl_verify_result=${VERIFY}, http_code=${CODE}"
fi
CERT="$(echo | openssl s_client -connect "${HOSTNAME_ONLY}:443" -servername "${HOSTNAME_ONLY}" 2>/dev/null | openssl x509 -noout -dates -issuer 2>/dev/null || true)"
if printf '%s' "${CERT}" | grep -q 'notAfter'; then
  EXPIRES="$(printf '%s' "${CERT}" | grep notAfter | cut -d= -f2)"
  ISSUER="$(printf '%s' "${CERT}" | grep '^issuer' | sed 's/^issuer=//' | head -c 80)"
  ok "证书有效期至 ${EXPIRES}（issuer: ${ISSUER}）"
else
  skip "无法读取证书有效期"
fi
fi

echo
echo "-- 6. HTTP -> HTTPS（80 未放行时跳过，记已知缺口）"
case "${BASE}" in
  https://*)
    OUT="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "http://${HOST}/" 2>/dev/null)"
    RC=$?
    if [ "${RC}" -ne 0 ] || [ "${OUT}" = "000" ]; then
      skip "80 不可达（腾讯云安全组未放行；首次 HTTP 访问会超时）"
    else
      case "${OUT}" in
        301|302|307|308) ok "HTTP ${OUT} -> HTTPS" ;;
        *)               bad "HTTP -> ${OUT}" ;;
      esac
    fi
    ;;
  *) skip "本地/HTTP 验收，无跳转检查" ;;
esac

echo
echo "-- 7. 回归：其他站点不受影响"
if [ "${SKIP_REGRESSION}" = "1" ]; then
  skip "回归检查已跳过（本地验收）"
else
for d in video.luteos.com xmind.luteos.com mas.luteos.com; do
  c="$(code "https://${d}/")"
  if [ "${c}" = "200" ]; then ok "https://${d}/ 200"; else bad "https://${d}/ -> ${c}"; fi
done
fi

echo
printf '== 结果：\033[32m%d PASS\033[0m, \033[31m%d FAIL\033[0m, \033[33m%d SKIP\033[0m\n' "${PASS}" "${FAIL}" "${SKIP}"
[ "${FAIL}" -eq 0 ]
