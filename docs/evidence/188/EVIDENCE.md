# PR #188 Verification Report: Slim-down 1/3 (Dead code, unused deps, Storybook, retired deploy paths)

**Tested commit**: `35ff5af6b018644f9ddfbd1dd20aafae043f1982` on `chore/slim-mz-deadcode`  
**Base**: `origin/master`  
**Purpose**: Fix open findings on PR #188: pre-push hook rejection (tsc failure TS2307), unresolved merge conflict markers, CodeRabbit review threads on `docs/DEVELOPMENT.md`, and verify test suites.

---

## Acceptance Criteria & Verification Mapping

### AC1 — TypeScript Compilation Clean Across Workspaces

- **Requirement**: `tsc --noEmit` must pass with exit 0 in `apps/api`, `apps/web`, and all packages with no broken imports or missing type declarations.
- **Verification Command**:

  ```bash
  cd apps/api && pnpm exec tsc --noEmit
  cd ../web && pnpm exec tsc --noEmit
  pnpm --filter @mizano/shared-types run build
  pnpm --filter @mizano/validators run type-check
  ```

- **Observed Exit Code**: 0
- **Evidence**:
  - `apps/api`: clean, 0 errors
  - `apps/web`: clean, 0 errors
  - `@mizano/shared-types`: built cleanly
  - `@mizano/validators`: clean, 0 errors

### AC2 — No Git Conflict Markers in Tracked Markdown Files

- **Requirement**: No leftover `<<<<<<< HEAD`, `=======`, or `>>>>>>>` markers anywhere in documentation.
- **Verification Command**:

  ```bash
  python3 -m unittest discover -s scripts -p 'test_no_conflict_markers.py'
  ```

- **Observed Output**:

  ```text
  Ran 10 tests in 0.015s
  OK
  ```

- **Observed Exit Code**: 0

### AC3 — CodeRabbit Review Findings Resolved on `docs/DEVELOPMENT.md`

- **Requirement**:
  1. Fork-PR statement narrowed: say that whether approval is required depends on repository or organization GitHub Actions policy (by default, approval is required for first-time contributors).
  2. Stale GCP VM deployment pipeline (`.github/workflows/deploy.yml`) removed from `docs/DEVELOPMENT.md`, matching the Mac mini production target.
  3. Stale planning-tools description updated to offline tests (`scripts/test_*.py`).
  4. Unit Tests job description updated to reflect mock-only execution (no service containers).
- **Verification**: Verified text in [`docs/DEVELOPMENT.md`](../../DEVELOPMENT.md) lines 10, 114, 149, 163-188.
- **Observed Exit Code**: 0

### AC4 — `batch-processor.util` Unit Test Passing

