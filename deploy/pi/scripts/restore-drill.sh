#!/usr/bin/env bash
# Restore drill: restore the latest encrypted backup (database + originals) into a
# throwaway Postgres, check it, then start the deployed API image against it and run
# the seeded smoke (drill-smoke.mjs). Appends a result line with timings to
# $MIZANO_DATA_DIR/backups/drill.log.
# Needs the age PRIVATE identity: AGE_IDENTITY_FILE=/path/key.txt restore-drill.sh
# DRILL_MAX_AGE_HOURS (default 26) refuses an older backup; 0 accepts any age.
set -euo pipefail
# shellcheck source=deploy/pi/scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

sha256_of() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1
}

# Print the newest db backup in $1; fail if none, or older than $2 hours (0 = any age).
pick_backup() {
  local latest
  latest="$(find "$1" -maxdepth 1 -name 'db-*.dump.age' | sort | tail -n 1)"
  [ -n "$latest" ] || { echo "DRILL FAILED: no backup found" >&2; return 1; }
  if [ "$2" -gt 0 ] && [ -z "$(find "$latest" -mmin "-$(($2 * 60))")" ]; then
    echo "DRILL FAILED: latest backup is older than $2h" >&2
    return 1
  fi
  printf '%s\n' "$latest"
}

# Read "<storageKey> <sha256>" lines on stdin. Each original must exist under
# $1/originals with that checksum. Prints the number checked.
verify_originals() {
  local key sum n=0
  while read -r key sum; do
    [ -n "$key" ] || continue
    case "/$key/" in
      */../* | //*) echo "DRILL FAILED: invalid storage key" >&2 && return 1 ;;
    esac
    [ -f "$1/originals/$key" ] || { echo "DRILL FAILED: original missing for an intake job" >&2; return 1; }
    [ "$(sha256_of "$1/originals/$key")" = "$sum" ] || { echo "DRILL FAILED: original checksum mismatch" >&2; return 1; }
    n=$((n + 1))
  done
  echo "$n"
}

DRILL_NAME="mizano-restore-drill-$$"
DRILL_WORK=""
DRILL_LOG=""
DRILL_BACKUP="none"
drill_cleanup() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ -n "$DRILL_LOG" ]; then
    printf '%s FAILED backup=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$DRILL_BACKUP" >>"$DRILL_LOG"
  fi
  docker rm -f "$DRILL_NAME-db" "$DRILL_NAME-redis" "$DRILL_NAME-api" >/dev/null 2>&1 || true
  docker network rm "$DRILL_NAME" >/dev/null 2>&1 || true
  [ -z "$DRILL_WORK" ] || rm -rf "$DRILL_WORK"
}

rand_secret() { head -c 32 /dev/urandom | base64 | tr -d '/+=\n'; }

main() {
  : "${AGE_IDENTITY_FILE:?set AGE_IDENTITY_FILE to the age private key file}"
  local dir="$DATA_DIR/backups" latest stamp start t timings pw db_url tables n=0
  DRILL_LOG="$dir/drill.log"
  trap drill_cleanup EXIT
  latest="$(pick_backup "$dir" "${DRILL_MAX_AGE_HOURS:-26}")"
  DRILL_BACKUP="$(basename "$latest")"
  stamp="${DRILL_BACKUP#db-}"
  stamp="${stamp%.dump.age}"
  DRILL_WORK="$(mktemp -d)"
  start=$SECONDS
  t=$SECONDS

  log "decrypting $DRILL_BACKUP"
  age -d -i "$AGE_IDENTITY_FILE" -o "$DRILL_WORK/db.dump" "$latest"
  mkdir -m 700 "$DRILL_WORK/files"
  if [ -f "$dir/originals-$stamp.tar.age" ]; then
    age -d -i "$AGE_IDENTITY_FILE" "$dir/originals-$stamp.tar.age" | tar -C "$DRILL_WORK/files" -xf -
  fi
  chmod 644 "$DRILL_WORK/db.dump"
  chmod 755 "$DRILL_WORK"
  timings="decrypt=$((SECONDS - t))s"
  t=$SECONDS

  pw="$(rand_secret)"
  docker network create "$DRILL_NAME" >/dev/null
  docker run -d --name "$DRILL_NAME-db" --network "$DRILL_NAME" --network-alias db --memory 1g \
    -e POSTGRES_PASSWORD="$pw" -e POSTGRES_DB=drill -v "$DRILL_WORK:/restore:ro" postgres:16 >/dev/null
  # Probe over TCP: the temporary init server only listens on the unix socket.
  local ready=0
  for _ in $(seq 1 60); do
    if docker exec "$DRILL_NAME-db" pg_isready -h 127.0.0.1 -U postgres -d drill >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 2
  done
  [ "$ready" -eq 1 ] || { echo "DRILL FAILED: postgres not ready" >&2; exit 1; }
  docker exec "$DRILL_NAME-db" pg_restore -U postgres -d drill --no-owner --exit-on-error /restore/db.dump
  timings="$timings restore=$((SECONDS - t))s"
  t=$SECONDS

  psql_q() { docker exec "$DRILL_NAME-db" psql -U postgres -d drill -tA -c "$1"; }
  tables="$(psql_q "select count(*) from information_schema.tables where table_schema='public'")"
  [ "$tables" -gt 0 ] || { echo "DRILL FAILED: no tables" >&2; exit 1; }
  # Journal lines must balance. Table/column names follow the Prisma schema.
  [ "$(psql_q "select to_regclass('public.journal_lines') is not null and to_regclass('public.journals') is not null")" = "t" ] ||
    { echo "DRILL FAILED: journals/journal_lines tables missing" >&2; exit 1; }
  # Every posted, non-deleted journal must balance on its own (debits = credits).
  [ "$(psql_q 'select count(*) > 0 from (select j.id from journals j join journal_lines l on l."journalId" = j.id where j."isPosted" and j."deletedAt" is null group by j.id having sum(l.debit) <> sum(l.credit)) u')" = "f" ] ||
    { echo "DRILL FAILED: debits do not equal credits" >&2; exit 1; }
  # Every live intake job's original must be restored with its recorded checksum.
  if [ "$(psql_q "select to_regclass('public.intake_jobs') is not null")" = "t" ]; then
    n="$(psql_q "select \"storageKey\" || ' ' || sha256 from intake_jobs where \"deletedAt\" is null" |
      verify_originals "$DRILL_WORK/files")"
  fi
  timings="$timings checks=$((SECONDS - t))s"
  t=$SECONDS

  # Forward the restored schema with the deployed image, as a real restore would, then smoke it.
  db_url="postgresql://postgres:$pw@db:5432/drill"
  docker run -d --name "$DRILL_NAME-redis" --network "$DRILL_NAME" --network-alias redis --memory 256m \
    redis:7 >/dev/null
  docker run --rm --network "$DRILL_NAME" -e DATABASE_URL="$db_url" -w /app/apps/api \
    "$MIZANO_API_IMAGE" npx prisma migrate deploy
  docker run -d --name "$DRILL_NAME-api" --network "$DRILL_NAME" --memory 1g \
    -e NODE_ENV=production -e API_PORT=6001 -e DATABASE_URL="$db_url" -e REDIS_URL=redis://redis:6379 \
    -e JWT_SECRET="$(rand_secret)" -e JWT_REFRESH_SECRET="$(rand_secret)" \
    -e CORS_ORIGIN=https://drill.invalid -e FRONTEND_URL=https://drill.invalid \
    -e OLLAMA_ENABLED=false -e INTAKE_STORAGE_DIR=/tmp/drill-intake \
    -v "$PI_DIR/scripts:/drill:ro" "$MIZANO_API_IMAGE" >/dev/null
  if ! docker exec "$DRILL_NAME-api" node /drill/drill-smoke.mjs; then
    docker logs --tail 30 "$DRILL_NAME-api" >&2 || true
    exit 1
  fi
  timings="$timings smoke=$((SECONDS - t))s total=$((SECONDS - start))s"

  local line
  line="backup=$DRILL_BACKUP image=$MIZANO_API_IMAGE tables=$tables originals=$n $timings"
  printf '%s OK %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$line" >>"$DRILL_LOG"
  log "restore drill OK: $line"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
