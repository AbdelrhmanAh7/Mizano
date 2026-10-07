#!/usr/bin/env bash
# Summarise the soak samples for the issue evidence. Usage: soak-report.sh [samples.tsv]
# Verdict:
#   FAIL        any OOM kill (kernel counter or container cgroup), a container restart,
#               a sample where a service is not healthy (unhealthy, starting, stopped
#               or missing), or a service with no row in some sample
#   SWAP-THRASH average swap-in above SWAP_IN_MAX_PER_SEC pages/s (default 10)
#   INCOMPLETE  no failure, but the window is shorter than SOAK_HOURS (default 24), fewer
#               than 90% of the expected one-per-minute samples exist, or a service has a
#               sample whose cgroup memory metrics could not be read (`na`): 0 MB and no
#               OOM counter is missing evidence, not a healthy budget
#   PASS        otherwise
# Every service in SOAK_SERVICES (default: STACK_SERVICES from lib.sh) needs one row per
# sample. A reboot inside the window resets the kernel counters; run the reboot test
# separately.
set -euo pipefail

tsv="${1:-}"
if [ -z "$tsv" ]; then
  # shellcheck source=deploy/pi/scripts/lib.sh
  . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
  tsv="$DATA_DIR/soak/samples.tsv"
  services="${SOAK_SERVICES:-${STACK_SERVICES[*]}}"
else
  # Standalone use on a copied samples.tsv; keep this default equal to STACK_SERVICES.
  services="${SOAK_SERVICES:-postgres redis api worker web cloudflared}"
fi
[ -s "$tsv" ] || { echo "no samples in $tsv" >&2; exit 1; }

awk -F'\t' -v hours="${SOAK_HOURS:-24}" -v swap_max="${SWAP_IN_MAX_PER_SEC:-10}" -v services="$services" '
function num(v) { return v ~ /^[0-9]+$/ }
BEGIN { nexp = split(services, expected, " ") }
$1 == "host" {
  n++
  if (n == 1) { t0 = $2; iso0 = $3; in0 = $7; out0 = $8; oom0 = $9; minavail = $5 }
  t1 = $2; iso1 = $3; in1 = $7; out1 = $8; oom1 = $9; total = $4
  if ($5 < minavail) minavail = $5
  if ($6 > maxswap) maxswap = $6
}
$1 == "ctr" {
  s = $4
  # ctr fields: 4 service, 5 cur, 6 peak, 7 limit, 8 cgroup oom_kill, 9 restarts, 10 health
  if (!(s in seen)) { seen[s] = 1; order[++ns] = s; c0[s] = $8 }
  cnt[s]++
  # A running container must have readable cgroup numbers; otherwise the sample proves nothing.
  if ($10 == "healthy" || $10 == "none") { if (!num($5) || !num($6) || !num($7) || !num($8)) unread[s]++ }
  if (num($5) && $5 > cur[s]) cur[s] = $5
  if (num($6) && $6 > peak[s]) peak[s] = $6
  if (num($7)) lim[s] = $7
  # The cgroup counter restarts at 0 with the container; count only increases.
  if (num($8)) { if (num(c0[s]) && $8 > c0[s]) cgoom[s] += $8 - c0[s]; c0[s] = $8 }
  # Docker restart count ("na" while the container is missing).
  if (num($9)) { if (!(s in r0)) r0[s] = $9; if ($9 > r1[s]) r1[s] = $9 }
  # Anything but healthy (or a running container without a health check) is a failure.
  if ($10 != "healthy" && $10 != "none") bad[s]++
}
END {
  secs = t1 - t0
  printf "window      %s -> %s (%.1f h, %d host samples)\n", iso0, iso1, secs / 3600, n
  printf "host        MemTotal %d MB, min MemAvailable %d MB, max swap used %d MB\n", total, minavail, maxswap
  swapin = in1 - in0; swapout = out1 - out0; ooms = oom1 - oom0
  rate = secs > 0 ? swapin / secs : 0
  printf "swap        %d pages in, %d pages out (%.2f pages/s in)\n", swapin, swapout, rate
  printf "oom_kill    %d (kernel counter delta)\n", ooms
  fail = (ooms > 0)
  # An expected service with no row at all is listed too, with every sample as a gap.
  for (i = 1; i <= nexp; i++) if (!(expected[i] in seen)) { seen[expected[i]] = 1; order[++ns] = expected[i] }
  printf "\n%-12s %10s %10s %10s %8s %9s %9s %9s %9s\n", "service", "max_cur", "peak", "limit", "peak%", "restarts", "unhealthy", "gaps", "unread"
  for (i = 1; i <= ns; i++) {
    s = order[i]
    p = peak[s] > 0 ? peak[s] : cur[s]
    pct = lim[s] > 0 ? 100 * p / lim[s] : 0
    rs = r1[s] - r0[s]
    gaps = n - cnt[s]
    if (rs > 0 || cgoom[s] > 0 || bad[s] > 0 || gaps > 0) fail = 1
    if (unread[s] > 0) incomplete = 1
    printf "%-12s %8sMB %8sMB %8sMB %7.0f%% %9d %9d %9d %9d\n", s, cur[s] + 0, peak[s] + 0, lim[s] + 0, pct, rs, bad[s] + 0, gaps, unread[s] + 0
    if (cgoom[s] > 0) printf "  %s: %d cgroup OOM kill(s)\n", s, cgoom[s]
    if (bad[s] > 0) printf "  %s: not healthy in %d sample(s)\n", s, bad[s]
    if (gaps > 0) printf "  %s: no row in %d sample(s)\n", s, gaps
    if (unread[s] > 0) printf "  %s: unreadable cgroup metrics in %d sample(s) (no memory evidence)\n", s, unread[s]
  }
  expected_samples = (hours * 3600) / 60
  if (secs < hours * 3600 || n < expected_samples * 0.9) incomplete = 1
  verdict = fail ? "FAIL" : (rate > swap_max ? "SWAP-THRASH" : (incomplete ? "INCOMPLETE" : "PASS"))
  printf "\nverdict     %s\n", verdict
  exit (verdict == "PASS" ? 0 : 1)
}' "$tsv"
