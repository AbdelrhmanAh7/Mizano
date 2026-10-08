# AI questions — issue #132

The implementation is complete. One follow-up needs the owner because it touches CI, which implementers must not edit.

## CI suggestion: `deploy.yml` must write `REDIS_PASSWORD`

`docker-compose.production.yml` now requires `REDIS_PASSWORD` (Redis `--requirepass`, and the API's `REDIS_URL` is `redis://:${REDIS_PASSWORD}@redis:6379`). The "Write .env on server" step in `.github/workflows/deploy.yml` writes `REDIS_URL=redis://redis:6379` and no `REDIS_PASSWORD`, so the next GCP rollout would stop at `docker compose ... up` with `set REDIS_PASSWORD`. That workflow is currently disabled and the VM unreachable, so nothing breaks today.

Suggested change (owner only):

1. Add a repository secret `REDIS_PASSWORD`, URL-safe, for example from `openssl rand -hex 32`.
2. In "Write .env on server", pass it as an env var (`REDIS_PASS: ${{ secrets.REDIS_PASSWORD }}`, also listed in `envs:`), then replace the `REDIS_URL` line with:

   ```sh
   printf 'REDIS_PASSWORD=%s\n' "${REDIS_PASS}"
   ```

   The compose file builds `REDIS_URL` itself. Optionally add `TRUST_PROXY_HOPS=1`, which is already the default.

3. Redis loads `--requirepass` only when it starts, so the first rollout after this change must recreate the `redis` container. `up -d postgres redis` does that automatically because the command changed.

The deploy step `npx prisma db seed ... || true` now exits non-zero in production (the seed refuses `NODE_ENV=production` without `SEED_ALLOW_PROD=1`). The `|| true` already tolerates that, so no change is needed unless the owner wants the step removed.
