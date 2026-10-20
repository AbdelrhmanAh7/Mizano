# Follow-up Issue Draft: Native-Runner Docker Validation

## Title

ci: validate multi-arch Docker builds on native runners under 5-minute cap

## Context

Docker multi-arch validation (`docker-build` matrix job on native amd64 `ubuntu-latest` and arm64 `ubuntu-24.04-arm`) was initially introduced in PR #82 to validate Dockerfile builds without QEMU emulation. However, measured cold-cache build times were ~8m36s (arm64) and ~11m37s (amd64), which exceeds the project's strict 5-minute owner rule (`timeout-minutes: 5`).

To allow PR #82 to ship essential CI improvements (draft gating, concurrency groups, Turbo caching, and task input guards), `docker-build` was extracted into this follow-up.

## Acceptance Criteria

- [ ] A cold-cache run is proven under 5 minutes per leg before it is added to `ci.yml`.
- [ ] Investigate design optimizations:
  - Separate `pnpm install` / dependency fetching from build steps
  - Pre-built base layers or minimal multi-stage targets
  - Optimized layer ordering to maximize warm/cold cache performance
- [ ] Native runners used: `ubuntu-latest` (amd64) and `ubuntu-24.04-arm` (arm64).
- [ ] Gated execution: runs on pushes to `master`/`develop` or PRs touching Docker files/paths.
- [ ] Validation only: `push: false`, publishing remains exclusively owned by `.github/workflows/deploy.yml`.
- [ ] Enforces `timeout-minutes: 5` on every matrix leg with zero continue-on-error.
