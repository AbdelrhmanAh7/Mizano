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

# Evidence: Issue #96 — Duplicate-invoice warning before posting (vendor + exact amount + date window)

A read-only duplicate check for bills, plus a dismissible, non-blocking warning in two places: on the scan review step when an intake job completes, and on unposted (DRAFT/PENDING) bills before approval.

- **Tested head:** `15b7fbf` `feat(api): seed a posted bill and a matching draft for the duplicate warning` (the e2e-army test is `2dc3976`). This document ships on the commit after it and differs from the tested head only by this file. Round-by-round history from earlier heads was trimmed per the CTO's round-8 instruction; the full history is in the PR #101 timeline.
- **Implementers:** rounds 1–7 by earlier engines (Opus 5.5, Gemini Flash via Antigravity, Fable 5.1); round 8 (the verify-failure fix: seeded duplicate pair + e2e-army rewrite + this trim) by Ling via OpenCode. Not an independent review.
- **Host:** Darwin arm64 (macOS), Node v26.10.0, pnpm 8.14.0, PostgreSQL 16 on localhost:5432 (throwaway DB `mizano_96_verify`, created with `prisma db push` + `prisma db seed`; no Redis).

## Behaviour

| Route                                   | Use                                                                |
| --------------------------------------- | ------------------------------------------------------------------ |
| `GET /bills/:id/possible-duplicates`    | Check a stored bill. It is excluded from its own matches.          |
| `POST /bills/possible-duplicates` (200) | Check unsaved draft values sent in the body. Not written to audit. |

Both routes require `purchases.view`. The response is `{ status: 'possible' | 'none' | 'unknown', matches: [{ billId, billNumber, documentDate, amount, currency }] }`, with at most 5 matches and `amount` as a fixed 4-dp string. Route order is safe: the POST is a distinct method and is declared before `GET /:id` (the browser evidence for the 404 finding shows `GET /api/bills/123` — a bill that does not exist — which is the correct 404, not a shadowed route).

**Seeded demo pair (round 8):** `prisma/seed.ts` now seeds `BILL-004` (posted OPEN, vendor Supplier Alpha, 2500, 2 days ago) and `BILL-005` (DRAFT, same vendor, same exact amount and currency, 1 day apart — inside the ±3-day window). The draft shows the dismissible "Possible duplicate bill" warning at `/en/purchases/bills/bill-BILL-005` in the demo and in every verify run; the "Approve & post" button stays enabled (non-blocking).

## Requirements verification

