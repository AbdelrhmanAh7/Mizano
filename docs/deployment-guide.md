# Mizano ERP - Deployment Guide

## Overview

This guide covers the full deployment lifecycle for Mizano ERP, from prerequisites through production launch and ongoing maintenance. It incorporates the pre-launch checklist, security hardening, monitoring setup, and rollback procedures.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Database Setup](#database-setup)
4. [Security Checklist](#security-checklist)
5. [Docker Deployment](#docker-deployment)
6. [Health Checks](#health-checks)
7. [Functional Testing Checklist](#functional-testing-checklist)
8. [Performance Targets](#performance-targets)
9. [Monitoring](#monitoring)
10. [Backup Strategy](#backup-strategy)
11. [Post-Launch](#post-launch)
12. [Rollback Procedure](#rollback-procedure)
13. [Quick Commands Reference](#quick-commands-reference)

---

## Prerequisites

### Server Specifications (Minimum)

| Resource | Minimum          | Recommended      |
| -------- | ---------------- | ---------------- |
| CPU      | 2 vCPUs          | 4 vCPUs          |
| RAM      | 4 GB             | 8 GB             |
| Storage  | 40 GB SSD        | 100 GB SSD       |
| OS       | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Required Software

| Software       | Version | Purpose                                                        |
| -------------- | ------- | -------------------------------------------------------------- |
| Docker         | 24+     | Container runtime                                              |
| Docker Compose | 2.20+   | Multi-container orchestration                                  |
| Node.js        | 20 LTS  | Build toolchain (if building outside Docker)                   |
| pnpm           | 8+      | Package manager (if building outside Docker)                   |
| Nginx          | 1.24+   | Reverse proxy and SSL termination (optional if using cloud LB) |

### Domain and SSL

- Register a domain (e.g., `app.mizano.io`) and point DNS A records to the server IP
- Obtain SSL certificates (recommended: Let's Encrypt via Certbot, or a managed certificate from your cloud provider)
- Ensure ports 80 and 443 are open in firewall/security groups

---

## Environment Configuration

### Generating Secrets

Generate cryptographically secure secrets for all token-signing keys:

```bash
# JWT Secret (access tokens)
openssl rand -base64 64

# JWT Refresh Secret (refresh tokens)
openssl rand -base64 64

# NextAuth Secret (session encryption)
openssl rand -base64 64

# Database password
openssl rand -base64 32
```

### Required Environment Variables

Create a `.env.production` file with the following variables:

```bash
# ──────────────────────────────────────────────
# Application
# ──────────────────────────────────────────────
NODE_ENV=production

# ──────────────────────────────────────────────
# Database (PostgreSQL 16)
# ──────────────────────────────────────────────
DATABASE_URL="postgresql://mizano:<GENERATED_DB_PASSWORD>@db:5432/mizano_db?schema=public"

# ──────────────────────────────────────────────
# Cache / Queue (Redis)
# ──────────────────────────────────────────────
REDIS_URL="redis://redis:6379"

# ──────────────────────────────────────────────
# Authentication
# ──────────────────────────────────────────────
JWT_SECRET="<GENERATED_JWT_SECRET>"
JWT_REFRESH_SECRET="<GENERATED_JWT_REFRESH_SECRET>"
JWT_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"

# ──────────────────────────────────────────────
# NextAuth (Frontend)
# ──────────────────────────────────────────────
NEXTAUTH_SECRET="<GENERATED_NEXTAUTH_SECRET>"
NEXTAUTH_URL="https://app.mizano.io"

# ──────────────────────────────────────────────
# API URL (Backend, as seen by the frontend)
# ──────────────────────────────────────────────
API_URL="https://api.mizano.io"

# ──────────────────────────────────────────────
# CORS
# ──────────────────────────────────────────────
CORS_ORIGINS="https://app.mizano.io"

# ──────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────
LOG_LEVEL="info"

# ──────────────────────────────────────────────
# Error Tracking (optional)
# ──────────────────────────────────────────────
# SENTRY_DSN="https://examplePublicKey@o0.ingest.sentry.io/0"
```

### Environment Variable Validation

Never deploy without validating that all required variables are set. The API should fail fast on startup if any required variable is missing:

```typescript
// Validated at application bootstrap
const requiredVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'NODE_ENV',
];

for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}
```

---

## Database Setup

### 1. Run Migrations

Apply all migrations to the production database:

```bash
# From the project root
pnpm db:migrate deploy
```

This runs all pending migrations in order. Unlike `db:push`, it uses the migration history to ensure idempotent, trackable schema changes.

### 2. Generate Prisma Client

```bash
pnpm db:generate
```

### 3. Seed Initial Data (First Deployment Only)

Create the initial admin user and default chart of accounts:

```bash
pnpm db:seed
```

The seed script creates:

- A default Organization
- An admin User with a temporary password (must be changed on first login)
- A standard chart of accounts
- Default tax rates
- System configuration records

### 4. Verify Database Connection

```bash
# Test connection from the API container
docker exec mizano-api npx prisma db execute --stdin <<< "SELECT 1;"
```

---

## Security Checklist

Complete every item before going live.

### Authentication and Authorization

- [ ] **JWT access token expiry**: set to 15 minutes (`JWT_EXPIRY=15m`)
- [ ] **JWT refresh token expiry**: set to 7 days (`JWT_REFRESH_EXPIRY=7d`)
- [ ] **All secrets generated uniquely**: JWT_SECRET, JWT_REFRESH_SECRET, NEXTAUTH_SECRET are all different values generated with `openssl rand`
- [ ] **Default admin password changed**: the seed admin user password has been changed from its default
- [ ] **Password hashing**: bcrypt with cost factor >= 10

### Network and Transport

- [ ] **HTTPS enforced**: all HTTP traffic redirected to HTTPS
- [ ] **SSL/TLS certificates valid**: not expired, correct domain
- [ ] **CORS configured**: `CORS_ORIGINS` set to only the frontend domain (no wildcards in production)
- [ ] **SSH key-only auth**: password authentication disabled on the server (`PasswordAuthentication no` in `/etc/ssh/sshd_config`)
- [ ] **Firewall configured**: only ports 80, 443, and SSH (22 or custom) open

### Application Security

- [ ] **Helmet.js enabled**: sets secure HTTP headers (X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, etc.)
- [ ] **Rate limiting enabled**: protect auth endpoints (login, register, refresh) from brute force attacks (e.g., 10 requests per minute per IP)
- [ ] **Input validation**: all request DTOs validated with class-validator decorators in NestJS and Zod schemas on the frontend
- [ ] **SQL injection prevention**: using Prisma parameterized queries (never string concatenation)
- [ ] **XSS prevention**: React's default escaping + Helmet.js headers

### Multi-Tenancy Verification

- [ ] **Every database query includes `organizationId`**: verified in code review
- [ ] **No cross-tenant data leakage**: tested by creating data in org A and verifying it is invisible from org B
- [ ] **Organization guard applied**: `OrganizationGuard` is active on all protected endpoints

### Server Hardening

- [ ] **SSH key-only authentication**: no password login
- [ ] **Unattended security updates**: enabled (`unattended-upgrades` on Ubuntu)
- [ ] **Non-root user for application**: Docker containers run as non-root
- [ ] **File permissions**: `.env.production` readable only by the application user (`chmod 600`)

---

## Docker Deployment

### Production Docker Compose

Create `docker-compose.production.yml`:

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: mizano
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: mizano_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - '127.0.0.1:5432:5432' # Only accessible from localhost
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U mizano -d mizano_db']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - '127.0.0.1:6379:6379' # Only accessible from localhost
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: production
    restart: always
    env_file: .env.production
    ports:
      - '127.0.0.1:6001:6001'
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:6001/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: production
    restart: always
    env_file: .env.production
    ports:
      - '127.0.0.1:5001:5001'
    depends_on:
      - api
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:5001']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s

volumes:
  postgres_data:
  redis_data:
```

### Deployment Steps

```bash
# 1. Clone the repository on the server
git clone <repo-url> /opt/mizano
cd /opt/mizano

# 2. Checkout the release tag
git checkout v1.0.0

# 3. Create the production env file
cp .env.example .env.production
# Edit .env.production with production values
chmod 600 .env.production

# 4. Build and start all services
docker compose -f docker-compose.production.yml up -d --build

# 5. Run database migrations
docker compose -f docker-compose.production.yml exec api npx prisma migrate deploy

# 6. Seed the database (first deployment only)
docker compose -f docker-compose.production.yml exec api npx prisma db seed

# 7. Verify all services are healthy
docker compose -f docker-compose.production.yml ps
```

### Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/mizano
server {
    listen 80;
    server_name app.mizano.io api.mizano.io;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.mizano.io;

    ssl_certificate /etc/letsencrypt/live/mizano.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mizano.io/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:6001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name app.mizano.io;

    ssl_certificate /etc/letsencrypt/live/mizano.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mizano.io/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Health Checks

The API exposes three health check endpoints that should be monitored continuously.

| Endpoint            | What it Checks                 | Expected Response                             |
| ------------------- | ------------------------------ | --------------------------------------------- |
| `GET /health`       | API process is running         | `{ "status": "ok" }`                          |
| `GET /health/db`    | PostgreSQL connection is alive | `{ "status": "ok", "database": "connected" }` |
| `GET /health/redis` | Redis connection is alive      | `{ "status": "ok", "redis": "connected" }`    |

### Verification

```bash
# Check all health endpoints after deployment
curl -s https://api.mizano.io/health | jq .
curl -s https://api.mizano.io/health/db | jq .
curl -s https://api.mizano.io/health/redis | jq .
```

If any health check fails, the corresponding Docker container will be automatically restarted by the `healthcheck` + `restart: always` configuration.

---

## Functional Testing Checklist

After deployment, verify all critical paths manually or with automated smoke tests.

### Authentication Flow

- [ ] User can register a new organization and admin account
- [ ] User can log in and receive JWT tokens
- [ ] JWT access token expires after 15 minutes and refresh works
- [ ] User can log out (refresh token is invalidated)
- [ ] Password reset flow works end-to-end
- [ ] RBAC: non-admin user cannot access admin-only endpoints

### Core Module Testing

- [ ] **Accounting**: create chart of accounts, post journal entries (verify debit = credit enforcement), view trial balance
- [ ] **Sales**: create customer, create quote, convert quote to invoice, record payment received
- [ ] **Purchases**: create vendor, create bill, record payment made
- [ ] **Inventory**: create items, record stock movements, verify stock level updates
- [ ] **Banking**: add bank account, import transactions, reconcile against invoices/bills
- [ ] **HR**: add employees, run payroll (if applicable)
- [ ] **Tax**: configure tax rates, verify tax calculations on invoices
- [ ] **Reports**: generate P&L, Balance Sheet, AR Aging, AP Aging

### AI Features

- [ ] Transaction categorization suggests correct accounts with confidence scores
- [ ] Bank reconciliation matching proposes correct matches
- [ ] Document intake (OCR) processes an uploaded invoice and extracts data
- [ ] Anomaly detection flags a suspicious transaction
- [ ] All AI suggestions are dismissible (human-in-the-loop)
- [ ] AI feedback loop: accepting/rejecting a suggestion records feedback

### Multi-Tenancy Isolation

- [ ] Create two organizations (Org A and Org B)
- [ ] Create data in Org A (invoices, customers, accounts)
- [ ] Log in as Org B user and verify zero data from Org A is visible
- [ ] API requests with Org A's token cannot access Org B's data (returns 403 or empty results)

---

## Performance Targets

| Metric                          | Target       | How to Measure                                  |
| ------------------------------- | ------------ | ----------------------------------------------- |
| Dashboard load                  | < 3 seconds  | Browser DevTools Network tab (DOMContentLoaded) |
| API response (list endpoints)   | < 500ms      | Response time header or logging middleware      |
| API response (single resource)  | < 200ms      | Response time header or logging middleware      |
| Report generation (1 year data) | < 5 seconds  | Measure from request to response complete       |
| Document OCR processing         | < 30 seconds | Queue job completion time                       |
| Database query (with indexes)   | < 100ms      | Prisma query logging                            |
| Time to First Byte (TTFB)       | < 800ms      | Lighthouse or WebPageTest                       |

### Performance Tuning

If targets are not met:

1. **Enable Prisma query logging** to identify slow queries: set `LOG_LEVEL=query` in Prisma configuration
2. **Add missing indexes** for slow query patterns
3. **Enable Redis caching** for frequently accessed, rarely changing data (chart of accounts, tax rates)
4. **Optimize N+1 queries** by using `include` or `select` (see Database Guide)
5. **Enable gzip compression** in Nginx for API responses
6. **Use connection pooling** for PostgreSQL (PgBouncer or Prisma connection pool settings)

---

## Monitoring

### Logging

Configure structured JSON logging for production:

```typescript
// NestJS logger configuration
{
  "level": "info",
  "format": "json",
  "timestamp": true,
  "context": true
}
```

Log aggregation options:

- **Self-hosted**: ELK Stack (Elasticsearch + Logstash + Kibana) or Loki + Grafana
- **Managed**: Datadog, AWS CloudWatch, Google Cloud Logging

### Uptime Monitoring

Set up external uptime checks that run every 1-5 minutes:

- Monitor `https://api.mizano.io/health`
- Monitor `https://api.mizano.io/health/db`
- Monitor `https://api.mizano.io/health/redis`
- Monitor `https://app.mizano.io` (frontend)

Recommended tools: UptimeRobot (free tier), Pingdom, Better Uptime, or AWS Route 53 health checks.

### Error Tracking

Integrate Sentry for real-time error tracking:

```bash
# Add to .env.production
SENTRY_DSN="https://examplePublicKey@o0.ingest.sentry.io/0"
```

Configure in both the NestJS API and Next.js frontend:

- Capture unhandled exceptions automatically
- Add breadcrumbs for key operations (login, payment processing, journal posting)
- Set up alerts for new error types and error rate spikes

### Resource Alerts

Set up alerts for server resource usage:

| Metric                  | Warning         | Critical        | Action                                   |
| ----------------------- | --------------- | --------------- | ---------------------------------------- |
| CPU usage               | > 70% for 5 min | > 90% for 2 min | Scale up or investigate runaway process  |
| Memory usage            | > 75%           | > 90%           | Check for memory leaks, increase RAM     |
| Disk usage              | > 75%           | > 90%           | Clean old backups/logs, expand volume    |
| PostgreSQL connections  | > 80% of max    | > 95% of max    | Increase pool size or add PgBouncer      |
| Redis memory            | > 200MB         | > 250MB         | Review cache TTLs, increase maxmemory    |
| API response time (p95) | > 1 second      | > 3 seconds     | Profile slow endpoints, check DB indexes |

---

## Backup Strategy

### Automated Database Backups

Configure a daily cron job for database backups:

```bash
# /etc/cron.d/mizano-backup
0 2 * * * root /opt/mizano/scripts/backup.sh >> /var/log/mizano-backup.log 2>&1
```

### Backup Script

```bash
#!/bin/bash
# /opt/mizano/scripts/backup.sh

set -euo pipefail

BACKUP_DIR="/backups/mizano"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

# Dump the database from the Docker container
docker exec mizano-db pg_dump -U mizano -d mizano_db -Fc \
  > "$BACKUP_DIR/mizano_${TIMESTAMP}.dump"

# Verify the backup file is not empty
BACKUP_SIZE=$(stat -c%s "$BACKUP_DIR/mizano_${TIMESTAMP}.dump" 2>/dev/null || stat -f%z "$BACKUP_DIR/mizano_${TIMESTAMP}.dump")
if [ "$BACKUP_SIZE" -lt 1000 ]; then
  echo "ERROR: Backup file suspiciously small ($BACKUP_SIZE bytes)" >&2
  exit 1
fi

echo "Backup created: mizano_${TIMESTAMP}.dump ($BACKUP_SIZE bytes)"

# Remove backups older than retention period
find "$BACKUP_DIR" -name "mizano_*.dump" -mtime +$RETENTION_DAYS -delete
echo "Cleaned backups older than $RETENTION_DAYS days"

# Copy to offsite storage (uncomment and configure)
# aws s3 cp "$BACKUP_DIR/mizano_${TIMESTAMP}.dump" s3://mizano-backups/daily/
# OR
# rclone copy "$BACKUP_DIR/mizano_${TIMESTAMP}.dump" remote:mizano-backups/daily/
```

### Offsite Storage

**Critical**: local backups alone are not sufficient. Copy backups to a separate location:

- **AWS S3** with lifecycle policy (transition to Glacier after 30 days)
- **Google Cloud Storage** with nearline/coldline classes
- **Separate server** via rsync or rclone
- **Managed backup service**: your cloud provider's snapshot/backup service

### Retention Policy

| Backup Type            | Frequency            | Retention |
| ---------------------- | -------------------- | --------- |
| Daily full backup      | Every day at 2:00 AM | 30 days   |
| Weekly backup (Sunday) | Weekly               | 90 days   |
| Monthly backup (1st)   | Monthly              | 1 year    |

### Restore Testing

**Test your backups regularly.** A backup that cannot be restored is not a backup.

```bash
# Monthly restore test procedure:

# 1. Create a temporary database
docker exec mizano-db createdb -U mizano mizano_restore_test

# 2. Restore the latest backup
docker exec -i mizano-db pg_restore -U mizano -d mizano_restore_test \
  < /backups/mizano/latest.dump

# 3. Run a quick verification query
docker exec mizano-db psql -U mizano -d mizano_restore_test \
  -c "SELECT COUNT(*) FROM \"Organization\";"

# 4. Drop the test database
docker exec mizano-db dropdb -U mizano mizano_restore_test
```

---

## Post-Launch

### Day 1 Monitoring

During the first 24 hours after launch, actively monitor:

- [ ] All health check endpoints returning OK
- [ ] No 5xx errors in application logs
- [ ] CPU and memory usage within normal ranges
- [ ] Database connection count is stable (no leaking connections)
- [ ] Redis memory usage is stable
- [ ] All cron jobs (backups, AI retraining schedulers) executed successfully
- [ ] User sign-ups and logins are working
- [ ] No cross-tenant data leakage in production logs

### Week 1 Tasks

- [ ] Review error tracking dashboard (Sentry) for recurring issues
- [ ] Check application performance against targets
- [ ] Verify daily backups are running and offsite copies are completing
- [ ] Review AI model accuracy on production data vs. test data
- [ ] Collect initial user feedback and triage bugs
- [ ] Confirm SSL certificate auto-renewal is configured (certbot renew)
- [ ] Verify log rotation is configured to prevent disk filling

### Ongoing Maintenance

| Task                                   | Frequency                                           |
| -------------------------------------- | --------------------------------------------------- |
| Review error tracking / logs           | Daily                                               |
| Verify backup completion               | Daily (automated alert)                             |
| Update dependencies (security patches) | Weekly                                              |
| Database vacuum and analyze            | Weekly (auto-vacuum should handle this, but verify) |
| Review and rotate API keys/secrets     | Quarterly                                           |
| Test backup restore procedure          | Monthly                                             |
| Review and update firewall rules       | Quarterly                                           |
| Upgrade PostgreSQL minor versions      | As released                                         |
| Load testing                           | Before major releases                               |
| Security audit                         | Annually                                            |

---

## Rollback Procedure

If a deployment causes critical issues, follow this procedure to revert to the previous version.

### Step 1: Identify the Problem

```bash
# Check application logs for errors
docker compose -f docker-compose.production.yml logs --tail=100 api
docker compose -f docker-compose.production.yml logs --tail=100 web

# Check health endpoints
curl -s https://api.mizano.io/health | jq .
curl -s https://api.mizano.io/health/db | jq .
```

### Step 2: Roll Back Application Code

```bash
# Find the previous release tag
git log --oneline --decorate -10

# Checkout the previous working version
git checkout v0.9.0  # Replace with the last known good version

# Rebuild and restart services
docker compose -f docker-compose.production.yml up -d --build
```

### Step 3: Roll Back Database Migrations (If Needed)

If the failed deployment included database migrations, you may need to restore from backup:

```bash
# 1. Stop the API to prevent further writes
docker compose -f docker-compose.production.yml stop api web

# 2. Restore the pre-deployment backup
docker exec -i mizano-db pg_restore -U mizano -d mizano_db -c \
  < /backups/mizano/pre_deployment_backup.dump

# 3. Restart services with the rolled-back code
docker compose -f docker-compose.production.yml up -d
```

**Important**: Always take a backup immediately before deploying (pre-deployment backup). Add this to your deployment script:

```bash
# Pre-deployment backup
docker exec mizano-db pg_dump -U mizano -d mizano_db -Fc \
  > /backups/mizano/pre_deploy_$(date +%Y%m%d_%H%M%S).dump
```

### Step 4: Verify Recovery

```bash
# Check all services are healthy
docker compose -f docker-compose.production.yml ps

# Verify health endpoints
curl -s https://api.mizano.io/health | jq .
curl -s https://api.mizano.io/health/db | jq .
curl -s https://api.mizano.io/health/redis | jq .

# Run smoke tests against critical paths
# (auth login, list invoices, dashboard load)
```

### Step 5: Post-Mortem

After stabilizing:

1. Document what went wrong and why
2. Identify the root cause of the failure
3. Fix the issue on a development branch
4. Add automated tests to prevent recurrence
5. Re-deploy with the fix after thorough testing

---

## Quick Commands Reference

### Service Management

```bash
# Start all production services
docker compose -f docker-compose.production.yml up -d

# Stop all services
docker compose -f docker-compose.production.yml down

# Restart a specific service
docker compose -f docker-compose.production.yml restart api

# View logs (follow mode)
docker compose -f docker-compose.production.yml logs -f api

# View logs (last 200 lines)
docker compose -f docker-compose.production.yml logs --tail=200 api web
```

### Database Operations

```bash
# Run pending migrations
docker compose -f docker-compose.production.yml exec api npx prisma migrate deploy

# Open Prisma Studio (development only, not for production)
# pnpm db:studio

# Connect to PostgreSQL directly
docker exec -it mizano-db psql -U mizano -d mizano_db

# Check active connections
docker exec mizano-db psql -U mizano -d mizano_db \
  -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'mizano_db';"
```

### Backup Operations

```bash
# Manual backup
docker exec mizano-db pg_dump -U mizano -d mizano_db -Fc > /backups/mizano/manual_$(date +%Y%m%d_%H%M%S).dump

# Restore from backup
docker exec -i mizano-db pg_restore -U mizano -d mizano_db -c < /backups/mizano/<backup_file>.dump

# List available backups
ls -lh /backups/mizano/
```

### Health and Diagnostics

```bash
# Check all health endpoints
curl -s https://api.mizano.io/health | jq .
curl -s https://api.mizano.io/health/db | jq .
curl -s https://api.mizano.io/health/redis | jq .

# Check container resource usage
docker stats --no-stream

# Check disk usage
df -h

# Check PostgreSQL database size
docker exec mizano-db psql -U mizano -d mizano_db \
  -c "SELECT pg_size_pretty(pg_database_size('mizano_db'));"
```

### SSL Certificate

```bash
# Check certificate expiry
openssl s_client -connect api.mizano.io:443 -servername api.mizano.io 2>/dev/null | openssl x509 -noout -dates

# Renew Let's Encrypt certificate
sudo certbot renew

# Test renewal (dry run)
sudo certbot renew --dry-run
```

### Emergency Procedures

```bash
# Kill and recreate all containers (nuclear option)
docker compose -f docker-compose.production.yml down
docker compose -f docker-compose.production.yml up -d --build --force-recreate

# Clear Redis cache (if stale data suspected)
docker exec mizano-redis redis-cli FLUSHALL

# Force restart PostgreSQL
docker compose -f docker-compose.production.yml restart db
```
