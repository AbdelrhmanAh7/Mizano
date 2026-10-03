#!/usr/bin/env bash
# Sourced by healthcheck and offline tests. Persist only delivered transitions.
# shellcheck shell=bash
set -euo pipefail
update_alert_state() {
  local state_dir=$1 state=$2 key next failed=0
  local -n messages=$3
  [ -f "$state" ] && [ -r "$state" ] || return 1
  # A damaged state file must never become notification text or fabricate recovery.
  if grep -qEv '^(api|web|gateway|tunnel|worker|queue|disk|memory|temperature|throttle|backup)(-probe)?$' "$state"; then
    return 1
  fi
  next=$(mktemp "$state_dir/active.XXXXXX") || return 1
  if ! chmod 600 "$next"; then rm -f "$next"; return 1; fi
  for key in "${!messages[@]}"; do
    if [ "${messages[$key]}" = unknown ]; then
      # Preserve only an already acknowledged incident during an outage of its
      # probe. The separate probe alert reports the loss of visibility.
      if grep -qxF "$key" "$state"; then
        if ! printf '%s\n' "$key" >>"$next"; then rm -f "$next"; return 1; fi
      fi
    elif grep -qxF "$key" "$state" || notify "ALERT: $key"; then
      if ! printf '%s\n' "$key" >>"$next"; then rm -f "$next"; return 1; fi
    else
      failed=1
    fi
  done
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    if [ -z "${messages[$key]:-}" ]; then
      if ! notify "RECOVERED: $key"; then
        if ! printf '%s\n' "$key" >>"$next"; then rm -f "$next"; return 1; fi
        failed=1
      fi
    fi
  done <"$state"
  if ! mv "$next" "$state"; then rm -f "$next"; return 1; fi
  return "$failed"
}
