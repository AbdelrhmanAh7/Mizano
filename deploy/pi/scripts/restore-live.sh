#!/usr/bin/env bash
# Restore an encrypted backup into the live Postgres database to recover from
# a broken migration or failed deployment.
# Recreates the database cleanly (so any tables, types, or objects created by
# the failed migration are dropped), decrypts and restores the database with
# pg_restore, restores originals if present, and exits 0 only on full success.
# Usage: AGE_IDENTITY_FILE=/path/key.txt restore-live.sh [/path/to/db-<stamp>.dump.age]
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/pi/scripts/lib.sh
. "$here/lib.sh"

: "${AGE_IDENTITY_FILE:?set AGE_IDENTITY_FILE to the age private key file}"
backup_file="${1:-}"
if [ -z "$backup_file" ]; then
  backup_file="$(find "$DATA_DIR/backups" -maxdepth 1 -name 'db-*.dump.age' | sort | tail -n 1)"
fi
[ -n "$backup_file" ] && [ -f "$backup_file" ] || {
  echo "backup file not found: ${backup_file:-none}" >&2
  exit 1
}

stamp="$(basename "$backup_file" .dump.age)"
stamp="${stamp#db-}"
dir="$(dirname "$backup_file")"

log "stopping api and web"
dc stop api web

log "recreating database $POSTGRES_DB to clean all migration artifacts"
# Terminate connections to $POSTGRES_DB and recreate it cleanly from the default postgres maintenance DB.
# shellcheck disable=SC2016 # variables expand inside the container
dc exec -T postgres sh -c '
  psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 <<-SQL
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''$POSTGRES_DB'\'' AND pid <> pg_backend_pid();
    DROP DATABASE IF EXISTS "$POSTGRES_DB";
    CREATE DATABASE "$POSTGRES_DB" OWNER "$POSTGRES_USER";
SQL
'

log "decrypting and restoring $(basename "$backup_file")"
# shellcheck disable=SC2016 # variables expand inside the container
age -d -i "$AGE_IDENTITY_FILE" "$backup_file" | \
  dc exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error'

orig_archive="$dir/originals-$stamp.tar.age"
if [ -f "$orig_archive" ]; then
  log "restoring originals from $(basename "$orig_archive")"
  age -d -i "$AGE_IDENTITY_FILE" "$orig_archive" | tar -C "$DATA_DIR" -xf -
fi

log "live restore completed successfully"
