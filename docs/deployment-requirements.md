# Mizano ERP — VPS Deployment Requirements

## Quick Answer: What to Buy

| Tier            | Users     | CPU       | RAM    | GPU                  | Disk       | Est. Cost/mo |
| --------------- | --------- | --------- | ------ | -------------------- | ---------- | ------------ |
| **Starter**     | 1–100     | 4 cores   | 16 GB  | None (CPU-only AI)   | 100 GB SSD | $30–60       |
| **Recommended** | 1–100     | 4+ cores  | 16 GB  | NVIDIA (16 GB VRAM)  | 100 GB SSD | $80–200      |
| **Medium**      | 100–1,000 | 8 cores   | 32 GB  | NVIDIA (16 GB VRAM)  | 500 GB SSD | $200–400     |
| **Large**       | 1,000+    | 16+ cores | 64+ GB | NVIDIA A100 (40 GB+) | 1 TB+ NVMe | $500+        |

> **GPU note:** Without a GPU, Ollama AI inference takes 10–30s per request (vs 0.5–3s with GPU). For production AI features, GPU is strongly recommended.

---

## Services Overview

| Service           | Image              | Port     | RAM Usage                 |
| ----------------- | ------------------ | -------- | ------------------------- |
| **NestJS API**    | node:20-alpine     | 6001     | 2–4 GB                    |
| **Next.js Web**   | node:20-alpine     | 5001     | 1–2 GB                    |
| **PostgreSQL 16** | postgres:16-alpine | 5432     | 1–2 GB                    |
| **Redis 7**       | redis:7-alpine     | 6379     | 256–512 MB                |
| **Nginx**         | nginx:alpine       | 80 / 443 | ~100 MB                   |
| **Ollama**        | ollama/ollama      | 11434    | 8–16 GB (model-dependent) |

**Total baseline RAM:** ~14–24 GB (with AI models loaded)

---

## Software Requirements

### On the VPS

