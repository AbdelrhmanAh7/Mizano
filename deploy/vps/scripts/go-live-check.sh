#!/usr/bin/env bash
# pass() always succeeds, so "check && pass || fail" is a safe if/else here.
# shellcheck disable=SC2015
# Read-only go-live check: prints PASS / FAIL / NOTE per item and exits 1 if anything FAILs.
#   sudo /opt/jarda/deploy/vps/scripts/go-live-check.sh [extra-host ...]
# Extra hosts (e.g. flowline.<domain>) get the same DNS and HTTPS checks. It changes nothing;
# the scenarios that do (reboot, crash, rollback, restore) are in docs/GO-LIVE.md.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/vps/scripts/env.sh
. "$here/env.sh"
fails=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails + 1)); }
note() { printf 'NOTE  %s\n' "$*"; }

echo "Go-live check $(date -u +%Y-%m-%dT%H:%M:%SZ) on $(hostname), version ${MIZANO_DEPLOYED_SHA:-unknown}"
public_ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
hosts=("$JARDA_WEB_HOST" "$JARDA_API_HOST" "$@")

for h in "${hosts[@]}"; do
  ips="$(getent ahostsv4 "$h" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
  if [ -n "$public_ip" ] && [[ " $ips" == *" $public_ip "* ]]; then pass "DNS $h -> $public_ip"; else fail "DNS $h -> '${ips% }' (server is ${public_ip:-unknown})"; fi
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "http://$h/" 2>/dev/null || true)"
  case "$code" in 301 | 302 | 307 | 308) pass "http://$h redirects to HTTPS ($code)" ;; *) fail "http://$h answered '$code', expected a redirect" ;; esac
  end="$(echo | timeout 15 openssl s_client -connect "$h:443" -servername "$h" -verify_return_error 2>/dev/null |
    openssl x509 -noout -enddate 2>/dev/null | sed -n 's/^notAfter=//p' || true)"
  if [ -n "$end" ]; then
    days=$((($(date -d "$end" +%s) - $(date +%s)) / 86400))
    if [ "$days" -ge "${CERT_MIN_DAYS:-14}" ]; then
      pass "HTTPS $h trusted certificate, $days days left (Caddy renews at about 30)"
    else
      fail "HTTPS $h certificate has only $days days left: renewal is failing (journalctl / compose logs caddy)"
    fi
  else
    fail "HTTPS $h no trusted certificate"
  fi
done
curl -fsS --max-time 15 -o /dev/null "https://$JARDA_WEB_HOST/robots.txt" && pass "web answers on https://$JARDA_WEB_HOST" || fail "web not answering"
curl -fsS --max-time 15 -o /dev/null "https://$JARDA_API_HOST/api/health" && pass "api health on https://$JARDA_API_HOST/api/health" || fail "api health failing"

for svc in postgres redis api worker web caddy; do
  cid="$(dc ps -q "$svc" 2>/dev/null || true)"
  if [ -z "$cid" ]; then fail "container $svc not running"; continue; fi
  read -r state health policy < <(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}} {{.HostConfig.RestartPolicy.Name}}' "$cid")
  if [ "$state" = running ] && { [ "$health" = healthy ] || [ "$health" = - ]; } && [ "$policy" = unless-stopped ]; then
    pass "container $svc $state/$health, restarts by itself ($policy)"
  else
    fail "container $svc state=$state health=$health restart=$policy"
  fi
done
published="$(docker ps --format '{{.Names}} {{.Ports}}' | grep -E '0\.0\.0\.0:|\[::\]:' | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
[[ "${published% }" =~ ^[a-z0-9_-]*caddy[a-z0-9_-]*$ ]] && pass "only Caddy is reachable from outside (${published% })" || fail "containers reachable from outside: ${published:-none}"

for unit in docker.service jarda-stack.service jarda-backup.timer jarda-healthcheck.timer; do
  [ "$(systemctl is-enabled "$unit" 2>/dev/null)" = enabled ] && pass "$unit starts at boot" || fail "$unit not enabled"
done
systemctl is-active --quiet jarda-backup.timer && pass "nightly backup timer next: $(systemctl show jarda-backup.timer -p NextElapseUSecRealtime --value)" || fail "backup timer not active"

ufw_rules="$(ufw status 2>/dev/null || true)"
if grep -q '^Status: active' <<<"$ufw_rules"; then
  open="$(grep -E 'ALLOW' <<<"$ufw_rules" | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"
  pass "firewall on, open: ${open% }"
else
  fail "firewall off"
fi
sshd -T 2>/dev/null | grep -qx 'passwordauthentication no' && pass "SSH: keys only (password login off)" || fail "SSH password login is on"

bstatus="$DATA_DIR/backups/backup.status"
if [ -f "$bstatus" ] && grep -q '^OK' "$bstatus"; then
  age_h=$((($(date +%s) - $(stat -c %Y "$bstatus")) / 3600))
  if [ "$age_h" -le 26 ]; then pass "last backup OK, $age_h h ago"; else fail "last backup is $age_h h old (nightly timer not running?)"; fi
else
  fail "no successful backup yet ($bstatus)"
fi
snaps="$(restic -r "$RESTIC_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" snapshots --json 2>/dev/null | python3 -c 'import json,sys; print(len(json.load(sys.stdin) or []))' 2>/dev/null || echo 0)"
note "local encrypted snapshots: $snaps (kept ${BACKUP_RETENTION_DAYS:-7} days)"
if [ -f /etc/jarda/r2.env ] && grep -q '^R2_ENABLED=1' /etc/jarda/r2.env; then note "off-site copy to Cloudflare R2: on"; else note "off-site copy to Cloudflare R2: off (fill /etc/jarda/r2.env)"; fi

if [ -n "${MAIL_SMTP_HOST:-}" ] && [ -n "${MAIL_FROM:-}" ]; then
  pass "email set up: $MAIL_SMTP_HOST as $MAIL_FROM"
else
  note "email not set up: password-reset and invoice emails are not sent (README section 5)"
fi
used="$(df --output=pcent "$DATA_DIR" | tail -n 1 | tr -dc '0-9')"
avail_mb="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
[ "$used" -le 80 ] && pass "disk ${used}% used (alert above 80%)" || fail "disk ${used}% used"
[ "$avail_mb" -ge 300 ] && pass "memory ${avail_mb} MB available (alert below 300 MB)" || fail "memory ${avail_mb} MB available"
last_hc="$(systemctl show jarda-healthcheck.service -p ExecMainStatus --value 2>/dev/null || true)"
note "last health check exit=${last_hc:-?} (0 healthy, 1 alerted); alerts: journalctl -t jarda-alert"

echo "Result: $([ "$fails" -eq 0 ] && echo 'ALL PASS' || echo "$fails FAIL")"
[ "$fails" -eq 0 ]
