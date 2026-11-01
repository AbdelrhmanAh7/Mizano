#!/usr/bin/env bash
# Every 5 minutes (jarda-healthcheck.timer): the shared deploy/pi health check with this
# server's files, plus HTTPS certificate expiry (healthcheck-extra.sh). Alerts and recoveries:
# always in the system log (journalctl -t jarda-alert), by email when alert.sh can send one,
# and on Telegram when TELEGRAM_BOT_TOKEN and TELEGRAM_ALERT_CHAT_ID are set.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/vps/scripts/env.sh
. "$here/env.sh"
export HEALTHCHECK_EXTRA="$here/healthcheck-extra.sh" ALERT_HOOK="$here/alert.sh"
exec "$PI_DIR/scripts/healthcheck.sh"
