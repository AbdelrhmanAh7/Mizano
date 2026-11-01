#!/usr/bin/env bash
# Every 5 minutes (jarda-healthcheck.timer): the shared deploy/pi health check with this
# server's files. Telegram alerts only when TELEGRAM_BOT_TOKEN and TELEGRAM_ALERT_CHAT_ID are set.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/vps/scripts/env.sh
. "$here/env.sh"
exec "$PI_DIR/scripts/healthcheck.sh"
