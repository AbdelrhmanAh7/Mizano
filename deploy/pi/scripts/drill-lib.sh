#!/usr/bin/env bash
# Restore-drill helpers, sourced by restore-drill.sh and its offline tests.
# shellcheck shell=bash

sha256_of() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1
}

# Print the newest db backup in $1; fail if none, or older than $2 hours (0 = any age).
pick_backup() {
  local latest
  latest="$(find "$1" -maxdepth 1 -name 'db-*.dump.age' | sort | tail -n 1)"
  [ -n "$latest" ] || { echo "DRILL FAILED: no backup found" >&2; return 1; }
  if [ "$2" -gt 0 ] && [ -z "$(find "$latest" -mmin "-$(($2 * 60))")" ]; then
    echo "DRILL FAILED: latest backup is older than $2h" >&2
    return 1
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
