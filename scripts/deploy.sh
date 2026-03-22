#!/usr/bin/env bash
# ============================================
# Mizano ERP — Deployment Script
# ============================================
# Called by CI/CD pipeline or manually on the server.
# Usage: bash deploy.sh [image-tag]
# ============================================

set -euo pipefail

TAG="${1:-latest}"
APP_DIR="/opt/mizano"
COMPOSE_FILE="docker-compose.production.yml"

cd "${APP_DIR}"

echo "=== Deploying Mizano ERP (tag: ${TAG}) ==="

# Load environment
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Pull latest images if using registry
if [ -n "${REGISTRY:-}" ]; then
    echo "[1/5] Pulling images from registry..."
    docker pull "${REGISTRY}/${API_IMAGE_NAME}:${TAG}"
    docker pull "${REGISTRY}/${WEB_IMAGE_NAME}:${TAG}"
    export API_IMAGE="${REGISTRY}/${API_IMAGE_NAME}:${TAG}"
    export WEB_IMAGE="${REGISTRY}/${WEB_IMAGE_NAME}:${TAG}"
else
    echo "[1/5] Building images locally..."
    docker compose -f "${COMPOSE_FILE}" build api web
fi

# Run database migrations
echo "[2/5] Running database migrations..."
docker compose -f "${COMPOSE_FILE}" run --rm api npx prisma migrate deploy

# Rolling restart
echo "[3/5] Restarting API..."
docker compose -f "${COMPOSE_FILE}" up -d --no-deps api
sleep 10

echo "[4/5] Restarting Web..."
docker compose -f "${COMPOSE_FILE}" up -d --no-deps web

# Ensure nginx is up
echo "[5/5] Ensuring nginx is running..."
docker compose -f "${COMPOSE_FILE}" --profile with-nginx up -d nginx

# Cleanup
docker image prune -f

# Health check
echo ""
echo "Waiting for services..."
sleep 15

API_STATUS=$(docker inspect --format='{{.State.Health.Status}}' mizano-api 2>/dev/null || echo "unknown")
WEB_STATUS=$(docker inspect --format='{{.State.Health.Status}}' mizano-web 2>/dev/null || echo "unknown")

echo "  API: ${API_STATUS}"
echo "  Web: ${WEB_STATUS}"

if [ "${API_STATUS}" = "healthy" ] && [ "${WEB_STATUS}" = "healthy" ]; then
    echo ""
    echo "=== Deployment successful! ==="
else
    echo ""
    echo "=== WARNING: Services may still be starting. Check: docker compose -f ${COMPOSE_FILE} ps ==="
fi
