#!/usr/bin/env bash
# One resource sample for the 24h soak test (run every minute by mizano-soak.timer).
# Appends to $DATA_DIR/soak/:
#   samples.tsv  machine-readable lines for soak-report.sh
#   stats.log    raw `free -m` and `docker stats` output as human evidence
# Records only resource numbers and container names; no env values or document data.
set -euo pipefail
# shellcheck source=deploy/pi/scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

out="$DATA_DIR/soak"
assert_ssd || exit 1
mkdir -p "$out"
tsv="$out/samples.tsv"
now="$(date +%s)"
iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

vmstat_val() { awk -v k="$1" '$1 == k {print $2}' /proc/vmstat; }
meminfo_mb() { awk -v k="$1:" '$1 == k {print int($2 / 1024)}' /proc/meminfo; }

# host <epoch> <iso> <mem_total_mb> <mem_available_mb> <swap_used_mb> <pswpin> <pswpout> <oom_kill>
swap_used=$(($(meminfo_mb SwapTotal) - $(meminfo_mb SwapFree)))
printf 'host\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$now" "$iso" \
  "$(meminfo_mb MemTotal)" "$(meminfo_mb MemAvailable)" "$swap_used" \
  "$(vmstat_val pswpin)" "$(vmstat_val pswpout)" "$(vmstat_val oom_kill)" >>"$tsv"

# Container memory straight from its cgroup (v2; systemd or cgroupfs driver).
cgroup_dir() {
  local d
  for d in "/sys/fs/cgroup/system.slice/docker-$1.scope" "/sys/fs/cgroup/docker/$1"; do
    if [ -d "$d" ]; then
      printf '%s' "$d"
      return 0
    fi
  done
  return 1
}
bytes_mb() { # file -> MB, or "na"
  local v
  v="$(cat "$1" 2>/dev/null || true)"
  case "$v" in
    '' | max) printf 'na' ;;
    *) printf '%s' $((v / 1048576)) ;;
  esac
}

# ctr <epoch> <iso> <service> <mem_current_mb> <mem_peak_mb> <mem_limit_mb> <cgroup_oom_kills> <restarts> <health>
# One row per service in STACK_SERVICES every sample, so a service that stops or
# disappears shows up as a row instead of silently dropping out of the report.
# health: the container health (healthy|unhealthy|starting), none for a running
# container without a health check, missing when there is no container, otherwise the
# container state (exited, restarting, dead, created, paused).
for svc in "${STACK_SERVICES[@]}"; do
  cid="$(dc ps -a -q "$svc" 2>/dev/null | head -n 1 || true)"
  full="" restarts=na health=missing cur=na peak=na limit=na ooms=na
  if [ -n "$cid" ]; then
    info="$(docker inspect -f '{{.Id}} {{.RestartCount}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" 2>/dev/null || true)"
    if [ -n "$info" ]; then
      read -r full restarts state hstatus <<<"$info"
      if [ "$state" = "running" ]; then health="$hstatus"; else health="$state"; fi
    fi
  fi
  if [ -n "$full" ] && dir="$(cgroup_dir "$full")"; then
    cur="$(bytes_mb "$dir/memory.current")"
    peak="$(bytes_mb "$dir/memory.peak")"
    limit="$(bytes_mb "$dir/memory.max")"
    ooms="$(awk '$1 == "oom_kill" {print $2}' "$dir/memory.events" 2>/dev/null || true)"
    ooms="${ooms:-na}"
  fi
  printf 'ctr\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$now" "$iso" "$svc" "$cur" "$peak" "$limit" \
    "$ooms" "$restarts" "$health" >>"$tsv"
done

{
  printf '=== %s\n' "$iso"
  free -m
  ids="$(dc ps -q 2>/dev/null || true)"
  if [ -n "$ids" ]; then
    # shellcheck disable=SC2086 # one argument per container id
    docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}' $ids
  fi
} >>"$out/stats.log" 2>&1
