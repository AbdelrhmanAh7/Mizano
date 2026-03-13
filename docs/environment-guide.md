# Environment Guide

Mizano uses a 4-environment configuration system managed through `APP_ENV`.

---

## Table of Contents

1. [Environments](#environments)
2. [How It Works](#how-it-works)
3. [Local Development Setup](#local-development-setup)
4. [Per-Environment Docker](#per-environment-docker)
5. [Environment Variable Reference](#environment-variable-reference)
6. [Adding New Variables](#adding-new-variables)
7. [Environment-Specific Defaults](#environment-specific-defaults)
8. [CI/CD Integration](#cicd-integration)
9. [Troubleshooting](#troubleshooting)

---

## Environments

| Environment | File         | APP_ENV | NODE_ENV      | Purpose                         |
| ----------- | ------------ | ------- | ------------- | ------------------------------- |
| Local       | `.env.local` | `local` | `development` | Localhost development (default) |
| Development | `.env.dev`   | `dev`   | `development` | Shared development server       |
| SIT         | `.env.sit`   | `sit`   | `production`  | System Integration Testing      |
| Production  | `.env.prod`  | `prod`  | `production`  | Production deployment           |

---

## How It Works

### API (NestJS)

The API resolves env files via `ConfigModule`:

```typescript
ConfigModule.forRoot({
  envFilePath: [`.env.${process.env.APP_ENV || 'local'}`, '.env'],
});
```

Resolution order:

1. `.env.${APP_ENV}` (e.g., `.env.dev`)
2. `.env` (fallback)

### Web (Next.js)

Next.js uses its built-in env loading convention:

1. `.env.$(NODE_ENV).local`
2. `.env.local`
3. `.env.$(NODE_ENV)`
4. `.env`

The `APP_ENV` variable is primarily used by the API. Next.js reads from `.env` for local development.

> **Important:** Only variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. All other variables are server-side only.

---

## Local Development Setup

```bash
# 1. Copy the local template to .env
cp .env.local .env

# 2. Start infrastructure + apps
pnpm dev

# 3. Verify env resolution
pnpm env:check
```

---

## Per-Environment Docker

```bash
# Development server
pnpm docker:dev

# SIT (production-like resources)
pnpm docker:sit

# Production
pnpm docker:prod
```

---

## Environment Variable Reference

### Core

| Variable   | Required | Default       | Description                                        |
| ---------- | -------- | ------------- | -------------------------------------------------- |
| `APP_ENV`  | No       | `local`       | Active environment (`local`, `dev`, `sit`, `prod`) |
| `NODE_ENV` | No       | `development` | Node environment (`development`, `production`)     |

### Database

| Variable                  | Required | Default | Description                                            |
| ------------------------- | -------- | ------- | ------------------------------------------------------ |
| `DATABASE_URL`            | Yes      | —       | PostgreSQL connection string                           |
| `DATABASE_POOL_SIZE`      | No       | `10`    | Max connections in the primary pool                    |
| `DATABASE_POOL_TIMEOUT`   | No       | `10`    | Seconds to wait for a free connection                  |
| `READ_DATABASE_URL`       | No       | —       | Read replica connection string (falls back to primary) |
| `DATABASE_READ_POOL_SIZE` | No       | `10`    | Max connections in the replica pool                    |

### Redis

| Variable    | Required | Default | Description          |
| ----------- | -------- | ------- | -------------------- |
| `REDIS_URL` | Yes      | —       | Redis connection URL |

### Authentication

| Variable                 | Required | Default | Description                        |
| ------------------------ | -------- | ------- | ---------------------------------- |
| `JWT_SECRET`             | Yes      | —       | Secret for signing access tokens   |
| `JWT_REFRESH_SECRET`     | Yes      | —       | Secret for signing refresh tokens  |
| `JWT_EXPIRATION`         | No       | `15m`   | Access token expiry                |
| `JWT_REFRESH_EXPIRATION` | No       | `7d`    | Refresh token expiry               |
| `NEXTAUTH_SECRET`        | Yes      | —       | NextAuth.js session encryption key |
| `NEXTAUTH_URL`           | Yes      | —       | Frontend base URL for NextAuth     |

### API Configuration

| Variable      | Required | Default | Description            |
| ------------- | -------- | ------- | ---------------------- |
| `API_URL`     | Yes      | —       | Backend API base URL   |
| `API_PORT`    | No       | `6001`  | Port for NestJS        |
| `CORS_ORIGIN` | No       | —       | Allowed CORS origin(s) |

### Frontend

| Variable               | Required | Default  | Description                    |
| ---------------------- | -------- | -------- | ------------------------------ |
| `NEXT_PUBLIC_API_URL`  | Yes      | —        | API URL exposed to the browser |
| `NEXT_PUBLIC_APP_NAME` | No       | `Mizano` | Application display name       |

### Rate Limiting

| Variable              | Required | Default | Description                  |
| --------------------- | -------- | ------- | ---------------------------- |
| `RATE_LIMIT_TTL`      | No       | `1000`  | Rate limit window (ms)       |
| `RATE_LIMIT_MAX`      | No       | `100`   | Max requests per window      |
| `RATE_LIMIT_AUTH_MAX` | No       | `100`   | Max auth requests per window |

### Logging & Monitoring

| Variable                  | Required | Default | Description                                  |
| ------------------------- | -------- | ------- | -------------------------------------------- |
| `LOG_LEVEL`               | No       | `debug` | Log level (`debug`, `info`, `warn`, `error`) |
| `SLOW_QUERY_THRESHOLD_MS` | No       | `100`   | Queries exceeding this (ms) flagged as slow  |

### OCR Service

| Variable                 | Required | Default | Description                    |
| ------------------------ | -------- | ------- | ------------------------------ |
| `OCR_SERVICE_URL`        | No       | —       | PaddleOCR + Tesseract endpoint |
| `OCR_SERVICE_TIMEOUT_MS` | No       | `60000` | Request timeout (ms)           |

### VLM Service

| Variable          | Required | Default                           | Description                    |
| ----------------- | -------- | --------------------------------- | ------------------------------ |
| `VLM_SERVICE_URL` | No       | —                                 | Vision-Language Model endpoint |
| `VLM_TIMEOUT_MS`  | No       | `120000`                          | Request timeout (ms)           |
| `VLM_ENABLED`     | No       | `true`                            | Enable/disable VLM features    |
| `VLM_MODEL_NAME`  | No       | `Qwen/Qwen2.5-VL-7B-Instruct-AWQ` | Model to use for VLM           |

### Email (SMTP)

| Variable          | Required | Default | Description                 |
| ----------------- | -------- | ------- | --------------------------- |
| `SMTP_HOST`       | No       | —       | SMTP server hostname        |
| `SMTP_PORT`       | No       | `587`   | SMTP server port            |
| `SMTP_USER`       | No       | —       | SMTP username/email         |
| `SMTP_PASSWORD`   | No       | —       | SMTP password / app key     |
| `SMTP_FROM_EMAIL` | No       | —       | Default sender address      |
| `SMTP_FROM_NAME`  | No       | —       | Default sender display name |

---

## Adding New Variables

When adding a new environment variable:

1. Add it to **all 4 env template files** (`.env.local`, `.env.dev`, `.env.sit`, `.env.prod`)
2. Use `__CHANGE_ME__` as the placeholder value for secrets
3. Use environment-appropriate defaults for non-secrets
4. Group variables by section with comments
5. Update this guide with the new variable in the reference table above

---

## Environment-Specific Defaults

| Variable         | Local       | Dev         | SIT        | Prod       |
| ---------------- | ----------- | ----------- | ---------- | ---------- |
| `LOG_LEVEL`      | debug       | debug       | info       | warn       |
| `RATE_LIMIT_MAX` | 100         | 100         | 60         | 30         |
| `NODE_ENV`       | development | development | production | production |

---

## CI/CD Integration

In CI/CD pipelines, set `APP_ENV` as an environment variable:

```yaml
# Example: GitHub Actions
env:
  APP_ENV: sit
```

The build scripts support this:

```bash
pnpm build:dev   # APP_ENV=dev
pnpm build:sit   # APP_ENV=sit
pnpm build:prod  # APP_ENV=prod
```

---

## Troubleshooting

### "Cannot connect to database"

```bash
# Check if PostgreSQL container is running
docker ps | grep postgres

# If not running, start infrastructure
pnpm docker:up

# Verify DATABASE_URL is correct
echo $DATABASE_URL
# Expected: postgresql://mizano:mizano_secret@localhost:5435/mizano_db
```

### "Cannot connect to Redis"

```bash
# Check if Redis container is running
docker ps | grep redis

# Test Redis connectivity
redis-cli -p 6380 ping
# Expected: PONG
```

### Wrong env file being used

```bash
# Check which env file is active
pnpm env:check

# Explicitly set APP_ENV
APP_ENV=dev pnpm dev:api
```

### "NEXT*PUBLIC*\* variable is undefined in browser"

- Variables must be prefixed with `NEXT_PUBLIC_` to be available client-side
- After changing `NEXT_PUBLIC_*` variables, restart the Next.js dev server
- These variables are embedded at **build time**, not runtime
