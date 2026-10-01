---
description: Deployment workflow — pre-checks, build, deploy to production
---

// turbo-all

# Deploy

## Steps

1. Run full CI checks first (all must pass with zero warnings):

```bash
pnpm ci:full
```

2. Verify environment file for target environment:

```bash
APP_ENV=prod node -e "const e=process.env.APP_ENV||'local';const f='.env.'+e;require('fs').existsSync(f)?console.log('Using: '+f):console.error('Missing: '+f)"
```

3. Build for production:

```bash
pnpm build:prod
```

4. Deploy via Docker (production stack):

```bash
pnpm docker:prod
```

5. Verify deployment:

```bash
docker-compose -f docker-compose.production.yml ps
```

## Pre-Deploy Checklist

- [ ] All tests pass (`pnpm ci:full`)
- [ ] Environment variables set in `.env.prod`
- [ ] Database migrations applied
- [ ] No uncommitted changes
- [ ] Version bumped if needed

## Deployment Targets

- **Production VM (GCP)**: `.github/workflows/deploy.yml` builds API/web images, pushes them to GHCR and rolls out `docker-compose.production.yml` over SSH after CI passes on `master`. Host/user/key come from repository secrets.
- **Manual Docker**: `pnpm docker:prod` with `.env.prod` and `docker-compose.production.yml`.

See [docs/DEVELOPMENT.md](../../docs/DEVELOPMENT.md#deployment) for details.

## Rollback

To stop production and revert:

```bash
pnpm docker:prod:down
```
