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
# Bind-mounted by compose with create_host_path: false; the scripts create the rest.
DATA_SUBDIRS=(postgres redis originals)

dc() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# Wait until api, worker and web report healthy. $1 = timeout in seconds.
wait_healthy() {
  local deadline=$((SECONDS + ${1:-240})) svc cid status ok
  while [ "$SECONDS" -lt "$deadline" ]; do
    ok=1
    for svc in api worker web; do
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

# Refuse to run when DATA_DIR is on the SD card (mmcblk device). If the SSD failed to
# mount, DATA_DIR would sit on the SD card's root filesystem. A Pi booting from an SSD
# (root on nvme/sda) passes.
assert_ssd() {
  local data_src
  if [ ! -d "$DATA_DIR" ]; then
    echo "data dir $DATA_DIR does not exist; is the SSD mounted?" >&2
    return 1
  fi
  data_src="$(findmnt -n -o SOURCE --target "$DATA_DIR" || true)"
  case "$data_src" in
    /dev/mmcblk*)
      echo "data dir $DATA_DIR is on the SD card ($data_src), not the SSD" >&2
      return 1
      ;;
    '')
      echo "cannot tell which device holds $DATA_DIR" >&2
      return 1
      ;;
  esac
  for sub in "${DATA_SUBDIRS[@]}"; do
    if [ ! -d "$DATA_DIR/$sub" ]; then
      echo "missing $DATA_DIR/$sub (see README section 1)" >&2
      return 1
    fi
  done
}

# Validate .env.pi with scripts/check-env.mjs (prints key names only). Uses the host's
# node if present, else a throwaway node container with no network and read-only mounts.
check_env() {
  local root
  root="$(cd "$PI_DIR/../.." && pwd)"
  if [ ! -f "$root/scripts/check-env.mjs" ]; then
    echo "missing $root/scripts/check-env.mjs; add scripts to the sparse checkout" >&2
    return 1
  fi
  if command -v node >/dev/null 2>&1; then
    APP_ENV=pi node "$root/scripts/check-env.mjs" --file "$ENV_FILE"
  else
    docker run --rm --network none -e APP_ENV=pi \
      -v "$root/scripts:/repo/scripts:ro" -v "$PI_DIR:/repo/deploy/pi:ro" \
      -v "$ENV_FILE:/repo/env.pi:ro" -w /repo \
      node:20-alpine node scripts/check-env.mjs --file /repo/env.pi
  fi
}
