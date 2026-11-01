#!/usr/bin/env bash
# Jarda on a fresh Ubuntu 24.04 server at any cloud (AWS Lightsail/EC2, Contabo, Hetzner, ...),
# one command as root or with sudo, after adding your SSH key:
#
#   curl -fsSL https://raw.githubusercontent.com/AbdelrhmanAh7/Mizano/master/deploy/vps/install.sh \
#     | sudo bash -s -- --domain example.com --email you@example.com
#
# Installs Docker, locks the server down (SSH keys only, firewall 22/80/443), builds and starts
# the stack behind Caddy (HTTPS for jarda.<domain> and jarda-api.<domain>), and turns on nightly
# encrypted backups and health checks. Run it again to update: data and secrets are kept, and a
# backup is taken before the new version starts.
#
# Options:
#   --domain D        company domain; hosts default to jarda.D and jarda-api.D (first run)
#   --email E         contact email for the free Let's Encrypt certificates (first run)
#   --web-host H      override the app hostname       --api-host H   override the API hostname
#   --ref R           git branch or tag to deploy (default master)
#   --admin-user U    sudo user that gets root's SSH keys (default jarda)
set -euo pipefail

REPO_URL="${JARDA_REPO_URL:-https://github.com/AbdelrhmanAh7/Mizano.git}"
REF="master"
APP_DIR=/opt/jarda
DATA_DIR=/srv/jarda
CONF_DIR=/etc/jarda
ENV_FILE="$CONF_DIR/jarda.env"
ADMIN_USER="jarda"
RESTIC_VERSION=0.19.1
domain="" email="" web_host="" api_host=""

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) domain="${2:-}"; shift 2 ;;
    --email) email="${2:-}"; shift 2 ;;
    --web-host) web_host="${2:-}"; shift 2 ;;
    --api-host) api_host="${2:-}"; shift 2 ;;
    --ref) REF="${2:-}"; shift 2 ;;
    --admin-user) ADMIN_USER="${2:-}"; shift 2 ;;
    -h | --help) sed -n '2,21p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "run as root (sudo)"
# shellcheck source=/dev/null
. /etc/os-release
[ "${ID:-}" = ubuntu ] || die "this kit targets Ubuntu 24.04 (found ${PRETTY_NAME:-unknown})"
[ "${VERSION_ID:-}" = "24.04" ] || say "warning: tested on Ubuntu 24.04, found $VERSION_ID"
arch="$(dpkg --print-architecture)"
case "$arch" in amd64 | arm64) ;; *) die "unsupported CPU architecture $arch" ;; esac
[[ "$ADMIN_USER" =~ ^[a-z][a-z0-9_-]{0,30}$ ]] || die "invalid --admin-user"
host_re='^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'

env_get() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 || true; }
if [ -n "$domain" ]; then
  web_host="${web_host:-jarda.$domain}"
  api_host="${api_host:-jarda-api.$domain}"
