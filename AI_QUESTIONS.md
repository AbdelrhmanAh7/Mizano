# Follow-ups found while doing #165 (left out of the PR on purpose: one task per PR)

1. `apps/web/lib/api.ts` `workOrdersApi`: everything except `bulkComplete` still calls `/work-orders/...`, and no API
   controller serves that path (the API lives at `/manufacturing/work-orders`). On the work orders page, the bulk
   Start / Cancel / Delete actions return 404. The list and the single actions go through `use-manufacturing.ts`
   and work. Fix: `crud('/manufacturing/work-orders')` plus the same prefix for every method.
2. `use-manufacturing.ts` `complete()` posts `{ producedQuantity }`, but the API reads `quantityProduced`, so a
   single completion from the detail page reaches `completeWorkOrder` with no quantity.
3. `bulkStart` / `bulkCancel` / `bulkDelete` (work orders) still use raw `updateMany` with inline `{ ids }` bodies.
   They should go through `runBulk` with the single commands and `BulkIdsDto` the way bulk-complete now does.
4. `completeWorkOrder` (single and bulk) writes movements, the COGM journal and the status update without one
   enclosing transaction or a conditional status claim. Two overlapping requests can complete an order twice.
   It also does not check component availability (only `start` does). This overlaps #195, which routes COGM
   through Journals.
5. `recordProduction` moves stock but posts no COGM journal. Bulk-complete now refuses orders with recorded
   production; how partial production should be costed is still open.
6. The manufacturing controllers use no `@InvalidatesLedger`, so cached ledger reports can lag behind a COGM
   posting until they expire (both the single and the bulk route).

# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.

# Hub suggestions from #165 (hub config is owner-only, nothing was changed there)

1. `ops/verify/scope.json` (Mizano `e2e`) matches only `apps/web/e2e/*.spec.ts` and `apps/api/test/*.e2e-spec.ts`, so
   the verifier reported "E2E TESTS THE PR ADDED: none" for a PR that added `e2e-army/165-*.e2e.ts`. Suggest adding
   `^e2e-army/.*\.e2e\.ts$`.
2. `prMaterial` in `src/jobs/verify.ts` reads a test title only when it is on the same line as `test(`/`it(`. Prettier
   (printWidth 100) moves long titles to the next line, so those titles are missed as well.
3. The e2e-army gate runs the hub suite and the PR tests in one 270 s window. On `a31297a` the hub login tests used it up
   waiting on failed model calls, so the PR tests never started. A separate budget for the PR tests would help.
