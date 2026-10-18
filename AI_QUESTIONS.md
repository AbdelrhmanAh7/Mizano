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
