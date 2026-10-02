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
check_service() { # name port path
  local cid ip
  cid="$(dc ps -q "$1" 2>/dev/null || true)"
  ip=""
  [ -z "$cid" ] || ip="$(container_ip "$cid")"
  if [ -z "$ip" ]; then
    problems+=("$1-down|$1 not running")
  elif ! curl -fsS --max-time 10 -o /dev/null "http://$ip:$2${3:-/api/health}" >/dev/null 2>&1; then
    problems+=("$1-unhealthy|$1 unhealthy")
  fi
}
check_service api 6001
check_service web 5001 /robots.txt

used="$(df --output=pcent "$DATA_DIR" | tail -n 1 | tr -dc '0-9')"
[ "${used:-0}" -le 80 ] || problems+=("disk|disk ${used}% used")

avail_mb="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
[ "$avail_mb" -ge 300 ] || problems+=("memory|low available memory (${avail_mb}MB)")

if [ -r /sys/class/thermal/thermal_zone0/temp ]; then
  temp_c=$(($(cat /sys/class/thermal/thermal_zone0/temp) / 1000))
  [ "$temp_c" -lt 80 ] || problems+=("temp|CPU temp ${temp_c}C")
fi
if command -v vcgencmd >/dev/null 2>&1; then
  thr="$(vcgencmd get_throttled 2>/dev/null | cut -d= -f2 || true)"
  if [ -n "$thr" ] && [ "$thr" != "0x0" ]; then problems+=("throttle|throttle flags $thr"); fi
fi

bstatus="$DATA_DIR/backups/backup.status"
if [ ! -f "$bstatus" ]; then
  problems+=("backup-missing|no backup status file")
else
  age_s=$(($(date +%s) - $(stat -c %Y "$bstatus")))
  [ "$age_s" -le $((26 * 3600)) ] || problems+=("backup-stale|backup older than 26h")
  grep -q '^OK' "$bstatus" || problems+=("backup-failed|last backup failed")
fi

notify() {
  if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then return 0; fi
  curl -fsS --max-time 15 -o /dev/null \
    --data-urlencode "chat_id=$TELEGRAM_ALERT_CHAT_ID" \
    --data-urlencode "text=$1" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" >/dev/null 2>&1 || true
}

# Dedupe on stable keys (check name), never on live numbers: one alert when a check
# starts failing, one recovery when it clears.
state="$state_dir/active-keys"
touch "$state"
declare -A now_msg=()
for p in "${problems[@]}"; do
  now_msg["${p%%|*}"]="${p#*|}"
done

for key in "${!now_msg[@]}"; do
  if ! grep -qxF "$key" "$state"; then
    notify "[Mizano $host] ALERT: ${now_msg[$key]}"
  fi
done
while IFS= read -r key; do
  [ -n "$key" ] || continue
  if [ -z "${now_msg[$key]:-}" ]; then
    notify "[Mizano $host] RECOVERED: $key"
  fi
done <"$state"

: >"$state.new"
for key in "${!now_msg[@]}"; do printf '%s
' "$key" >>"$state.new"; done
mv "$state.new" "$state"

if [ "${#now_msg[@]}" -gt 0 ]; then
  log "problems: ${!now_msg[*]}" >&2
  exit 1
fi
