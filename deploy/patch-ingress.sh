#!/usr/bin/env bash
# 服务器侧：把 main.luteos.com 的 server block 接入共享网关。
#
# 共享网关把 nginx.conf 作为「单文件只读 bind mount」挂进容器。这个挂载在容器
# 启动时固定当时的 inode：之后在宿主上替换/修改这个文件，运行中的容器都看不到，
# 容器内 nginx -t 与 HUP reload 都不能证明候选有效。这个约束在本仓库的
# xmind 部署 Runbook 里已经记录过一次。因此接入动作是：
#   候选生成 -> 容器内验证 -> 备份 -> 记录 32 域名基线 -> 原子安装 -> 有界重启
#   -> 校验容器内 hash == 候选 -> 域名回归 -> （任一失败）恢复备份 + 再重启
#
# 前置：/opt/mas-router-site/tools/ 下有 patch-ingress.py 和 main.luteos.com.conf；
#       mas-router-site-web 已在 172.20.0.1:18890 healthy。
# 用法：sudo bash patch-ingress.sh
set -euo pipefail

BASE=/opt/ai-video/deploy/lighthouse/nginx.conf
CONTAINER=ai_video_nginx
ROOT=/opt/mas-router-site
TOOLS="${ROOT}/tools"
CAND="/tmp/nginx.conf.mas-router-site.$(date +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${ROOT}/backups"
BACKUP="${BACKUP_DIR}/nginx.conf.$(date +%Y%m%dT%H%M%SZ)"
DOMAIN=main.luteos.com
DOMAINS_FILE="/tmp/mas-router-site-domains.$$.txt"
BASELINE_FILE="/tmp/mas-router-site-baseline.$$.txt"

command -v python3 >/dev/null || { echo "需要 python3" >&2; exit 1; }
[ -f "${TOOLS}/patch-ingress.py" ] || { echo "缺少 ${TOOLS}/patch-ingress.py" >&2; exit 1; }
[ -f "${TOOLS}/main.luteos.com.conf" ] || { echo "缺少 ${TOOLS}/main.luteos.com.conf" >&2; exit 1; }
[ -f "${BASE}" ] || { echo "找不到共享网关配置 ${BASE}" >&2; exit 1; }

http_code() { # host -> code（SNI 指到 127.0.0.1，绕开 DNS/回环差异）
  local out
  out="$(curl -s -k -o /dev/null -w '%{http_code}' --max-time 8 --resolve "$1:443:127.0.0.1" "https://$1/" 2>/dev/null)" || true
  echo "${out:-000}"
}

wait_ingress() {
  for _ in $(seq 1 60); do
    code="$(http_code video.luteos.com)"
    [ "${code}" != "000" ] && return 0
    sleep 1
  done
  return 1
}

echo "== 0. 上游必须已经 healthy"
curl -fsS http://172.20.0.1:18890/healthz | grep -q '^ok' \
  || { echo "172.20.0.1:18890 不健康，先把容器起来" >&2; exit 1; }

echo "== 1. 生成候选配置"
REPLACE_ARG=""
if grep -q "BEGIN mas-router-site" "${BASE}"; then
  REPLACE_ARG="--replace"
  echo "   已存在带标记的块：本次是更新"
fi
python3 "${TOOLS}/patch-ingress.py" \
  --base "${BASE}" \
  --snippet "${TOOLS}/main.luteos.com.conf" \
  --output "${CAND}" \
  ${REPLACE_ARG}

echo "== 2. 在运行中的容器里验证候选（不改运行中的配置）"
docker cp "${CAND}" "${CONTAINER}:/tmp/nginx.conf.candidate"
docker exec "${CONTAINER}" nginx -t -c /tmp/nginx.conf.candidate

echo "== 3. 备份当前配置"
install -d -m 0755 "${BACKUP_DIR}"
cp -p "${BASE}" "${BACKUP}"
echo "backup: ${BACKUP}"

