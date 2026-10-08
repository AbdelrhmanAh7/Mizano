# EVIDENCE.md — PR Merge Sprint Audit (#95)

## Overview

- **Issue**: #95 (MZ · PR merge sprint until queue ≤ 5)
- **Base Commit (`master`)**: `b83d72b5a1900350d7575dfa39396e95b058a5c4`
- **Audit Date**: 2026-10-07
- **Reviewed Scope**: 6 oldest open pull requests (#58, #60, #65, #66, #67, #68)

---

## Requirements Verification Matrix

| REQ ID | Requirement                                         | Verification Method                                | Status |
| ------ | --------------------------------------------------- | -------------------------------------------------- | ------ |
| REQ-1  | Retrieve 6 oldest open PRs                          | `gh pr list --search "sort:created-asc" --limit 6` | PASSED |
| REQ-2  | Record exact tested commit SHAs                     | Git ref inspection (`headRefOid` per PR)           | PASSED |
| REQ-3  | Execute local test suites per PR                    | Run unit/web suites with output captured           | PASSED |
| REQ-4  | Domain risk audit (money, tenant, idempotency, RTL) | Diff inspection against AGENTS.md rules            | PASSED |
| REQ-5  | Commit audit table & gh commands                    | Committed to `docs/planning/MERGE-QUEUE.md`        | PASSED |
| REQ-6  | Non-destructive execution (<300 doc lines)          | No PRs merged; doc-only additions                  | PASSED |

---

## Detailed Test Logs & Commit Evidence

### PR #58

- **Commit SHA**: `2b3f01c3d7e9fe4877bb29b8af903437b3eee92a`
- **Branch**: `demo/20-telegram-intake`
- **Commands**:
  ```bash
  git checkout --detach 2b3f01c3d7e9fe4877bb29b8af903437b3eee92a
  pnpm --filter ./apps/api exec prisma generate
  pnpm --filter ./apps/api test telegram
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/telegram/telegram.client.spec.ts
  PASS src/modules/telegram/telegram-link.service.spec.ts
  PASS src/modules/telegram/telegram-intake.service.spec.ts
  Test Suites: 3 passed, 3 total
  Tests:       74 passed, 74 total
  Lint: 4 packages successful
  ```

### PR #60

- **Commit SHA**: `d01e25239b4a3a62c1034a0258c53e614655ed69`
- **Branch**: `demo/38-arm64-images`
- **Commands**:
  ```bash
  git checkout --detach d01e25239b4a3a62c1034a0258c53e614655ed69
  pnpm --filter ./apps/api test intake
  pnpm lint
  ```
- **Output**:
  ```text
  Test Suites: 1 skipped, 17 passed, 17 of 18 total
  Tests:       9 skipped, 284 passed, 293 total
  Lint: 4 packages successful
  ```

### PR #65

- **Commit SHA**: `5eb0340b0e002730f52709d3a7ad8a6097203f77`
- **Branch**: `demo/followup-vat`
- **Commands**:
  ```bash
  git checkout --detach 5eb0340b0e002730f52709d3a7ad8a6097203f77
  pnpm --filter ./apps/api test vat
  pnpm --filter ./apps/api test default-roles
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/tax/controllers/vat-returns.controller.spec.ts
  PASS src/modules/tax/interceptors/vat-decimal.interceptor.spec.ts
  PASS src/modules/tax/services/vat-returns.service.spec.ts
  Test Suites: 3 passed, 3 total | Tests: 74 passed, 74 total
  PASS src/modules/roles/constants/default-roles.constant.spec.ts (1 passed)
  Lint: 4 packages successful
  ```

### PR #66

- **Commit SHA**: `310ac2b1aa7129b4c51403f46eb6ee36f4d1e778`
- **Branch**: `demo/followup-reports-ledger`
- **Commands**:
  ```bash
  git checkout --detach 310ac2b1aa7129b4c51403f46eb6ee36f4d1e778
  pnpm --filter ./apps/api test aging-reports
  pnpm --filter ./apps/api test depreciation
  pnpm --filter ./apps/api test work-orders
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/reports/services/aging-reports.receivables.spec.ts (28 passed)
  PASS src/modules/assets/services/depreciation.service.spec.ts (22 passed)
  PASS src/modules/manufacturing/services/work-orders.service.spec.ts (29 passed)
  Test Suites: 6 passed, 6 total | Tests: 79 passed, 79 total
  Lint: 4 packages successful
  ```

### PR #67

- **Commit SHA**: `be7478f715f1e0f0efb8447e922db9d79d37fbc1`
- **Branch**: `demo/followup-sales-banking`
- **Commands**:
  ```bash
  git checkout --detach be7478f715f1e0f0efb8447e922db9d79d37fbc1
  pnpm --filter ./apps/api test recurring-profiles credit-notes
  pnpm --filter ./apps/web test payments bill-form invoices
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/accounting/services/recurring-profiles.service.spec.ts (41 passed)
  PASS src/modules/sales/services/credit-notes.service.spec.ts (47 passed)
  PASS @mizano/web (payments, bill-form, invoices): 4 passed, 16 passed
  Total: 8 suites passed, 104 tests passed
  Lint: 4 packages successful
  ```

### PR #68

- **Commit SHA**: `7c632bdf74832cfc94f97cb49c196d168e99127f`
- **Branch**: `demo/followup-org-currency`
- **Commands**:
  ```bash
  git checkout --detach 7c632bdf74832cfc94f97cb49c196d168e99127f
  pnpm --filter ./apps/api test organizations
  pnpm --filter ./apps/web test report-currency report-labels purchases-currency
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/organizations/organizations.service.spec.ts (26 passed)
  PASS @mizano/web (report-currency, report-labels, purchases-currency): 3 passed, 78 passed
  Total: 4 suites passed, 104 tests passed
  Lint: 4 packages successful
  ```

---

# Evidence: Issue #96 Duplicate-invoice warning before posting (vendor + exact amount + date window)

A read-only duplicate check for bills, plus a dismissible, non-blocking warning in two places: on the scan review step when an intake job completes, and on unposted (DRAFT/PENDING) bills before approval.

- **Baseline:** `origin/master` at `615060ed6294e16375a1f1ea9385cb7e812cd24f` (merged into the branch in `4a620dc`)
- **Tested head:** `be582d2` `test(purchases): explicit e2e edges for the duplicate check` (verified first-hand on 2026-10-08 with the targeted Jest suites and the seeded API e2e against PostgreSQL 16). This evidence file ships on `604d05a`, which differs from the tested head only by this document. The earlier record for `632e7cf` (and before it `0d7078ba9f832dfa1b8d6d73dc3fbd1c5ccfa26f`) is superseded; round 4 re-ran every check on the new head.
- **Implementers:** Claude Opus 5.5 (round 1), Gemini 3.8 Flash (round 2) via Antigravity CLI, Claude Fable 5.1 via Claude Code (round 3, the audit interceptor change) and Claude Fable 5.1 via OpenCode (round 4, the e2e edge tests and this record). Earlier commits were made by previous engines. This is not an independent review.
- **Host:** Darwin arm64 (macOS), Node v26.10.0, pnpm 8.14.0, PostgreSQL 16.15

## Behaviour

| Route                                   | Use                                                                |
| --------------------------------------- | ------------------------------------------------------------------ |
| `GET /bills/:id/possible-duplicates`    | Check a stored bill. It is excluded from its own matches.          |
| `POST /bills/possible-duplicates` (200) | Check unsaved draft values sent in the body. Not written to audit. |

Both routes require `purchases.view`. The response is `{ status: 'possible' | 'none' | 'unknown', matches: [{ billId, billNumber, documentDate, amount, currency }] }`, with at most 5 matches and `amount` as a fixed 4-dp string.

## Requirements verification

| REQ    | Requirement                                                                                                                                                                                 | Verified by                                                                                                                                                                             | Result   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| REQ-1  | ±3 calendar days inclusive: day 0, −3 and +3 match; ±4 does not.                                                                                                                            | `bills.service.spec.ts` › `exact match on day 0, -3 and +3…`; e2e › `matches a POSTed draft by normalized vendor name, exact decimal and +/-3 days`                                     | **PASS** |
| REQ-2  | Exact Decimal comparison (`100.10` = `100.1`, ≠ `100.11`). Matches are returned as fixed 4-dp strings (`100.1000`).                                                                         | `bills.service.spec.ts` › `matches 100.10 vs 100.1…`; e2e › `warns on a stored draft… 4-dp match`                                                                                       | **PASS** |
| REQ-3  | Same currency only. A stored bill without a currency is in the base currency. A draft without a currency returns `unknown`, not a guess.                                                    | `bills.service.spec.ts` › `rejects different currency…`, `returns unknown when … currency is missing`; e2e (`noCurrency`)                                                               | **PASS** |
| REQ-4  | Vendor by tenant-checked id or by normalized name (NFKC, case, whitespace; Arabic). A vendor id from another tenant returns 400.                                                            | `bills.service.spec.ts` › `matches vendor name…`, `rejects a vendor id from another organization…`; e2e tenant B                                                                        | **PASS** |
| REQ-5  | Tenant scoping: another tenant's bill id returns 404, its vendor id returns 400, and its vendor name finds nothing.                                                                         | e2e › `never reveals tenant A's bills or vendors to tenant B`                                                                                                                           | **PASS** |
| REQ-6  | Only posted bills (OPEN, PARTIALLY_PAID, PAID, OVERDUE, VOID) are candidates; DRAFT/PENDING are not.                                                                                        | `bills.service.spec.ts` › `scopes by organization and to posted bills in the +/-3 day window`                                                                                           | **PASS** |
| REQ-7  | Missing amount, date, vendor or currency returns `unknown`, and no bill query runs.                                                                                                         | `bills.service.spec.ts` › `returns unknown when amount, date, vendor or currency is missing`                                                                                            | **PASS** |
| REQ-8  | Input contract: `YYYY-MM-DD` only (timestamps rejected); amounts are decimal strings (JSON numbers, `1e2` and >4 dp rejected); the error never echoes the input.                            | `check-possible-duplicate-bills.dto.spec.ts`; `bills.service.spec.ts` › `accepts date-only input…`; e2e › `rejects numeric amounts…` (400)                                              | **PASS** |
| REQ-9  | Ordering: date DESC, then id DESC; at most 5 matches.                                                                                                                                       | `bills.service.spec.ts` › `sorts matches by document_date DESC, id DESC and returns at most 5`                                                                                          | **PASS** |
| REQ-10 | Read-only: the POST check writes no audit row, and soft-deleted bills return 404.                                                                                                           | `audit.interceptor.spec.ts` › `does not audit read-only POST routes marked @SkipAudit()`; e2e › `does not write an audit row…`                                                          | **PASS** |
| REQ-14 | `@SkipAudit()` is limited to the duplicate query. The interceptor reads it from the handler only, a class-level marker is ignored, and POST/PUT/PATCH/DELETE without it are still recorded. | `audit.interceptor.spec.ts` › `still audits POST/PUT/PATCH/DELETE…`, `ignores a class-level @SkipAudit()…`; `bills.controller.spec.ts` › `opts out only the read-only duplicate query…` | **PASS** |
| REQ-11 | Guards: 401 without a token and 403 without `purchases.view`, on both routes.                                                                                                               | e2e › `requires authentication and purchases.view`                                                                                                                                      | **PASS** |
| REQ-12 | Dismissible, non-blocking banner on DRAFT/PENDING bills, linking each match. Nothing shows while loading or with no match. A failed check shows Retry. Copy is in en and ar.                | `possible-duplicates-banner.spec.tsx` (8 tests)                                                                                                                                         | **PASS** |
| REQ-13 | On intake completion the scan review step sends the selected vendor (else the extracted name), extracted total, date and currency as a POST body; unclean values are left out.              | `scan-duplicate-draft.spec.ts` (3 tests); banner spec › `checks a stored bill by ID or an unsaved intake draft by its fields`                                                           | **PASS** |

I checked that two tests fail when their fix is removed: the DTO numeric-amount test fails without `@Transform`, and the e2e audit test fails without `@SkipAudit()` (`Expected: 8, Received: 9`).

## AI council decision on PR #101 (round 3)

| Ask                                                                                                  | Resolution                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve every CodeRabbit CHANGES_REQUESTED item                                                      | All four CodeRabbit threads (`billId` path tests, `deletedAt: null` on the id lookup, stale tested SHA, REQ-11 route text) were fixed in `f925886`/`2fdb64d` and CodeRabbit marked each "Addressed". CodeRabbit incremental reviews are disabled on this repository, so its status stays CHANGES_REQUESTED until `@coderabbitai review` is re-run. |
| Restore the #95 audit in EVIDENCE.md and add the #96 evidence alongside it                           | This file: the #95 merge-sprint audit from `master` is restored above, byte for byte, and the #96 record follows it.                                                                                                                                                                                                                               |
| Limit `@SkipAudit()` to the read-only duplicate check, with tests proving postings are still audited | `632e7cf`: the interceptor honours the marker on the handler only (a class-level marker cannot silence a controller). Tests: REQ-14 above. Only `BillsController.findPossibleDuplicates` carries the marker; the spec enumerates every controller handler and fails if any other one does.                                                         |

## Review threads to resolve on PR #101 (round 2)

| Thread / Finding                                                                                                                                                                                    | Resolution                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bills.controller.ts:89`: Neither web API hooks nor the intake/bill UI calls either new endpoint, so intake completion and pre-posting still cannot show the required dismissible warning (Copilot) | Done: `usePossibleDuplicates` hook and `billsApi` methods added in `2fe0abd` and `6cc3d6c`. Localized `PossibleDuplicatesBanner` integrated on the bill page before approval (`/purchases/bills/[id]`) and on intake completion review step (`/purchases/bills/scan`) via `scanDuplicateDraft`. Banner tested in `possible-duplicates-banner.spec.tsx` and `scan-duplicate-draft.spec.ts`. |
| `bills.controller.ts:104`: Route only tested by direct controller calls; needs seeded API E2E coverage for auth/perms, malformed query, matching, and cross-tenant isolation (Copilot)              | Done in `f26147e`: `test/bill-duplicates.e2e-spec.ts` executes `JwtAuthGuard` (401), `PermissionsGuard` (`purchases.view` 403), global `ValidationPipe` (400 for numbers, exponents, timestamps), cross-tenant isolation (404 / 400), and read-only `@SkipAudit()`. Verified first-hand against PostgreSQL 16.                                                                             |
| Amount exposed in GET query parameters (Quality review)                                                                                                                                             | Fixed in `8461325`: replaced query parameters on unsaved drafts with `POST /bills/possible-duplicates` receiving a validated JSON body, keeping amounts, dates, and vendor names out of logged URLs.                                                                                                                                                                                       |
| Amount lacks decimal string validation (Quality review)                                                                                                                                             | Fixed in `8461325` & `f925886`: `@IsDecimalString()` with `@Transform(({ obj }) => obj.amount)` to prevent number-to-string coercion by `enableImplicitConversion`. Tested in `check-possible-duplicate-bills.dto.spec.ts`.                                                                                                                                                                |

## Review threads to resolve on PR #101 (round 3)

| Thread / Finding                                                                                                                                                                                                                                                                                                                                                                                        | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bills.controller.ts:104`: Route only tested by direct controller calls and reflector inspection; does not execute `JwtAuthGuard`, `PermissionsGuard`, the global validation pipe, routing order, or real tenant-scoped Prisma queries. Add seeded API E2E coverage for authentication/permission rejection, malformed query input, successful matching, and cross-tenant IDs for both routes (Copilot) | Re-verified and closed on `be582d2`: `test/bill-duplicates.e2e-spec.ts` boots the real `AppModule` in-process with the production `ValidationPipe` and hits both routes over HTTP. Authentication/permission rejection: 401 anonymous and 403 without `purchases.view` on both routes. Malformed input: 400 for a JSON number, `1e2`, a timestamp date and an unknown body property (`forbidNonWhitelisted`); empty body → 200 `unknown`; malformed bill id on the GET route → 404. Successful matching: stored draft by id (4-dp decimal match, self excluded) and POSTed draft by normalized vendor name, exact decimal and ±3 days. Cross-tenant IDs: tenant B gets 404 on the GET route, 400 on a foreign `vendorId`, and `none` for a foreign vendor name. Routing order is proven by the neighbouring suites (`purchases.e2e-spec.ts`, `multi-tenancy.e2e-spec.ts`) passing on the same head. All 9 e2e tests re-run first-hand on PostgreSQL 16 (see Commands and results). |

## Review threads (PR #101, round 1)

| Thread                                                           | Resolution                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Values in query string (Copilot, quality review)                 | Done in `8461325`: the check is a POST body. `f925886` also returns 200.                        |
| Offset timestamps compared by text prefix (Copilot, Codex)       | `f925886`: date-only input (DTO and service). Timestamps are rejected.                          |
| No web client or banner (Copilot)                                | `2fe0abd`: bill page before Approve & post. `6cc3d6c`: scan review step on intake completion.   |
| `@IsString()` amount (Copilot, quality review)                   | Done in `8461325` (`@IsDecimalString()`).                                                       |
| JSON numbers converted implicitly (Codex)                        | `f925886`: `@Transform` keeps the raw value. The DTO test runs with `enableImplicitConversion`. |
| Soft-deleted bill id still readable (Copilot, CodeRabbit, Codex) | `f925886`: `deletedAt: null` on the lookup → 404 (unit + e2e).                                  |
| `Decimal#toString()` amounts (Copilot, Codex)                    | `f925886`: `toFixed(4)`.                                                                        |
| No seeded e2e (Copilot)                                          | `f26147e`: `test/bill-duplicates.e2e-spec.ts`.                                                  |
| No `billId` path tests (CodeRabbit)                              | `f925886`: same-tenant exclusion and the not-found path, with no candidate query.               |
| POST is audited as a CREATE (Codex P1)                           | `7f36808`: `@SkipAudit()` plus an AuditInterceptor check.                                       |
| Foreign vendor id trusted (Codex)                                | `f925886`: vendor resolved with `organizationId` and `deletedAt: null` → 400.                   |
| Error message echoes the date (Codex)                            | `f925886`: constant message (asserted in the unit test).                                        |
| Missing draft currency assumed base (Codex)                      | `f925886`: returns `unknown`.                                                                   |
| DTO date regex differs from the service (CodeRabbit)             | Both now accept `^\d{4}-\d{2}-\d{2}$` only.                                                     |
| Stale EVIDENCE (CodeRabbit, Codex)                               | This file, recorded for the tested head above.                                                  |

New root causes are added to `docs/agents/review-lessons.md` (`a437761`).

## Commands and results (tested head)

`pnpm ci:full` is `turbo lint type-check test`. Round 3 ran it with `--force` (so turbo could not replay results cached by other worktrees) on `632e7cf`:

```text
$ pnpm exec turbo lint type-check test --force
@mizano/web:test: Test Suites: 50 passed, 50 total
@mizano/web:test: Tests:       469 passed, 469 total
api:test: Test Suites: 138 passed, 138 total
api:test: Tests:       2224 passed, 2224 total
 Tasks:    12 successful, 12 total
Cached:    0 cached, 12 total
```

Round 4 (`be582d2`) changes only `apps/api/test/bill-duplicates.e2e-spec.ts` and this file, so it re-ran the affected suites first-hand (below) instead of the full pipeline.

`next lint` prints 13 warnings, all in files this branch does not touch: crm, manufacturing, projects/my-tasks, purchases/credits, tax pages, `use-ai-chatbot.ts` and two settings specs. They predate this branch. The changed files lint clean with `eslint --max-warnings 0`, and all changed files pass `prettier --check`.

Seeded API e2e on a throwaway PostgreSQL 16 database owned by this session (`mizano_96_e2e`, created with `prisma db push`, no `REDIS_URL`), re-run first-hand on `be582d2`:

```text
$ jest --config ./test/jest-e2e.json --runInBand --verbose test/bill-duplicates.e2e-spec.ts
PASS test/bill-duplicates.e2e-spec.ts
  Possible duplicate bills (e2e)
    ✓ warns on a stored draft with the posted bill as a 4-dp match, excluding itself (6 ms)
    ✓ matches a POSTed draft by normalized vendor name, exact decimal and +/-3 days (18 ms)
    ✓ rejects numeric amounts, exponents and timestamps with 400 (9 ms)
    ✓ rejects unknown body properties with 400 (global validation pipe) (2 ms)
    ✓ accepts an empty body as unknown through the real pipe (4 ms)
    ✓ answers 404 for a malformed bill id instead of failing (3 ms)
    ✓ does not write an audit row for the read-only POST (24 ms)
    ✓ requires authentication and purchases.view (103 ms)
    ✓ never reveals tenant A's bills or vendors to tenant B (12 ms)
Tests:       9 passed, 9 total
$ jest --config ./test/jest-e2e.json --runInBand test/bill-duplicates.e2e-spec.ts test/purchases.e2e-spec.ts test/multi-tenancy.e2e-spec.ts
Test Suites: 3 passed, 3 total
Tests:       51 passed, 51 total
```

Targeted unit/component runs on the same head (the `IntakeQueueService` ECONNREFUSED lines in the e2e output are the expected no-Redis boot warning; this suite does not use the queue):

```text
$ jest --testPathPattern="bills.service.spec|bills.controller.spec|check-possible-duplicate-bills"  (apps/api)
Test Suites: 3 passed, 3 total
Tests:       64 passed, 64 total
$ jest --testPathPattern="audit.interceptor.spec"  (apps/api)
Tests:       16 passed, 16 total
$ jest --config jest.config.js --runInBand --testPathPattern="possible-duplicates-banner|scan-duplicate-draft"  (apps/web)
Test Suites: 2 passed, 2 total
Tests:       11 passed, 11 total
$ eslint --max-warnings 0 test/bill-duplicates.e2e-spec.ts && prettier --check test/bill-duplicates.e2e-spec.ts  (apps/api)
All checks passed / All matched files use Prettier code style!
```

## Not verified / blocked

- **`test/intake.e2e-spec.ts`: blocked, not passed.** It needs Redis/BullMQ, and this host has no Redis server (`Intake worker error: ECONNREFUSED`). This branch does not change intake code.
- **Browser journey:** not run. Browser E2E is not wired in the repo (`docs/DEVELOPMENT.md`). Both banner placements were verified only by component and unit tests. The intake completion path itself (SSE result → review step) was not exercised end to end.
- **Environment notes (round 3):** that worktree had no `node_modules`; they were installed offline from the local pnpm store with the lockfile unchanged (`pnpm install --offline --frozen-lockfile --ignore-scripts`), then `prisma generate` was run and bcrypt's prebuilt binary fetched. Round-3 e2e results came from that session's own cluster on port 55498, created with `initdb` and removed afterwards.
- **Environment notes (round 4):** run on the existing Darwin arm64 worktree (Node v26.10.0, pnpm 8.14.0) against the local PostgreSQL 16.15 server on `/tmp:5432`, using a throwaway database `mizano_96_e2e` created with `prisma db push --skip-generate` for this session. No Redis server is available, so `test/intake.e2e-spec.ts` stays blocked (unchanged by this branch).
- **Size:** the diff is above the ~300-line guideline (about 390 non-test lines). Round 1 asked for the UI and e2e in this PR.

## Round 5 (review round 4/3)

- **Seeded API E2E for both routes (Copilot):** already in `apps/api/test/bill-duplicates.e2e-spec.ts` since `be582d2`. It runs the real HTTP stack for `POST /bills/possible-duplicates` and `GET /bills/:id/possible-duplicates`: 401 anonymous, 403 for a role without permissions, 400 for malformed bodies (numeric amount, exponent, timestamp, unknown property), a successful match with the ±3-day boundary, and tenant B getting 404/400/none for tenant A's ids. Neither route takes a query string, so there is no query input to malform. No new e2e was needed.
- **Scan banner vs. intake permission (Codex):** `PossibleDuplicatesBanner` now renders nothing and issues no request unless the user has `purchases.view`, the permission the check routes require. A role with only `purchases.create` no longer sees a permanent failed-check state. Test: `@issue-96 does not check or show anything without purchases.view` in `possible-duplicates-banner.spec.tsx`.
- **Verified:** `jest --testPathPattern=possible-duplicates-banner` (apps/web): 9 passed. `tsc --noEmit`, `eslint` and `prettier --check` on the changed files: clean. API code and e2e were not touched this round, so they were not re-run.

## Index note

`Bill` has `@@index([organizationId, vendorId])`, and the candidate query is bounded to one vendor and a 7-day window. No migration was added. An index on `(organizationId, vendorId, date)` can be considered if tenants grow large.

## Review round 5 (#96)

- Copilot (E2E for both routes): already covered by `apps/api/test/bill-duplicates.e2e-spec.ts` (401/403 on both routes, malformed input 400/404, success by id and by POST, cross-tenant 404/400/none); no code change.
- Codex (permission gate): already fixed in 8f7867a (`PossibleDuplicatesBanner` returns null without `purchases.view`).
- Codex (unknown result): banner renders `possible-duplicates-unknown` with localized `bills.duplicates.unknown` (en/ar); spec `says so when the check was inconclusive`.
- Codex (stale none): `usePossibleDuplicates` uses `staleTime: 0`, `refetchOnWindowFocus: 'always'`, `refetchInterval: 30_000`.
- e2e-army test added: `e2e-army/96-duplicate-bill-warning.e2e.ts` (@issue-96 AC1, AC2).
- Verified: `npx jest --testPathPattern="possible-duplicates|scan-duplicate"` in apps/web, 12 tests pass.