fi
web_host="${web_host:-$(env_get JARDA_WEB_HOST)}"
api_host="${api_host:-$(env_get JARDA_API_HOST)}"
email="${email:-$(env_get ACME_EMAIL)}"
[ -n "$web_host" ] && [ -n "$api_host" ] || die "first run needs --domain (or --web-host and --api-host)"
[[ "$web_host" =~ $host_re ]] && [[ "$api_host" =~ $host_re ]] || die "invalid hostname"
[[ "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "first run needs --email"

# ---------------------------------------------------------------- base packages
say "Updating the system and installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q ca-certificates curl git ufw python3 bzip2 openssl unattended-upgrades
# Security updates install themselves every night (Ubuntu's default policy, made explicit).
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' \
  >/etc/apt/apt.conf.d/20auto-upgrades

if ! swapon --show | grep -q .; then
  say "Adding a 4 GB swap file (helps the image build)"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

# ---------------------------------------------------------------- SSH: keys only
say "SSH: key login only"
keys=""
# Root's keys (Contabo, Hetzner) or the cloud's default user's keys (AWS Lightsail and EC2:
# `ubuntu`, which runs this script with sudo). Lines with forced commands are skipped.
key_files=(/root/.ssh/authorized_keys "/home/$ADMIN_USER/.ssh/authorized_keys")
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then
  key_files+=("$(getent passwd "$SUDO_USER" | cut -d: -f6)/.ssh/authorized_keys")
fi
for f in "${key_files[@]}"; do
  if [ -s "$f" ]; then keys="$keys$(grep -E '^(ssh-|ecdsa-|sk-)' "$f" || true)"$'\n'; fi
done
printf '%s' "$keys" | grep -qE '^(ssh-|ecdsa-|sk-)' \
  || die "no SSH public key found. Add your key when you create the server (or: ssh-copy-id root@<server-ip>), then run this again"
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos '' "$ADMIN_USER" >/dev/null
fi
usermod -aG sudo "$ADMIN_USER"
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
printf '%s' "$keys" | grep -E '^(ssh-|ecdsa-|sk-)' | sort -u >"/home/$ADMIN_USER/.ssh/authorized_keys"
chown "$ADMIN_USER:$ADMIN_USER" "/home/$ADMIN_USER/.ssh/authorized_keys"
chmod 600 "/home/$ADMIN_USER/.ssh/authorized_keys"
# The admin user has no password (key login only), so sudo must not ask for one.
echo "$ADMIN_USER ALL=(ALL) NOPASSWD:ALL" >"/etc/sudoers.d/90-$ADMIN_USER"
chmod 440 "/etc/sudoers.d/90-$ADMIN_USER"
visudo -cf "/etc/sudoers.d/90-$ADMIN_USER" >/dev/null || die "sudoers check failed"
# 00- sorts before cloud-init's 50-cloud-init.conf; sshd keeps the first value it reads.
cat >/etc/ssh/sshd_config.d/00-jarda.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
PermitEmptyPasswords no
MaxAuthTries 4
X11Forwarding no
SSHD
sshd -t || die "sshd configuration check failed"
sshd -T 2>/dev/null | grep -qx 'passwordauthentication no' || die "password login is still enabled"
systemctl reload ssh 2>/dev/null || systemctl restart ssh

# ---------------------------------------------------------------- firewall
say "Firewall: only 22, 80 and 443 open"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null

# ---------------------------------------------------------------- Docker
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  say "Installing Docker from Docker's own repository"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$arch signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
if [ ! -f /etc/docker/daemon.json ]; then
  # Log rotation for every container; containers keep running while Docker itself upgrades.
  install -d /etc/docker
  printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "10m", "max-file": "5" },\n  "live-restore": true\n}\n' \
    >/etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker >/dev/null
usermod -aG docker "$ADMIN_USER"
install -d /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=500M\n' >/etc/systemd/journald.conf.d/jarda.conf
systemctl restart systemd-journald

# ---------------------------------------------------------------- restic (backups)
if ! restic backup --help 2>/dev/null | grep -q -- --stdin-from-command; then
  say "Installing restic $RESTIC_VERSION (Ubuntu's package is too old)"
  tmp="$(mktemp -d)"
  base="https://github.com/restic/restic/releases/download/v$RESTIC_VERSION"
  file="restic_${RESTIC_VERSION}_linux_${arch}.bz2"
  curl -fsSL -o "$tmp/$file" "$base/$file"
  curl -fsSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS"
  (cd "$tmp" && grep " $file\$" SHA256SUMS | sha256sum -c --quiet -) || die "restic checksum mismatch"
  bunzip2 -c "$tmp/$file" >/usr/local/bin/restic
  chmod 755 /usr/local/bin/restic
  rm -rf "$tmp"
fi

# ---------------------------------------------------------------- code
say "Getting Jarda ($REF)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q --depth 1 origin "$REF"
  git -C "$APP_DIR" checkout -q --force --detach FETCH_HEAD
else
  git clone -q --depth 1 --branch "$REF" "$REPO_URL" "$APP_DIR"
fi
sha="$(git -C "$APP_DIR" rev-parse --short=12 HEAD)"

