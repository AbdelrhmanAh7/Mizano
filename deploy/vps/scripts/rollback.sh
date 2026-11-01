#!/usr/bin/env bash
# Go back to the previous version in about a minute, without building anything.
#
#   sudo /opt/jarda/deploy/vps/scripts/rollback.sh --list        # versions kept on this server
#   sudo /opt/jarda/deploy/vps/scripts/rollback.sh               # back to the version before this one
#   sudo /opt/jarda/deploy/vps/scripts/rollback.sh --to 1a2b3c4  # a kept version (also to go forward again)
#
# install.sh keeps the running version and the one before it. Rollback takes a backup first
# (skip with --skip-backup), points the env file at the other version's images and restarts only
# the app containers. The database is not changed: database updates are forward-only, so a
# version that added one keeps its new tables, which the older version ignores. If the older
# version cannot start on the newer database, restore the backup taken before the update.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/vps/scripts/env.sh
. "$here/env.sh"
started=$SECONDS

to="" list=0 backup=1
while [ $# -gt 0 ]; do
  case "$1" in
    --to) to="${2:-}"; shift 2 ;;
    --list) list=1; shift ;;
    --skip-backup) backup=0; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

current="${MIZANO_DEPLOYED_SHA:-}"
# Versions that have both images, newest first.
mapfile -t versions < <(
  docker image ls jarda-api --format '{{.CreatedAt}}\t{{.Tag}}' | sort -r | cut -f2 |
    while read -r tag; do
      if docker image inspect "jarda-web:$tag" >/dev/null 2>&1; then echo "$tag"; fi
    done
)
if [ "$list" -eq 1 ]; then
  for v in "${versions[@]}"; do
    if [ "$v" = "$current" ]; then echo "$v (running)"; else echo "$v"; fi
  done
  exit 0
fi

target=""
for v in "${versions[@]}"; do
  if [ -n "$to" ]; then
    case "$v" in "$to"*) target="$v"; break ;; esac
  elif [ "$v" != "$current" ]; then
    target="$v"
    break
  fi
done
[ -n "$target" ] || { echo "ROLLBACK FAILED: no other kept version${to:+ matching $to} (see --list)" >&2; exit 1; }
[ "$target" != "$current" ] || { echo "already running $target" >&2; exit 0; }

if [ "$backup" -eq 1 ]; then
  log "rollback stage=backup"
  "$here/backup.sh" >/dev/null || { echo "ROLLBACK STOPPED: the backup failed (re-run with --skip-backup to go on anyway)" >&2; exit 1; }
fi

log "rollback from=${current:0:12} to=${target:0:12}"
persist_deployment "$target" "jarda-api:$target" "jarda-web:$target"
# env.sh exported the old values, and docker compose prefers the shell's over --env-file.
unset MIZANO_API_IMAGE MIZANO_WEB_IMAGE MIZANO_DEPLOYED_SHA

# Recreates only the containers whose image changed (migrate, api, worker, web).
"$here/compose.sh" up -d >/dev/null
wait_healthy 240 || {
  echo "ROLLBACK FAILED: version ${target:0:12} is not healthy. Back to ${current:0:12}: $0 --to ${current:0:12}" >&2
  exit 1
}
log "rollback OK running=${target:0:12} seconds=$((SECONDS - started))"
