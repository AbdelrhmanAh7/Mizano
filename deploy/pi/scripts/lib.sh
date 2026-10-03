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
umask 077
chmod 600 "$ENV_FILE"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

# Fail closed on a multi-origin or non-HTTPS public configuration.
if [[ ! "${NEXTAUTH_URL:-}" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] ||
   [ "${CORS_ORIGIN:-}" != "$NEXTAUTH_URL" ] ||
   [ "${PUBLIC_API_URL:-}" != "$NEXTAUTH_URL/api" ]; then
  echo 'Pi requires matching HTTPS NextAuth/CORS origin and /api API URL' >&2
  exit 2
fi
for secret_name in JWT_SECRET JWT_REFRESH_SECRET NEXTAUTH_SECRET POSTGRES_PASSWORD DATABASE_URL CLOUDFLARE_TUNNEL_TOKEN; do
  secret_value="${!secret_name:-}"
  if [ -z "$secret_value" ] || [[ "$secret_value" = *REPLACE* ]]; then
    echo "configure $secret_name in the Pi secret file" >&2
    exit 2
  fi
done
for secret_name in JWT_SECRET JWT_REFRESH_SECRET NEXTAUTH_SECRET; do
  secret_value="${!secret_name}"
  if [ "${#secret_value}" -lt 32 ]; then
    echo "configure a random secret of at least 32 characters for $secret_name" >&2
    exit 2
  fi
done
if [ "$JWT_SECRET" = "$JWT_REFRESH_SECRET" ] ||
   [ "$JWT_SECRET" = "$NEXTAUTH_SECRET" ] ||
   [ "$JWT_REFRESH_SECRET" = "$NEXTAUTH_SECRET" ]; then
  echo 'Pi authentication secrets must be distinct' >&2
  exit 2
fi
unset secret_value secret_name
for image_name in MIZANO_GATEWAY_IMAGE MIZANO_TUNNEL_IMAGE; do
  if [[ ! "${!image_name:-}" =~ ^[A-Za-z0-9._:/-]+@sha256:[a-f0-9]{64}$ ]]; then
    echo "configure a reviewed digest for $image_name" >&2
    exit 2
  fi
done
unset image_name
export DATA_DIR="${MIZANO_DATA_DIR:-/mnt/ssd/mizano}"

dc() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# Wait for the applications, gateway and an actual tunnel edge connection.
# $1 = timeout in seconds. The distroless tunnel has no shell for a Docker probe.
wait_healthy() {
  local deadline=$((SECONDS + ${1:-240})) svc cid status ok
  while [ "$SECONDS" -lt "$deadline" ]; do
    ok=1
    for svc in api web gateway; do
      cid="$(dc ps -q "$svc" 2>/dev/null || true)"
      status=""
      if [ -n "$cid" ]; then
        status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
      fi
      [ "$status" = "healthy" ] || ok=0
    done
    if ! timeout 15 docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T gateway \
      wget -q -T 10 -O /dev/null http://cloudflared:2000/ready >/dev/null 2>&1; then
      ok=0
    fi
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
