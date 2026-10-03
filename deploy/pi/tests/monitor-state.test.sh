#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=deploy/pi/scripts/monitor-state.sh
. "$(dirname "${BASH_SOURCE[0]}")/../scripts/monitor-state.sh"
umask 077
state_dir=$(mktemp -d)
trap 'rm -rf "$state_dir"' EXIT
state="$state_dir/active-keys"
touch "$state"
delivered="$state_dir/delivered"
touch "$delivered"
send_ok=1
notify() { [ "$send_ok" = 1 ] || return 1; printf '%s\n' "$1" >>"$delivered"; }
declare -A now_msg=()
checks=0
assert_lines() { [ "$(wc -l <"$delivered")" -eq "$1" ]; checks=$((checks+1)); }
for key in api web gateway tunnel worker queue disk memory temperature throttle backup; do
  now_msg=(["$key"]=1)
  update_alert_state "$state_dir" "$state" now_msg
  assert_lines 1
  now_msg["$key"]=changed-value
  update_alert_state "$state_dir" "$state" now_msg
  assert_lines 1
  now_msg=()
  update_alert_state "$state_dir" "$state" now_msg
  assert_lines 2
  update_alert_state "$state_dir" "$state" now_msg
  assert_lines 2
  : >"$delivered"
done
now_msg=([api]=1)
send_ok=0
if update_alert_state "$state_dir" "$state" now_msg; then exit 1; fi
[ ! -s "$state" ]; assert_lines 0
send_ok=1
update_alert_state "$state_dir" "$state" now_msg
assert_lines 1
now_msg=()
[ "${#now_msg[@]}" -eq 0 ]
send_ok=0
if update_alert_state "$state_dir" "$state" now_msg; then exit 1; fi
grep -qx api "$state"; assert_lines 1
send_ok=1
update_alert_state "$state_dir" "$state" now_msg
[ ! -s "$state" ]; assert_lines 2
# Missing probes cannot manufacture resolution of an acknowledged incident.
for key in disk memory temperature throttle queue; do
  : >"$delivered"
  now_msg=(["$key"]=1)
  update_alert_state "$state_dir" "$state" now_msg
  now_msg=(["$key"]=unknown ["$key-probe"]=1)
  update_alert_state "$state_dir" "$state" now_msg
  update_alert_state "$state_dir" "$state" now_msg
  grep -qx "$key" "$state"
  assert_lines 2
  ! grep -qx "RECOVERED: $key" "$delivered"
  now_msg=()
  update_alert_state "$state_dir" "$state" now_msg
  assert_lines 4
  : >"$delivered"
  now_msg=(["$key"]=unknown ["$key-probe"]=1)
  update_alert_state "$state_dir" "$state" now_msg
  ! grep -qx "$key" "$state"
  assert_lines 1
  now_msg=()
  update_alert_state "$state_dir" "$state" now_msg
done
# State persistence errors must return failure even in an if/! context, where
# Bash disables errexit throughout this function.
mktemp() { return 1; }
if update_alert_state "$state_dir" "$state" now_msg; then exit 1; fi
unset -f mktemp
assert_lines 2
mv() { return 1; }
if update_alert_state "$state_dir" "$state" now_msg; then exit 1; fi
unset -f mv
assert_lines 2
printf 'unexpected-private-content\n' >"$state"
if update_alert_state "$state_dir" "$state" now_msg; then exit 1; fi
assert_lines 2
: >"$state"
if update_alert_state "$state_dir" "$state_dir/missing" now_msg; then exit 1; fi
assert_lines 2
printf 'PASS: %s transition assertions\n' "$checks"