# ---------------------------------------------------------------- secrets and settings
say "Settings in $ENV_FILE (secrets are generated once and never printed)"
install -d -m 700 "$CONF_DIR"
# Slots for other products on this server (FlowLine): compose files, HTTPS sites, backup hooks.
install -d -m 755 "$CONF_DIR/compose.d" "$CONF_DIR/caddy-sites"
install -d -m 700 "$CONF_DIR/backup.d"
install -d -m 755 "$DATA_DIR"
install -d -m 700 "$DATA_DIR/backups" "$DATA_DIR/monitor" "$DATA_DIR/caddy" "$DATA_DIR/redis"
install -d -m 700 -o 1001 -g 1001 "$DATA_DIR/originals"
rnd() { openssl rand -hex "$1"; }
if [ ! -f "$ENV_FILE" ]; then
  pg_pw="$(rnd 24)"
  (
    umask 077
    cat >"$ENV_FILE" <<ENV
# Jarda server settings. Generated by install.sh on $(date -u +%Y-%m-%d). Never commit or share.
JARDA_WEB_HOST=$web_host
JARDA_API_HOST=$api_host
ACME_EMAIL=$email
MIZANO_DATA_DIR=$DATA_DIR
POSTGRES_USER=jarda
POSTGRES_PASSWORD=$pg_pw
POSTGRES_DB=jarda
DATABASE_URL=postgresql://jarda:$pg_pw@postgres:5432/jarda
REDIS_URL=redis://redis:6379
JWT_SECRET=$(rnd 48)
JWT_REFRESH_SECRET=$(rnd 48)
NEXTAUTH_SECRET=$(rnd 48)
INTEGRATIONS_ENCRYPTION_KEY=$(rnd 32)
NEXTAUTH_URL=https://$web_host
CORS_ORIGIN=https://$web_host
PUBLIC_API_URL=https://$api_host/api
# Backups: encrypted restic repository on this server; the R2 copy is set in r2.env.
RESTIC_REPOSITORY=$DATA_DIR/backups/restic
RESTIC_PASSWORD_FILE=$CONF_DIR/restic-password
BACKUP_SET=jarda
BACKUP_HOST=jarda-vps
BACKUP_RETENTION_DAYS=7
# Optional alerts (Telegram): TELEGRAM_BOT_TOKEN= and TELEGRAM_ALERT_CHAT_ID=
ENV
  )
else
  # Re-runs may change the hostnames or email; every secret stays as it is.
  tmp="$(mktemp "$ENV_FILE.XXXXXX")"
  grep -vE '^(JARDA_WEB_HOST|JARDA_API_HOST|ACME_EMAIL|NEXTAUTH_URL|CORS_ORIGIN|PUBLIC_API_URL)=' "$ENV_FILE" >"$tmp" || true
  printf 'JARDA_WEB_HOST=%s\nJARDA_API_HOST=%s\nACME_EMAIL=%s\nNEXTAUTH_URL=https://%s\nCORS_ORIGIN=https://%s\nPUBLIC_API_URL=https://%s/api\n' \
    "$web_host" "$api_host" "$email" "$web_host" "$web_host" "$api_host" >>"$tmp"
  chmod 600 "$tmp" && mv "$tmp" "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"
new_password=0
if [ ! -f "$CONF_DIR/restic-password" ]; then
  (umask 077 && rnd 32 >"$CONF_DIR/restic-password")
  new_password=1
fi
chmod 600 "$CONF_DIR/restic-password"
if [ ! -f "$CONF_DIR/r2.env" ]; then
  (
    umask 077
    cat >"$CONF_DIR/r2.env" <<'R2'
# Off-site copy of the nightly backup to Cloudflare R2 (free tier: 10 GB). Off until filled in.
# 1. Cloudflare dashboard -> R2 -> Create bucket "jarda-backups".
# 2. R2 -> Manage API tokens -> Create token with "Object Read & Write" on that bucket only.
# 3. Fill these three lines, set R2_ENABLED=1, then test: sudo /opt/jarda/deploy/vps/scripts/backup.sh
R2_ENABLED=0
R2_REPOSITORY=s3:https://<ACCOUNT_ID>.r2.cloudflarestorage.com/jarda-backups/restic
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_RETENTION_DAYS=30
R2
  )
fi

