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

# Wait until api and web report healthy. $1 = timeout in seconds.
wait_healthy() {
  local deadline=$((SECONDS + ${1:-240})) svc cid status ok
  while [ "$SECONDS" -lt "$deadline" ]; do
    ok=1
    for svc in api web; do
      cid="$(dc ps -q "$svc" 2>/dev/null || true)"
      status=""
      if [ -n "$cid" ]; then
        status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
      fi
      [ "$status" = "healthy" ] || ok=0
    done
    if [ "$ok" -eq 1 ]; then
      return 0
    fi
    sleep 5
  done
  return 1
}
