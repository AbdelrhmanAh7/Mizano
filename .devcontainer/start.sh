#!/usr/bin/env bash
# Starts the web (5001) and API (6001) servers with the codespace's forwarded addresses.
# Dev-only: the secrets come from the tracked .env.local placeholders; ports stay private.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  web="https://${CODESPACE_NAME}-5001.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  api="https://${CODESPACE_NAME}-6001.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
  web="http://localhost:5001"
  api="http://localhost:6001"
fi
export NEXTAUTH_URL="$web" FRONTEND_URL="$web" CORS_ORIGIN="$web"
# The browser reaches the API through the web address ($web/api/backend, proxied by Next.js):
# a private forwarded port rejects cross-origin calls. Live updates (WebSocket) stay off.
export API_PROXY_TARGET="http://localhost:6001" NEXT_PUBLIC_API_URL="$web/api/backend"
export API_INTERNAL_URL="http://localhost:6001/api"
echo "Web: $web  API: $api"
# turbo 2 filters unlisted variables in strict mode; loose mode passes the ones set above.
exec pnpm exec turbo dev --env-mode=loose
