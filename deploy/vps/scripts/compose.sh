#!/usr/bin/env bash
# `docker compose` for the whole server: the Jarda stack plus every extra product file in
# /etc/jarda/compose.d/*.yml (FlowLine), one project, one internal network.
#   sudo /opt/jarda/deploy/vps/scripts/compose.sh ps
set -euo pipefail
vps="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${ENV_FILE:-/etc/jarda/jarda.env}"
extra_dir="${JARDA_COMPOSE_D:-/etc/jarda/compose.d}"
args=(-f "$vps/docker-compose.vps.yml")
if [ -d "$extra_dir" ]; then
  for f in "$extra_dir"/*.yml; do
    if [ -f "$f" ]; then args+=(-f "$f"); fi
  done
fi
exec docker compose "${args[@]}" --env-file "$env_file" "$@"
