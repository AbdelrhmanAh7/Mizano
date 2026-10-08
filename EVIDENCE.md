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

# Evidence for Issue #104: credential-age check and rotation metadata

- **Baseline (`master`)**: `615060ed6294e16375a1f1ea9385cb7e812cd24f`
- **Tested head**: `93ab0c5a0b08faea6e5a2bdc23192e6a01179ddc` (clean tree). The next commit adds only this record.
- **Host**: macOS arm64, Node 26, PostgreSQL 16 throwaway cluster on 127.0.0.1:55104, no Redis (`REDIS_URL=` blank).
- **First commit** `96f259f` holds only the failing tests; before the implementation all 6 e2e tests failed (missing `smtpPasswordRotatedAt` column, no boot line).

## Requirements

| REQ | Requirement                                                                                     | Verified by                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 | `classifyCredentialAge`: 89 days `ok`, 90 `due`, 91 `expired`, whole UTC days                   | `credential-age.spec.ts`; e2e boot line: `TELEGRAM_BOT` (89 days) `ok`, `CLOUDFLARE_TUNNEL` (91) `expired`, SMTP (90) `due`             |
| AC2 | Missing or malformed date (not strict `YYYY-MM-DD`, impossible, future) gives `unknown`         | 13 unit cases; e2e boot with `2026-7-11` and an empty key                                                                               |
| AC3 | `smtpPasswordRotatedAt` set server-side only when `smtpPassword` changes; never client-supplied | e2e: stamp on change, unchanged for other fields or the same password, `400` for a client-sent stamp; `organizations.service.spec.ts`   |
| AC4 | One line per boot with names and classifications; host keys via `ConfigService`                 | e2e `AC1 AC4` (exactly one `warn` line; org without a password not listed; legacy row without a stamp `unknown`)                        |
| AC5 | No credential value in logs                                                                     | e2e `AC5` scans every `Logger` call and stdout/stderr for the four sentinel secrets; it fails when the service logs the token (checked) |

## Commands and results (on the tested head)

```text
$ npx turbo lint type-check test --force
api:test: Test Suites: 137 passed, 137 total
api:test: Tests:       2218 passed, 2218 total
@mizano/web:test: Test Suites: 48 passed, 48 total
@mizano/web:test: Tests:       458 passed, 458 total
 Tasks:    12 successful, 12 total

$ REDIS_URL= DATABASE_URL=postgresql://postgres@127.0.0.1:55104/mizano_e2e npx jest --config ./test/jest-e2e.json --runInBand
PASS test/credential-rotation.e2e-spec.ts
Test Suites: 12 passed, 12 total
Tests:       263 passed, 263 total
```

## Notes and open items

- `@mizano/web:lint` prints 13 warnings that predate this branch; no `apps/web` file changed. An earlier full run hit one timing flake in `intake-processor.service.spec.ts` (lease heartbeat); it passed 3/3 in isolation and in the recorded run.
- Size: 162 changed lines outside tests (the ~300 budget), 304 lines of tests, plus this record.
- Schema: `Organization.smtpPasswordRotatedAt` (nullable, migration `20261008000000_smtp_password_rotated_at`, no backfill). The brief asks for coordinator sign-off on the schema change; this PR is that request.
- Root `.env.local/.dev/.sit` are CRLF; the new keys keep CRLF. No CI workflow or secret value was touched.
