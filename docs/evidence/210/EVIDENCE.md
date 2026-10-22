# Evidence: Issue #210 — test(api): specs for bank statement import service (#134 follow-up 5/5)

## Overview

- **Issue**: #210 (`test(api): specs for bank statement import service (#134 follow-up 5/5)`)
- **Parent Issue**: #134 (R5: ledger-writing services with zero specs)
- **Base Commit**: `6679bfe28c0b25e244840502283a0058b292e104` (`master`)
- **Tested Commit SHA**: `085afaf8f6570017181a7d669781bfc698dc7cf0`
- **Originating Sentry Issue**: None (Technical debt / test coverage follow-up split from PR #139 / issue #134).
- **User-facing flow / E2E**: Not user-facing (backend banking statement import unit test suite). No user-facing UI route modified. Waiver: `E2E: not needed — pure internal unit test addition for bank-statement-import.service`.

---

## Changed Covering Tests

- `apps/api/src/modules/banking/services/bank-statement-import.service.spec.ts` (57 unit tests covering parsing, amount signs, duplicate-line detection, tenant scoping, idempotent retries, Decimal posting, and mock timers/no wall-clock dates)

---

## Numbered Acceptance Criteria

1. **AC1 (Parsing and Amount Signs)**: `detectColumnMapping`, `parseAmount`, `parseDate`, and `normalizeTransactions` correctly identify standard and split columns, parse standard, European, negative, and parenthesized negative amounts, handle multiple date formats, and determine DEPOSIT vs WITHDRAWAL types.
2. **AC2 (Exact Decimal Journal Lines & Sign Handling)**: Imported transactions are stored with exact `Decimal` amounts (stored as positive absolute value) with type indicating direction (`DEPOSIT` for credit/money in, `WITHDRAWAL` for debit/money out).
3. **AC3 (Tenant Scoping)**: Every Prisma read and write carries `organizationId`. Records from another organization (`ORG_2`) are never read or written when processing for `ORG_1`, and foreign bank account IDs reject with `NotFoundException`.
4. **AC4 (Duplicate-line Detection & Idempotent Retries)**: Re-importing identical statement lines or existing transactions detects duplicates via primary key (date + amount + reference) and secondary key (date + amount + description prefix), creating zero duplicate records and reporting accurate duplicate counts.
5. **AC5 (Mocking & Deterministic Dates)**: Prisma and Redis are mocked (`createMockPrisma`); tests avoid wall-clock dependencies and use deterministic timestamps or mock queries.
6. **AC6 (Test Runners, Lint & Type-Check Passing)**: Both `node apps/api/_run_tests.js --testPathPattern=bank-statement-import.service.spec.ts` and `pnpm --filter api test bank-statement-import.service.spec.ts` pass all 57 tests; `pnpm --filter api type-check` and `pnpm --filter api lint` both exit 0 cleanly.

---

## Verification Matrix

| AC ID   | Requirement Description                                       | Test / Command                                                                                                                                                | Observed Result                                                                            | Exit Code | Status     |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- | ---------- |
| **AC1** | Column detection, amount parsing, date parsing, normalization | `node apps/api/_run_tests.js --testPathPattern=bank-statement-import.service.spec.ts -t "detectColumnMapping\|parseAmount\|parseDate\|normalizeTransactions"` | 27 tests PASS (Standard/European/parentheses amounts, date formats, split debit/credit)    | 0         | **PASSED** |
| **AC2** | Exact Decimal journal lines & direction signs                 | `node apps/api/_run_tests.js --testPathPattern=bank-statement-import.service.spec.ts -t "Decimal journal lines"`                                              | 4 tests PASS (DEPOSIT credit, WITHDRAWAL debit, European Decimal, parentheses)             | 0         | **PASSED** |
| **AC3** | Tenant isolation and organizationId scoping                   | `node apps/api/_run_tests.js --testPathPattern=bank-statement-import.service.spec.ts -t "tenant isolation"`                                                   | 2 tests PASS (no cross-org read/write, foreign bank account rejected)                      | 0         | **PASSED** |
| **AC4** | Deduplication and idempotent retries                          | `node apps/api/_run_tests.js --testPathPattern=bank-statement-import.service.spec.ts -t "idempotent retries\|deduplicateTransactions"`                        | 9 tests PASS (primary reference key, secondary description key, re-import duplicate count) | 0         | **PASSED** |
| **AC5** | Prisma mocked & no wall-clock dates                           | `node apps/api/_run_tests.js --testPathPattern=bank-statement-import.service.spec.ts -t "no wall-clock dates"`                                                | 2 tests PASS (Prisma mocked via `createMockPrisma`, fixed dates verified)                  | 0         | **PASSED** |
| **AC6** | Full unit spec execution via `_run_tests.js`                  | `node apps/api/_run_tests.js --testPathPattern=bank-statement-import.service.spec.ts`                                                                         | 57/57 unit tests PASS (3.02s)                                                              | 0         | **PASSED** |
| **AC6** | Full unit spec execution via `pnpm test`                      | `pnpm --filter api test bank-statement-import.service.spec.ts`                                                                                                | 57/57 unit tests PASS (2.45s)                                                              | 0         | **PASSED** |
| —       | TypeScript type checking                                      | `pnpm --filter api type-check`                                                                                                                                | Clean (0 errors across tsc and test/tsconfig.e2e.json)                                     | 0         | **PASSED** |
| —       | ESLint check across api                                       | `pnpm --filter api lint`                                                                                                                                      | Clean (0 errors, 0 warnings)                                                               | 0         | **PASSED** |

---

## Bug Fix / Regression Demonstration

- **Base behaviour on master (`6679bfe28c0b25e244840502283a0058b292e104`)**: `apps/api/src/modules/banking/services/bank-statement-import.service.ts` had zero test specifications in the repository (identified in issue #134 R5). Prior attempt on `ai/210` at commit `0298c3d039c7` added the initial spec draft but failed the pre-push gate because TypeScript compilation failed with `tsc failed (2)` due to strict mock typing issues and implicit any parameters.
- **Head behaviour**: All TypeScript errors resolved using properly cast mock types matching repository patterns (`/* eslint-disable @typescript-eslint/no-explicit-any */`, typed calls), passing `tsc --noEmit` and `pnpm --filter api type-check` cleanly with 0 errors. All 57 tests pass deterministically.

---

## UI Verification (Screenshots / RTL & LTR)

**UI is EXEMPT**:

- This issue adds backend unit test specifications for `BankStatementImportService`.
- No frontend files in `apps/web` are modified.
- No Playwright screenshots or RTL/LTR web tests are required for this backend-only test change.

---

## Skills Used

- `systematic-debugging`: Diagnosed the `tsc failed (2)` pre-push failure on commit `0298c3d039c7` to strict mock typing and implicit any parameter violations on `findFirstCalls`, `findManyCalls`, and `createManyCalls`.
- `principle-type-system-discipline`: Aligned mock declarations with repository standard practices from `reconciliation.service.spec.ts` and `opening-balances.service.spec.ts`, eliminating all TS errors while preserving strict assertions.
- `verification-before-completion`: Executed `_run_tests.js`, `pnpm test`, `pnpm type-check`, and `pnpm lint`, verifying 0 errors and 57 passing tests.
- `model-effort-routing`: Explicitly chosen Tool + Model + Effort for all tasks.
