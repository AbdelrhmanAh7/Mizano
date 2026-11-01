#!/usr/bin/env bash
# Example for /etc/jarda/backup.d/20-flowline (chmod 700): runs after Jarda's nightly backup with
# the same environment (RESTIC_REPOSITORY, RESTIC_PASSWORD_FILE, BACKUP_HOST from jarda.env).
# Back FlowLine's database up into the same encrypted repository under its own tag; the R2 copy
# then carries it off-site with Jarda's snapshots. Adjust the dump command to FlowLine's database.
set -euo pipefail
restic backup --host "${BACKUP_HOST:-jarda-vps}" --tag flowline --stdin-from-command \
  --stdin-filename flowline.dump -- \
  docker exec flowline-db pg_dump -U postgres -d postgres -Fc >/dev/null
restic forget --host "${BACKUP_HOST:-jarda-vps}" --tag flowline --keep-within 7d --prune >/dev/null
