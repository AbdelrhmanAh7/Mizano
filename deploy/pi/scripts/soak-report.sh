#!/usr/bin/env bash
# Summarise the soak samples for the issue evidence. Usage: soak-report.sh [samples.tsv]
# Verdict:
#   FAIL        any OOM kill (kernel counter or container cgroup) or a container restart
#   SWAP-THRASH average swap-in above SWAP_IN_MAX_PER_SEC pages/s (default 10)
#   INCOMPLETE  no failure, but the window is shorter than SOAK_HOURS (default 24)
#   PASS        otherwise
# A reboot inside the window resets the kernel counters; run the reboot test separately.
set -euo pipefail

tsv="${1:-}"
if [ -z "$tsv" ]; then
  # shellcheck source=deploy/pi/scripts/lib.sh
  . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
  tsv="$DATA_DIR/soak/samples.tsv"
fi
[ -s "$tsv" ] || { echo "no samples in $tsv" >&2; exit 1; }

awk -F'\t' -v hours="${SOAK_HOURS:-24}" -v swap_max="${SWAP_IN_MAX_PER_SEC:-10}" '
function num(v) { return v ~ /^[0-9]+$/ }
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
  if (!(s in seen)) { seen[s] = 1; order[++ns] = s; r0[s] = $9; r1[s] = $9; c0[s] = $8 }
  if (num($5) && $5 > cur[s]) cur[s] = $5
  if (num($6) && $6 > peak[s]) peak[s] = $6
  if (num($7)) lim[s] = $7
  # The cgroup counter restarts at 0 with the container; count only increases.
  if (num($8)) { if (num(c0[s]) && $8 > c0[s]) cgoom[s] += $8 - c0[s]; c0[s] = $8 }
  if ($9 + 0 > r1[s]) r1[s] = $9 + 0
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
  printf "\n%-12s %10s %10s %10s %8s %9s %9s\n", "service", "max_cur", "peak", "limit", "peak%", "restarts", "unhealthy"
  fail = (ooms > 0)
  for (i = 1; i <= ns; i++) {
    s = order[i]
    p = peak[s] > 0 ? peak[s] : cur[s]
    pct = lim[s] > 0 ? 100 * p / lim[s] : 0
    rs = r1[s] - r0[s]
    if (rs > 0 || cgoom[s] > 0) fail = 1
    printf "%-12s %8sMB %8sMB %8sMB %7.0f%% %9d %9d\n", s, cur[s] + 0, peak[s] + 0, lim[s] + 0, pct, rs, bad[s] + 0
    if (cgoom[s] > 0) printf "  %s: %d cgroup OOM kill(s)\n", s, cgoom[s]
  }
  verdict = fail ? "FAIL" : (rate > swap_max ? "SWAP-THRASH" : (secs < hours * 3600 ? "INCOMPLETE" : "PASS"))
  printf "\nverdict     %s\n", verdict
  exit (verdict == "PASS" ? 0 : 1)
}' "$tsv"
