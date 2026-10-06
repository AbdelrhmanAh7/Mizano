#!/usr/bin/env bash
# Deploy exact images by digest. Usage: deploy.sh <commit-sha> <api-digest> <web-digest>
# Digests look like sha256:<64 hex>; repositories come from MIZANO_API_IMAGE/MIZANO_WEB_IMAGE.
set -euo pipefail
here="$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=deploy/pi/scripts/lib.sh
. "$here/lib.sh"

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <commit-sha> <api-digest> <web-digest>" >&2
  exit 2
fi
sha="$1"
api_digest="$2"
web_digest="$3"
digest_re='^sha256:[0-9a-f]{64}$'
sha_re='^[0-9a-f]{7,40}$'
[[ "$api_digest" =~ $digest_re && "$web_digest" =~ $digest_re ]] || { echo "invalid digest" >&2; exit 2; }
[[ "$sha" =~ $sha_re ]] || { echo "invalid commit sha" >&2; exit 2; }

api_repo="${MIZANO_API_IMAGE%%@*}"
web_repo="${MIZANO_WEB_IMAGE%%@*}"
logfile="$DATA_DIR/deployments.log"
mkdir -p "$DATA_DIR"
touch "$logfile"

# Is there a previous good deployment to fall back to?
prev_ok="$(grep -cE ' (OK|ROLLBACK) ' "$logfile" || true)"

export MIZANO_API_IMAGE="$api_repo@$api_digest"
export MIZANO_WEB_IMAGE="$web_repo@$web_digest"

record() {
  printf '%s %s %s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$sha" "$MIZANO_API_IMAGE" "$MIZANO_WEB_IMAGE" >>"$logfile"
}

log "pulling $sha"
dc pull api web

# The api container runs as uid 1001 and writes intake originals to this bind
# mount; a root-owned directory would fail every intake write with EACCES.
originals="$DATA_DIR/originals"
mkdir -p "$originals"
log "checking $originals is writable by uid 1001 (api user)"
if ! docker run --rm --user 1001:1001 -v "$originals:/data/originals" --entrypoint test "$MIZANO_API_IMAGE" -w /data/originals; then
  echo "$originals is not writable by uid 1001; run: sudo chown -R 1001:1001 $originals" >&2
  exit 1
fi

log "running migrations"
dc run --rm migrate
log "restarting stack"
dc up -d --remove-orphans

if wait_healthy 300; then
  record OK
  persist_deployment "$sha" "$MIZANO_API_IMAGE" "$MIZANO_WEB_IMAGE"
  log "deploy OK $sha"
  exit 0
fi

record FAILED
log "health check failed for $sha"
if [ "$prev_ok" -ge 1 ]; then
  log "rolling back to previous deployment"
  exec "$here/rollback.sh"
fi
echo "no previous deployment recorded; stack left as is" >&2
exit 1
