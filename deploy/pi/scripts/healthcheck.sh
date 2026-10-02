#!/usr/bin/env bash
# Run every 5 min by systemd. Alerts and recoveries go to Telegram; messages carry no
# secrets or document data. A state file prevents repeat spam.
set -euo pipefail
# shellcheck source=deploy/pi/scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

state_dir="$DATA_DIR/monitor"
mkdir -p "$state_dir"
host="$(hostname -s)"
problems=()

container_ip() {
  docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$1" 2>/dev/null || true
}
check_service() { # name port
  local cid ip
  cid="$(dc ps -q "$1" 2>/dev/null || true)"
  ip=""
  [ -z "$cid" ] || ip="$(container_ip "$cid")"
  if [ -z "$ip" ]; then
    problems+=("$1 not running")
  elif ! curl -fsS --max-time 10 -o /dev/null "http://$ip:$2/api/health" >/dev/null 2>&1; then
    problems+=("$1 unhealthy")
  fi
}
check_service api 6001
check_service web 5001

used="$(df --output=pcent "$DATA_DIR" | tail -n 1 | tr -dc '0-9')"
[ "${used:-0}" -le 80 ] || problems+=("disk ${used}% used")

avail_mb="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
[ "$avail_mb" -ge 300 ] || problems+=("low memory: ${avail_mb}MB available")

if [ -r /sys/class/thermal/thermal_zone0/temp ]; then
  temp_c=$(($(cat /sys/class/thermal/thermal_zone0/temp) / 1000))
  [ "$temp_c" -lt 80 ] || problems+=("CPU temp ${temp_c}C")
fi
if command -v vcgencmd >/dev/null 2>&1; then
  thr="$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2 || true)"
  if [ -n "$thr" ] && [ "$thr" != "0x0" ]; then problems+=("throttle flags $thr"); fi
fi

bstatus="$DATA_DIR/backups/backup.status"
if [ ! -f "$bstatus" ]; then
  problems+=("no backup status file")
else
  age_s=$(($(date +%s) - $(stat -c %Y "$bstatus")))
  [ "$age_s" -le $((26 * 3600)) ] || problems+=("backup older than 26h")
  grep -q '^OK' "$bstatus" || problems+=("last backup failed")
fi

notify() {
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then return 0; fi
  curl -fsS --max-time 15 -o /dev/null \
    --data-urlencode "chat_id=$TELEGRAM_ALERT_CHAT_ID" \
    --data-urlencode "text=$1" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" >/dev/null 2>&1 || true
}

current=""
if [ "${#problems[@]}" -gt 0 ]; then
  current="$(printf '%s\n' "${problems[@]}" | sort | paste -sd ';' -)"
fi
state="$state_dir/last-alert"
previous=""
[ ! -f "$state" ] || previous="$(cat "$state")"

if [ "$current" != "$previous" ]; then
  if [ -n "$current" ]; then
    notify "[Mizano $host] ALERT: $current"
  else
    notify "[Mizano $host] RECOVERED: all checks passing"
  fi
  printf '%s' "$current" >"$state"
fi
if [ -n "$current" ]; then
  log "problems: $current" >&2
  exit 1
fi
