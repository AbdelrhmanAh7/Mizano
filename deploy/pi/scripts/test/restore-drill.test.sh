#!/usr/bin/env bash
# Offline tests for the restore-drill helpers (no Docker). Run: bash deploy/pi/scripts/test/restore-drill.test.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/drill-test.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
# shellcheck source=deploy/pi/scripts/drill-lib.sh
. "$here/../drill-lib.sh"

fails=0
check() { # check <name> <expected-exit> <cmd...>
  local name="$1" want="$2" got=0
  shift 2
  "$@" >"$tmp/out" 2>&1 || got=$?
  if { [ "$want" -eq 0 ] && [ "$got" -eq 0 ]; } || { [ "$want" -ne 0 ] && [ "$got" -ne 0 ]; }; then
    echo "ok   $name"
  else
    echo "FAIL $name (exit $got)"
    cat "$tmp/out"
    fails=$((fails + 1))
  fi
}

b="$tmp/backups"
mkdir -p "$b"
check "no backup found" 1 pick_backup "$b" 26
touch -t 202601010230 "$b/db-20260101T003000Z.dump.age"
check "stale backup is refused" 1 pick_backup "$b" 26
check "max age 0 accepts any backup" 0 pick_backup "$b" 0
touch "$b/db-20261007T003000Z.dump.age"
pick_backup "$b" 26 >"$tmp/picked"
check "newest backup is picked" 0 grep -qx "$b/db-20261007T003000Z.dump.age" "$tmp/picked"

root="$tmp/files"
mkdir -p "$root/originals/org1/2026/10"
printf 'invoice-bytes' >"$root/originals/org1/2026/10/abc"
sum="$(sha256_of "$root/originals/org1/2026/10/abc")"
check "originals match" 0 verify_originals "$root" <<<"org1/2026/10/abc $sum"
check "no intake jobs is fine" 0 verify_originals "$root" </dev/null
check "missing original fails" 1 verify_originals "$root" <<<"org1/2026/10/missing $sum"
check "checksum mismatch fails" 1 verify_originals "$root" <<<"org1/2026/10/abc ${sum/?/0}0"
check "traversal key is refused" 1 verify_originals "$root" <<<"../../etc/passwd $sum"

[ "$fails" -eq 0 ] || { echo "$fails failed"; exit 1; }
echo "all passed"
