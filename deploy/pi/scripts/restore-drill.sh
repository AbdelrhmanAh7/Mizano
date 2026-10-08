#!/usr/bin/env bash
# Restore the latest backup (database + originals) into a throwaway Postgres, check it,
# then start the deployed API image against it and run the seeded smoke (drill-smoke.mjs).
# Appends OK/FAILED with per-phase timings to $MIZANO_DATA_DIR/backups/drill.log.
# Needs the age PRIVATE identity: AGE_IDENTITY_FILE=/path/key.txt restore-drill.sh
# DRILL_MAX_AGE_HOURS (default 26) refuses an older backup; 0 accepts any age.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/pi/scripts/lib.sh
. "$here/lib.sh"
# shellcheck source=deploy/pi/scripts/drill-lib.sh
. "$here/drill-lib.sh"

: "${AGE_IDENTITY_FILE:?set AGE_IDENTITY_FILE to the age private key file}"
dir="$DATA_DIR/backups"
latest="$(pick_backup "$dir" "${DRILL_MAX_AGE_HOURS:-26}")"
stamp="$(basename "$latest" .dump.age)"
stamp="${stamp#db-}"

name="mizano-restore-drill-$$"
work="$(mktemp -d "${TMPDIR:-/tmp}/mizano-drill.XXXXXX")"
cleanup() {
  local rc=$?
  [ "$rc" -eq 0 ] || printf '%s FAILED backup=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$latest")" >>"$dir/drill.log"
  docker rm -f "$name" "$name-redis" "$name-api" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
rand_secret() { head -c 32 /dev/urandom | base64 | tr -d '/+=\n'; }
start=$SECONDS
t=$SECONDS

log "decrypting $(basename "$latest")"
age -d -i "$AGE_IDENTITY_FILE" -o "$work/db.dump" "$latest"
mkdir -m 700 "$work/files"
if [ -f "$dir/originals-$stamp.tar.age" ]; then
  age -d -i "$AGE_IDENTITY_FILE" "$dir/originals-$stamp.tar.age" | tar -C "$work/files" -xf -
fi
chmod 644 "$work/db.dump"
chmod 755 "$work"
timings="decrypt=$((SECONDS - t))s"
t=$SECONDS

drill_pw="$(rand_secret)"
docker network create "$name" >/dev/null
docker run -d --name "$name" --network "$name" --network-alias db --memory 1g \
  -e POSTGRES_PASSWORD="$drill_pw" -e POSTGRES_DB=drill -v "$work:/restore:ro" postgres:16 >/dev/null
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
timings="$timings restore=$((SECONDS - t))s"
t=$SECONDS
psql_q() { docker exec "$name" psql -U postgres -d drill -tA -c "$1"; }

tables="$(psql_q "select count(*) from information_schema.tables where table_schema='public'")"
[ "$tables" -gt 0 ] || { echo "DRILL FAILED: no tables" >&2; exit 1; }

# Journal lines must balance. Table/column names follow the Prisma schema.
exists="$(psql_q "select to_regclass('public.journal_lines') is not null and to_regclass('public.journals') is not null")"
[ "$exists" = "t" ] || { echo "DRILL FAILED: journals/journal_lines tables missing" >&2; exit 1; }
# Every posted, non-deleted journal must balance on its own (debits = credits).
unbalanced="$(psql_q 'select count(*) > 0 from (select j.id from journals j join journal_lines l on l."journalId" = j.id where j."isPosted" and j."deletedAt" is null group by j.id having sum(l.debit) <> sum(l.credit)) u')"
[ "$unbalanced" = "f" ] || { echo "DRILL FAILED: debits do not equal credits" >&2; exit 1; }
# Every live intake job's original must come back with its recorded checksum.
originals=0
if [ "$(psql_q "select to_regclass('public.intake_jobs') is not null")" = "t" ]; then
  originals="$(psql_q "select \"storageKey\" || ' ' || sha256 from intake_jobs where \"deletedAt\" is null" |
    verify_originals "$work/files")"
fi
timings="$timings checks=$((SECONDS - t))s"
t=$SECONDS

# Forward the schema with the deployed image, as a real restore would, then smoke it.
db_url="postgresql://postgres:$drill_pw@db:5432/drill"
docker run -d --name "$name-redis" --network "$name" --network-alias redis --memory 256m redis:7 >/dev/null
docker run --rm --network "$name" -e DATABASE_URL="$db_url" -w /app/apps/api \
  "$MIZANO_API_IMAGE" npx prisma migrate deploy
docker run -d --name "$name-api" --network "$name" --memory 1g \
  -e NODE_ENV=production -e API_PORT=6001 -e DATABASE_URL="$db_url" -e REDIS_URL=redis://redis:6379 \
  -e JWT_SECRET="$(rand_secret)" -e JWT_REFRESH_SECRET="$(rand_secret)" \
  -e CORS_ORIGIN=https://drill.invalid -e FRONTEND_URL=https://drill.invalid \
  -e OLLAMA_ENABLED=false -e INTAKE_STORAGE_DIR=/tmp/drill-intake \
  -v "$here:/drill:ro" "$MIZANO_API_IMAGE" >/dev/null
if ! docker exec "$name-api" node /drill/drill-smoke.mjs; then
  docker logs --tail 30 "$name-api" >&2 || true
  exit 1
fi
timings="$timings smoke=$((SECONDS - t))s total=$((SECONDS - start))s"

result="backup=$(basename "$latest") image=$MIZANO_API_IMAGE tables=$tables originals=$originals $timings"
printf '%s OK %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$result" >>"$dir/drill.log"
log "restore drill OK: $result"