| REQ    | Requirement                                                                                                                                                                                 | Verified by                                                                                                                                                                   | Result   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| REQ-1  | ±3 calendar days inclusive: day 0, −3 and +3 match; ±4 does not.                                                                                                                            | `bills.service.spec.ts` › `exact match on day 0, -3 and +3…`; e2e › `matches a POSTed draft by normalized vendor name, exact decimal and +/-3 days`                           | **PASS** |
| REQ-2  | Exact Decimal comparison (`100.10` = `100.1`, ≠ `100.11`). Matches are returned as fixed 4-dp strings (`100.1000`).                                                                         | `bills.service.spec.ts` › `matches 100.10 vs 100.1…`; e2e › `warns on a stored draft… 4-dp match`                                                                             | **PASS** |
| REQ-3  | Same currency only. A stored bill without a currency is in the base currency. A POSTed draft without a currency returns `unknown`, not a guess.                                             | `bills.service.spec.ts` › `rejects different currency…`, `returns unknown when … currency is missing`; e2e (`noCurrency`)                                                     | **PASS** |
| REQ-4  | Vendor by tenant-checked id or by normalized name (NFKC, case, whitespace; Arabic). A vendor id from another tenant returns 400.                                                            | `bills.service.spec.ts` › `matches vendor name…`, `rejects a vendor id from another organization…`; e2e tenant B                                                              | **PASS** |
| REQ-5  | Tenant scoping: another tenant's bill id returns 404, its vendor id returns 400, and its vendor name finds nothing.                                                                         | e2e › `never reveals tenant A's bills or vendors to tenant B`                                                                                                                 | **PASS** |
| REQ-6  | Only posted bills (OPEN, PARTIALLY_PAID, PAID, OVERDUE, VOID) are candidates; DRAFT/PENDING are not.                                                                                        | `bills.service.spec.ts` › `scopes by organization and to posted bills in the +/-3 day window`                                                                                 | **PASS** |
| REQ-7  | Missing amount, date, vendor or currency returns `unknown`, and no bill query runs.                                                                                                         | `bills.service.spec.ts` › `returns unknown when amount, date, vendor or currency is missing`                                                                                  | **PASS** |
| REQ-8  | Input contract: `YYYY-MM-DD` only (timestamps rejected); amounts are decimal strings (JSON numbers, `1e2` and >4 dp rejected); the error never echoes the input.                            | `check-possible-duplicate-bills.dto.spec.ts`; `bills.service.spec.ts` › `accepts date-only input…`; e2e › `rejects numeric amounts…` (400)                                    | **PASS** |
| REQ-9  | Ordering: date DESC, then id DESC; at most 5 matches.                                                                                                                                       | `bills.service.spec.ts` › `sorts matches by document_date DESC, id DESC and returns at most 5`                                                                                | **PASS** |
| REQ-10 | Read-only: the POST check writes no audit row, and soft-deleted bills return 404.                                                                                                           | `audit.interceptor.spec.ts` › `does not audit read-only POST routes marked @SkipAudit()`; e2e › `does not write an audit row…`                                                | **PASS** |
| REQ-14 | `@SkipAudit()` is limited to the duplicate query. The interceptor reads it from the handler only, a class-level marker is ignored, and POST/PUT/PATCH/DELETE without it are still recorded. | `audit.interceptor.spec.ts` › `still audits POST/PUT/PATCH/DELETE…`, `ignores a class-level @SkipAudit()…`; `bills.controller.spec.ts` › `opts out only the duplicate query…` | **PASS** |
| REQ-11 | Guards: 401 without a token and 403 without `purchases.view`, on both routes.                                                                                                               | e2e › `requires authentication and purchases.view`                                                                                                                            | **PASS** |
| REQ-12 | Dismissible, non-blocking banner on DRAFT/PENDING bills, linking each match. Nothing shows while loading or with no match. A failed check shows Retry. Copy is in en and ar.                | `possible-duplicates-banner.spec.tsx` (8 tests)                                                                                                                               | **PASS** |
| REQ-13 | On intake completion the scan review step sends the selected vendor (else the extracted name), extracted total, date and currency as a POST body; unclean values are left out.              | `scan-duplicate-draft.spec.ts` (3 tests); banner spec › `checks a stored bill by ID or an unsaved intake draft by its fields`                                                 | **PASS** |
| REQ-15 | The seeded demo/verify DB contains a visible duplicate pair, so the warning is observable in the browser without setup.                                                                     | round-8 seed-pair run through the real HTTP stack (below) + `e2e-army/96-duplicate-bill-warning.e2e.ts` (@issue-96 AC1, AC1-negative, AC2)                                    | **PASS** |

Two tests were proven to fail without their fix in earlier rounds: the DTO numeric-amount test fails without `@Transform`, and the e2e audit test fails without `@SkipAudit()` (`Expected: 8, Received: 9`).

## Verify failure on d5f7292 — root cause and fix (round 8)

The hub verify job (headless browser, planned flows) failed with "pages returning 'Not found'". The flow evidence shows the product code was not the cause:

- `/en/purchases/bills/123` — bill `123` does not exist in the seeded DB; the page correctly renders "Not found" (and `GET /api/bills/123` correctly answers 404). The planned flow had replaced `:id` with a value that does not exist in the app.
- `/en/purchases/bills/scan` — correctly renders the upload step; the banner only appears on the review step after an intake completes (OCR is off in the verify stack).
- `/en/purchases/bills/possible-duplicates` — an API route, correctly "Not found" when opened as a page.

**Root cause:** the throwaway demo DB had no draft bill with a matching posted sibling, so no browser flow could ever see the warning — the feature was not observable end-to-end in the demo/verify environment. **Fix:** the seeded pair (see above), plus the e2e-army test rewritten to drive it as the seeded demo admin (`purchases.view`): list → draft `BILL-005` → warning listing `BILL-004` with "Approve & post" still enabled → dismiss → negative (posted `BILL-001` shows no warning) → Arabic RTL page.

## Commands and results (tested head, first-hand this session)

```text
$ npx jest --config ./test/jest-e2e.json --runInBand test/bill-duplicates.e2e-spec.ts   # apps/api, throwaway seeded DB
PASS test/bill-duplicates.e2e-spec.ts — 9 passed (stored-draft 4-dp match, POSTed draft ±3 days,
  numeric/exponent/timestamp 400, unknown property 400, empty body unknown, malformed id 404,
  no audit row, 401/403 guards, cross-tenant 404/400/none)
