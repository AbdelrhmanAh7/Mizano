---
description: Debug API issues — check Docker, test endpoints, verify DB, check logs
---

// turbo-all

# Debug API Issues

## Steps

### 1. Check Docker Containers

```bash
docker-compose ps
```

### 2. Check if API Port is in Use

```bash
lsof -i :6001 2>/dev/null || echo "Port 6001 not in use"
```

### 3. Check Docker Logs

```bash
docker-compose logs --tail=50
```

### 4. Test API Health Endpoint

```bash
curl -v http://localhost:6001/api/health
```

### 5. Test Authenticated Endpoint

```bash
# First, get a token by logging in
TOKEN=$(curl -s -X POST http://localhost:6001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mizano.com","password":"admin123"}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

# Then test with the token
curl -H "Authorization: Bearer $TOKEN" http://localhost:6001/api/organizations
```

### 6. Check Database Connection

```bash
pnpm --filter api exec prisma db execute --stdin <<< "SELECT 1"
```

### 7. Validate Prisma Schema

```bash
pnpm db:check
```

### 8. Check for Port Conflicts

```bash
lsof -i :5001 2>/dev/null && echo "Web port in use"
lsof -i :6001 2>/dev/null && echo "API port in use"
lsof -i :5435 2>/dev/null && echo "PostgreSQL port in use"
lsof -i :6380 2>/dev/null && echo "Redis port in use"
```

### 9. Kill Processes on Ports (if needed)

```bash
lsof -ti :6001 | xargs kill -9 2>/dev/null
lsof -ti :5001 | xargs kill -9 2>/dev/null
```

### 10. Restart Everything

```bash
docker-compose down && docker-compose up -d && pnpm dev
```

## Common Issues

| Issue                        | Solution                                           |
| ---------------------------- | -------------------------------------------------- |
| `ECONNREFUSED :6001`         | API not running. Start with `pnpm dev:api`         |
| `ECONNREFUSED :5435`         | PostgreSQL not running. Run `docker-compose up -d` |
| `ECONNREFUSED :6380`         | Redis not running. Run `docker-compose up -d`      |
| `MODULE_NOT_FOUND`           | Run `pnpm install` then `pnpm db:generate`         |
| `i18n dir not found`         | Check `apps/api/src/i18n/` exists                  |
| `compression not a function` | Check `compression` import in `main.ts`            |
