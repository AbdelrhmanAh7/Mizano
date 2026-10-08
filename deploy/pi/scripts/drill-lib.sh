#!/usr/bin/env bash
# Restore-drill helpers, sourced by restore-drill.sh and its offline tests.
# shellcheck shell=bash

sha256_of() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1
}

stamp_to_epoch() {
  local s="$1"
  local iso="${s:0:4}-${s:4:2}-${s:6:2}T${s:9:2}:${s:11:2}:${s:13:2}Z"
  local ep
  if ep="$(date -u -d "$iso" +%s 2>/dev/null)"; then
    echo "$ep"
  elif ep="$(date -j -u -f "%Y%m%dT%H%M%SZ" "$s" +%s 2>/dev/null)"; then
    echo "$ep"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import sys, datetime; print(int(datetime.datetime.strptime(sys.argv[1], '%Y%m%dT%H%M%SZ').replace(tzinfo=datetime.timezone.utc).timestamp()))" "$s"
  elif command -v node >/dev/null 2>&1; then
    node -e "console.log(Math.floor(Date.parse(process.argv[1])/1000))" "$iso"
  else
    echo "DRILL FAILED: cannot parse timestamp" >&2
    return 1
  fi
}

# Print the newest db backup in $1; fail if none, or older than $2 hours (0 = any age).
# Validates the creation timestamp encoded in the filename (db-<stamp>.dump.age)
# rather than mutable filesystem mtime.
pick_backup() {
  local latest
  latest="$(find "$1" -maxdepth 1 -name 'db-*.dump.age' | sort | tail -n 1)"
  [ -n "$latest" ] || { echo "DRILL FAILED: no backup found" >&2; return 1; }
  if [ "$2" -gt 0 ]; then
    local fname stamp b_epoch now_epoch max_sec age_sec
    fname="$(basename "$latest")"
    stamp="${fname#db-}"
    stamp="${stamp%.dump.age}"
    if [[ ! "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
      echo "DRILL FAILED: invalid backup timestamp format: $fname" >&2
      return 1
    fi
    b_epoch="$(stamp_to_epoch "$stamp")" || return 1
    now_epoch="$(date -u +%s)"
    max_sec=$(($2 * 3600))
    age_sec=$((now_epoch - b_epoch))
    if [ "$age_sec" -gt "$max_sec" ]; then
      echo "DRILL FAILED: latest backup is older than $2h" >&2
      return 1
    fi
  fi
  printf '%s\n' "$latest"
}

# Read "<storageKey> <sha256>" lines on stdin. Each original must exist under
# $1/originals with that checksum. Prints the number checked.
verify_originals() {
  local key sum n=0
  while read -r key sum; do
    [ -n "$key" ] || continue
    case "/$key/" in
      */../* | //*) echo "DRILL FAILED: invalid storage key" >&2 && return 1 ;;
    esac
    [ -f "$1/originals/$key" ] || { echo "DRILL FAILED: original missing for an intake job" >&2; return 1; }
    [ "$(sha256_of "$1/originals/$key")" = "$sum" ] || { echo "DRILL FAILED: original checksum mismatch" >&2; return 1; }
    n=$((n + 1))
  done
  echo "$n"
}
