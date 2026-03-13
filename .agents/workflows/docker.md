---
description: Docker infrastructure management — up, down, logs, status, profiles
---

// turbo-all

# Docker Infrastructure

## Steps

### Start Infrastructure (PostgreSQL :5435 + Redis :6380)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && docker-compose up -d
```

### Start with OCR Service

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && docker-compose --profile ocr up -d
```

### Start with VLM Service (requires GPU)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && docker-compose --profile vlm up -d
```

### Check Status

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && docker-compose ps
```

### View Logs (follow mode)

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && docker-compose logs -f
```

### View Logs for Specific Service

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && docker-compose logs -f postgres
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && docker-compose logs -f redis
```

### Stop All Containers

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && docker-compose down
```

### Production Deployment

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm docker:prod
```

### Stop Production

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm docker:prod:down
```

## Docker Compose Files

| File                            | Purpose                   |
| ------------------------------- | ------------------------- |
| `docker-compose.yml`            | Base (PostgreSQL + Redis) |
| `docker-compose.dev.yml`        | Dev overrides             |
| `docker-compose.sit.yml`        | SIT environment           |
| `docker-compose.production.yml` | Full production stack     |
