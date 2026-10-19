# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.

# Follow-ups from #208 (depreciation.service spec), not fixed in that PR per the CTO rule

The spec marks both cases `it.todo` in
`apps/api/src/modules/assets/services/depreciation.service.spec.ts`. Each needs its own fix issue under #134.

1. **Concurrent runs post the same period twice.** `runMonthlyDepreciation` and `runDepreciationForAsset`
   check `scheduleEntry.executedAt` before `$transaction`, and `depreciationSchedule.update` has no
   `executedAt: null` guard. A probe test that ran two `runDepreciationForAsset(org, asset, 3, 2026)` calls
   with `Promise.allSettled` got `journal.create` called 2 times (expected 1). Suggested fix: inside the
   transaction, `updateMany({ where: { id, organizationId, executedAt: null } })` and abort when `count` is 0.
2. **Queries keyed by id only.** `depreciationSchedule.findUnique/update/findMany` and `asset.update` carry no
   `organizationId`. They are tenant-safe today only because the asset is first read with `organizationId`.