# ---------------------------------------------------------------- build
say "Building the app images for $web_host (about 10 minutes the first time)"
cd "$APP_DIR"
build_log=/var/log/jarda-build.log
{
  docker build --progress=plain -t "jarda-api:$sha" -f apps/api/Dockerfile . &&
    docker build --progress=plain -t "jarda-web:$sha" -f apps/web/Dockerfile \
      --build-arg "NEXT_PUBLIC_API_URL=https://$api_host/api" \
      --build-arg "NEXT_PUBLIC_APP_URL=https://$web_host" .
} >"$build_log" 2>&1 || { tail -n 30 "$build_log" >&2; die "image build failed (full log: $build_log)"; }

compose() { "$APP_DIR/deploy/vps/scripts/compose.sh" "$@"; }
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
if ! restic -r "$RESTIC_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" cat config >/dev/null 2>&1; then
  restic -r "$RESTIC_REPOSITORY" --password-file "$RESTIC_PASSWORD_FILE" init >/dev/null
elif [ -n "${MIZANO_API_IMAGE:-}" ] && compose ps -q postgres 2>/dev/null | grep -q .; then
  say "Backing up before the update"
  "$APP_DIR/deploy/vps/scripts/backup.sh"
fi

# Record the new images in the env file (the shared helper rewrites only these three keys).
tmp="$(mktemp "$ENV_FILE.XXXXXX")"
grep -vE '^(MIZANO_API_IMAGE|MIZANO_WEB_IMAGE|MIZANO_DEPLOYED_SHA)=' "$ENV_FILE" >"$tmp" || true
printf 'MIZANO_API_IMAGE=jarda-api:%s\nMIZANO_WEB_IMAGE=jarda-web:%s\nMIZANO_DEPLOYED_SHA=%s\n' "$sha" "$sha" "$sha" >>"$tmp"
chmod 600 "$tmp" && mv "$tmp" "$ENV_FILE"

# ---------------------------------------------------------------- start + services
say "Starting Jarda"
install -m 644 "$APP_DIR"/deploy/vps/systemd/*.service "$APP_DIR"/deploy/vps/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable jarda-stack.service >/dev/null
systemctl restart jarda-stack.service
systemctl enable --now jarda-backup.timer jarda-healthcheck.timer >/dev/null

ok=0
for _ in $(seq 1 60); do
  healthy=0
  for svc in api web worker; do
    cid="$(compose ps -q "$svc" 2>/dev/null || true)"
    status=""
    if [ -n "$cid" ]; then status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"; fi
    if [ "$status" = healthy ]; then healthy=$((healthy + 1)); fi
  done
  if [ "$healthy" -eq 3 ]; then ok=1; break; fi
  sleep 5
done
[ "$ok" -eq 1 ] || die "the app did not become healthy; see: sudo $APP_DIR/deploy/vps/scripts/compose.sh logs --tail 100"
# Old images of earlier versions (keeps the two running tags and the build cache).
docker image prune -f >/dev/null || true

public_ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo '<server-ip>')"
if curl -fsS --max-time 20 -o /dev/null "https://$web_host/robots.txt" 2>/dev/null; then
  https_state="HTTPS works: https://$web_host"
else
  https_state="HTTPS not reachable yet. Add DNS A records $web_host and $api_host -> $public_ip (Cloudflare: 'DNS only', grey cloud); Caddy gets the certificates by itself within minutes."
fi

say "Done. Jarda $sha is running."
cat <<SUMMARY
  App:      https://$web_host
  API:      https://$api_host/api/health
  $https_state
  Backups:  nightly 02:30 Cairo, encrypted, kept 7 days in $DATA_DIR/backups
            off-site copy to Cloudflare R2: fill $CONF_DIR/r2.env (off until then)
  Restore:  sudo $APP_DIR/deploy/vps/scripts/restore.sh --list
  Update:   run this same command again
  SSH:      key login only; user '$ADMIN_USER' (sudo) and root with your key
SUMMARY
if [ "$new_password" -eq 1 ]; then
  cat <<NOTICE

  IMPORTANT: the backup password was just created in $CONF_DIR/restic-password.
  Copy it into your password manager now (sudo cat $CONF_DIR/restic-password).
  Without it no backup can ever be read, including the copy in R2.
NOTICE
fi
