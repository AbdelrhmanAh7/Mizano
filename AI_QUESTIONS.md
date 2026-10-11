# Questions for the owner (#153)

Workflow files are owner-only, so none of these were changed on `ai/153`. Label the issue `ci-change` if you want them applied.

1. **Node version in `.github/workflows/e2e-army.yml` (`NODE_VERSION: '22'`).** CodeRabbit asks for Node 20 to match the other jobs. Node 20 cannot work for this job: `e2e@0.18.0` and `@e2e-dev/web@0.13.0` declare `engines: ^22.22.3 || >=24.8.0`, and `scripts/e2e-army.sh` refuses older Node (exit 78). Keep 22 for this job only; `docs/DEVELOPMENT.md` line 7 documents the exception. Option: move every job to Node 22 in a separate issue.
2. **Redis service container (QA finding).** Not needed and deliberately absent: `scripts/e2e-army.sh` exports `REDIS_URL=""`, and with it empty the API falls back to the in-memory cache (`apps/api/src/cache/cache.module.ts:16`) and the in-process intake queue (`apps/api/src/modules/ai/intake/intake-queue.service.ts:48`). This is also the stack the hub's verify job uses. `docs/DEVELOPMENT.md` wrongly said the job had a Redis container; that is corrected.
