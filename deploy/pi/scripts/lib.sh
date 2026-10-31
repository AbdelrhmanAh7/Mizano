#!/usr/bin/env bash
# Shared helpers, sourced by the other scripts. Loads .env.pi without echoing it.
# shellcheck shell=bash
set -euo pipefail

PI_DIR="${PI_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-$PI_DIR/.env.pi}"
COMPOSE_FILE="${COMPOSE_FILE:-$PI_DIR/docker-compose.pi.yml}"
export COMPOSE_FILE ENV_FILE

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

# Only a private password file is accepted; an inherited password must not override it.
require_restic() {
  if [ -z "${RESTIC_REPOSITORY:-}" ] || [ -z "${RESTIC_PASSWORD_FILE:-}" ]; then
    echo "set RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE" >&2
    return 1
  fi
  command -v restic >/dev/null || { echo "restic not installed" >&2; return 1; }
  local features
  features="$(restic backup --help)" || return 1
  [[ "$features" == *--stdin-from-command* ]] || { echo "restic needs stdin-from-command support" >&2; return 1; }
  unset RESTIC_PASSWORD RESTIC_PASSWORD_COMMAND
  python3 - "$RESTIC_PASSWORD_FILE" <<'PYTHON'
import pathlib, stat, sys
try:
    key = pathlib.Path(sys.argv[1])
    if not key.is_absolute() or not key.is_file() or stat.S_IMODE(key.stat().st_mode) & 0o077:
        raise ValueError()
except Exception:
    print('restic password must be an absolute private file (mode 600 or 400)', file=sys.stderr)
    sys.exit(1)
PYTHON
}

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# Wait until api, web and the intake worker (no HTTP port; heartbeat healthcheck) report healthy.
# A dead worker fails the deploy so the existing rollback path runs. $1 = timeout in seconds.
wait_healthy() {
  local deadline=$((SECONDS + ${1:-240})) svc cid status ok
  while [ "$SECONDS" -lt "$deadline" ]; do
    ok=1
    for svc in api web worker; do
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
