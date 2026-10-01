---
description: Docker infrastructure management — up, down, logs, status
---

// turbo-all

# Docker Infrastructure

## Steps

### Start Infrastructure (PostgreSQL :5435 + Redis :6380)

```bash
docker-compose up -d
```

### Check Status

```bash
docker-compose ps
```

### View Logs (follow mode)

```bash
docker-compose logs -f
```

### View Logs for Specific Service

```bash
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Stop All Containers

```bash
docker-compose down
```

### Production Deployment

```bash
pnpm docker:prod
```

### Stop Production

```bash
pnpm docker:prod:down
```

## Docker Compose Files

| File                            | Purpose                   |
| ------------------------------- | ------------------------- |
| `docker-compose.yml`            | Base (PostgreSQL + Redis) |
| `docker-compose.dev.yml`        | Dev overrides             |
| `docker-compose.sit.yml`        | SIT environment           |
| `docker-compose.production.yml` | Full production stack     |
