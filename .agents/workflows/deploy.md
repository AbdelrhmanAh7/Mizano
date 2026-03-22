---
description: Deployment workflow — pre-checks, build, deploy to production
---

// turbo-all

# Deploy

## Steps

1. Run full CI checks first (all must pass with zero warnings):

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm ci:full
```

2. Verify environment file for target environment:

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && APP_ENV=prod node -e "const e=process.env.APP_ENV||'local';const f='.env.'+e;require('fs').existsSync(f)?console.log('Using: '+f):console.error('Missing: '+f)"
```

3. Build for production:

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm build:prod
```

4. Deploy via Docker (production stack):

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm docker:prod
```

5. Verify deployment:

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && docker-compose -f docker-compose.production.yml ps
```

## Pre-Deploy Checklist

- [ ] All tests pass (`pnpm ci:full`)
- [ ] Environment variables set in `.env.prod`
- [ ] Database migrations applied
- [ ] No uncommitted changes
- [ ] Version bumped if needed

## Deployment Targets

- **Kamatera VPS** (primary): CI/CD via `.github/workflows/deploy.yml` -> SSH to 185.247.117.157
- **Railway**: See `railway.toml` for configuration
- **Render**: See `render.yaml` for configuration
- **Docker**: Use `docker-compose.production.yml`

## Rollback

To stop production and revert:

```bash
cd /mnt/c/Users/Abdelrahman/Desktop/Personal_Project/Mizano && pnpm docker:prod:down
```
