# shellcheck shell=bash
# Sourced by deploy/pi/scripts/healthcheck.sh on the VPS: adds HTTPS certificate checks to
# "problems". Caddy renews certificates by itself about 30 days before they expire, so a
# certificate with fewer than CERT_MIN_DAYS left (default 14) means renewal is failing.
cert_min_days="${CERT_MIN_DAYS:-14}"
cert_port="${CADDY_HTTPS_PORT:-443}"
cert_hosts=("${JARDA_WEB_HOST:-}" "${JARDA_API_HOST:-}")
# Other products' sites on this server (first line "host {" in each site file).
for site in "${JARDA_CADDY_SITES_DIR:-/etc/jarda/caddy-sites}"/*.caddy; do
  [ -r "$site" ] || continue
  while IFS= read -r h; do cert_hosts+=("$h"); done < <(
    sed -nE 's/^([a-z0-9.-]+\.[a-z]{2,})[[:space:]]*\{.*$/\1/p' "$site" || true
  )
done
for h in "${cert_hosts[@]}"; do
  [ -n "$h" ] || continue
  end="$(echo | timeout 15 openssl s_client -connect "127.0.0.1:$cert_port" -servername "$h" 2>/dev/null |
    openssl x509 -noout -enddate 2>/dev/null | sed -n 's/^notAfter=//p' || true)"
  if [ -z "$end" ]; then
    problems+=("cert-$h|no HTTPS certificate served for $h")
    continue
  fi
  days=$((($(date -d "$end" +%s) - $(date +%s)) / 86400))
  [ "$days" -ge "$cert_min_days" ] || problems+=("cert-$h|HTTPS certificate for $h expires in $days days")
done
