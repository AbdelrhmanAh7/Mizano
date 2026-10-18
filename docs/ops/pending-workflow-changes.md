# Pending workflow changes for #183

Owner rule: workflow/CI files are not edited by the implementer, so **neither change
below is applied in this PR**. The CTO approved both (comment on PR #203,
2026-10-11) and no secret is created or rotated. Apply them by hand. Neither blocks
a deploy: without change 1 Redis and the API use `POSTGRES_PASSWORD` (the API
URL-encodes it; the only unsupported character is a single quote).

Until change 2 lands, `scripts/check-compose-security.sh` does **not** gate CI.
`apps/api/src/cache/production-compose.spec.ts` runs the same checks in the unit
suite without Docker.

## 1. `.github/workflows/deploy.yml` (env file generation, about line 225)

Derive the Redis password **before** the `{ ... } > ~/mizano/.env` block. The
`::add-mask::` workflow command must go to the job's stdout; inside the redirected
block it would be written into the `.env` file instead.

Before the block (no `set -x`; never echo the value elsewhere):

```sh
REDIS_PASS_HEX=$(printf '%s' "${PG_PASS}" | sha256sum | cut -c1-64)
echo "::add-mask::${REDIS_PASS_HEX}"
```

Inside the block, replace

```sh
              echo "REDIS_URL=redis://redis:6379"
```

with

```sh
              printf 'REDIS_PASSWORD=%s\n' "${REDIS_PASS_HEX}"
```

Compose then uses a Redis password distinct from the database one for
`--requirepass`, `REDISCLI_AUTH` and the API's `REDIS_PASSWORD`. The API
percent-encodes it into the credential-free `REDIS_URL`
(`apps/api/src/cache/redis-url.ts`), so no URL-character restriction applies.

## 2. `.github/workflows/ci.yml` (lint job)

Add a step. The script sets its own dummy passwords and unsets `REDIS_PASSWORD`,
so the step needs no env. It needs Docker Compose v2 and `jq` (both on
GitHub-hosted runners):

```yaml
- name: Compose security check
  run: bash scripts/check-compose-security.sh
```
