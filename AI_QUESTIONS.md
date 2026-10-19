# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.

# Notes for #208 (depreciation.service spec)

Both gaps the spec first documented as `it.todo` are now fixed in `depreciation.service.ts` and covered by
real tests, because the issue's acceptance criteria (one journal per period, organizationId on every
query) cannot be met otherwise. This departs from the CTO's "do not change the service" comment; the
round-2 QA findings asked for the root cause.

1. Concurrent runs no longer double-post: the period is claimed in-transaction with
   `updateMany({ id, organizationId, executedAt: null })`; the loser aborts (manual run throws
   "already executed", monthly run skips).
2. Schedule, asset and journal queries/writes in the monthly, manual and reverse paths all carry
   `organizationId` (schedule lookups moved from `findUnique` on `assetId_month_year` to `findFirst`).

Not covered: a real-database concurrency test (the spec simulates the row-level compare-and-set in the mock).
