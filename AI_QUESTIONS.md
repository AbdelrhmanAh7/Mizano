# AI questions — issue #132

No blocking questions. The implementation is complete, and `.github/workflows/deploy.yml` keeps working unchanged: every variable `docker-compose.production.yml` requires (`${VAR:?}`) is one the workflow's "Write .env on server" step already writes. `apps/api/test/production-compose.e2e-spec.ts` checks this.

## Optional CI suggestion (owner only, not needed for this PR)

Without `REDIS_PASSWORD`, Redis uses the required `POSTGRES_PASSWORD`, so the current workflow deploys an authenticated Redis. To give Redis its own secret:

1. Add a repository secret `REDIS_PASSWORD`, for example from `openssl rand -hex 32`. Any characters work, because the API percent-encodes it into `REDIS_URL`.
2. In "Write .env on server", pass it as an env var (`REDIS_PASS: ${{ secrets.REDIS_PASSWORD }}`, also listed in `envs:`) and add `printf 'REDIS_PASSWORD=%s\n' "${REDIS_PASS}"`. The workflow's `REDIS_URL` line can stay: compose sets the API's `REDIS_URL` itself.

Redis reads `--requirepass` only at start. The first rollout after this PR changes the redis `command`, so `up -d postgres redis` recreates the container. The same happens after a password change.

The deploy step `npx prisma db seed ... || true` now exits non-zero in production, because the seed refuses `NODE_ENV=production` without `SEED_ALLOW_PROD=1`. The `|| true` already tolerates that.
