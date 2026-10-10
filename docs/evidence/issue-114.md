# Evidence: Issue #114, VAT return draft generated from the Mizano ledger

**Tested code head**: `f3923317e124efa4ebb2a38bba4f1087c6e8420b` (`ai/114`). Everything below ran on that tree. The commit that adds this file changes nothing else.

The root `EVIDENCE.md` is unchanged from `master` (it still holds the #95 audit).

## Rework after QA on PR #117

| QA finding                                      | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ETA mismatch flagging not implemented           | Implemented (AC6). "ETA" is the Egyptian Tax Authority. The repo stores no ETA submission data, so the check is the one the ledger can run before filing: ETA recomputes tax from the lines and rejects a document whose header differs. Each summed invoice and bill is checked (net line amount × rate, rounded per line as in `computeDocumentTotals`). Differences go to `etaMismatches` with both figures and make the draft `incomplete`. Comparison against ETA portal data stays in #119. |
| Service, type, e2e and docs "not shown" in diff | Diff shortened from 668 to about 620 lines. The specs were compacted without dropping cases, and every file is listed below. The service is complete: `apps/api/src/modules/reports/services/vat-return-draft.service.ts`. The type is in `packages/shared-types/src/entities/reports.ts`.                                                                                                                                                                                                        |
| Repo lesson: implement every functional change  | VAT computation and ETA mismatch flagging are both implemented. The filing-corrections metric (needs history of filed returns) remains in #120; #114 stays open for it.                                                                                                                                                                                                                                                                                                                           |

## Requirements

| REQ   | Requirement                                             | Verification (all tests carry `@issue-114`)                                                                                                                                                                        | Status |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| AC1   | Authenticated and org-scoped; cross-org returns no data | e2e: anonymous `401`; tenant B queries tenant A's exact window and gets one exact empty, complete body. Unit: both queries carry `organizationId`; controller passes the session org.                              | PASSED |
| AC2   | Output, input and net are decimal strings from fixtures | e2e: `140.0000` / `70.0000` / `70.0000`; empty period is all `0.0000`. Unit: mixed 0/5/14% rates, `0.1 + 0.2 = 0.3000`.                                                                                            | PASSED |
| AC3   | Only posted, non-deleted documents                      | e2e: a DRAFT and a VOID invoice in the window are excluded. Unit: the query filters `status notIn [DRAFT, VOID]` and `deletedAt: null`.                                                                            | PASSED |
| AC4   | Missing/foreign-currency data goes to `exceptions[]`    | e2e: an `EUR` invoice yields exactly one exception. Unit: foreign code and null tax; a missing code counts as base currency, case-insensitively.                                                                   | PASSED |
| AC5   | Invalid range returns 400                               | e2e: `from > to` and a malformed date return `400`. Controller unit: `from > to` never reaches the service; `from = to` is accepted.                                                                               | PASSED |
| AC6   | ETA mismatches flagged before filing                    | e2e: a posted invoice whose header tax is changed to `139.99` (lines give `140.00`) is listed with both amounts and the draft is `incomplete`. Unit: per-line rounding (`1.6665 → 1.67`) and a bill with no lines. | PASSED |
| Log   | Errors logged without message or params                 | Unit: a Prisma-like error is logged as `PrismaClientKnownRequestError(P2010)` only.                                                                                                                                | PASSED |
| Docs  | Commands are copy-pasteable                             | Both commands in `docs/reports.md` were run verbatim against the API built from this tree on a seeded throwaway database: `200`, `complete`, `etaMismatches: []`. The old path `/api/v1/...` was wrong.            | PASSED |
| Scope | No migration, no CI/workflow change                     | 10 files, all VAT draft code, tests and docs. No `prisma/` or `.github/` changes.                                                                                                                                  | PASSED |

## Size

The plan asked for at most 300 lines. The diff adds 620 lines: 205 of production code, 318 of tests (unit plus e2e), and 97 of docs including this file. It cannot be split further without shipping the endpoint without its tests.

## Commands run on `f392331`

- `npx jest` (apps/api): 138 suites, 2208 tests passed.
- `npx jest` (apps/web): 48 suites, 458 tests passed.
- `npx turbo lint type-check --force`: 10 of 10 tasks successful.
- `npx jest --config ./test/jest-e2e.json --runInBand` with `REDIS_URL=` on a freshly migrated throwaway Postgres 16: 11 suites, 261 tests passed (including `intake` and `reports`, 19 tests).
- Before the fix (`a989c3d`, tests only), `reports.e2e-spec` failed in 4 tests, all because `etaMismatches` was absent.

## Not verified

- No comparison against real ETA portal data (none stored): #119.
- The filing-corrections metric: #120.
