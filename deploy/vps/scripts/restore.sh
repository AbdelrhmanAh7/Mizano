#!/usr/bin/env bash
# Restore THIS server's database and original documents from an encrypted backup snapshot.
#
#   sudo /opt/jarda/deploy/vps/scripts/restore.sh --list
#   sudo /opt/jarda/deploy/vps/scripts/restore.sh --yes                    # latest local snapshot
#   sudo /opt/jarda/deploy/vps/scripts/restore.sh --snapshot 1a2b3c4d --yes
#   sudo /opt/jarda/deploy/vps/scripts/restore.sh --from-r2 --yes          # new server, bucket only
#
# Steps: verify the snapshot's checksums -> safety backup of the current data (unless the
# database is gone) -> stop the app -> replace the database and the originals folder -> check
# per-organization counts and ledger balance against the snapshot's manifest -> start the app.
# The replaced originals folder is kept as originals.before-restore-<time> until you delete it.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/vps/scripts/env.sh
. "$here/env.sh"
umask 077

snapshot="" confirm=0 list=0 from_r2=0 safety=1
while [ $# -gt 0 ]; do
  case "$1" in
    --snapshot) snapshot="${2:-}"; shift 2 ;;
    --yes) confirm=1; shift ;;
    --list) list=1; shift ;;
    --from-r2) from_r2=1; shift ;;
    --skip-safety-backup) safety=0; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

require_restic
if [ "$from_r2" -eq 1 ]; then
  R2_ENV_FILE="${R2_ENV_FILE:-/etc/jarda/r2.env}"
  set -a
  # shellcheck disable=SC1090
  . "$R2_ENV_FILE"
  set +a
  export RESTIC_REPOSITORY="$R2_REPOSITORY" AWS_DEFAULT_REGION="${R2_REGION:-auto}"
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
fi
backup_host="${BACKUP_HOST:-$(hostname)}"
set_name="${BACKUP_SET:-default}"
[[ "$set_name" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "invalid backup set" >&2; exit 2; }

if [ "$list" -eq 1 ]; then
  restic snapshots --host "$backup_host" --tag "mizano,$set_name"
  exit 0
fi
if [ "$confirm" -ne 1 ]; then
  echo "This REPLACES the live database and documents. Re-run with --yes (see --list first)." >&2
  exit 2
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/jarda-restore.XXXXXX")"
trap 'rm -rf "$work"' EXIT
restic snapshots --json --host "$backup_host" --tag "mizano,$set_name" >"$work/snapshots.json" 2>/dev/null \
  || { echo "RESTORE FAILED: cannot list snapshots (password file, repository or lock)" >&2; exit 1; }
snapshot="$(python3 - "$work/snapshots.json" "$snapshot" <<'PYTHON'
import json, sys
rows = json.load(open(sys.argv[1])) or []
wanted = sys.argv[2]
if wanted:
    rows = [r for r in rows if r['id'].startswith(wanted) or r.get('short_id') == wanted]
print(max(rows, key=lambda r: r['time'])['id'] if rows else '')
PYTHON
)"
[[ "$snapshot" =~ ^[0-9a-f]{64}$ ]] || { echo "RESTORE FAILED: no matching snapshot" >&2; exit 1; }
log "restore snapshot=${snapshot:0:8} stage=read-and-verify"
restic dump "$snapshot" /mizano.tar >"$work/backup.tar" 2>/dev/null \
  || { echo "RESTORE FAILED: cannot read the snapshot" >&2; exit 1; }
python3 "$PI_DIR/scripts/backup-manifest.py" unpack "$work/backup.tar" "$work"
rm -f "$work/backup.tar"

user="${POSTGRES_USER:-jarda}"
db="${POSTGRES_DB:-jarda}"
dc up -d postgres >/dev/null
for _ in $(seq 1 60); do
  dc exec -T postgres pg_isready -h 127.0.0.1 -U "$user" -d postgres >/dev/null 2>&1 && break
  sleep 1
done
dc exec -T postgres pg_isready -h 127.0.0.1 -U "$user" -d postgres >/dev/null 2>&1 \
  || { echo "RESTORE FAILED: database container not ready" >&2; exit 1; }

if [ "$safety" -eq 1 ]; then
  log "restore stage=safety-backup"
  "$VPS_DIR/scripts/backup.sh" >/dev/null || {
    echo "RESTORE STOPPED: the safety backup of the current data failed." >&2
    echo "If the current data is already lost, re-run with --skip-safety-backup." >&2
    exit 1
  }
fi

log "restore stage=stop-app"
dc stop caddy web worker api >/dev/null 2>&1 || true

log "restore stage=database"
dc exec -T postgres psql -XqAt -v ON_ERROR_STOP=1 -U "$user" -d postgres \
  -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" -c "CREATE DATABASE \"$db\" OWNER \"$user\"" >/dev/null
dc exec -T postgres pg_restore -U "$user" -d "$db" --no-owner --no-privileges --exit-on-error \
  <"$work/db.dump" >/dev/null 2>&1 || { echo "RESTORE FAILED: database restore (app left stopped)" >&2; exit 1; }

log "restore stage=originals"
originals="$DATA_DIR/originals"
if [ -d "$originals" ]; then
  mv "$originals" "$originals.before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
fi
mkdir -p "$originals"
cp -R "$work/originals/." "$originals/"
# The API container runs as uid 1001 (nestjs) and writes new uploads here.
if [ "$(id -u)" -eq 0 ]; then chown -R 1001:1001 "$originals"; fi
chmod 700 "$originals"

log "restore stage=verify"
container="$(dc ps -q postgres)"
python3 "$PI_DIR/scripts/backup-manifest.py" verify-db "$container" "$work" "$user" "$db" || {
  echo "RESTORE FAILED: restored data does not match the snapshot (app left stopped)" >&2
  exit 1
}

log "restore stage=start-app"
dc up -d >/dev/null
wait_healthy 300 || { echo "RESTORE WARNING: data restored, but the app is not healthy yet" >&2; exit 1; }
log "restore OK snapshot=${snapshot:0:8}"
