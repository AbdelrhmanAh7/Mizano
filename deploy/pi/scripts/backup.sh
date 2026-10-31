#!/usr/bin/env bash
# One encrypted restic snapshot: a consistent custom-format dump, originals and manifest.
set -euo pipefail
here="$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=deploy/pi/scripts/lib.sh
. "$here/lib.sh"
umask 077
retention="${BACKUP_RETENTION_DAYS:-14}"
[[ "$retention" =~ ^[1-9][0-9]*$ ]] || { echo "invalid retention days" >&2; exit 2; }
set_name="${BACKUP_SET:-default}"
[[ "$set_name" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "invalid backup set" >&2; exit 2; }
dir="$DATA_DIR/backups"
mkdir -p "$dir"
status="$dir/backup.status"
work="$(mktemp -d "$dir/.backup.XXXXXX")"
cleanup() {
  local rc=$?
  if [ "$rc" -ne 0 ]; then printf 'FAILED %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$status"; fi
  rm -rf "$work"
}
trap cleanup EXIT
fail() {
  printf 'FAILED %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$status"
  echo "backup failed: $1" >&2
  exit 1
}
require_restic || fail "restic configuration"
backup_host="${BACKUP_HOST:-$(hostname)}"
python3 "$here/backup-manifest.py" create "$work" || fail "snapshot or originals verification"
# restic checks tar's exit code before committing a snapshot; no partial piped archive can win.
COPYFILE_DISABLE=1 restic backup --host "$backup_host" --json --stdin-from-command --stdin-filename mizano.tar --tag mizano --tag "$set_name" \
  -- tar -C "$work" -cf - db.dump originals manifest.json >"$work/restic.json" 2>/dev/null || fail "restic snapshot"
snapshot="$(python3 -c 'import json,sys; rows=[json.loads(s) for s in open(sys.argv[1])]; print(next(r["snapshot_id"] for r in rows if r.get("message_type")=="summary"))' "$work/restic.json")" || fail "snapshot identifier"
[[ "$snapshot" =~ ^[0-9a-f]{8,64}$ ]] || fail "snapshot identifier"
# Retention is scoped to this application's stable backup-set tag; legacy age files are untouched.
restic forget --host "$backup_host" --tag "mizano,$set_name" --keep-within "${retention}d" --prune >/dev/null 2>&1 || fail "retention"
printf 'OK %s snapshot=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$snapshot" >"$status"
log "backup OK snapshot=$snapshot"
