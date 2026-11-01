#!/usr/bin/env bash
# Sends one alert line by email: alert.sh "<message>". Called by the health check (deduplicated:
# one email when a check starts failing, one when it recovers). The message is always in the
# system log too (journalctl -t jarda-alert). Email goes out only when the mail server is set in
# /etc/jarda/jarda.env (MAIL_SMTP_HOST, MAIL_SMTP_USER, MAIL_SMTP_PASSWORD, MAIL_FROM); it goes
# to ALERT_EMAIL, else ACME_EMAIL. Test it: sudo /opt/jarda/deploy/vps/scripts/alert.sh "test".
set -euo pipefail
ENV_FILE="${ENV_FILE:-/etc/jarda/jarda.env}"
msg="${1:?message}"
if [ -r "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi
to="${ALERT_EMAIL:-${ACME_EMAIL:-}}"
if [ -z "${MAIL_SMTP_HOST:-}" ] || [ -z "${MAIL_SMTP_USER:-}" ] || [ -z "${MAIL_SMTP_PASSWORD:-}" ] ||
  [ -z "${MAIL_FROM:-}" ] || [ -z "$to" ]; then
  echo "alert: email not set up (MAIL_SMTP_* / MAIL_FROM in $ENV_FILE); logged only" >&2
  exit 0
fi
from_addr="$(printf '%s' "$MAIL_FROM" | sed -nE 's/.*<([^>]+)>.*/\1/p')"
from_addr="${from_addr:-$MAIL_FROM}"
port="${MAIL_SMTP_PORT:-587}"
scheme=smtp
[ "$port" != 465 ] || scheme=smtps
subject="$(printf '%s' "$msg" | tr -d '\r\n' | cut -c1-150)"
mail_file="$(mktemp)"
trap 'rm -f "$mail_file"' EXIT
printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n\r\nServer: %s\r\nCheck: journalctl -t jarda-alert --since today\r\n' \
  "$MAIL_FROM" "$to" "$subject" "$(date -R)" "$msg" "$(hostname)" >"$mail_file"
# The password goes through a curl config on stdin, never on the command line.
cred="$(printf '%s:%s' "$MAIL_SMTP_USER" "$MAIL_SMTP_PASSWORD" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
printf 'user = "%s"\n' "$cred" |
  curl -fsS --max-time 30 --config - --ssl-reqd --url "$scheme://$MAIL_SMTP_HOST:$port" \
    --mail-from "$from_addr" --mail-rcpt "$to" --upload-file "$mail_file"
echo "alert: email sent to $to"