- **Requirement**: `batch-processor.util.ts` restored from master so `batch-processor.util.spec.ts` (added on master in #198/#241) compiles and passes all unit tests.
- **Verification Command**:

  ```bash
  pnpm --filter api exec jest src/modules/ai/utils/batch-processor.util.spec.ts --runInBand
  ```

- **Observed Output**:

  ```text
  PASS src/modules/ai/utils/batch-processor.util.spec.ts
    batchProcessWithRiskAggregation
      ✓ returns all-zero counts for empty input without calling the processor (1 ms)
      ✓ splits 3 items with batchSize 5 into Math.ceil(total / batchSize) ordered batches (2 ms)
      ✓ splits 5 items with batchSize 5 into Math.ceil(total / batchSize) ordered batches
      ✓ splits 10 items with batchSize 5 into Math.ceil(total / batchSize) ordered batches (1 ms)
      ✓ splits 11 items with batchSize 5 into Math.ceil(total / batchSize) ordered batches
      ✓ splits 4 items with batchSize 1 into Math.ceil(total / batchSize) ordered batches
      ✓ uses a default batchSize of 10 (1 ms)
      ✓ does not start the next batch until every item of the current batch has settled
      ✓ counts HIGH and CRITICAL as highRisk, MEDIUM as mediumRisk and LOW as lowRisk
      ✓ counts rejections as failed and keeps processing the rest of the batch and later batches
      ✓ resolves rather than rejects when every item fails
      ✓ reports processed as the input length, so processed = high + medium + low + failed
      ✎ todo rejects or clamps batchSize <= 0 instead of looping forever (util defect, not fixed here)

  Test Suites: 1 passed, 1 total
  Tests:       1 todo, 12 passed, 13 total
  Snapshots:   0 total
  Time:        2.04 s
  ```

- **Observed Exit Code**: 0

### AC5 — Vision and Consistency Tests Pass

- **Requirement**: `scripts/test_vision_docs.py` passes all consistency assertions against live milestones.
- **Verification Command**:

  ```bash
  python3 -m unittest discover -s scripts -p 'test_vision_docs.py'
  ```

- **Observed Output**:

  ```text
  Ran 4 tests in 0.000s
  OK
  ```

- **Observed Exit Code**: 0

### AC6 — Pi Deploy Worker Gating Spec (Historical Coverage)

- **Note**: This test remains in the tree but targets the retired `deploy.sh` flow and removed systemd units that scheduled `healthcheck.sh`. It is retained as standalone script regression coverage, not as validation of a supported deployment path.
- **Requirement**: Worker deploy gating tests in `apps/api/src/deploy-worker-gating.spec.ts` pass cleanly.
- **Verification Command**:

  ```bash
  pnpm --filter api exec jest src/deploy-worker-gating.spec.ts --runInBand
  ```

- **Observed Output**:

  ```text
  PASS src/deploy-worker-gating.spec.ts
    Pi deploy scripts gate on the intake worker
      ✓ wait_healthy succeeds when api, web and worker are healthy (838 ms)
      ✓ wait_healthy fails when only the worker is unhealthy (5193 ms)
      ✓ healthcheck.sh reports a missing or unhealthy worker like api and web (1 ms)

  Test Suites: 1 passed, 1 total
  Tests:       3 passed, 3 total
  ```

- **Observed Exit Code**: 0

---

## Root Cause Analysis & Regression Demonstration

### 1. Pre-push hook failure (tsc failed code 2)

- **Symptom**: `push-gate: REFUSED: ... apps/api: .../node_modules/.bin/tsc failed (2)`
- **Root Cause**: PR #188 initially removed `batch-processor.util.ts` as an unused file. Subsequently, PR #198 (#241) was merged into `master`, introducing `apps/api/src/modules/ai/utils/batch-processor.util.spec.ts` which imports `batchProcessWithRiskAggregation` from `./batch-processor.util`. Merging `master` into `chore/slim-mz-deadcode` brought in `batch-processor.util.spec.ts`, which failed compilation with `TS2307: Cannot find module './batch-processor.util'`.
- **Regression Demonstration**:
  - Without `batch-processor.util.ts`: `cd apps/api && pnpm exec tsc --noEmit` exited with code 2: `error TS2307: Cannot find module './batch-processor.util'`.
  - With `batch-processor.util.ts` restored: `cd apps/api && pnpm exec tsc --noEmit` exits with code 0.

### 2. Merge conflict markers in tracked markdown files

- **Symptom**: `scripts/test_no_conflict_markers.py` failed with 1 failure on `docs/DEVELOPMENT.md` and `docs/vision.md`.
- **Root Cause**: An earlier merge of `origin/master` into `chore/slim-mz-deadcode` left raw git conflict markers (`<<<<<<< HEAD`, `=======`, `>>>>>>> origin/master`) in `docs/DEVELOPMENT.md` (around the deployment section) and `docs/vision.md` (around milestone G2).
- **Regression Demonstration**:
  - Base: `python3 -m unittest discover -s scripts -p 'test_no_conflict_markers.py'` failed with code 1.
  - Head: `python3 -m unittest discover -s scripts -p 'test_no_conflict_markers.py'` passes with code 0 (10/10 tests).

### 3. Investigation of Verify Bot Login 401 Finding

- **Reported Issue**: Verification run failed with 401 Unauthorized attempting to log in with `demo@example.com` / `password`.
- **Finding**: `demo@example.com` is not a seeded user in Mizano. As defined in `apps/api/prisma/seed.ts:816-821` and the repo guidelines, seeded credentials are:
  - Admin: `admin@mizano.com` / `[password in seed fixture]`
  - Other users: `manager@mizano.com`, `accountant@mizano.com`, `sales@mizano.com`, `storekeeper@mizano.com`, `hr@mizano.com` / `[password in seed fixture]`
- No authentication logic or credentials were changed by this PR (chore slim-down).
