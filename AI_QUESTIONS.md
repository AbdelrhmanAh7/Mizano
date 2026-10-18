# Resolved Questions

## PR #82: Timeout for `docker-build` job in PR #82

- **Resolution**: Per CTO rework directive, Option 2 was implemented: `docker-build` is split into parallel per-image and per-architecture matrix legs (`api` / `web` on `amd64` / `arm64`), strictly enforcing `timeout-minutes: 5` across every job in `.github/workflows/ci.yml`. No 5-minute owner rule exceptions remain.

# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.
