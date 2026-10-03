#!/usr/bin/env bash
# Shared helpers, sourced by the other scripts. Loads .env.pi without echoing it.
# shellcheck shell=bash
set -euo pipefail

PI_DIR="${PI_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-$PI_DIR/.env.pi}"
COMPOSE_FILE="$PI_DIR/docker-compose.pi.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "missing env file: $ENV_FILE" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

export DATA_DIR="${MIZANO_DATA_DIR:-/mnt/ssd/mizano}"

dc() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# Docker health status of a compose service's container ($1): healthy, unhealthy or
# starting; empty when the service has no container.
service_health() {
  local cid
  cid="$(dc ps -q "$1" 2>/dev/null || true)"
  [ -n "$cid" ] || return 0
  docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true
}

# Append a monitoring problem (the caller's `problems` array, "key|message") unless the
# service ($1) has a running, healthy container. Used for services that expose no HTTP
# endpoint, such as the intake worker: a dead worker leaves every document queued silently.
check_service_health() {
  local status
  status="$(service_health "$1")"
  if [ -z "$status" ]; then
    problems+=("$1-down|$1 not running")
  elif [ "$status" != "healthy" ]; then
    problems+=("$1-unhealthy|$1 unhealthy")
  fi
}

# Wait until api, web and worker report healthy. $1 = timeout in seconds.
wait_healthy() {
  local deadline=$((SECONDS + ${1:-240})) svc ok
  while [ "$SECONDS" -lt "$deadline" ]; do
    ok=1
    for svc in api web worker; do
      [ "$(service_health "$svc")" = "healthy" ] || ok=0
    done
    if [ "$ok" -eq 1 ]; then
      return 0
    fi
    sleep 5
  done
  return 1
}

# Persist the deployed image refs and SHA into the env file so later plain
# `docker compose up` uses them. Rewrites only those keys, atomically, keeping
# every other line and the file mode. Args: sha api-image web-image.
persist_deployment() {
  local tmp
  tmp="$(mktemp "$ENV_FILE.XXXXXX")"
  chmod --reference="$ENV_FILE" "$tmp"
  {
    grep -vE '^(MIZANO_API_IMAGE|MIZANO_WEB_IMAGE|MIZANO_DEPLOYED_SHA)=' "$ENV_FILE" || true
    printf 'MIZANO_API_IMAGE=%s\nMIZANO_WEB_IMAGE=%s\nMIZANO_DEPLOYED_SHA=%s\n' "$2" "$3" "$1"
  } >"$tmp"
  mv "$tmp" "$ENV_FILE"
}
