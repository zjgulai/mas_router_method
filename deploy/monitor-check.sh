#!/usr/bin/env bash
# main.luteos.com 生产探活。cron 每 10 分钟跑一次（安装见 deploy/README.md）。
#
# 设计：
#   - 每次运行把 ok/fail 写进状态文件；只有状态翻转（ok→fail 或 fail→ok）才发
#     飞书告警——持续故障每 10 分钟刷一次屏，只会让人把告警窗关掉。
#   - 告警通道是飞书群自定义机器人 webhook，读自
#     /opt/mas-router-site/monitor/feishu-webhook.env（FEISHU_WEBHOOK_URL=...，
#     chmod 600）。文件不存在或 URL 为空 = 只记日志不推送。
#   - 检查项刻意精简：探活要的是「站点死没死」，全量验收是 deploy/accept.sh 的事。
set -uo pipefail

BASE="${MONITOR_BASE:-https://main.luteos.com}"
STATE_DIR="${MONITOR_STATE_DIR:-/opt/mas-router-site/monitor}"
STATE_FILE="${STATE_DIR}/state"
LOG="${STATE_DIR}/last-run.log"
WEBHOOK_ENV="${STATE_DIR}/feishu-webhook.env"

mkdir -p "${STATE_DIR}"

code() {
  # 退出码单独吞掉：curl 失败时 -w 仍会打印 000，直接 `|| echo 000` 会拼出 000000。
  local out
  out="$(curl -s -k -o /dev/null -w '%{http_code}' --max-time 15 "$1" 2>/dev/null)" || true
  echo "${out:-000}"
}

fails=()
c="$(code "${BASE}/healthz")"
[ "$c" = "200" ] && curl -s --max-time 15 "${BASE}/healthz" | grep '^ok' >/dev/null || fails+=("healthz=${c}")
c="$(code "${BASE}/")"
[ "$c" = "200" ] || fails+=("home=${c}")
# 不用 grep -q：命中后提前关管道会触发 pipefail 下的 SIGPIPE，把正常页面误判为缺失。
curl -s --max-time 15 "${BASE}/" | grep 'Agent Native Builder' >/dev/null || fails+=("home-content")
c="$(code "${BASE}/cheatsheet.html")"
[ "$c" = "200" ] || fails+=("cheatsheet=${c}")
c="$(code "${BASE}/sitemap.xml")"
[ "$c" = "200" ] || fails+=("sitemap=${c}")
c="$(code "${BASE}/monitor-probe-$RANDOM-$$")"
[ "$c" = "404" ] || fails+=("404-behavior=${c}")

now="ok"
detail="ok"
if [ "${#fails[@]}" -gt 0 ]; then
  now="fail"
  detail="${fails[*]}"
fi
echo "$(date '+%FT%T') ${now} ${detail}" >> "${LOG}"
printf '%s' "${now}" > "${STATE_FILE}"
tail -n 500 "${LOG}" > "${LOG}.tmp" 2>/dev/null && mv "${LOG}.tmp" "${LOG}"

prev="unknown"
[ -f "${STATE_FILE}.prev" ] && prev="$(cat "${STATE_FILE}.prev")"
printf '%s' "${now}" > "${STATE_FILE}.prev"

if [ "$now" != "$prev" ]; then
  if [ -f "${WEBHOOK_ENV}" ]; then
    # shellcheck disable=SC1090
    . "${WEBHOOK_ENV}"
    if [ -n "${FEISHU_WEBHOOK_URL:-}" ]; then
      if [ "$now" = "fail" ]; then
        TEXT="🔴 main.luteos.com 探活失败（${detail}）。上次状态：${prev}。验收脚本：deploy/accept.sh"
      else
        TEXT="🟢 main.luteos.com 已恢复（此前状态：${prev}）"
      fi
      curl -s --max-time 10 -X POST -H 'Content-Type: application/json' \
        -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"${TEXT}\"}}" \
        "${FEISHU_WEBHOOK_URL}" >> "${LOG}" 2>&1 || true
    fi
  fi
fi

[ "$now" = "ok" ]
