#!/usr/bin/env bash
# Exercise the actual backup command; storage, Docker and encryption are fakes.
set -euo pipefail
pi_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch/bin" "$scratch/data/originals" "$scratch/data/backups"
export ENV_FILE="$scratch/env" FAIL_STAGE=none LOCK_STATUS=0
cat >"$ENV_FILE" <<ENV
NEXTAUTH_URL=https://pilot.example.com
CORS_ORIGIN=https://pilot.example.com
PUBLIC_API_URL=https://pilot.example.com/api
JWT_SECRET=test-only-jwt-secret-at-least-32-chars
JWT_REFRESH_SECRET=test-only-refresh-secret-at-least-32-chars
NEXTAUTH_SECRET=test-only-nextauth-secret-at-least-32-chars
POSTGRES_PASSWORD=test-only-password
DATABASE_URL=postgresql://mizano:test-only-password@postgres:5432/mizano_db
CLOUDFLARE_TUNNEL_TOKEN=test-only-tunnel
MIZANO_GATEWAY_IMAGE=nginx@sha256:0000000000000000000000000000000000000000000000000000000000000000
MIZANO_TUNNEL_IMAGE=cloudflare/cloudflared@sha256:0000000000000000000000000000000000000000000000000000000000000000
BACKUP_AGE_RECIPIENT=age1testonly
MIZANO_DATA_DIR='$scratch/data'
ENV
cat >"$scratch/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[ "$FAIL_STAGE" != dump ] || { printf 'sensitive-document-content\n' >&2; exit 1; }
printf 'test-only-dump\n'
MOCK
cat >"$scratch/bin/age" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
cat >/dev/null
[ "$FAIL_STAGE" != encrypt ] || exit 1
printf 'test-only-encrypted-output\n'
MOCK
cat >"$scratch/bin/find" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[ "$FAIL_STAGE" != retention ]
MOCK
cat >"$scratch/bin/mv" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [ "$FAIL_STAGE" = rename ] && [[ "$1" = *.part ]]; then exit 1; fi
exec /usr/bin/mv "$@"
MOCK
printf '#!/usr/bin/env bash\nexit "${LOCK_STATUS:-0}"\n' >"$scratch/bin/flock"
chmod +x "$scratch/bin/"*
export PATH="$scratch/bin:$PATH"
checks=0
run() {
  local expected=$1 actual=0
  bash "$pi_dir/scripts/backup.sh" >"$scratch/output" 2>&1 || actual=$?
  [ "$actual" -eq "$expected" ]
  ! grep -q sensitive-document-content "$scratch/output"
  checks=$((checks+1))
}
run 0
grep -q '^OK ' "$scratch/data/backups/backup.status"
compgen -G "$scratch/data/backups/db-*.dump.age" >/dev/null
compgen -G "$scratch/data/backups/originals-*.tar.age" >/dev/null
for FAIL_STAGE in dump encrypt rename retention; do
  printf 'OK old-success\n' >"$scratch/data/backups/backup.status"
  run 1
  grep -q '^FAILED ' "$scratch/data/backups/backup.status"
  ! compgen -G "$scratch/data/backups/*.part" >/dev/null
done
FAIL_STAGE=none
printf 'BACKUP_RETENTION_DAYS=invalid\n' >>"$ENV_FILE"
run 1
grep -q '^FAILED ' "$scratch/data/backups/backup.status"
printf 'BACKUP_RETENTION_DAYS=14\n' >>"$ENV_FILE"
rmdir "$scratch/data/originals"
run 1
grep -q '^FAILED ' "$scratch/data/backups/backup.status"
mkdir "$scratch/data/originals"
run 0
grep -q '^OK ' "$scratch/data/backups/backup.status"
LOCK_STATUS=75
run 0
grep -q '^OK ' "$scratch/data/backups/backup.status"
LOCK_STATUS=1
run 1
grep -q '^FAILED ' "$scratch/data/backups/backup.status"
printf 'PASS: %s backup failure/recovery cases\n' "$checks"
