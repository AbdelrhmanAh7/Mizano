#!/usr/bin/env bash
# Roll back to the previous good deployment recorded in deployments.log.
# Called after a FAILED record it restores the last OK entry; run manually it
# restores the OK entry before the current one. Migrations are NOT reverted, so
# migrations must stay backward compatible with the previous release.
set -euo pipefail
# shellcheck source=deploy/pi/scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

logfile="$DATA_DIR/deployments.log"
[ -f "$logfile" ] || { echo "no deployments.log" >&2; exit 1; }

# Log lines: "<ts> <OK|FAILED|ROLLBACK> <sha> <api> <web>". OK = deployed, ROLLBACK =
# rolled back to that entry. The active entry is the last OK/ROLLBACK line; a manual
# rollback targets the OK entry before the active one, so repeats keep moving back.
last_status="$(tail -n 1 "$logfile" | awk '{print $2}')"
mapfile -t oks < <(grep ' OK ' "$logfile" || true)
active="$(grep -E ' (OK|ROLLBACK) ' "$logfile" | tail -n 1 || true)"
[ -n "$active" ] || { echo "no previous good deployment" >&2; exit 1; }
target=""
if [ "$last_status" = "FAILED" ]; then
  target="$active"
else
  read -r _ _ _ act_api act_web <<<"$active"
  pos=-1
  for i in "${!oks[@]}"; do
    read -r _ _ _ o_api o_web <<<"${oks[$i]}"
    if [ "$o_api" = "$act_api" ] && [ "$o_web" = "$act_web" ]; then pos=$i; fi
  done
  if [ "$pos" -ge 1 ]; then target="${oks[$((pos - 1))]}"; fi
fi
[ -n "$target" ] || { echo "no previous good deployment" >&2; exit 1; }

read -r _ _ sha api_img web_img <<<"$target"
export MIZANO_API_IMAGE="$api_img"
export MIZANO_WEB_IMAGE="$web_img"
log "rolling back to $sha"
dc pull api web
dc up -d --remove-orphans
if wait_healthy 300; then
  printf '%s ROLLBACK %s %s %s
' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$sha" "$api_img" "$web_img" >>"$logfile"
  persist_deployment "$sha" "$api_img" "$web_img"
  log "rollback OK"
  exit 0
fi
echo "rollback target is unhealthy; manual intervention required" >&2
exit 1
