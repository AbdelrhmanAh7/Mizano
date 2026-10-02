#!/usr/bin/env bash
# Nightly backup: pg_dump (custom format) + tar of originals, encrypted with age.
set -euo pipefail
# shellcheck source=deploy/pi/scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT}"
retention="${BACKUP_RETENTION_DAYS:-14}"
dir="$DATA_DIR/backups"
status="$dir/backup.status"
mkdir -p "$dir"
umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

fail() {
  printf 'FAILED %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$status"
  log "backup failed: $1" >&2
  exit 1
}
command -v age >/dev/null || fail "age not installed"

db_out="$dir/db-$stamp.dump.age"
files_out="$dir/originals-$stamp.tar.age"

# Write to .part then rename so partial files never look valid.
# shellcheck disable=SC2016 # variables expand inside the container
dc exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  | age -r "$BACKUP_AGE_RECIPIENT" >"$db_out.part" || fail "pg_dump"
mv "$db_out.part" "$db_out"

if [ -d "$DATA_DIR/originals" ]; then
  tar -C "$DATA_DIR" -cf - originals | age -r "$BACKUP_AGE_RECIPIENT" >"$files_out.part" || fail "tar originals"
  mv "$files_out.part" "$files_out"
fi

find "$dir" -maxdepth 1 -type f \( -name 'db-*.age' -o -name 'originals-*.age' \) -mtime +"$retention" -delete

printf 'OK %s db=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$db_out")" >"$status"
log "backup OK ($(basename "$db_out"))"
