#!/usr/bin/env bash
# Host probes are separate from alert delivery so thresholds can be tested offline.
# shellcheck shell=bash
set -euo pipefail
check_resources() {
  local data_dir=$1 meminfo=$2 thermal=$3 used avail temp flags modified age
  used=$(df -P "$data_dir" 2>/dev/null | awk 'END {gsub(/%/, "", $5); print $5}') || used=''
  if [[ "$used" =~ ^[0-9]{1,3}$ ]] && [ "$used" -le 100 ]; then
    [ "$used" -le 80 ] || fail_check disk
  else unknown_check disk; fi
  avail=$(awk '/^MemAvailable:/ {print int($2/1024)}' "$meminfo" 2>/dev/null) || avail=''
  if [[ "$avail" =~ ^[0-9]{1,12}$ ]]; then
    [ "$avail" -ge 300 ] || fail_check memory
  else unknown_check memory; fi
  temp=''
  if [ -r "$thermal" ]; then read -r temp <"$thermal" || temp=''; fi
  if [[ "$temp" =~ ^[0-9]{1,7}$ ]]; then
    [ "$temp" -lt 80000 ] || fail_check temperature
  else unknown_check temperature; fi
  flags=$(vcgencmd get_throttled 2>/dev/null) || flags=''
  if [[ "$flags" =~ ^throttled=0x[0-9a-fA-F]{1,8}$ ]]; then
    [ "$(( ${flags#*=} & 15 ))" -eq 0 ] || fail_check throttle
  else unknown_check throttle; fi
  modified=$(stat -c %Y "$data_dir/backups/backup.status" 2>/dev/null) || modified=''
  if [[ "$modified" =~ ^[0-9]{1,12}$ ]] && grep -q '^OK ' "$data_dir/backups/backup.status"; then
    age=$(($(date +%s) - modified))
    [ "$age" -ge 0 ] && [ "$age" -le 93600 ] || fail_check backup
  else fail_check backup; fi
}
