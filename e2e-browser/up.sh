#!/usr/bin/env bash
# Generates the Prisma client, builds the shared packages, starts the throwaway Postgres and Redis and applies the migrations. Usage: pnpm e2e:up (needs Docker)
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm db:generate >/dev/null
pnpm turbo run build --filter='./packages/*' --concurrency=2 >/dev/null
docker compose -f e2e-browser/docker-compose.yml up -d --wait
DATABASE_URL='postgresql://e2e:e2e@127.0.0.1:5499/jarda_e2e' pnpm --filter api exec prisma migrate deploy
echo "Stack ready: database 5499, queue 6499"
