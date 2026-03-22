#!/usr/bin/env bash
# ============================================
# Mizano ERP — Oracle Cloud VM Initial Setup
# ============================================
# Run this ONCE on a fresh Oracle Cloud Ubuntu/Oracle Linux instance.
# Usage: sudo bash oracle-server-setup.sh <YOUR_DOMAIN>
#
# Prerequisites:
#   - Oracle Cloud VM with Ubuntu 22.04 or Oracle Linux 9
#   - Security List: open ports 22, 80, 443
#   - DNS A record pointing YOUR_DOMAIN to the VM public IP
# ============================================

set -euo pipefail

DOMAIN="${1:?Usage: sudo bash oracle-server-setup.sh <YOUR_DOMAIN>}"
APP_DIR="/opt/mizano"
DEPLOY_USER="deploy"

echo "=== Mizano ERP — Oracle Cloud Setup ==="
echo "Domain: ${DOMAIN}"
echo ""

# ------------------------------------------
# 1. System updates
# ------------------------------------------
echo "[1/8] Updating system packages..."
if command -v apt-get &>/dev/null; then
    apt-get update -y && apt-get upgrade -y
    apt-get install -y curl git ufw software-properties-common
elif command -v dnf &>/dev/null; then
    dnf update -y
    dnf install -y curl git firewalld
fi

# ------------------------------------------
# 2. Install Docker
# ------------------------------------------
echo "[2/8] Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install Docker Compose plugin if not present
if ! docker compose version &>/dev/null; then
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

echo "Docker version: $(docker --version)"
echo "Compose version: $(docker compose version)"

# ------------------------------------------
# 3. Create deploy user
# ------------------------------------------
echo "[3/8] Creating deploy user..."
if ! id "${DEPLOY_USER}" &>/dev/null; then
    useradd -m -s /bin/bash "${DEPLOY_USER}"
    usermod -aG docker "${DEPLOY_USER}"
    echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/local/bin/docker-compose" >> /etc/sudoers.d/deploy
fi

# ------------------------------------------
# 4. Firewall — Oracle Linux uses iptables by default
# ------------------------------------------
echo "[4/8] Configuring firewall (iptables)..."
# Oracle Cloud uses iptables rules via /etc/iptables/rules.v4
# We need to open ports 80 and 443 in the OS firewall
# (Security List in OCI console must also allow these)

if command -v ufw &>/dev/null; then
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
elif command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --permanent --add-service=ssh
    firewall-cmd --reload
else
    # Oracle Linux default iptables
    iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
    iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
    netfilter-persistent save 2>/dev/null || iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
fi

# ------------------------------------------
# 5. Create application directory
# ------------------------------------------
echo "[5/8] Setting up application directory..."
mkdir -p "${APP_DIR}"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"

# ------------------------------------------
# 6. Generate production .env
# ------------------------------------------
echo "[6/8] Generating production .env..."
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
NEXTAUTH_URL=https://${DOMAIN}

# API
API_PORT=6001
NODE_ENV=production
CORS_ORIGIN=https://${DOMAIN}

# Frontend
NEXT_PUBLIC_API_URL=https://${DOMAIN}/api
NEXT_PUBLIC_APP_NAME=Mizano

# Rate Limiting
RATE_LIMIT_TTL=1000
RATE_LIMIT_MAX=30
RATE_LIMIT_AUTH_MAX=10

# Logging
LOG_LEVEL=warn

# Ollama AI (set to false if not using AI features)
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
# 7. SSL certificate via Let's Encrypt
# ------------------------------------------
echo "[7/8] Obtaining SSL certificate..."
# We use standalone mode for initial cert (nginx not running yet)
if [ ! -d "/etc/letsencrypt/live/mizano" ]; then
    docker run --rm \
        -v mizano_certbot_certs:/etc/letsencrypt \
        -v mizano_certbot_www:/var/www/certbot \
        -p 80:80 \
        certbot/certbot certonly \
        --standalone \
        --agree-tos \
        --no-eff-email \
        --cert-name mizano \
        -d "${DOMAIN}" \
        --email "admin@${DOMAIN}"
    echo "  SSL certificate obtained for ${DOMAIN}"
else
    echo "  SSL certificate already exists."
fi

# ------------------------------------------
# 8. Create systemd service for auto-start
# ------------------------------------------
echo "[8/8] Creating systemd service..."
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

echo ""
echo "============================================"
echo "  Oracle Cloud setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Clone your repo into ${APP_DIR}:"
echo "     su - ${DEPLOY_USER}"
echo "     cd ${APP_DIR}"
echo "     git clone https://github.com/AbdelrhmanAh7/Mizano.git ."
echo ""
echo "  2. Review and edit ${ENV_FILE}"
echo ""
echo "  3. Start the application:"
echo "     docker compose -f docker-compose.production.yml --profile with-nginx up -d"
echo ""
echo "  4. Run database migrations:"
echo "     docker compose -f docker-compose.production.yml exec api npx prisma migrate deploy"
echo ""
echo "  5. (Optional) Seed the database:"
echo "     docker compose -f docker-compose.production.yml exec api npx prisma db seed"
echo ""
echo "  Your app will be live at: https://${DOMAIN}"
echo "============================================"
