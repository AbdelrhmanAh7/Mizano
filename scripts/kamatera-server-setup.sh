#!/usr/bin/env bash
# ============================================
# Mizano ERP — Kamatera VPS Initial Setup
# ============================================
# Run this ONCE on a fresh Kamatera Ubuntu 22.04 LTS instance.
# Usage: sudo bash kamatera-server-setup.sh <YOUR_DOMAIN>
#
# Prerequisites:
#   - Kamatera VPS with Ubuntu 22.04 LTS
#   - Firewall: open ports 22, 80, 443 (Kamatera console)
#   - DNS A record pointing YOUR_DOMAIN to the VPS public IP
# ============================================

set -euo pipefail

DOMAIN="${1:?Usage: sudo bash kamatera-server-setup.sh <YOUR_DOMAIN>}"
APP_DIR="/opt/mizano"
DEPLOY_USER="deploy"

echo "=== Mizano ERP — Kamatera VPS Setup ==="
echo "Domain: ${DOMAIN}"
echo ""

# ------------------------------------------
# 1. System updates
# ------------------------------------------
echo "[1/9] Updating system packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git ufw software-properties-common fail2ban unattended-upgrades

# ------------------------------------------
# 2. Configure swap (important for 8GB RAM)
# ------------------------------------------
echo "[2/9] Configuring swap..."
if [ ! -f /swapfile ]; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # Tune swappiness for a server workload
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    echo "  4GB swap created"
else
    echo "  Swap already configured"
fi

# ------------------------------------------
# 3. Install Docker
# ------------------------------------------
echo "[3/9] Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install Docker Compose plugin if not present
if ! docker compose version &>/dev/null; then
    apt-get install -y docker-compose-plugin
fi

echo "Docker version: $(docker --version)"
echo "Compose version: $(docker compose version)"

# ------------------------------------------
# 4. Create deploy user
# ------------------------------------------
echo "[4/9] Creating deploy user..."
if ! id "${DEPLOY_USER}" &>/dev/null; then
    useradd -m -s /bin/bash "${DEPLOY_USER}"
    usermod -aG docker "${DEPLOY_USER}"

    # Allow deploy user to run docker commands without sudo
    echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/docker-compose" >> /etc/sudoers.d/deploy

    # Copy SSH authorized_keys from root to deploy user
    mkdir -p /home/${DEPLOY_USER}/.ssh
    if [ -f /root/.ssh/authorized_keys ]; then
        cp /root/.ssh/authorized_keys /home/${DEPLOY_USER}/.ssh/authorized_keys
    fi
    chown -R ${DEPLOY_USER}:${DEPLOY_USER} /home/${DEPLOY_USER}/.ssh
    chmod 700 /home/${DEPLOY_USER}/.ssh
    chmod 600 /home/${DEPLOY_USER}/.ssh/authorized_keys 2>/dev/null || true
    echo "  Deploy user created with SSH keys copied from root"
fi

# ------------------------------------------
# 5. Firewall (UFW)
# ------------------------------------------
echo "[5/9] Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "  Firewall enabled: SSH(22), HTTP(80), HTTPS(443)"

# ------------------------------------------
# 6. SSH hardening
# ------------------------------------------
echo "[6/9] Hardening SSH..."
# Disable root login and password auth
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?ChallengeResponseAuthentication.*/ChallengeResponseAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
echo "  SSH: root login disabled, password auth disabled"

# ------------------------------------------
# 7. Create application directory
# ------------------------------------------
echo "[7/9] Setting up application directory..."
mkdir -p "${APP_DIR}"
mkdir -p "${APP_DIR}/nginx"
mkdir -p "${APP_DIR}/backups"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"

# ------------------------------------------
# 8. Generate production .env
# ------------------------------------------
echo "[8/9] Generating production .env..."
ENV_FILE="${APP_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
    JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
    JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d '\n')
    NEXTAUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')
    POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n' | tr -d '/' | head -c 32)

    cat > "${ENV_FILE}" <<ENVEOF
# ============================================
# MIZANO ERP — Production (.env)
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Server: Kamatera VPS (Amsterdam)
# ============================================
APP_ENV=prod

# Database
POSTGRES_USER=mizano
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=mizano_db
DATABASE_URL=postgresql://mizano:${POSTGRES_PASSWORD}@postgres:5432/mizano_db?schema=public

# Redis
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# NextAuth
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=http://${DOMAIN}

# API
API_PORT=6001
NODE_ENV=production
CORS_ORIGIN=http://${DOMAIN}

# Frontend
NEXT_PUBLIC_API_URL=http://${DOMAIN}/api
NEXT_PUBLIC_APP_NAME=Mizano

# Rate Limiting
RATE_LIMIT_TTL=1000
RATE_LIMIT_MAX=30
RATE_LIMIT_AUTH_MAX=10

# Logging
LOG_LEVEL=warn

# Ollama AI (disabled by default — 8GB RAM is not enough for AI models + app)
# Enable if you add more RAM or offload Ollama to a separate server
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_ENABLED=false

