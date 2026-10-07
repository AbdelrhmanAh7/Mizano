# Evidence: Issue #96 Duplicate-invoice warning before posting (vendor + exact amount + date window)

A read-only duplicate check for bills, plus a dismissible, non-blocking warning on unposted bills. Intake drafts are saved as DRAFT bills and posted from the bill page, so the warning appears there before approval.

- **Baseline:** `origin/master` at `615060ed6294e16375a1f1ea9385cb7e812cd24f` (merged into the branch in `4a620dc`)
- **Tested head:** `a437761b8f5ea68ae150351f829c5208b3b6911d`. `apps/` and `packages/` are identical to `2fe0abd`, where `turbo lint type-check test` ran (`git diff --stat 2fe0abd a437761 -- apps packages` is empty).
- **Author:** Claude Opus 5.5 (`claude-opus-5-5`) via Claude Code, AI implementer for review round 1 on PR #101. Earlier commits were made by previous engines. This is not an independent review.
- **Host:** Darwin arm64 (macOS), Node v26.10.0, pnpm 8.14.0

## Behaviour

| Route                                   | Use                                                                |
| --------------------------------------- | ------------------------------------------------------------------ |
| `GET /bills/:id/possible-duplicates`    | Check a stored bill. It is excluded from its own matches.          |
| `POST /bills/possible-duplicates` (200) | Check unsaved draft values sent in the body. Not written to audit. |

Both routes require `purchases.view`. The response is `{ status: 'possible' | 'none' | 'unknown', matches: [{ billId, billNumber, documentDate, amount, currency }] }`, with at most 5 matches and `amount` as a fixed 4-dp string.

## Requirements verification

| REQ    | Requirement                                                                                                                                                                  | Verified by                                                                                                                                         | Result   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| REQ-1  | ±3 calendar days inclusive: day 0, −3 and +3 match; ±4 does not.                                                                                                             | `bills.service.spec.ts` › `exact match on day 0, -3 and +3…`; e2e › `matches a POSTed draft by normalized vendor name, exact decimal and +/-3 days` | **PASS** |
| REQ-2  | Exact Decimal comparison (`100.10` = `100.1`, ≠ `100.11`). Matches are returned as fixed 4-dp strings (`100.1000`).                                                          | `bills.service.spec.ts` › `matches 100.10 vs 100.1…`; e2e › `warns on a stored draft… 4-dp match`                                                   | **PASS** |
| REQ-3  | Same currency only. A stored bill without a currency is in the base currency. A draft without a currency returns `unknown`, not a guess.                                     | `bills.service.spec.ts` › `rejects different currency…`, `returns unknown when … currency is missing`; e2e (`noCurrency`)                           | **PASS** |
| REQ-4  | Vendor by tenant-checked id or by normalized name (NFKC, case, whitespace; Arabic). A vendor id from another tenant returns 400.                                             | `bills.service.spec.ts` › `matches vendor name…`, `rejects a vendor id from another organization…`; e2e tenant B                                    | **PASS** |
| REQ-5  | Tenant scoping: another tenant's bill id returns 404, its vendor id returns 400, and its vendor name finds nothing.                                                          | e2e › `never reveals tenant A's bills or vendors to tenant B`                                                                                       | **PASS** |
| REQ-6  | Only posted bills (OPEN, PARTIALLY_PAID, PAID, OVERDUE, VOID) are candidates; DRAFT/PENDING are not.                                                                         | `bills.service.spec.ts` › `scopes by organization and to posted bills in the +/-3 day window`                                                       | **PASS** |
| REQ-7  | Missing amount, date, vendor or currency returns `unknown`, and no bill query runs.                                                                                          | `bills.service.spec.ts` › `returns unknown when amount, date, vendor or currency is missing`                                                        | **PASS** |
| REQ-8  | Input contract: `YYYY-MM-DD` only (timestamps rejected); amounts are decimal strings (JSON numbers, `1e2` and >4 dp rejected); the error never echoes the input.             | `check-possible-duplicate-bills.dto.spec.ts`; `bills.service.spec.ts` › `accepts date-only input…`; e2e › `rejects numeric amounts…` (400)          | **PASS** |
| REQ-9  | Ordering: date DESC, then id DESC; at most 5 matches.                                                                                                                        | `bills.service.spec.ts` › `sorts matches by document_date DESC, id DESC and returns at most 5`                                                      | **PASS** |
| REQ-10 | Read-only: the POST check writes no audit row, and soft-deleted bills return 404.                                                                                            | `audit.interceptor.spec.ts` › `does not audit read-only POST routes marked @SkipAudit()`; e2e › `does not write an audit row…`                      | **PASS** |
| REQ-11 | Guards: 401 without a token and 403 without `purchases.view`, on both routes.                                                                                                | e2e › `requires authentication and purchases.view`                                                                                                  | **PASS** |
| REQ-12 | Dismissible, non-blocking banner on DRAFT/PENDING bills, linking each match. Nothing shows while loading or with no match. A failed check shows Retry. Copy is in en and ar. | `possible-duplicates-banner.spec.tsx` (7 tests)                                                                                                     | **PASS** |

I checked that two tests fail when their fix is removed: the DTO numeric-amount test fails without `@Transform`, and the e2e audit test fails without `@SkipAudit()` (`Expected: 8, Received: 9`).

## Review threads (PR #101, round 1)

| Thread                                                           | Resolution                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Values in query string (Copilot, quality review)                 | Done in `8461325`: the check is a POST body. `f925886` also returns 200.                        |
| Offset timestamps compared by text prefix (Copilot, Codex)       | `f925886`: date-only input (DTO and service). Timestamps are rejected.                          |
| No web client or banner (Copilot)                                | `2fe0abd`: hook, banner (en/ar) and integration on the bill page before Approve & post.         |
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

`pnpm ci:full` is `turbo lint type-check test`. I ran it with `--force` so turbo could not replay results cached by other worktrees:

```text
$ pnpm exec turbo lint type-check test --force
@mizano/web:test: Test Suites: 49 passed, 49 total
@mizano/web:test: Tests:       465 passed, 465 total
api:test: Test Suites: 138 passed, 138 total
api:test: Tests:       2218 passed, 2218 total
 Tasks:    12 successful, 12 total
