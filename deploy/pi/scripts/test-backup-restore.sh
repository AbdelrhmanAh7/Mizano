#!/usr/bin/env bash
# Offline gate; call through the shared heavy.sh queue on the owner's Mac.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash -n "$here/backup.sh" "$here/restore-drill.sh" "$here/lib.sh"
shellcheck "$here/backup.sh" "$here/restore-drill.sh" "$here/lib.sh" "$0"
python3 "$here/test_backup_restore.py"
