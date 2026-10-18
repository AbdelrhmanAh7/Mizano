# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.

---

# AI_QUESTIONS — #182

Deferred from this slice (first slice = offset mapping only, per spec):

1. Restore the reverted async entity-extraction path (T3) in the service/controller/DTO.
2. Update the E2E PDF fixtures and run the full E2E suite for Unicode length handling.
3. Offsets are only set for subtotal/tax/total; date, invoice number, vendor and tax id still expose line evidence only.
4. Local `pnpm --filter api type-check` fails on the base because `@mizano/shared-types` is not built (logger/filter files); none of the errors are in the changed files.