Cached:    0 cached, 12 total
```

`next lint` prints 13 warnings, all in files this branch does not touch: crm, manufacturing, projects/my-tasks, purchases/credits, tax pages, `use-ai-chatbot.ts` and two settings specs. They predate this branch. The changed files lint clean with `eslint --max-warnings 0`, and all changed files pass `prettier --check`.

Targeted runs:

```text
$ jest src/modules/purchases src/common/interceptors/audit.interceptor.spec.ts   (apps/api)
Test Suites: 12 passed, 12 total
Tests:       167 passed, 167 total
$ jest components/purchases/possible-duplicates-banner.spec.tsx                  (apps/web)
Tests:       7 passed, 7 total
```

Seeded API e2e on a throwaway PostgreSQL 16 cluster (`prisma db push`, no `REDIS_URL`):

```text
$ jest --config ./test/jest-e2e.json --runInBand --verbose test/bill-duplicates.e2e-spec.ts
PASS test/bill-duplicates.e2e-spec.ts
  Possible duplicate bills (e2e)
    ✓ warns on a stored draft with the posted bill as a 4-dp match, excluding itself (4 ms)
    ✓ matches a POSTed draft by normalized vendor name, exact decimal and +/-3 days (11 ms)
    ✓ rejects numeric amounts, exponents and timestamps with 400 (7 ms)
    ✓ does not write an audit row for the read-only POST (13 ms)
    ✓ requires authentication and purchases.view (101 ms)
    ✓ never reveals tenant A's bills or vendors to tenant B (8 ms)
Tests:       6 passed, 6 total
$ jest --config ./test/jest-e2e.json --runInBand test/bill-duplicates.e2e-spec.ts test/purchases.e2e-spec.ts test/multi-tenancy.e2e-spec.ts
Test Suites: 3 passed, 3 total
Tests:       48 passed, 48 total
```

## Not verified / blocked

- **`test/intake.e2e-spec.ts`: blocked, not passed.** It needs Redis/BullMQ, and this host has no Redis server (`Intake worker error: ECONNREFUSED`). This branch does not change intake code.
- **Browser journey:** not run. Browser E2E is not wired in the repo (`docs/DEVELOPMENT.md`). The banner was verified only by component tests.
- **Environment notes:** this worktree had no `node_modules`. I installed them offline from the local pnpm store with the lockfile unchanged (`pnpm install --offline --frozen-lockfile --ignore-scripts`), then ran `prisma generate` and fetched bcrypt's prebuilt binary. Some intermediate e2e runs hit a PostgreSQL server owned by another local session on the same port. Those runs are discarded. All e2e results above come from this session's own cluster on port 55496, and the database I had created on the other server was dropped.
- **Size:** the diff is above the ~300-line guideline (about 390 non-test lines). Round 1 asked for the UI and e2e in this PR.

## Index note

`Bill` has `@@index([organizationId, vendorId])`, and the candidate query is bounded to one vendor and a 7-day window. No migration was added. An index on `(organizationId, vendorId, date)` can be considered if tenants grow large.
