#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=deploy/pi/scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
# shellcheck source=deploy/pi/scripts/monitor-state.sh
. "$(dirname "${BASH_SOURCE[0]}")/monitor-state.sh"
# shellcheck source=deploy/pi/scripts/monitor-resources.sh
. "$(dirname "${BASH_SOURCE[0]}")/monitor-resources.sh"
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_ALERT_CHAT_ID:-}" ]; then
  log 'monitoring credentials are not configured' >&2
  exit 2
fi
command -v jq >/dev/null || { log 'monitoring requires jq' >&2; exit 2; }
if [ "$#" -ne 0 ]; then
  [ "$#" -eq 2 ] && [ "$1" = --simulate ] || exit 2
  case "$2" in api|web|gateway|tunnel|worker|queue|disk|memory|temperature|throttle|backup|recovery) ;; *) exit 2;; esac
fi
state_dir="$DATA_DIR/monitor"
mkdir -p "$state_dir"
chmod 700 "$state_dir"
exec 9>"$state_dir/lock"
lock_status=0
flock -E 75 -n 9 || lock_status=$?
if [ "$lock_status" -eq 75 ]; then exit 0; fi
if [ "$lock_status" -ne 0 ]; then
  log 'monitoring lock failed' >&2
  exit 2
fi
state="$state_dir/active-keys"
touch "$state"
chmod 600 "$state"
declare -A now_msg=()
fail_check() { now_msg["$1"]=1; }
# Probe failure means unknown, never recovery of an existing incident.
unknown_check() { now_msg["$1"]=unknown; fail_check "$1-probe"; }
# Operator simulations skip live probes and never clear real incident state.
if [ "${1:-}" = --simulate ]; then
  state="$state_dir/simulation-keys"
  touch "$state"
  chmod 600 "$state"
  [ "$2" = recovery ] || fail_check "$2"
else
# Probe actual routes and inspect semantic API health (HTTP 200 can be unhealthy).
if ! timeout 15 docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api node -e '
fetch("http://127.0.0.1:6001/api/health", {signal: AbortSignal.timeout(8000)})
.then(async r => {const h = await r.json(); process.exit(r.ok && h.status === "healthy" && h.services.database.status === "connected" && h.services.redis.status === "connected" ? 0 : 1);})
.catch(() => process.exit(1));' >/dev/null 2>&1; then fail_check api; fi
if ! timeout 15 docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T web wget -q -T 10 -O /dev/null http://127.0.0.1:5001/robots.txt >/dev/null 2>&1; then fail_check web; fi
# The public path: gateway -> web, and cloudflared's edge connection (/ready = 200 only
# with at least one live connection to Cloudflare). Metrics listen on the internal network.
if ! timeout 15 docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T gateway wget -q -T 10 -O /dev/null http://127.0.0.1:8080/robots.txt >/dev/null 2>&1; then fail_check gateway; fi
if ! timeout 15 docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T gateway wget -q -T 10 -O /dev/null http://cloudflared:2000/ready >/dev/null 2>&1; then fail_check tunnel; fi
# Worker currently lives inside API; BullMQ reports live registered consumers.
if ! timeout 15 docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T -w /app/apps/api api node -e '
setTimeout(() => process.exit(1), 8000);
const {Queue} = require("bullmq");
const u = new URL(process.env.REDIS_URL);
const q = new Queue("intake", {connection: {host: u.hostname, port: Number(u.port || 6379), username: decodeURIComponent(u.username), password: decodeURIComponent(u.password), db: Number(u.pathname.slice(1) || 0), ...(u.protocol === "rediss:" ? {tls: {}} : {}), maxRetriesPerRequest: 1}});
q.getWorkers().then(async w => {await q.close(); process.exit(w.length > 0 ? 0 : 1);}).catch(() => process.exit(1));' >/dev/null 2>&1; then fail_check worker; fi
# DB is the dead-letter source of truth: BullMQ removes failed deliveries.
if [[ "${MONITOR_ORGANIZATION_ID:-}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  # shellcheck disable=SC2016 # Postgres credentials expand only inside the container.
  count=$(timeout 15 docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres sh -c 'PGOPTIONS="-c statement_timeout=8000 -c lock_timeout=5000" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' 2>/dev/null <<SQL
SELECT count(*) FROM intake_jobs WHERE status = 'DEAD_LETTER' AND "deletedAt" IS NULL AND "organizationId" = '$MONITOR_ORGANIZATION_ID';
SQL
) || count=unknown
else count=unknown; fi
if [[ "$count" =~ ^[0-9]{1,15}$ ]]; then
  # Keep unresolved dead letters active, including after notification failures.
  [ "$count" -eq 0 ] || fail_check queue
else unknown_check queue; fi
check_resources "$DATA_DIR" /proc/meminfo /sys/class/thermal/thermal_zone0/temp
fi
notify() {
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_ALERT_CHAT_ID:-}" ] || return 1
  # Config on stdin keeps the token out of argv and diagnostics.
  [[ "$TELEGRAM_BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]] || return 1
  local reply
  reply=$(printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TELEGRAM_BOT_TOKEN" |
    curl --config - -fsS --max-time 15 --data-urlencode "chat_id=$TELEGRAM_ALERT_CHAT_ID" \
      --data-urlencode "text=[Mizano] $1" 2>/dev/null) || return 1
  # Inspect the top-level acknowledgement, never a substring in an error body.
  printf '%s' "$reply" | jq -e '.ok == true and (.result.message_id | type == "number")' >/dev/null 2>&1
}
if ! update_alert_state "$state_dir" "$state" now_msg; then
  log 'monitoring notification delivery failed; transitions will retry' >&2
  exit 2
fi
[ "${#now_msg[@]}" -eq 0 ]