$ npx jest --testPathPattern="bills.service.spec|bills.controller.spec|check-possible-duplicate-bills"
PASS — 3 suites, 64 tests
$ npx jest --testPathPattern="audit.interceptor.spec"   PASS — 16 tests
$ npx jest --config jest.config.js --runInBand --testPathPattern="possible-duplicates-banner|scan-duplicate-draft"   # apps/web
PASS — 2 suites, 12 tests
$ pnpm --filter api type-check && pnpm --filter @mizano/web type-check   # clean
$ pnpm --filter api lint   # clean; web lint has 13 pre-existing warnings in files this branch does not touch
$ npx prettier --check apps/api/prisma/seed.ts e2e-army/96-duplicate-bill-warning.e2e.ts   # clean
```

Seed-pair proof (temporary spec against the same throwaway DB, deleted after the run — the durable copy is the e2e-army test): the seeded `BILL-004`/`BILL-005` rows exist with the expected statuses/vendor/amounts one day apart; the draft is listed on `GET /bills`; `GET /bills/bill-BILL-005/possible-duplicates` and `POST /bills/possible-duplicates` (vendor name, exact decimal, calendar date, currency) both return `{ status: 'possible', matches: [BILL-004, amount '2500.0000'] }`; the read-only POST writes no audit row; another tenant gets 404.

Per the owner's speed directive for this repo, the full `pnpm ci:full` suite and build run on GitHub-hosted CI after the push; locally only the affected suites above were re-run. `e2e-army/96-duplicate-bill-warning.e2e.ts` runs in the hub's tester-army/e2e gate and verify job.

## Not verified / blocked

- **Browser journey in this session:** not run here (no browser stack on this host); the hub verify job runs it on every head. The scan-page placement is covered by component/unit tests; the intake completion path (SSE result → review step) was not exercised end-to-end (OCR off in the verify stack).
- **Size:** the diff is above the ~300-line guideline (round 1 asked for the UI and e2e in this PR; round 8 adds the seed pair).

## Open review threads (PR #101) — both already resolved in code

| Thread                                                                                                                                                              | Resolution                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Copilot: route only tested by direct controller calls; needs seeded API E2E for auth/permission rejection, malformed input, matching, cross-tenant ids, both routes | `apps/api/test/bill-duplicates.e2e-spec.ts` boots the real `AppModule` in-process with the production `ValidationPipe` and hits both routes over HTTP: 401 anonymous, 403 without `purchases.view`, 400 for numeric amount / `1e2` / timestamp / unknown property, success by stored id and by POSTed draft, cross-tenant 404 / 400 / `none`. Re-run on the tested head above (9/9). |
| Codex P2: scan banner calls a `purchases.view` route for a `purchases.create`-only role                                                                             | `PossibleDuplicatesBanner` renders nothing and issues no request without `purchases.view` (`8f7867a`); a `purchases.create`-only role sees no failed-check state. Test: `@issue-96 does not check or show anything without purchases.view` in `possible-duplicates-banner.spec.tsx`.                                                                                                 |
