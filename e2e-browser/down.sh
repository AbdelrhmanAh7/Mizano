#!/usr/bin/env bash
# Stops the throwaway stack; its data lives in memory and is gone. Usage: pnpm e2e:down
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f e2e-browser/docker-compose.yml down
