#!/usr/bin/env bash
# Verifies the production compose stacks (#183): no published 5432/6379,
# Redis runs with --requirepass, every REDIS_URL carries credentials, and
# `docker compose config` fails when POSTGRES_PASSWORD is unset.
# Needs Docker Compose v2. Uses dummy values only; prints no passwords.
set -euo pipefail

cd "$(dirname "$0")/.."

FILES=(docker-compose.production.yml deploy/pi/docker-compose.pi.yml)
DUMMY_PASS=composecheck0123456789abcdef
# Images the pi file requires; any non-empty value renders the config.
export MIZANO_API_IMAGE=check/api MIZANO_WEB_IMAGE=check/web DATABASE_URL=postgresql://check
export JWT_SECRET=check JWT_REFRESH_SECRET=check CORS_ORIGIN=https://check NEXTAUTH_URL=https://check
export NEXTAUTH_SECRET=check CLOUDFLARE_TUNNEL_TOKEN=check
unset REDIS_PASSWORD REDIS_URL

fail=0
file_fail=0
report() { echo "FAIL $1: $2"; fail=1; file_fail=1; }
# --env-file /dev/null: a developer's .env must not mask a missing variable.
config() { docker compose --env-file /dev/null -f "$1" config; }

for f in "${FILES[@]}"; do
  file_fail=0
  if ! out=$(POSTGRES_PASSWORD="$DUMMY_PASS" config "$f" 2>&1); then
    report "$f" "docker compose config failed: $out"
    continue
  fi
  if grep -Eq 'published: "?(5432|6379)"?$' <<<"$out"; then
    report "$f" "publishes 5432 or 6379"
  fi
  grep -q -- "--requirepass" <<<"$out" || report "$f" "redis has no --requirepass"
  grep -q -- "$DUMMY_PASS" <<<"$out" || report "$f" "redis password does not fall back to POSTGRES_PASSWORD"
  while IFS= read -r url; do
    [[ "$url" == *"redis://:${DUMMY_PASS}@"* ]] || report "$f" "REDIS_URL without credentials"
  done < <(grep -Eo 'redis://[^"[:space:]]*' <<<"$out")

  if (unset POSTGRES_PASSWORD; config "$f" >/dev/null 2>&1); then
    report "$f" "config succeeds without POSTGRES_PASSWORD"
  fi
  if [[ $file_fail -eq 0 ]]; then echo "OK   $f"; fi
done

exit "$fail"