| Software                     | Version                        | Purpose                               |
| ---------------------------- | ------------------------------ | ------------------------------------- |
| **OS**                       | Ubuntu 22.04 LTS (recommended) | Host operating system                 |
| **Docker**                   | 24+                            | Container runtime                     |
| **Docker Compose**           | v2.20+                         | Service orchestration                 |
| **Ollama**                   | Latest                         | Local LLM inference engine            |
| **NVIDIA Drivers**           | 535+ (if GPU)                  | GPU support for Ollama                |
| **NVIDIA Container Toolkit** | Latest (if GPU)                | Docker GPU passthrough                |
| **Certbot**                  | Latest                         | Free SSL certificates (Let's Encrypt) |

### AI Models to Download (on VPS)

| Model          | Size on Disk | VRAM Needed | Purpose                              |
| -------------- | ------------ | ----------- | ------------------------------------ |
| `qwen2.5:7b`   | ~4.5 GB      | ~6 GB       | Text extraction, NLP, categorization |
| `minicpm-v:8b` | ~5.5 GB      | ~8 GB       | Invoice/bill image analysis          |

Both models loaded simultaneously require **~14 GB VRAM** (or ~16 GB system RAM for CPU-only).

---

## Disk Storage Breakdown

| Component                         | Size           | Notes                               |
| --------------------------------- | -------------- | ----------------------------------- |
| Docker images (API + Web + infra) | ~2 GB          | After build                         |
| Ollama models                     | ~10 GB         | qwen2.5:7b + minicpm-v:8b           |
| PostgreSQL data                   | 5–500 GB       | Grows with transactions, audit logs |
| Redis data                        | 1–5 GB         | Cache, job queues                   |
| OS + Docker overhead              | ~10 GB         | Ubuntu + Docker engine              |
| **Minimum total**                 | **~30 GB**     | Day-one footprint                   |
| **Recommended**                   | **100 GB SSD** | Room for 1–2 years of growth        |

---

## Network & Firewall

### Ports to Expose (public)

| Port | Protocol | Service                       |
| ---- | -------- | ----------------------------- |
| 80   | TCP      | Nginx (HTTP → HTTPS redirect) |
| 443  | TCP      | Nginx (HTTPS)                 |
| 22   | TCP      | SSH (restrict to your IP)     |

### Ports to Keep Internal Only

| Port  | Service    | Notes                            |
| ----- | ---------- | -------------------------------- |
| 5001  | Next.js    | Behind Nginx                     |
| 6001  | NestJS API | Behind Nginx                     |
| 5432  | PostgreSQL | Docker internal network only     |
| 6379  | Redis      | Docker internal network only     |
| 11434 | Ollama     | Accessible to API container only |

### Bandwidth

- **Minimum:** 1 Gbps shared
- **Recommended:** 1 Gbps unmetered
- **Monthly transfer:** ~500 GB–2 TB depending on document upload volume

---

## DNS Requirements

| Record               | Type | Value  | Purpose                                             |
| -------------------- | ---- | ------ | --------------------------------------------------- |
| `yourdomain.com`     | A    | VPS IP | Main web app                                        |
| `api.yourdomain.com` | A    | VPS IP | API endpoint (or use same domain with path routing) |

---

## Security Checklist

### Secrets to Generate Before Deployment

```bash
# Run these on the VPS to generate secrets
openssl rand -base64 64   # → POSTGRES_PASSWORD
openssl rand -base64 64   # → JWT_SECRET
openssl rand -base64 64   # → JWT_REFRESH_SECRET
openssl rand -base64 32   # → NEXTAUTH_SECRET
```

### Production `.env.prod` Required Variables

```env
# ─── Core ───
APP_ENV=prod
NODE_ENV=production

# ─── Database ───
POSTGRES_USER=mizano
POSTGRES_PASSWORD=<generated-secret>
POSTGRES_DB=mizano_db
DATABASE_URL=postgresql://mizano:<password>@postgres:5432/mizano_db?schema=public

# ─── Redis ───
REDIS_URL=redis://redis:6379

# ─── Auth ───
JWT_SECRET=<generated-secret>
JWT_REFRESH_SECRET=<generated-secret>
NEXTAUTH_SECRET=<generated-secret>
NEXTAUTH_URL=https://yourdomain.com

# ─── URLs ───
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
CORS_ORIGIN=https://yourdomain.com

# ─── AI / Ollama ───
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_TEXT_MODEL=qwen2.5:7b
OLLAMA_VISION_MODEL=minicpm-v:8b
OLLAMA_TIMEOUT_MS=120000
OLLAMA_MAX_CONCURRENT=3

# ─── Rate Limiting ───
THROTTLE_TTL=1000
THROTTLE_LIMIT=30
AUTH_THROTTLE_LIMIT=10

# ─── Logging ───
LOG_LEVEL=warn

# ─── Optional ───
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=noreply@yourdomain.com
# SMTP_PASSWORD=<smtp-password>
# SENTRY_DSN=https://xxx@sentry.io/xxx
```

### Server Hardening

- [ ] SSH key-only auth (disable password login)
- [ ] UFW firewall: allow only 22, 80, 443
- [ ] Fail2ban for SSH brute-force protection
- [ ] Automatic security updates (`unattended-upgrades`)
- [ ] Non-root Docker user for containers
- [ ] PostgreSQL password > 32 characters
- [ ] All JWT secrets > 64 characters

---

## Deployment Steps (Quick Reference)

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. Install Docker Compose (if not bundled)
sudo apt install docker-compose-plugin

# 3. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 4. (If GPU) Install NVIDIA drivers + Container Toolkit
sudo apt install nvidia-driver-535
# Follow: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html

# 5. Pull AI models
ollama pull qwen2.5:7b
ollama pull minicpm-v:8b

# 6. Clone repo & configure
git clone <your-repo-url> /opt/mizano
cd /opt/mizano
cp .env.prod.example .env.prod   # Edit with real values

# 7. Deploy
pnpm docker:prod

# 8. Run database migrations
docker compose -f docker-compose.production.yml run --rm api npx prisma migrate deploy

# 9. Verify health
curl http://localhost:6001/health
curl http://localhost:5001/api/health
curl http://localhost:11434/api/tags

# 10. Set up SSL (Let's Encrypt)
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com -d api.yourdomain.com
```

---

## Backup Strategy

| What               | How                               | Frequency            |
| ------------------ | --------------------------------- | -------------------- |
| **PostgreSQL**     | `pg_dump` to compressed file      | Daily (cron)         |
| **Redis**          | Optional — cache can rebuild      | Weekly or skip       |
| **Uploaded files** | S3 sync or rsync to backup server | Daily                |
| **SSL certs**      | Auto-renewed by Certbot           | Auto (every 60 days) |
| **Full VPS**       | VPS provider snapshot             | Weekly               |

### Example Backup Cron

```bash
# /etc/cron.d/mizano-backup
0 3 * * * docker exec mizano-postgres pg_dump -U mizano mizano_db | gzip > /backups/mizano-$(date +\%Y\%m\%d).sql.gz
0 4 * * 0 find /backups -mtime +30 -delete
```

---

## Monitoring

### Built-in Health Checks

| Endpoint            | Expected                        |
| ------------------- | ------------------------------- |
| `GET /health`       | `200 OK`                        |
| `GET /health/db`    | `200 OK` (PostgreSQL connected) |
| `GET /health/redis` | `200 OK` (Redis connected)      |

### Recommended Monitoring Stack (Optional)

| Tool                     | Purpose                    | Effort                   |
| ------------------------ | -------------------------- | ------------------------ |
| **UptimeRobot** (free)   | Uptime monitoring + alerts | 5 min setup              |
| **Sentry** (free tier)   | Error tracking             | Add `SENTRY_DSN` env var |
| **Netdata**              | Real-time server metrics   | `apt install netdata`    |
| **Grafana + Prometheus** | Full observability         | Advanced setup           |

---

## Current Deployment: Kamatera VPS

| Property     | Value                                               |
| ------------ | --------------------------------------------------- |
| **Provider** | Kamatera                                            |
| **Zone**     | EU — Amsterdam, The Netherlands                     |
| **IP**       | 185.247.117.157                                     |
| **Hostname** | 185-247-117-157.eu-cloud-xip.com                    |
| **OS**       | Ubuntu 22.04 LTS                                    |
| **CPU**      | 4 cores                                             |
| **RAM**      | 8 GB (+4 GB swap)                                   |
| **Disk**     | 100 GB SSD                                          |
| **AI**       | Disabled (not enough RAM for Ollama + app services) |

### Server Setup

```bash
# SSH into the server as root and run:
sudo bash scripts/kamatera-server-setup.sh 185-247-117-157.eu-cloud-xip.com
```

### GitHub Secrets Required

| Secret           | Value                                         |
| ---------------- | --------------------------------------------- |
| `DEPLOY_HOST`    | `185.247.117.157`                             |
| `DEPLOY_USER`    | `deploy`                                      |
| `DEPLOY_SSH_KEY` | Private SSH key for the deploy user           |
| `PRODUCTION_URL` | `http://185-247-117-157.eu-cloud-xip.com`     |
| `API_URL`        | `http://185-247-117-157.eu-cloud-xip.com/api` |

---

## VPS Provider Recommendations

### Current: Kamatera (Amsterdam)

| Plan       | CPU     | RAM  | Disk       | Price   |
| ---------- | ------- | ---- | ---------- | ------- |
| **Active** | 4 cores | 8 GB | 100 GB SSD | ~$40/mo |

### For CPU-only (no AI or slow AI)

| Provider     | Plan    | CPU    | RAM   | Disk   | Price   |
| ------------ | ------- | ------ | ----- | ------ | ------- |
| Kamatera     | Custom  | 4 vCPU | 16 GB | 100 GB | ~$50/mo |
| Hetzner      | CX31    | 4 vCPU | 16 GB | 160 GB | ~€15/mo |
| DigitalOcean | Premium | 4 vCPU | 16 GB | 100 GB | ~$48/mo |
| Contabo      | VPS L   | 6 vCPU | 16 GB | 400 GB | ~€12/mo |

### For GPU (fast AI inference)

| Provider    | Plan      | GPU      | VRAM  | RAM   | Price     |
| ----------- | --------- | -------- | ----- | ----- | --------- |
| Hetzner     | GX11      | RTX 4000 | 20 GB | 32 GB | ~€175/mo  |
| Lambda Labs | GPU Cloud | A10G     | 24 GB | 32 GB | ~$0.75/hr |
| Vast.ai     | Community | RTX 4090 | 24 GB | 32 GB | ~$0.30/hr |
| RunPod      | GPU Pod   | RTX 4090 | 24 GB | 32 GB | ~$0.44/hr |

> **Tip:** Current 8GB server is fine for app services without AI. To enable Ollama AI, upgrade to 16GB+ RAM or offload Ollama to a separate server.

---

## Obsolete Environment Variables (Safe to Remove)

These were for removed Python microservices and can be deleted from all `.env.*` files:

```env
# REMOVED — No longer used
OCR_SERVICE_URL=http://ocr-service:7001
OCR_SERVICE_TIMEOUT_MS=60000
VLM_SERVICE_URL=http://vlm-service:8100
VLM_TIMEOUT_MS=120000
VLM_ENABLED=true
VLM_MODEL_NAME=Qwen/Qwen2.5-VL-7B-Instruct-AWQ
```
