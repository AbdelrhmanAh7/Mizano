# AI questions — #183 Secure Docker Compose production stacks

The CTO rework on PR #203 (2026-10-11, head 51bfc81) asks for two CI/workflow
changes. The owner rule for this repo says workflow and CI config changes always
stop at the owner, so they are proposed here and **not** made in this PR.

## 1. `.github/workflows/deploy.yml` (needed before the next production deploy)

The production compose file now builds the API's `REDIS_URL` itself:
`redis://:${REDIS_PASSWORD:-${POSTGRES_PASSWORD}}@redis:6379/0`. The `REDIS_URL`
line deploy.yml writes into `~/mizano/.env` (about line 225) is no longer read by
the `api` service (its `environment:` entry wins), so the deploy does not lose
Redis auth. What can still break: deploy.yml writes the raw `POSTGRES_PASSWORD`
secret, and if that secret contains `/ + = @ : % ?` the compose-built Redis URL
does not parse (and URL-encoding it does not help: clients decode the URL, so
they would send the raw secret while `requirepass` holds the encoded one).
Proposed change, using only the existing `POSTGRES_PASSWORD` secret (no new
secret, nothing echoed): derive a URL-safe hex Redis password from it.

```sh
# replaces: echo "REDIS_URL=redis://redis:6379"
REDIS_PASS_HEX=$(printf '%s' "${PG_PASS}" | sha256sum | cut -c1-64)
printf 'REDIS_PASSWORD=%s\n' "${REDIS_PASS_HEX}"
```

Compose then uses it for `--requirepass`, `REDISCLI_AUTH` and the API's
`REDIS_URL`. Rotating the secret to `openssl rand -hex 32` would also work.

## 2. Wire `scripts/check-compose-security.sh` into the lint job

The script runs `docker compose config` on both production compose files and
fails on a published 5432/6379, a missing `--requirepass`, a `REDIS_URL` without
credentials, or a config that renders without `POSTGRES_PASSWORD`. Proposed
step in `.github/workflows/ci.yml` (lint job; GitHub-hosted runners ship Docker
Compose v2):

```yaml
- name: Compose security check
  run: bash scripts/check-compose-security.sh
```

Until then the same checks run in the unit suite through
`apps/api/src/cache/production-compose.spec.ts` (no Docker needed).
