#!/usr/bin/env bash
# Runs once when the codespace is created: install, generate, migrate and seed the dev database.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
sudo corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter api exec prisma migrate deploy
pnpm db:seed
echo "Ready. Run: pnpm dev:codespaces"
