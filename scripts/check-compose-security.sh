#!/usr/bin/env bash
# Verifies the production compose stacks (#183): postgres/redis publish no
# port, Redis runs with --requirepass, every REDIS_URL carries credentials,
# and `docker compose config` fails when POSTGRES_PASSWORD is unset.
# Needs Docker Compose v2 and jq. Uses dummy values only; prints no passwords.
set -euo pipefail

cd "$(dirname "$0")/.."

FILES=(docker-compose.production.yml deploy/pi/docker-compose.pi.yml)
DUMMY_PG=composecheck0123456789abcdef
DUMMY_REDIS=0000000000000000000000000000000000000000000000000000000000000000
# Images the pi file requires; any non-empty value renders the config.
export MIZANO_API_IMAGE=check/api MIZANO_WEB_IMAGE=check/web DATABASE_URL=postgresql://check
export JWT_SECRET=check JWT_REFRESH_SECRET=check CORS_ORIGIN=https://check NEXTAUTH_URL=https://check
export NEXTAUTH_SECRET=check CLOUDFLARE_TUNNEL_TOKEN=check
unset REDIS_PASSWORD REDIS_URL

fail=0
file_fail=0
report() { echo "FAIL $1: $2"; fail=1; file_fail=1; }
# --env-file /dev/null: a developer's .env must not mask a missing variable.
config() { docker compose --env-file /dev/null -f "$1" config --format json; }

# check FILE PG_PASSWORD EXPECTED_REDIS_PASSWORD [REDIS_PASSWORD]
check_render() {
  local f=$1 pg=$2 expected=$3 redis=${4:-} out
  if ! out=$(POSTGRES_PASSWORD="$pg" REDIS_PASSWORD="$redis" config "$f" 2>&1); then
    report "$f" "docker compose config failed: $out"
    return
  fi
  # Any ports entry on postgres/redis counts, whatever the host port is.
  local published
  published=$(jq -r '[.services.postgres.ports, .services.redis.ports] | map(. // []) | add | length' <<<"$out")
  [[ "$published" == "0" ]] || report "$f" "postgres/redis publish $published port(s)"

  local redis_cmd
  redis_cmd=$(jq -r '.services.redis.command | if type == "array" then join(" ") else . end' <<<"$out")
  [[ "$redis_cmd" == *"--requirepass $expected"* ]] || report "$f" "redis --requirepass missing or wrong password"
  [[ "$(jq -r '.services.redis.environment.REDISCLI_AUTH // ""' <<<"$out")" == "$expected" ]] \
    || report "$f" "redis healthcheck auth (REDISCLI_AUTH) missing or wrong password"

  local urls count=0 url
  urls=$(jq -r '.services[].environment // {} | .REDIS_URL // empty' <<<"$out")
  while IFS= read -r url; do
    [[ -n "$url" ]] || continue
    count=$((count + 1))
    [[ "$url" == "redis://:${expected}@"* ]] || report "$f" "REDIS_URL without the redis password"
  done <<<"$urls"
  [[ $count -gt 0 ]] || report "$f" "no service defines REDIS_URL"
}

for f in "${FILES[@]}"; do
  file_fail=0
  check_render "$f" "$DUMMY_PG" "$DUMMY_PG"
  check_render "$f" "$DUMMY_PG" "$DUMMY_REDIS" "$DUMMY_REDIS"

  if (unset POSTGRES_PASSWORD; config "$f" >/dev/null 2>&1); then
    report "$f" "config succeeds without POSTGRES_PASSWORD"
  fi
  if [[ $file_fail -eq 0 ]]; then echo "OK   $f"; fi
done

exit "$fail"
