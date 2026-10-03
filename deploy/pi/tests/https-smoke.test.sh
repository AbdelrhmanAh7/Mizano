#!/usr/bin/env bash
# Owner-run from an external network. Never prints bodies or credential headers.
set -euo pipefail
: "${PUBLIC_ORIGIN:?set PUBLIC_ORIGIN to the pilot HTTPS origin}"
[[ "$PUBLIC_ORIGIN" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || exit 2
: "${ACCESS_COOKIE_FILE:?provide a private curl cookie jar with Cloudflare Access only}"
[ -f "$ACCESS_COOKIE_FILE" ] || exit 2
chmod 600 "$ACCESS_COOKIE_FILE"
# The jar must contain only Cloudflare Access credentials, no application session.
if grep -Eqi '(next-auth|authjs|refresh.?token|access.?token)' "$ACCESS_COOKIE_FILE"; then
  printf 'Use an Access-only cookie jar, without app authentication\n' >&2
  exit 2
fi
checks=0
expect_status() {
  local path=$1 expected=$2 actual
  actual=$(curl --silent --show-error --max-time 20 --proto '=https' \
    --cookie "$ACCESS_COOKIE_FILE" --output /dev/null --write-out '%{http_code}' \
    "$PUBLIC_ORIGIN$path" 2>/dev/null) || {
      printf 'FAIL: HTTPS request failed\n' >&2
      exit 1
    }
  [ "$actual" = "$expected" ] || {
    printf 'FAIL: %s expected %s received %s\n' "$path" "$expected" "$actual" >&2
    exit 1
  }
  checks=$((checks+1))
}
expect_status /robots.txt 200
expect_status /api/invoices 401
expect_status /api/auth/csrf 200
expect_status /api/auth/providers 200
expect_status /api/docs 404
expect_status /api/docs-json 404
expect_status /api/docs-yaml 404
expect_status /api/internal/tunnel-update 404
expect_status /api/health 404
printf 'PASS: %s external HTTPS checks; authenticated journeys and port scan still required\n' "$checks"