# SMTP (configure before going live)
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=your-email
# SMTP_PASSWORD=your-password
# SMTP_FROM_EMAIL=noreply@${DOMAIN}
# SMTP_FROM_NAME=Mizano ERP
ENVEOF

    chmod 600 "${ENV_FILE}"
    chown "${DEPLOY_USER}:${DEPLOY_USER}" "${ENV_FILE}"
    echo "  .env created at ${ENV_FILE}"
    echo "  IMPORTANT: Edit SMTP settings before going live!"
else
    echo "  .env already exists, skipping."
fi

# ------------------------------------------
# 9. SSL certificate
# ------------------------------------------
echo "[9/9] Setting up SSL certificate..."
SSL_OK=false

# Create Docker volumes for certbot
docker volume create mizano_certbot_certs 2>/dev/null || true
docker volume create mizano_certbot_www 2>/dev/null || true

# Try Let's Encrypt first (may fail for xip.com / dynamic DNS domains)
if ! docker run --rm -v mizano_certbot_certs:/certs alpine test -d /certs/live/mizano 2>/dev/null; then
    echo "  Attempting Let's Encrypt certificate..."
    if docker run --rm \
        -v mizano_certbot_certs:/etc/letsencrypt \
        -v mizano_certbot_www:/var/www/certbot \
        -p 80:80 \
        certbot/certbot certonly \
        --standalone \
        --agree-tos \
        --no-eff-email \
        --cert-name mizano \
        -d "${DOMAIN}" \
        --email "admin@${DOMAIN}" 2>/dev/null; then
        echo "  Let's Encrypt certificate obtained for ${DOMAIN}"
        SSL_OK=true
    else
        echo "  Let's Encrypt failed (expected for xip.com domains)."
        echo "  Generating self-signed certificate instead..."
        docker run --rm -v mizano_certbot_certs:/etc/letsencrypt alpine sh -c "
            mkdir -p /etc/letsencrypt/live/mizano &&
            apk add --no-cache openssl &&
            openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
                -keyout /etc/letsencrypt/live/mizano/privkey.pem \
                -out /etc/letsencrypt/live/mizano/fullchain.pem \
                -subj '/CN=${DOMAIN}'
        "
        echo "  Self-signed certificate created for ${DOMAIN}"
        SSL_OK=true
    fi
else
    echo "  SSL certificate already exists."
    SSL_OK=true
fi

# ------------------------------------------
# Systemd service for auto-start
# ------------------------------------------
echo "Creating systemd service..."
cat > /etc/systemd/system/mizano.service <<SVCEOF
[Unit]
Description=Mizano ERP (Docker Compose)
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=${DEPLOY_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/docker compose -f docker-compose.production.yml --profile with-nginx up -d
ExecStop=/usr/bin/docker compose -f docker-compose.production.yml --profile with-nginx down
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable mizano.service

# ------------------------------------------
# Daily backup cron
# ------------------------------------------
echo "Setting up daily database backup..."
cat > /etc/cron.d/mizano-backup <<'CRONEOF'
# Mizano ERP — Daily PostgreSQL backup at 3 AM
0 3 * * * deploy docker exec mizano-postgres pg_dump -U mizano mizano_db | gzip > /opt/mizano/backups/mizano-$(date +\%Y\%m\%d).sql.gz
# Cleanup backups older than 30 days
0 4 * * 0 deploy find /opt/mizano/backups -name "*.sql.gz" -mtime +30 -delete
CRONEOF

# ------------------------------------------
# Enable automatic security updates
# ------------------------------------------
echo "Enabling automatic security updates..."
dpkg-reconfigure -plow unattended-upgrades 2>/dev/null || true

echo ""
echo "============================================"
echo "  Kamatera VPS setup complete!"
echo "============================================"
echo ""
echo "Server: Kamatera Amsterdam (4 CPU, 8GB RAM, 100GB SSD)"
echo ""
echo "Next steps:"
echo ""
echo "  1. SSH in as the deploy user:"
echo "     ssh ${DEPLOY_USER}@$(curl -s ifconfig.me 2>/dev/null || echo '<your-ip>')"
echo ""
echo "  2. Review and edit ${ENV_FILE}"
echo ""
echo "  3. Copy docker-compose.production.yml and nginx config:"
echo "     (CI/CD will do this automatically on deploy)"
echo ""
echo "  4. Or deploy manually:"
echo "     cd ${APP_DIR}"
echo "     docker compose -f docker-compose.production.yml --profile with-nginx up -d"
echo ""
echo "  5. Run database migrations:"
echo "     docker compose -f docker-compose.production.yml run --rm api npx prisma migrate deploy"
echo ""
echo "  6. (Optional) Seed the database:"
echo "     docker compose -f docker-compose.production.yml run --rm api npx prisma db seed"
echo ""
echo "  Your app will be live at: https://${DOMAIN}"
echo ""
echo "GitHub Secrets to configure:"
echo "  DEPLOY_HOST     = $(curl -s ifconfig.me 2>/dev/null || echo '<your-ip>')"
echo "  DEPLOY_USER     = ${DEPLOY_USER}"
echo "  DEPLOY_SSH_KEY  = (paste the private key for ${DEPLOY_USER})"
echo "  PRODUCTION_URL  = https://${DOMAIN}"
echo "  API_URL         = https://${DOMAIN}/api"
echo "============================================"