echo "== 4. 记录域名基线"
grep -oE 'server_name[^;]+' "${BASE}" | sed 's/server_name//' \
  | tr -s ' \t' '\n' | grep -E '^[a-z0-9.*_-]+\.[a-z]+$' | sort -u > "${DOMAINS_FILE}"
: > "${BASELINE_FILE}"
while IFS= read -r d; do
  [ "${d}" = "${DOMAIN}" ] && continue
  c="$(http_code "${d}")"
  [ "${c}" = "000" ] && { sleep 2; c="$(http_code "${d}")"; }
  printf '%s %s\n' "${d}" "${c}" >> "${BASELINE_FILE}"
done < "${DOMAINS_FILE}"
echo "baseline: $(wc -l < "${BASELINE_FILE}") 个域名"

rollback() {
  echo "!! 回滚共享网关配置并重启" >&2
  install -m 0644 "${BACKUP}" "${BASE}"
  docker restart "${CONTAINER}" >/dev/null
  wait_ingress || true
  echo "!! 已回滚；如有需要请手工核对 ${BACKUP}" >&2
}

echo "== 5. 原子安装候选并做一次有界重启"
install -m 0644 "${CAND}" "${BASE}"
if ! docker restart "${CONTAINER}" >/dev/null; then
  rollback; exit 1
fi
if ! wait_ingress; then
  echo "重启后入口未恢复" >&2
  rollback; exit 1
fi

echo "== 6. 校验容器内配置就是候选"
HOST_HASH="$(sha256sum "${BASE}" | cut -d' ' -f1)"
CONT_HASH="$(docker exec "${CONTAINER}" sha256sum /etc/nginx/nginx.conf | cut -d' ' -f1)"
if [ "${HOST_HASH}" != "${CONT_HASH}" ]; then
  echo "容器内配置 hash 与候选不一致（${CONT_HASH:0:12} != ${HOST_HASH:0:12}）" >&2
  rollback; exit 1
fi
grep -q "mas-router-site ${DOMAIN}" <(docker exec "${CONTAINER}" grep -E 'BEGIN mas-router-site' /etc/nginx/nginx.conf) \
  || { echo "容器内配置缺少部署标记" >&2; rollback; exit 1; }

echo "== 7. main.luteos.com 验收"
curl -fsS -k --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/healthz" | grep -q '^ok' \
  || { echo "HTTPS healthz 失败" >&2; rollback; exit 1; }
curl -fsS -k --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/" | grep -q 'Agent Native Builder' \
  || { echo "首页内容不是我们的站点" >&2; rollback; exit 1; }
echo "  healthz ok · 首页 ok"

echo "== 8. 32 域名回归（与基线比较）"
sleep 3   # 重启后部分上游会抖一下；给一个已有的稳定窗口
CHANGED=0
while IFS=' ' read -r d before; do
  after="$(http_code "${d}")"
  case "${before}" in
    2*|3*)
      case "${after}" in
        2*|3*) : ;;
        *)
          # 单次 000/5xx 可能是重启尾巴；重试两轮再判定
          sleep 2; after="$(http_code "${d}")"
          case "${after}" in
            2*|3*) : ;;
            *) sleep 2; after="$(http_code "${d}")" ;;
          esac
          case "${after}" in
            2*|3*) : ;;
            *) echo "  变差：${d} ${before} -> ${after}" >&2; CHANGED=1 ;;
          esac
          ;;
      esac
      ;;
  esac
done < "${BASELINE_FILE}"
if [ "${CHANGED}" -ne 0 ]; then
  echo "有域名回归变差" >&2
  rollback; exit 1
fi
echo "  无回归"

rm -f "${DOMAINS_FILE}" "${BASELINE_FILE}"
echo
echo "ok — ${DOMAIN} 已接入共享网关"
echo "    候选：${CAND}"
echo "    备份：${BACKUP}（回滚：install -m 0644 ${BACKUP} ${BASE} && docker restart ${CONTAINER}）"
