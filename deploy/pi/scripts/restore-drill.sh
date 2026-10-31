#!/usr/bin/env bash
# Always restores to a new, network-isolated scratch Postgres and a temporary originals folder.
set -euo pipefail
here="$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=deploy/pi/scripts/lib.sh
. "$here/lib.sh"
umask 077
require_restic
backup_host="${BACKUP_HOST:-$(hostname)}"
set_name="${BACKUP_SET:-default}"
[[ "$set_name" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "invalid backup set" >&2; exit 2; }
work="$(mktemp -d)"
name="mizano-restore-drill-$(python3 -c 'import secrets; print(secrets.token_hex(12))')"
container_id=""
started=$SECONDS
cleanup() {
  if [ -n "$container_id" ]; then docker rm -f "$container_id" >/dev/null 2>&1 || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
# Pin latest to one complete snapshot before reading it; never restore a caller-supplied DB URL.
restic snapshots --json --host "$backup_host" --tag "mizano,$set_name" --latest 1 >"$work/snapshots.json" 2>"$work/restic.log"
snapshot="$(python3 -c 'import json,sys; rows=json.load(open(sys.argv[1])); assert rows; print(max(rows,key=lambda r:r["time"])["id"])' "$work/snapshots.json")"
[[ "$snapshot" =~ ^[0-9a-f]{8,64}$ ]] || { echo "no valid backup snapshot" >&2; exit 1; }
restic dump "$snapshot" /mizano.tar >"$work/backup.tar" 2>>"$work/restic.log"
log "restore stage=verify-files"
python3 "$here/backup-manifest.py" unpack "$work/backup.tar" "$work"
# Credentials are generated for this one scratch container and removed with it.
drill_pw="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
container_id="$(docker run -d --name "$name" --network none --memory 384m \
  -e POSTGRES_PASSWORD="$drill_pw" -e POSTGRES_DB=drill \
  "${RESTORE_POSTGRES_IMAGE:-postgres:16}" -c shared_buffers=64MB -c max_connections=10 2>"$work/container.log")"
ready=0
for _ in $(seq 1 60); do
  if docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d drill >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" -eq 1 ] || { echo "DRILL FAILED: scratch database not ready" >&2; exit 1; }
log "restore stage=database"
docker exec -i "$name" pg_restore -U postgres -d drill --no-owner --no-privileges --exit-on-error \
  <"$work/db.dump" >"$work/restore.log" 2>&1
log "restore stage=verify-ledger-links"
python3 "$here/backup-manifest.py" verify-db "$name" "$work"
log "restore drill OK snapshot=$snapshot elapsed_seconds=$((SECONDS-started))"
