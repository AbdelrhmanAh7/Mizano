#!/usr/bin/env bash
# Nightly backup (jarda-backup.timer, 02:30 Cairo):
#   1. one encrypted restic snapshot on this server: consistent pg_dump + originals + manifest,
#      kept BACKUP_RETENTION_DAYS days (7) -- the shared deploy/pi/scripts/backup.sh does this;
#   2. if /etc/jarda/r2.env sets R2_ENABLED=1, a copy of the new snapshots to Cloudflare R2.
# Both repositories use the same restic password file; R2 keys never enter the app containers.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/vps/scripts/env.sh
. "$here/env.sh"
umask 077

"$PI_DIR/scripts/backup.sh"

# Other products' own backups (FlowLine): executable files in /etc/jarda/backup.d, run in name
# order after Jarda's. A failing hook fails this run (and the systemd unit) after the R2 copy.
hooks_failed=0
for hook in "${JARDA_BACKUP_D:-/etc/jarda/backup.d}"/*; do
  [ -f "$hook" ] && [ -x "$hook" ] || continue
  if "$hook"; then log "backup hook OK: $(basename "$hook")"; else
    hooks_failed=1
    echo "backup hook failed: $(basename "$hook")" >&2
  fi
done
finish() {
  if [ "$hooks_failed" -ne 0 ]; then exit 1; fi
  exit 0
}

R2_ENV_FILE="${R2_ENV_FILE:-/etc/jarda/r2.env}"
offsite_status="$DATA_DIR/backups/offsite.status"
if [ ! -f "$R2_ENV_FILE" ]; then
  log "offsite copy skipped: no $R2_ENV_FILE"
  finish
fi
set -a
# shellcheck disable=SC1090
. "$R2_ENV_FILE"
set +a
if [ "${R2_ENABLED:-0}" != "1" ]; then
  log "offsite copy skipped: R2_ENABLED is not 1"
  finish
fi
fail() {
  printf 'FAILED %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$offsite_status"
  echo "offsite copy failed: $1" >&2
  exit 1
}
for key in R2_REPOSITORY R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  [ -n "${!key:-}" ] || fail "set $key in $R2_ENV_FILE"
done
if [[ "$R2_REPOSITORY" != s3:https://* ]] && [ "${R2_ALLOW_PLAIN_HTTP_FOR_LOCAL_TEST:-0}" != 1 ]; then
  fail "R2_REPOSITORY must start with s3:https://"
fi
r2_retention="${R2_RETENTION_DAYS:-30}"
[[ "$r2_retention" =~ ^[1-9][0-9]*$ ]] || fail "invalid R2_RETENTION_DAYS"
backup_host="${BACKUP_HOST:-$(hostname)}"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
# R2 has a single region called "auto".
export AWS_DEFAULT_REGION="${R2_REGION:-auto}"
r2() { restic -r "$R2_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" "$@"; }
if ! r2 cat config >/dev/null 2>&1; then
  # Same chunker settings as the local repository, so copies deduplicate.
  r2 init --from-repo "$RESTIC_REPOSITORY" --from-password-file "$RESTIC_PASSWORD_FILE" \
    --copy-chunker-params >/dev/null 2>&1 || fail "cannot reach or create the R2 repository"
fi
# Every snapshot of this server (Jarda and the backup.d hooks), only those the bucket lacks.
r2 copy --from-repo "$RESTIC_REPOSITORY" --from-password-file "$RESTIC_PASSWORD_FILE" \
  --host "$backup_host" >/dev/null 2>&1 || fail "copy to R2"
# Retention per product: restic groups snapshots by host and tags.
r2 forget --host "$backup_host" --group-by host,tags --keep-within "${r2_retention}d" --prune \
  >/dev/null 2>&1 || fail "R2 retention"
printf 'OK %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$offsite_status"
log "offsite copy OK (R2, kept ${r2_retention} days)"
finish
