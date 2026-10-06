#!/usr/bin/env bash
# Offline regression: a missing or unhealthy extraction worker must fail the deploy health wait
# and raise a monitoring problem. Stubs docker/compose; needs no Docker, network or Pi.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$here/../.env.pi.example"
. "$here/lib.sh"

worker_state=healthy
dc() {
  local service="${!#}"
  if [ "$service" = worker ] && [ "$worker_state" = missing ]; then return; fi
  printf '%s\n' "$service"
}
docker() {
  local service="${!#}"
  if [ "$service" = worker ]; then printf '%s\n' "$worker_state";
  else printf 'healthy\n'; fi
}
sleep() { command sleep 0.05; }

fail() { echo "$1" >&2; exit 1; }
checks=0

# Deploy and rollback wait.
wait_healthy 1 || fail 'healthy worker rejected'
checks=$((checks + 1))
for state in unhealthy starting missing; do
  worker_state=$state
  if wait_healthy 1; then fail "$state worker accepted by wait_healthy"; fi
  checks=$((checks + 1))
done

# Monitoring (healthcheck.sh appends to the caller's `problems` array).
worker_state=healthy
problems=()
check_service_health worker
[ "${#problems[@]}" -eq 0 ] || fail "healthy worker reported: ${problems[*]}"
checks=$((checks + 1))

expect_problem() { # state expected
  worker_state=$1
  problems=()
  check_service_health worker
  [ "${problems[*]:-}" = "$2" ] || fail "$1 worker: expected '$2' got '${problems[*]:-}'"
  checks=$((checks + 1))
}
expect_problem unhealthy 'worker-unhealthy|worker unhealthy'
expect_problem starting 'worker-unhealthy|worker unhealthy'
expect_problem missing 'worker-down|worker not running'

echo "$checks worker health checks passed"
