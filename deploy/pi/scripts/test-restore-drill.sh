#!/usr/bin/env bash
# Full developer drill. Run ONLY through heavy.sh; everything lives in a fresh temporary project.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
umask 077
work="$(mktemp -d)"
project="mizano-drill-$(python3 -c 'import secrets; print(secrets.token_hex(8))')"
export ENV_FILE="$work/source.env" COMPOSE_FILE="$work/compose.yml" DATA_DIR="$work/data"
export MIZANO_DISPOSABLE_DRILL=yes
unset RESTIC_PASSWORD RESTIC_PASSWORD_COMMAND BACKUP_ORIGINALS_CONTAINER_PATH
cleanup() {
  if [ -f "$COMPOSE_FILE" ]; then docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v >/dev/null 2>&1 || return 1; fi
  rm -rf "$work"
}
trap cleanup EXIT
mkdir -p "$DATA_DIR/originals"
python3 -c 'import secrets,sys; open(sys.argv[1],"w").write(secrets.token_hex(32))' "$work/restic-password"
pw="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
cat >"$ENV_FILE" <<ENV
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$pw
POSTGRES_DB=source
MIZANO_DATA_DIR=$DATA_DIR
RESTIC_REPOSITORY=$work/restic
RESTIC_PASSWORD_FILE=$work/restic-password
BACKUP_SET=local-drill
ENV
cat >"$COMPOSE_FILE" <<COMPOSE
name: $project
services:
  postgres:
    image: postgres:16
    mem_limit: 384m
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_DB: source
    ports: ['127.0.0.1::5432']
    command: ['postgres', '-c', 'shared_buffers=64MB', '-c', 'max_connections=20']
COMPOSE
# shellcheck source=/dev/null
. "$ENV_FILE"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE BACKUP_SET
cd "$repo"
dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }
dc up -d postgres >"$work/source.log" 2>&1
ready=0
for _ in $(seq 1 60); do
  if dc exec -T postgres pg_isready -h 127.0.0.1 -U postgres -d source >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" -eq 1 ]
port="$(dc port postgres 5432)"
export DATABASE_URL="postgresql://postgres:$pw@$port/source"
printf 'stage=apply-migrations\n'
pnpm --filter api exec prisma migrate deploy >"$work/migrations.log" 2>&1
printf 'stage=create-synthetic-fixture\n'
node "$here/restore-drill-fixture.js"
restic init >"$work/restic-init.log" 2>&1
printf 'stage=backup\n'
"$here/backup.sh"
restic check --read-data >"$work/restic-check.log" 2>&1
# Make the source unavailable: the drill must read only the encrypted repository.
dc stop postgres >"$work/source-stop.log" 2>&1
mv "$DATA_DIR/originals" "$DATA_DIR/source-originals-unavailable"
printf 'fixture organizations=2 originals=4 journals=2 linked_drafts=4 source_database_stopped=1\n'
"$here/restore-drill.sh"
# A preserved but incomplete approval must not become a successful recovery claim.
dc start postgres >/dev/null 2>&1
for _ in $(seq 1 60); do
  if dc exec -T postgres pg_isready -h 127.0.0.1 -U postgres -d source >/dev/null 2>&1; then break; fi
  sleep 1
done
dc exec -T postgres psql -Xq -v ON_ERROR_STOP=1 -U postgres -d source \
  -c 'UPDATE intake_jobs SET "draftDocumentId"=NULL WHERE id=(SELECT id FROM intake_jobs ORDER BY id LIMIT 1)' >/dev/null
mv "$DATA_DIR/source-originals-unavailable" "$DATA_DIR/originals"
"$here/backup.sh" >/dev/null
dc stop postgres >/dev/null 2>&1
if "$here/restore-drill.sh" >"$work/negative-check.log" 2>&1; then
  echo "fixture failed: incomplete approval incorrectly passed" >&2
  exit 1
fi
grep -q 'unbalanced ledger or broken tenant/document/journal links' "$work/negative-check.log"
printf 'incomplete_approval_negative_check=passed\n'
cleanup || { echo 'fixture cleanup failed' >&2; exit 1; }
trap - EXIT
printf 'restic_check_read_data=passed source_project_cleanup=passed\n'
