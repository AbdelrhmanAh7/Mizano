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

last_status="$(tail -n 1 "$logfile" | awk '{print $2}')"
ok_count="$(grep -c ' OK ' "$logfile" || true)"
target=""
if [ "$last_status" = "FAILED" ]; then
  target="$(grep ' OK ' "$logfile" | tail -n 1 || true)"
elif [ "$ok_count" -ge 2 ]; then
  target="$(grep ' OK ' "$logfile" | tail -n 2 | head -n 1)"
fi
[ -n "$target" ] || { echo "no previous good deployment" >&2; exit 1; }

read -r _ _ sha api_img web_img <<<"$target"
export MIZANO_API_IMAGE="$api_img"
export MIZANO_WEB_IMAGE="$web_img"
log "rolling back to $sha"
dc pull api web
dc up -d --remove-orphans
if wait_healthy 300; then
  printf '%s OK %s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$sha" "$api_img" "$web_img" >>"$logfile"
  log "rollback OK"
  exit 0
fi
echo "rollback target is unhealthy; manual intervention required" >&2
exit 1
