#!/usr/bin/env bash
# pnpm e2e:army [e2e run args...]: the in-repo E2E gate (#153). Prepares a TEST database, builds the API, starts the Nest API and the
# Next.js web app, runs tester-army/e2e on e2e-army/ (config: e2e.config.ts) and stops everything again. Same recipe as the hub's
# verify job (nql-agents ops/verify/Mizano.sh), so a local run sees what the PR gate sees.
#
#   DATABASE_URL         required: a throwaway Postgres database whose name contains test, e2e or verify (schema-pushed + seeded)
#   E2E_ARMY_PORT_WEB    web port, default 5101       E2E_ARMY_PORT_API   API port, default 6101 (both kept off the dev ports)
#   E2E_ARMY_SKIP_SETUP  1 = reuse the prepared database and build (iterate on tests)
#   E2E_ARMY_MODEL_* / E2E_ARMY_CLI   model for agent steps, see e2e.config.ts (none: agent tests skip, the others run)
#
#   pnpm e2e:army                                    whole suite (PR tests + every feature shard)
#   pnpm e2e:army --tag shard:smoke                  one shard (ids: e2e-army/shards.json), each <= 5 min
#   pnpm e2e:army --tag feat:mz-journals             one feature
#   pnpm e2e:army e2e-army/153-e2e-army-gate.e2e.ts  one file
#
# No outbound side effects: no Redis, SMTP, Telegram, OCR or Ollama; the JWT / NextAuth secrets are random per run. Logs: .e2e/app-*.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

: "${DATABASE_URL:?set DATABASE_URL to a throwaway test database (its name must contain test, e2e or verify)}"
DB_NAME="${DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
[[ "$DB_NAME" =~ (test|e2e|verify) ]] || { echo "e2e-army: refusing database '$DB_NAME' (name must contain test, e2e or verify)" >&2; exit 78; }

PORT_WEB="${E2E_ARMY_PORT_WEB:-5101}"
PORT_API="${E2E_ARMY_PORT_API:-6101}"
for p in "$PORT_WEB" "$PORT_API"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then echo "e2e-army: port $p is already in use" >&2; exit 75; fi
done

export APP_ENV=e2e-army NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1 E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1
export REDIS_URL="" OLLAMA_ENABLED=false VLM_ENABLED=false
export OLLAMA_BASE_URL=http://127.0.0.1:9 VLM_SERVICE_URL=http://127.0.0.1:9 OCR_SERVICE_URL=http://127.0.0.1:9
unset SMTP_HOST SMTP_USER SMTP_PASSWORD TELEGRAM_BOT_TOKEN TELEGRAM_ALERT_CHAT_ID PADDLE_OCR_API_URL PADDLE_OCR_API_TOKEN
secret() { node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))'; }
SECRET1="$(secret)" SECRET2="$(secret)" SECRET3="$(secret)"
mkdir -p .e2e

if [ "${E2E_ARMY_SKIP_SETUP:-}" != 1 ]; then
  echo "[e2e-army] preparing $DB_NAME and building the API"
  pnpm db:generate >/dev/null
  pnpm --filter api exec prisma db push --skip-generate --accept-data-loss >/dev/null
  pnpm --filter api exec prisma db seed >/dev/null
  pnpm turbo run build --filter=api --filter='@mizano/web^...' --output-logs=errors-only
fi

PIDS=()
cleanup() {
  for pid in "${PIDS[@]}"; do kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM
set -m # each app in its own process group, so cleanup also stops the children (next dev workers)

(
  export NODE_ENV=production JWT_SECRET="$SECRET1" JWT_REFRESH_SECRET="$SECRET2" OLLAMA_WEBHOOK_SECRET="$SECRET3"
  export JWT_EXPIRATION=15m JWT_REFRESH_EXPIRATION=7d API_PORT="$PORT_API" CORS_ORIGIN="http://127.0.0.1:$PORT_WEB"
  export RATE_LIMIT_TTL=1000 RATE_LIMIT_MAX=1000 RATE_LIMIT_AUTH_MAX=1000 INTAKE_STORAGE_DIR="$ROOT/.e2e/intake"
  mkdir -p "$INTAKE_STORAGE_DIR"
  cd apps/api && exec node dist/main.js
) >.e2e/app-api.log 2>&1 &
PIDS+=($!)
(
  # HOSTNAME: Next builds middleware redirect URLs from it (else "localhost" becomes a second cookie origin)
  export HOSTNAME=127.0.0.1 NODE_ENV=development NEXTAUTH_SECRET="$SECRET1" NEXTAUTH_URL="http://127.0.0.1:$PORT_WEB"
  export API_INTERNAL_URL="http://127.0.0.1:$PORT_API/api" NEXT_PUBLIC_API_URL="http://127.0.0.1:$PORT_API/api" NEXT_PUBLIC_APP_URL="http://127.0.0.1:$PORT_WEB"
  cd apps/web && exec pnpm exec next dev -H 127.0.0.1 -p "$PORT_WEB"
) >.e2e/app-web.log 2>&1 &
PIDS+=($!)
set +m

wait_for() { # url name: up to 4 minutes for a 2xx/3xx answer
  for _ in $(seq 1 120); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1" || true)"
    if [ "${code:-0}" -ge 200 ] && [ "${code:-0}" -lt 400 ]; then return 0; fi
    sleep 2
  done
  echo "e2e-army: $2 did not come up, see .e2e/app-$2.log" >&2
  tail -20 ".e2e/app-$2.log" >&2 || true
  return 1
}
wait_for "http://127.0.0.1:$PORT_API/api/health/live" api
wait_for "http://127.0.0.1:$PORT_WEB/en/login" web

echo "[e2e-army] app up: web http://127.0.0.1:$PORT_WEB, API http://127.0.0.1:$PORT_API/api"
set +e
E2E_ARMY_URL="http://127.0.0.1:$PORT_WEB" E2E_ARMY_API="http://127.0.0.1:$PORT_API/api" E2E_ARMY_REPO=Mizano \
  pnpm exec e2e run --reporter list,junit "$@"
RC=$?
set -e
echo "[e2e-army] exit $RC"
exit "$RC"
