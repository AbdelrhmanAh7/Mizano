#!/usr/bin/env bash
# Restore THIS server's database and original documents from an encrypted backup snapshot.
#
#   sudo /opt/jarda/deploy/vps/scripts/restore.sh --list
#   sudo /opt/jarda/deploy/vps/scripts/restore.sh --yes                    # latest local snapshot
#   sudo /opt/jarda/deploy/vps/scripts/restore.sh --snapshot 1a2b3c4d --yes
#   sudo /opt/jarda/deploy/vps/scripts/restore.sh --from-r2 --yes          # new server, bucket only
#   sudo /opt/jarda/deploy/vps/scripts/restore.sh --check                  # test only, app keeps running
#
# --check restores the snapshot into a scratch database next to the live one, verifies it the
# same way, then drops it. It changes nothing the app uses: run it any time to prove a backup.
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

snapshot="" confirm=0 list=0 from_r2=0 safety=1 check=0
while [ $# -gt 0 ]; do
  case "$1" in
    --snapshot) snapshot="${2:-}"; shift 2 ;;
    --yes) confirm=1; shift ;;
    --list) list=1; shift ;;
    --from-r2) from_r2=1; shift ;;
    --skip-safety-backup) safety=0; shift ;;
    --check) check=1; shift ;;
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
if [ "$confirm" -ne 1 ] && [ "$check" -ne 1 ]; then
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

if [ "$check" -eq 1 ]; then
  scratch="${db}_restore_check"
  container="$(dc ps -q postgres)"
  drop_scratch() {
    dc exec -T postgres psql -XqAt -U "$user" -d postgres \
      -c "DROP DATABASE IF EXISTS \"$scratch\" WITH (FORCE)" >/dev/null 2>&1 || true
  }
  trap 'drop_scratch; rm -rf "$work"' EXIT
  log "restore-check snapshot=${snapshot:0:8} stage=scratch-database db=$scratch"
  drop_scratch
  dc exec -T postgres psql -XqAt -v ON_ERROR_STOP=1 -U "$user" -d postgres \
    -c "CREATE DATABASE \"$scratch\" OWNER \"$user\"" >/dev/null
  dc exec -T postgres pg_restore -U "$user" -d "$scratch" --no-owner --no-privileges --exit-on-error \
    <"$work/db.dump" >/dev/null 2>&1 || { echo "RESTORE CHECK FAILED: the database did not restore" >&2; exit 1; }
  python3 "$PI_DIR/scripts/backup-manifest.py" verify-db "$container" "$work" "$user" "$scratch" || {
    echo "RESTORE CHECK FAILED: restored data does not match the snapshot" >&2
    exit 1
  }
  drop_scratch
  log "restore-check OK snapshot=${snapshot:0:8} originals=verified scratch=dropped"
  exit 0
fi

if [ "$safety" -eq 1 ]; then
  log "restore stage=safety-backup"
  "$VPS_DIR/scripts/backup.sh" >/dev/null || {
    echo "RESTORE STOPPED: the safety backup of the current data failed." >&2
    echo "If the current data is already lost, re-run with --skip-safety-backup." >&2
    exit 1
  }
fi

log "restore stage=stop-app"
# Until the restore succeeds, jarda-stack.service refuses to start the app (e.g. after a reboot).
restore_flag="${JARDA_RESTORE_FLAG:-/etc/jarda/restore-in-progress}"
date -u +%Y-%m-%dT%H:%M:%SZ >"$restore_flag"
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
  echo "RESTORE FAILED: restored data does not match the snapshot (app left stopped; see README section 7)" >&2
  exit 1
}

log "restore stage=start-app"
rm -f "$restore_flag"
if systemctl cat jarda-stack.service >/dev/null 2>&1; then
  systemctl restart jarda-stack.service
else
  dc up -d >/dev/null
fi
wait_healthy 300 || { echo "RESTORE WARNING: data restored, but the app is not healthy yet" >&2; exit 1; }
log "restore OK snapshot=${snapshot:0:8}"
