#!/usr/bin/env bash
# Disaster drill of the VPS kit on a throwaway stack. Run it on a spare machine or a scratch server:
# never next to production (same Docker network range) and not on the owner's laptop (memory).
# It uses the real docker-compose.vps.yml, Caddyfile, backup.sh and restore.sh, with:
#   - Caddy's own self-signed certificates (CADDY_TLS=internal) on 127.0.0.1:18080/18443;
#   - data, the restic repository and every secret in a new temporary folder;
#   - an rclone S3 server standing in for Cloudflare R2 (same S3 protocol).
# Steps: start -> sign up through HTTPS -> add a synthetic ledger with documents -> nightly
# backup (local + "R2") -> destroy the database and documents -> restore from the R2 copy on an
# empty stack -> same per-organization counts, balanced ledger, the user can sign in again.
#
#   DRILL_API_IMAGE=jarda-api:x DRILL_WEB_IMAGE=jarda-web:x deploy/vps/scripts/test-vps-drill.sh
# The web image must be built with NEXT_PUBLIC_API_URL=https://jarda-api.localhost:18443/api.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
vps="$(cd "$here/.." && pwd)"
: "${DRILL_API_IMAGE:?set DRILL_API_IMAGE}" "${DRILL_WEB_IMAGE:?set DRILL_WEB_IMAGE}"
umask 077
work="$(mktemp -d "${TMPDIR:-/tmp}/jarda-vps-drill.XXXXXX")"
hex() { python3 -c "import secrets,sys; print(secrets.token_hex(int(sys.argv[1])))" "$1"; }
project="jarda-vps-drill-$(hex 4)"
s3_name="$project-s3"
export COMPOSE_PROJECT_NAME="$project" ENV_FILE="$work/jarda.env" R2_ENV_FILE="$work/r2.env"
export COMPOSE_FILE="$vps/docker-compose.vps.yml"
web=jarda.localhost api=jarda-api.localhost port=18443
step() { printf '%s stage=%s\n' "$(date -u +%H:%M:%S)" "$1"; }
die() { echo "VPS DRILL FAILED: $*" >&2; exit 1; }
cleanup() {
  [ "${KEEP:-0}" = 1 ] && { echo "kept: $work ($project)"; return; }
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down -v >/dev/null 2>&1 || true
  docker rm -fv "$s3_name" >/dev/null 2>&1 || true
  # Postgres and the documents were written by container users; remove them from a container.
  docker run --rm -v "$work:/w" alpine:3.20 rm -rf /w/data /w/s3 >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

mkdir -p "$work/data/originals" "$work/s3/jarda-backups"
pg_pw="$(hex 24)"
hex 32 >"$work/restic-password"
chmod 600 "$work/restic-password"
cat >"$ENV_FILE" <<ENV
JARDA_WEB_HOST=$web
JARDA_API_HOST=$api
ACME_EMAIL=drill@example.com
CADDY_TLS=internal
CADDY_HTTP_PORT=127.0.0.1:18080
CADDY_HTTPS_PORT=127.0.0.1:$port
MIZANO_DATA_DIR=$work/data
MIZANO_API_IMAGE=$DRILL_API_IMAGE
MIZANO_WEB_IMAGE=$DRILL_WEB_IMAGE
POSTGRES_USER=jarda
POSTGRES_PASSWORD=$pg_pw
POSTGRES_DB=source
DATABASE_URL=postgresql://jarda:$pg_pw@postgres:5432/source
JWT_SECRET=$(hex 48)
JWT_REFRESH_SECRET=$(hex 48)
NEXTAUTH_SECRET=$(hex 48)
INTEGRATIONS_ENCRYPTION_KEY=$(hex 32)
NEXTAUTH_URL=https://$web:$port
CORS_ORIGIN=https://$web:$port
PUBLIC_API_URL=https://$api:$port/api
RESTIC_REPOSITORY=$work/restic
RESTIC_PASSWORD_FILE=$work/restic-password
BACKUP_SET=jarda
BACKUP_HOST=jarda-vps
BACKUP_RETENTION_DAYS=7
ENV
chmod 600 "$ENV_FILE"
s3_key="drill$(hex 6)" s3_secret="$(hex 20)"
cat >"$R2_ENV_FILE" <<R2
R2_ENABLED=1
R2_REPOSITORY=s3:http://127.0.0.1:19000/jarda-backups/restic
R2_ALLOW_PLAIN_HTTP_FOR_LOCAL_TEST=1
R2_ACCESS_KEY_ID=$s3_key
R2_SECRET_ACCESS_KEY=$s3_secret
R2_RETENTION_DAYS=30
R2

dc() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }
curl_tls() { curl -fsS -k --max-time 20 --resolve "$web:$port:127.0.0.1" --resolve "$api:$port:127.0.0.1" "$@"; }
wait_up() {
  for _ in $(seq 1 90); do
    ok=1
    for svc in api web worker; do
      cid="$(dc ps -q "$svc" 2>/dev/null || true)"
      st=""
      [ -z "$cid" ] || st="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
      [ "$st" = healthy ] || ok=0
    done
    if [ "$ok" = 1 ] && curl_tls -o /dev/null "https://$api:$port/api/health" 2>/dev/null; then return 0; fi
    sleep 5
  done
  dc ps >&2
  dc logs --tail 40 >&2
  return 1
}
# Same counts, ledger and links the backup manifest checks, run on any database name.
state() { dc exec -T postgres psql -XqAt -U jarda -d source <"$vps/../pi/scripts/backup-state.sql"; }

step start-stack
docker run -d --name "$s3_name" -p 127.0.0.1:19000:9000 -v "$work/s3:/data" \
  rclone/rclone:1.68.2 serve s3 --auth-key "$s3_key,$s3_secret" --addr :9000 /data >/dev/null
