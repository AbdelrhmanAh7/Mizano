---
description: Environment management — check, switch, validate env vars, compare files
---

// turbo-all

# Environment Management

## Steps

### Check Current Environment

```bash
pnpm env:check
```

### Check a Specific Environment

```bash
APP_ENV=dev pnpm env:check
APP_ENV=sit pnpm env:check
APP_ENV=prod pnpm env:check
```

### View Environment File Contents (redacted)

```bash
grep -E "^[A-Z]" .env.local | sed 's/=.*/=***/'
```

### Compare Two Environment Files (keys only)

```bash
diff <(grep -E "^[A-Z]" .env.local | cut -d= -f1 | sort) <(grep -E "^[A-Z]" .env.prod | cut -d= -f1 | sort)
```

## Environment System (4-env)

| File         | APP_ENV | NODE_ENV    | Purpose             |
| ------------ | ------- | ----------- | ------------------- |
| `.env.local` | local   | development | Local dev (default) |
| `.env.dev`   | dev     | development | Shared dev server   |
| `.env.sit`   | sit     | production  | Integration testing |
| `.env.prod`  | prod    | production  | Production          |

## Required Variables

```
DATABASE_URL      — PostgreSQL connection string
REDIS_URL         — Redis connection string
JWT_SECRET        — JWT signing secret
JWT_REFRESH_SECRET — Refresh token secret
NEXTAUTH_SECRET   — NextAuth.js secret
NEXTAUTH_URL      — Frontend URL
API_URL           — Backend URL (server-side)
NEXT_PUBLIC_API_URL — Backend URL (client-side)
```

## Note

The API resolves env files as: `.env.${APP_ENV}` → `.env`. See [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md#environments) for full details.
