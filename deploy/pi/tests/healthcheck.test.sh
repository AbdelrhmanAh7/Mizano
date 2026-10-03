#!/usr/bin/env bash
# Full command harness: fake transport only; never sends Telegram messages.
set -euo pipefail
pi_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch/bin" "$scratch/data/monitor"
export ENV_FILE="$scratch/env" DELIVERED="$scratch/delivered" SEND_OK=1 LOCK_STATUS=0
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
TELEGRAM_BOT_TOKEN=123:test_only
TELEGRAM_ALERT_CHAT_ID=123
MIZANO_DATA_DIR='$scratch/data'
ENV
cat >"$scratch/bin/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
config=$(cat)
[[ "$config" = 'url = "https://api.telegram.org/bot123:test_only/sendMessage"' ]]
for arg in "$@"; do
  [[ "$arg" != *test_only* ]]
  if [[ "$arg" = text=* ]]; then printf '%s\n' "$arg" >>"$DELIVERED"; fi
done
case "$SEND_OK" in
  1) printf '{"ok": true, "result": {"message_id": 1}}\n' ;;
  nested) printf '{"ok": false, "result": {"ok": true, "message_id": 1}}\n' ;;
  malformed) printf 'not JSON: "ok": true\n' ;;
  *) printf '{"ok": false}\n' ;;
esac
MOCK
chmod +x "$scratch/bin/curl"
# Git Bash cannot lock Unix descriptors; locking itself remains a Pi check.
printf '#!/usr/bin/env bash\nexit "${LOCK_STATUS:-0}"\n' >"$scratch/bin/flock"
chmod +x "$scratch/bin/flock"
export PATH="$scratch/bin:$PATH"
touch "$DELIVERED"
printf 'api\n' >"$scratch/data/monitor/active-keys"
checks=0
run() {
  local expected=$1 actual=0
  shift
  bash "$pi_dir/scripts/healthcheck.sh" "$@" >"$scratch/output" 2>&1 || actual=$?
  [ "$actual" -eq "$expected" ]
  ! grep -q test_only "$scratch/output"
  checks=$((checks+1))
}
run 1 --simulate disk
run 1 --simulate disk
[ "$(wc -l <"$DELIVERED")" -eq 1 ]
run 0 --simulate recovery
run 0 --simulate recovery
[ "$(wc -l <"$DELIVERED")" -eq 2 ]
grep -qx api "$scratch/data/monitor/active-keys"
SEND_OK=0
run 2 --simulate backup
[ ! -s "$scratch/data/monitor/simulation-keys" ]
SEND_OK=1
run 1 --simulate backup
SEND_OK=0
run 2 --simulate recovery
grep -qx backup "$scratch/data/monitor/simulation-keys"
SEND_OK=1
run 0 --simulate recovery
[ ! -s "$scratch/data/monitor/simulation-keys" ]
for SEND_OK in nested malformed; do
  run 2 --simulate memory
  [ ! -s "$scratch/data/monitor/simulation-keys" ]
done
SEND_OK=1
run 2 --simulate invalid
run 2 --invalid
run 2 --simulate disk unexpected
LOCK_STATUS=75
run 0 --simulate disk
LOCK_STATUS=1
run 2 --simulate disk
# Exercise all live branches with failing probes, without contacting Docker.
LOCK_STATUS=0
cat >"$scratch/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" = *postgres* ]]; then
  sql=$(cat)
  [[ "$sql" = *'"organizationId" = '\''pilot-org'\'''* ]]
  [[ "$sql" = *'"deletedAt" IS NULL'* ]]
  printf '%s\n' "$QUEUE_COUNT"
else
  [ "$LIVE_OK" = 1 ]
fi
MOCK
chmod +x "$scratch/bin/docker"
cat >"$scratch/bin/vcgencmd" <<'MOCK'
#!/usr/bin/env bash
printf 'throttled=0x0\n'
MOCK
chmod +x "$scratch/bin/vcgencmd"
printf 'MONITOR_ORGANIZATION_ID=pilot-org\n' >>"$ENV_FILE"
export LIVE_OK=0 QUEUE_COUNT=1
: >"$DELIVERED"
: >"$scratch/data/monitor/active-keys"
run 1
run 1
for key in api web gateway tunnel worker queue; do
  [ "$(grep -cxF "text=[Mizano] ALERT: $key" "$DELIVERED")" -eq 1 ]
done
QUEUE_COUNT=unknown
run 1
! grep -qxF 'text=[Mizano] RECOVERED: queue' "$DELIVERED"
grep -qx queue "$scratch/data/monitor/active-keys"
LIVE_OK=1 QUEUE_COUNT=0
run 1 # Host probes are still unhealthy on the test machine.
for key in api web gateway tunnel worker queue queue-probe; do
  [ "$(grep -cxF "text=[Mizano] RECOVERED: $key" "$DELIVERED")" -eq 1 ]
done
printf 'PASS: %s full monitoring command cases\n' "$checks"
