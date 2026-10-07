#!/usr/bin/env bash
# One command to start/stop the Pi stack. Usage: stack.sh up|down|stop|restart|status|logs|check
#   check    validate .env.pi (same rules as `APP_ENV=pi pnpm env:check`)
#   up       check .env.pi and the SSD, start everything (waits for api, worker, web healthy
#            and the cloudflared container running)
#   down     stop and remove containers; data on the SSD is kept
#   stop     stop containers without removing them (used by mizano-stack.service)
#   status   container state (stopped ones too), health and memory use
#   logs     follow logs (optionally of one service)
set -euo pipefail
# shellcheck source=deploy/pi/scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

cmd="${1:-}"
case "$cmd" in
  check)
    check_env
    ;;
  up)
    # mizano-stack.service sets SKIP_ENV_CHECK=1: a reboot must not be blocked by a
    # newer check rule; the operator ran `check` when changing the config.
    if [ "${SKIP_ENV_CHECK:-0}" != "1" ]; then check_env; fi
    assert_ssd
    dc up -d --remove-orphans
    if wait_healthy "${WAIT_SECONDS:-300}"; then
      log "stack healthy"
    else
      log "stack not healthy after ${WAIT_SECONDS:-300}s; see: $0 status" >&2
      exit 1
    fi
    ;;
  down)
    dc down
    ;;
  stop)
    dc stop
    ;;
  restart)
    "$0" down
    "$0" up
    ;;
  status)
    # -a also lists a service whose container has stopped.
    dc ps -a
    ids="$(dc ps -q)"
    if [ -n "$ids" ]; then
      # shellcheck disable=SC2086 # one argument per container id
      docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' $ids
    fi
    free -m
    ;;
  logs)
    shift
    dc logs -f --tail=200 "$@"
    ;;
  *)
    echo "usage: $0 check|up|down|stop|restart|status|logs [service]" >&2
    exit 2
    ;;
esac
