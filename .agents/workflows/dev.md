---
description: Start development servers (Docker infrastructure + Web + API)
---

// turbo-all

# Start Development Servers

## Steps

1. Start Docker infrastructure (PostgreSQL + Redis):

```bash
docker-compose up -d
```

2. Verify containers are running:

```bash
docker-compose ps
```

3. Start all dev servers (Web :5001 + API :6001):

```bash
pnpm dev
```

**Note:** To start individual services instead:

- API only: `pnpm dev:api`
- Web only: `pnpm dev:web`

4. Health check — verify API is responding:

```bash
curl -s http://localhost:6001/api/health || echo "API not ready yet"
```

5. Verify Web is responding:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5001 || echo "Web not ready yet"
```

## Port Reference

| Service    | Port |
| ---------- | ---- |
| Web        | 5001 |
| API        | 6001 |
| PostgreSQL | 5435 |
| Redis      | 6380 |
