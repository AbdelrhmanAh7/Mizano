#!/usr/bin/env bash
# Restore the latest backup into a throwaway Postgres container and sanity-check it.
# Needs the age PRIVATE identity: AGE_IDENTITY_FILE=/path/key.txt restore-drill.sh
set -euo pipefail
# shellcheck source=deploy/pi/scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

: "${AGE_IDENTITY_FILE:?set AGE_IDENTITY_FILE to the age private key file}"
dir="$DATA_DIR/backups"
latest="$(find "$dir" -maxdepth 1 -name 'db-*.dump.age' | sort | tail -n 1)"
[ -n "$latest" ] || { echo "no backup found" >&2; exit 1; }

name="mizano-restore-drill-$$"
work="$(mktemp -d)"
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

log "decrypting $(basename "$latest")"
age -d -i "$AGE_IDENTITY_FILE" -o "$work/db.dump" "$latest"
chmod 644 "$work/db.dump"
chmod 755 "$work"

drill_pw="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')"
docker run -d --name "$name" -e POSTGRES_PASSWORD="$drill_pw" -e POSTGRES_DB=drill \
  -v "$work:/restore:ro" postgres:16 >/dev/null
# Probe over TCP: the temporary init server only listens on the unix socket.
ready=0
for _ in $(seq 1 60); do
  if docker exec "$name" pg_isready -h 127.0.0.1 -U postgres -d drill >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
[ "$ready" -eq 1 ] || { echo "DRILL FAILED: postgres not ready" >&2; exit 1; }

docker exec "$name" pg_restore -U postgres -d drill --no-owner --exit-on-error /restore/db.dump
psql_q() { docker exec "$name" psql -U postgres -d drill -tA -c "$1"; }

tables="$(psql_q "select count(*) from information_schema.tables where table_schema='public'")"
[ "$tables" -gt 0 ] || { echo "DRILL FAILED: no tables" >&2; exit 1; }

# Journal lines must balance. Table/column names follow the Prisma schema.
exists="$(psql_q "select to_regclass('public.journal_lines') is not null and to_regclass('public.journals') is not null")"
[ "$exists" = "t" ] || { echo "DRILL FAILED: journals/journal_lines tables missing" >&2; exit 1; }
# Every posted, non-deleted journal must balance on its own (debits = credits).
unbalanced="$(psql_q 'select count(*) > 0 from (select j.id from journals j join journal_lines l on l."journalId" = j.id where j."isPosted" and j."deletedAt" is null group by j.id having sum(l.debit) <> sum(l.credit)) u')"
[ "$unbalanced" = "f" ] || { echo "DRILL FAILED: debits do not equal credits" >&2; exit 1; }
log "restore drill OK: $tables tables, journals balanced"