dc up -d >"$work/up.log" 2>&1
wait_up

step https-checks
curl_tls -o /dev/null -w 'web /en/login http=%{http_code}\n' "https://$web:$port/en/login"
for page in en/terms ar/privacy; do
  curl_tls "https://$web:$port/$page" -o "$work/page.html"
  grep -q -e 'Draft: not yet reviewed' -e 'مسودة' "$work/page.html" || { echo "legal page $page has no draft label" >&2; exit 1; }
  echo "legal page /$page: 200 with the draft label"
done
curl_tls -o /dev/null -w 'api /api/health http=%{http_code}\n' "https://$api:$port/api/health"
hsts="$(curl_tls -o /dev/null -D - "https://$web:$port/en/login" | grep -ci '^strict-transport-security' || true)"
[ "$hsts" -ge 1 ] || die "no HSTS header"
echo "HSTS header: present"
published="$(docker ps --filter "label=com.docker.compose.project=$project" --format '{{.Names}} {{.Ports}}' | grep -c -- '->' || true)"
[ "$published" -eq 1 ] || die "$published containers publish ports"
echo "containers publishing ports: 1 (caddy only)"

step sign-up
email="owner-$(hex 4)@drill.test" password="Drill-$(hex 6)-Aa1"
curl_tls -o /dev/null -H 'Content-Type: application/json' "https://$api:$port/api/auth/register" \
  -d "{\"email\":\"$email\",\"password\":\"$password\",\"firstName\":\"Drill\",\"lastName\":\"Owner\",\"organizationName\":\"Drill Trading\",\"country\":\"EG\"}"
login() {
  curl_tls -H 'Content-Type: application/json' "https://$api:$port/api/auth/login" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" 2>/dev/null |
    python3 -c 'import json,sys
def find(o):
    if isinstance(o, dict):
        if "accessToken" in o: return o["accessToken"]
        for v in o.values():
            r = find(v)
            if r: return r
try:
    print("token" if find(json.load(sys.stdin)) else "none")
except ValueError:
    print("none")' || true
}
[ "$(login)" = token ] || die "sign-in after sign-up"
echo "sign-in through HTTPS: ok"

step synthetic-ledger
pg_cid="$(dc ps -q postgres)"
docker run --rm --network "container:$pg_cid" -w /app/apps/api \
  -v "$vps/../pi/scripts/restore-drill-fixture.js:/app/apps/api/drill-fixture.js:ro" \
  -v "$work/data/originals:/drill/originals" \
  -e MIZANO_DISPOSABLE_DRILL=yes -e DATA_DIR=/drill \
  -e "DATABASE_URL=postgresql://jarda:$pg_pw@127.0.0.1:5432/source" \
  "$DRILL_API_IMAGE" node drill-fixture.js >/dev/null
state >"$work/before.json"
python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); print("before: organizations=%d checks=%s" % (len(s["counts"]), "all-zero" if not any(s["checks"].values()) else s["checks"]))' "$work/before.json"

step backup
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
restic init >/dev/null
"$here/backup.sh"
grep -q '^OK' "$work/data/backups/backup.status" || die "local backup status"
echo "local backup.status: OK"
grep -q '^OK' "$work/data/backups/offsite.status" || die "offsite status"
echo "offsite (R2 stand-in) status: OK"
AWS_ACCESS_KEY_ID="$s3_key" AWS_SECRET_ACCESS_KEY="$s3_secret" AWS_DEFAULT_REGION=auto \
  restic -r "s3:http://127.0.0.1:19000/jarda-backups/restic" --password-file "$work/restic-password" \
  snapshots --json | python3 -c 'import json,sys; print("snapshots in R2 stand-in:", len(json.load(sys.stdin)))'

step disaster
# The server is lost: database, documents and the local backups are all gone.
dc down -v >/dev/null 2>&1
docker run --rm -v "$work:/w" alpine:3.20 sh -c 'rm -rf /w/data/postgres /w/data/originals /w/data/redis /w/restic' >/dev/null
mkdir -p "$work/data/originals"
dc up -d >/dev/null 2>&1
wait_up
[ "$(login)" = none ] || die "the user could still sign in after the loss"
echo "after the loss: the user cannot sign in (empty database)"

step restore-from-r2
# A new server has no local repository yet: restore straight from the bucket.
# Nothing to back up first (the database is empty), so no safety backup.
"$here/restore.sh" --from-r2 --skip-safety-backup --yes
state >"$work/after.json"
python3 - "$work/before.json" "$work/after.json" <<'PYTHON'
import json, sys
before, after = (json.load(open(p)) for p in sys.argv[1:3])
assert before == after, "state differs after restore"
assert not any(after["checks"].values()), "ledger or links broken"
print("after restore: per-organization counts identical, ledger balanced, document links intact")
PYTHON
[ "$(login)" = token ] || die "sign-in after restore"
echo "after restore: the same user signs in through HTTPS again"
originals="$(find "$work/data/originals" -type f | wc -l | tr -d ' ')"
[ "$originals" -ge 4 ] || die "documents missing after restore ($originals)"
echo "after restore: documents back on disk: $originals"

step restore-local-with-safety-backup
# Normal case on a running server: restore the latest local snapshot, safety backup first.
restic init >/dev/null
"$here/backup.sh" >/dev/null
"$here/restore.sh" --yes
[ "$(login)" = token ] || die "sign-in after the local restore"
echo "local restore with safety backup: ok"
restic snapshots --json --host jarda-vps --tag mizano,jarda | python3 -c 'import json,sys; print("local snapshots now:", len(json.load(sys.stdin)))'

step finished
echo "VPS DRILL PASSED"
