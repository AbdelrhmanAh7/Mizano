#!/usr/bin/env bash
# Nightly backup: pg_dump (custom format) + tar of originals, encrypted with age.
set -euo pipefail
# shellcheck source=deploy/pi/scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

retention="${BACKUP_RETENTION_DAYS:-14}"
dir="$DATA_DIR/backups"
status="$dir/backup.status"
mkdir -p "$dir"
chmod 700 "$dir"
umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
status_tmp=''
backup_owned=0
db_out="$dir/db-$stamp.dump.age"
files_out="$dir/originals-$stamp.tar.age"

# Any failure, including rename/retention/invalid configuration, replaces an
# earlier OK. Do not let an unexpected command error leave a fresh success behind.
backup_exit() {
  local code=$?
  trap - EXIT
  if [ "$backup_owned" -eq 1 ]; then
    rm -f "$db_out.part" "$files_out.part" || true
    [ -z "$status_tmp" ] || rm -f "$status_tmp" || true
  fi
  if [ "$code" -ne 0 ]; then
    status_tmp=$(mktemp "$dir/status.XXXXXX") &&
      printf 'FAILED %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$status_tmp" &&
      mv "$status_tmp" "$status" || true
    log 'backup failed' >&2
  fi
  exit "$code"
}
trap backup_exit EXIT
# Serialize timer and manual backups so status and file pairs cannot race.
exec 9>"$dir/lock"
lock_status=0
flock -E 75 -n 9 || lock_status=$?
[ "$lock_status" -ne 75 ] || exit 0
[ "$lock_status" -eq 0 ] || { log 'backup lock failed' >&2; exit 1; }
backup_owned=1

fail() {
  log "backup failed: $1" >&2
  exit 1
}
command -v age >/dev/null || fail "age not installed"
[[ "${BACKUP_AGE_RECIPIENT:-}" =~ ^age1[0-9a-z]+$ ]] || fail "configure backup recipient"
[[ "$retention" =~ ^[0-9]{1,3}$ ]] && [ "$retention" -ge 1 ] || fail "invalid retention"
[ -d "$DATA_DIR/originals" ] || fail "originals storage missing"

# Write to .part then rename so partial files never look valid.
# shellcheck disable=SC2016 # variables expand inside the container
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' 2>/dev/null \
  | age -r "$BACKUP_AGE_RECIPIENT" >"$db_out.part" 2>/dev/null || fail "pg_dump"
mv "$db_out.part" "$db_out"

tar -C "$DATA_DIR" -cf - originals 2>/dev/null | age -r "$BACKUP_AGE_RECIPIENT" >"$files_out.part" 2>/dev/null || fail "tar originals"
mv "$files_out.part" "$files_out"

find "$dir" -maxdepth 1 -type f \( -name 'db-*.age' -o -name 'originals-*.age' \) -mtime +"$retention" -delete

status_tmp=$(mktemp "$dir/status.XXXXXX")
printf 'OK %s db=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$db_out")" >"$status_tmp"
mv "$status_tmp" "$status"
log "backup OK ($(basename "$db_out"))"
