# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.

# Follow-ups for #209 / PR #295 (CTO rework directives)

## 1. Sibling PR: ai/209-bulk (`bulk-operations.service.spec.ts`)

Per CTO instruction, PR #295 is scoped to `bank-transactions.service.spec.ts` (~250 lines diff). Sibling PR on branch `ai/209-bulk` covers `bulk-operations.service.spec.ts`.

## 2. Bug Issue Draft: BulkOperationsService empty job and retry failures

- **Title**: `bug(bulk-operations): empty job status evaluates to failed and retry accumulates prior failures`
- **Component**: `apps/api/src/modules/bulk-operations/bulk-operations.service.ts`
- **Description**:
  1. In `bulk-operations.service.ts:80`: `job.status = job.failures.length === job.total ? 'failed' : 'completed';`. When `ids` is empty, `job.total === 0` and `job.failures.length === 0`. Because `0 === 0`, an empty job is marked as `'failed'` instead of `'completed'`.
  2. When retrying a job with failed IDs, `job.failures` array is never reset. Prior failures persist across retries, causing `failures.length === total` to falsely mark retried jobs as `'failed'` even when all retry items succeed.

## 3. Security Issue Draft: BulkOperationsService missing organizationId scoping

- **Title**: `sec(bulk-operations): getJob and processJob lack organizationId scoping enabling cross-tenant access`
- **Component**: `apps/api/src/modules/bulk-operations/bulk-operations.service.ts`
- **Description**:
  1. `getJob(jobId: string)` and `processJob(jobId: string)` only take a `jobId` parameter and lookup from the shared `Map<string, BulkJobState>`.
  2. Neither method accepts or verifies an `organizationId`. A caller from organization A with knowledge of a UUID `jobId` belonging to organization B can inspect job state, progress, failure reasons, and trigger processing.
  3. Fix: Update `getJob(organizationId: string, jobId: string)` and `processJob(organizationId: string, jobId: string, ...)` to reject access when `job.organizationId !== organizationId`.
