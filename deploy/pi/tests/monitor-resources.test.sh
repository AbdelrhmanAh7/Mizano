#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=deploy/pi/scripts/monitor-resources.sh
. "$(dirname "${BASH_SOURCE[0]}")/../scripts/monitor-resources.sh"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch/backups"
declare -A now_msg=()
fail_check() { now_msg["$1"]=1; }
unknown_check() { now_msg["$1"]=unknown; fail_check "$1-probe"; }
disk=80 mock_flags=throttled=0x0 probe_ok=1
df() { [ "$probe_ok" = 1 ] || return 1; printf 'Filesystem 1024-blocks Used Available Capacity Mounted\nmock 100 80 20 %s%% /\n' "$disk"; }
vcgencmd() { printf '%s\n' "$mock_flags"; }
checks=0
healthy() {
  now_msg=()
  disk=80 mock_flags=throttled=0x0 probe_ok=1
  printf 'MemAvailable: 307200 kB\n' >"$scratch/meminfo"
  printf '79999\n' >"$scratch/temp"
  printf 'OK timestamp\n' >"$scratch/backups/backup.status"
}
probe() { check_resources "$scratch" "$scratch/meminfo" "$scratch/temp"; }
expect() {
  probe
  if [[ "$1" = *-probe ]]; then
    [ "${#now_msg[@]}" -eq 2 ] && [ "${now_msg[${1%-probe}]:-}" = unknown ]
  else
    [ "${#now_msg[@]}" -eq 1 ]
  fi
  [ "${now_msg[$1]:-}" = 1 ]
  checks=$((checks+1))
}
healthy; probe; [ "${#now_msg[@]}" -eq 0 ]; checks=$((checks+1))
healthy; disk=81; expect disk
healthy; printf 'MemAvailable: 306176 kB\n' >"$scratch/meminfo"; expect memory
healthy; printf '80000\n' >"$scratch/temp"; expect temperature
for flags_value in 0x1 0x2 0x4 0x8; do
  healthy; mock_flags="throttled=$flags_value"; expect throttle
done
healthy; mock_flags=throttled=0xf0000; probe; [ "${#now_msg[@]}" -eq 0 ]; checks=$((checks+1))
healthy; printf 'FAILED timestamp\n' >"$scratch/backups/backup.status"; expect backup
healthy; touch -d '27 hours ago' "$scratch/backups/backup.status"; expect backup
healthy; touch -d '1 hour' "$scratch/backups/backup.status"; expect backup
healthy; rm "$scratch/backups/backup.status"; expect backup
healthy; probe_ok=0; expect disk-probe
healthy; disk=99999999999999999999999; expect disk-probe
healthy; printf 'missing field\n' >"$scratch/meminfo"; expect memory-probe
healthy; printf 'invalid\n' >"$scratch/temp"; expect temperature-probe
healthy; printf '99999999999999999999999\n' >"$scratch/temp"; expect temperature-probe
healthy; rm "$scratch/temp"; expect temperature-probe
healthy; mock_flags=invalid; expect throttle-probe
printf 'PASS: %s resource threshold/probe cases\n' "$checks"
