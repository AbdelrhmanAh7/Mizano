# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.

# Follow-ups for #212 (not in this slice)

- #162 item 3: make the stock moves in `issue` / `markReturned` atomic with the status change.
- #143: lower the heap cap in `.env.example`, fix the `.env.local` load order, route the production CMD through the launcher, align `nodeHeapMbSchema`/`parseHeapMb` with the launcher, re-run EVIDENCE for the merged head.
- #107: re-check `.husky/pre-push` CodeRabbit findings against master; fix the `docs/DEVELOPMENT.md` Minor.
- QA-checklist review of #149, #152, #154.
- The earlier note about pre-existing `tsc` errors in `logger.service.ts` no longer holds: type-check exited 0 on this head.
