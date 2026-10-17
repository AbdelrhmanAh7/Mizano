# AI_QUESTIONS — #142 (needs the owner: CI/deploy workflow)

1. **`.github/workflows/deploy.yml` does not start the intake worker.** The deploy step brings up only `api`, `web` and `nginx`
   (`docker compose -f docker-compose.production.yml up -d --no-deps api` … lines ~316–319). Now that the API only enqueues, a deploy
   without the worker leaves every upload `QUEUED`. The CTO comment on PR #146 asks for the worker in that list, but owner rule: workflow
   changes always stop at the owner, and #142 is not a CI issue, so it is **not** changed here. Suggested edit, one line after the `api` restart:

   ```bash
   docker compose -f docker-compose.production.yml up -d --no-deps intake-worker
   ```

   (The service name is `intake-worker`; it already depends on postgres/redis health and uses the `${API_IMAGE}` image.)

2. **Local DB-backed e2e not runnable in this session.** No PostgreSQL (`localhost:5435`) or Redis was reachable in the sandbox, so
   `apps/api/test/intake-worker-isolation.e2e-spec.ts` and the `e2e-army` file were not executed locally this round; CI (`ci.yml`) runs the
   API e2e against its own services.

3. **`@types/js-yaml` is missing from the local install** (pre-existing: `coderabbit-config.spec.ts` fails the same way locally). The new
   `worker-deploy-config.spec.ts` uses `js-yaml` like that spec; it was run locally with ts-jest diagnostics off for that one TS7016 error.
