# Environment Guide

Mizano uses a 4-environment configuration system managed through `APP_ENV`.

## Environments

| Environment | File         | APP_ENV | NODE_ENV      | Purpose                         |
| ----------- | ------------ | ------- | ------------- | ------------------------------- |
| Local       | `.env.local` | `local` | `development` | Localhost development (default) |
| Development | `.env.dev`   | `dev`   | `development` | Shared development server       |
| SIT         | `.env.sit`   | `sit`   | `production`  | System Integration Testing      |
| Production  | `.env.prod`  | `prod`  | `production`  | Production deployment           |

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

## Local Development Setup

```bash
# 1. Copy the local template to .env
cp .env.local .env

# 2. Start infrastructure + apps
pnpm dev

# 3. Verify env resolution
pnpm env:check
```

## Per-Environment Docker

```bash
# Development server
pnpm docker:dev

# SIT (production-like resources)
pnpm docker:sit

# Production
pnpm docker:prod
```

## Adding New Variables

When adding a new environment variable:

1. Add it to ALL 4 env template files (`.env.local`, `.env.dev`, `.env.sit`, `.env.prod`)
2. Use `__CHANGE_ME__` as the placeholder value for secrets
3. Use environment-appropriate defaults for non-secrets
4. Group variables by section with comments
5. Document the new variable in `docs/environment-guide.md`

## Environment-Specific Defaults

| Variable         | Local       | Dev         | SIT        | Prod       |
| ---------------- | ----------- | ----------- | ---------- | ---------- |
| `LOG_LEVEL`      | debug       | debug       | info       | warn       |
| `RATE_LIMIT_MAX` | 100         | 100         | 60         | 30         |
| `NODE_ENV`       | development | development | production | production |

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
