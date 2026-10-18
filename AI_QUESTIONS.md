# AI Questions for Owner

## Question: Timeout exception for `docker-build` job in PR #82

- **Owner rule**: "every job stays under 5 minutes (`timeout-minutes: 5`) ... split a job rather than raising the limit." All other CI jobs (`Install Dependencies`, `Lint & Type Check`, `Unit Tests`, `Build`, `CI Gate`, `Path Filter`) strictly comply with `timeout-minutes: 5`.
- **Finding**: On PR #82, building the production multi-architecture Docker images (`apps/api` and `apps/web` for `amd64` and `arm64`) on native runners takes approximately 8m36s on `arm64` (`ubuntu-24.04-arm`) and 11m37s on `amd64` (`ubuntu-latest`). Under a 5-minute limit, `docker-build` would time out and fail.
- **Current implementation**: PR #82 sets `timeout-minutes: 30` on `docker-build`. The job is strictly gated: it only runs on pushes to `master`/`develop`, on PRs with changes to Dockerfiles/deploy files/ci workflows, or when explicitly requested via the `docker` label. It does not block the 4 fast required check statuses (`Install Dependencies`, `Lint & Type Check`, `Unit Tests`, `Build`).
- **Options for the owner**:
  1. **Option 1 (Recommended)**: Approve an explicit documented exception to the 5-minute rule for `docker-build` (`timeout-minutes: 30`), while keeping the strict 5-minute limit for all other CI jobs.
  2. **Option 2**: Require splitting the Docker build into separate per-image or per-target jobs if feasible to try to fit within 5 minutes.
  3. **Option 3**: Remove `docker-build` from `ci.yml` in this PR entirely and move Docker image validation to `nightly.yml` or a separate scheduled workflow.
# Questions / follow-ups for #186 (CI config is owner-only, so nothing was changed there)

1. `.github/workflows/deploy.yml:325` runs `docker exec mizano-api npx prisma db seed ... || true` after
   every production rollout. With this guard (container `NODE_ENV=production`) that step now prints the
   refusal and exits 1, which `|| true` swallows, so deploys keep working and no demo admin is created.
   Decision needed: leave as is (recommended, the intended outcome of #186), or remove the now-pointless
   seed step from the workflow, or export `SEED_ALLOW_PROD=1` there if a production seed is still wanted.
2. The issue text says `npm run seed`, but `apps/api/package.json` only had `prisma.seed`, no `seed` script.
   Added `"seed": "ts-node prisma/seed.ts"` so `pnpm --filter api seed` works as the acceptance criteria state.
