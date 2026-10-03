#!/usr/bin/env bash
set -euo pipefail
pi_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
export ENV_FILE="$scratch/env"
cat >"$ENV_FILE" <<'ENV'
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
ENV
bash -c '. "$1/scripts/lib.sh"' _ "$pi_dir"
checks=1
for invalid in 'NEXTAUTH_URL=http://pilot.example.com' 'CORS_ORIGIN=*' 'PUBLIC_API_URL=https://other.example.com/api' 'JWT_SECRET=REPLACE_ME' 'JWT_REFRESH_SECRET=' 'NEXTAUTH_SECRET=short' 'JWT_SECRET=test-only-refresh-secret-at-least-32-chars' 'MIZANO_GATEWAY_IMAGE=nginx:latest' 'MIZANO_TUNNEL_IMAGE=' 'MIZANO_GATEWAY_IMAGE=nginx@sha256:short'; do
  cp "$ENV_FILE" "$scratch/good"
  printf '%s\n' "$invalid" >>"$ENV_FILE"
  if bash -c '. "$1/scripts/lib.sh"' _ "$pi_dir" >"$scratch/output" 2>&1; then
    printf 'FAIL: invalid configuration accepted\n' >&2
    exit 1
  fi
  mv "$scratch/good" "$ENV_FILE"
  checks=$((checks+1))
done
# Contract checks for routing and monitoring SQL; live nginx/DB checks are separate.
grep -q 'location /api/' "$pi_dir/gateway.conf"
grep -qF 'location ~ ^/api/auth/(csrf|session|providers|signin|signout|callback|error)(/|$)' "$pi_dir/gateway.conf"
grep -q 'location /socket.io/' "$pi_dir/gateway.conf"
grep -q 'FROM intake_jobs.*"deletedAt" IS NULL.*"organizationId"' "$pi_dir/scripts/healthcheck.sh"
! grep -q '^[[:space:]]*ports:' "$pi_dir/docker-compose.pi.yml"
! grep -q 'image:.*latest' "$pi_dir/docker-compose.pi.yml"
# Gate deployments on both application readiness and reachable ingress.
# shellcheck source=deploy/pi/scripts/lib.sh
. "$pi_dir/scripts/lib.sh"
dc() { printf '%s\n' "$3"; }
docker() {
  if [ "$1" = inspect ]; then
    if [ "${@: -1}" = "$unhealthy" ]; then printf 'unhealthy\n'; else printf 'healthy\n'; fi
  else
    [ "$unhealthy" != tunnel ]
  fi
}
timeout() { shift; "$@"; }
sleep() { SECONDS=$((SECONDS+$1)); }
unhealthy=none
wait_healthy 1
checks=$((checks+1))
for unhealthy in api web gateway tunnel; do
  if wait_healthy 1; then exit 1; fi
  checks=$((checks+1))
done
printf 'PASS: %s configuration cases and 6 deployment contracts\n' "$checks"
