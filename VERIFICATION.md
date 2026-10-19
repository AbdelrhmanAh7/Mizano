# VERIFICATION REPORT — Issue #153: Adopt tester-army/e2e in-repo as the E2E gate

- **Issue**: [#153](https://github.com/AbdelrhmanAh7/Mizano/issues/153)
- **PR**: [#268](https://github.com/AbdelrhmanAh7/Mizano/pull/268)
- **Branch**: `ai/153`
- **Base**: `master` (`451cc181`)
- **Tested Head Commit**: `8e42e0c74d7f96492ba60dba805130cc7eca4b35` (merged with latest `origin/master`)
- **Sentry Issue**: N/A (Feature enablement & in-repo testing framework adoption, not triggered by a Sentry error)

---

## Numbered Acceptance Criteria

1. **AC1 — Form Sign-in & Dashboard Navigation**: The accountant user signs in via the form at `/en/login` with seeded credentials (`admin@mizano.com`) and reaches `/en/dashboard`; invalid credentials return 401 Unauthorized.
2. **AC2 — Ledger Journal Correctness & Validation**: A balanced journal entry with matching debit and credit decimal amounts creates successfully (201 Created) with exact 4-decimal-place totals (`50.2500`); unbalanced entries or entries violating decimal limits are rejected (400 Bad Request).
3. **AC3 — Sales Invoice Drafting & Calculation**: A draft sales invoice is created (201 Created) with accurate calculated decimal totals (subtotal, tax, grand total) and listed; invoices with empty line items are rejected (400 Bad Request).
4. **AC4 — Bilingual RTL/LTR Localization**: Arabic pages render right-to-left (`document.documentElement.dir === 'rtl'`, `lang === 'ar'`) with Arabic text; English pages render left-to-right (`document.documentElement.dir === 'ltr'`, `lang === 'en'`).
5. **AC5 — Feature Map & Matrix Sharding**: The hub feature suite is ported into `e2e-army/features/` with tags (`feat:<id>`, `shard:<id>`, `lvl:<level>`); 22 shards defined in `e2e-army/shards.json` executed in GitHub Actions with `timeout-minutes: 5` per shard.
6. **AC6 — Service Endpoint Unit Coverage**: All 22 modified API services and DTO validation classes have dedicated unit tests ensuring edge-case handling passes without 500 errors.
7. **AC7 — Secret Security & Environment Isolation**: Zero credentials or tokens are committed; `e2e.config.ts` and `cli-model.ts` read only from environment variables and local Keychain; app secrets are ephemeral and generated per test run.
8. **AC8 — Clean Merge & Quality Gates**: Merge conflicts against `origin/master` are resolved cleanly with zero conflict markers, and all repo verification checks (`pnpm type-check`, `pnpm lint`, unit tests) pass.

---

## Verification Matrix

| AC #    | Acceptance Criterion                     | Verification Method / Command                                                                                                                                            | Observed Exit Code |   Status   |
| :------ | :--------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------: | :--------: |
| **AC1** | Form sign-in & dashboard navigation      | `e2e-army/153-e2e-army-gate.e2e.ts` (test: AC1 demo accountant signs in)                                                                                                 |         0          | **PASSED** |
| **AC2** | Ledger entry balance & rejection         | `e2e-army/153-e2e-army-gate.e2e.ts` (test: AC2 balanced ledger entry); `pnpm --filter api exec jest src/modules/accounting/services/journals.service.spec.ts` (49 tests) |         0          | **PASSED** |
| **AC3** | Draft invoice creation & line validation | `e2e-army/153-e2e-army-gate.e2e.ts` (test: AC3 sales invoice created as draft); `pnpm --filter api exec jest src/modules/sales/services/invoices.service.spec.ts`        |         0          | **PASSED** |
| **AC4** | Arabic RTL & English LTR layouts         | `e2e-army/153-e2e-army-gate.e2e.ts` (test: AC4 Arabic pages render right-to-left, English left-to-right)                                                                 |         0          | **PASSED** |
| **AC5** | Sharded CI configuration (≤ 5 min)       | `.github/workflows/e2e-army.yml` inspection: `jq -c '["pr"] + [.shards[].id]' e2e-army/shards.json`, `timeout-minutes: 5`                                                |         0          | **PASSED** |
| **AC6** | Service unit test coverage               | `pnpm --filter api exec jest <22 service spec files>` (22 suites / 199 tests passed, 0 failed)                                                                           |         0          | **PASSED** |
| **AC7** | Zero committed secrets                   | `git diff origin/master -- e2e.config.ts e2e-army/cli-model.ts` inspection: reads `process.env` and Keychain only                                                        |         0          | **PASSED** |
| **AC8** | Rebase & pre-push checks                 | `git merge origin/master`, `pnpm type-check` (6/6 tasks passed), `pnpm lint` (4/4 packages passed, 0 errors)                                                             |         0          | **PASSED** |

---

## Changed Covering Tests

The following 24 test suites directly cover the changed application behavior and gates:

1. `e2e-army/153-e2e-army-gate.e2e.ts` (E2E-first gate suite covering AC1, AC2, AC3, AC4)
2. `apps/api/src/modules/accounting/services/journals.service.spec.ts` (AC2 ledger validation and idempotent posting)
3. `apps/api/src/modules/assets/services/assets.service.spec.ts`
4. `apps/api/src/modules/assets/services/depreciation.service.spec.ts`
5. `apps/api/src/modules/banking/services/bank-accounts.service.spec.ts`
6. `apps/api/src/modules/banking/services/bank-rules.service.spec.ts`
7. `apps/api/src/modules/banking/services/bank-transactions.service.spec.ts`
8. `apps/api/src/modules/crm/services/deals.service.spec.ts`
9. `apps/api/src/modules/currency/services/currency.service.spec.ts`
10. `apps/api/src/modules/documents/services/email.service.spec.ts`
11. `apps/api/src/modules/hr/services/attendance.service.spec.ts`
12. `apps/api/src/modules/hr/services/employees.service.spec.ts`
13. `apps/api/src/modules/hr/services/payroll.service.spec.ts`
14. `apps/api/src/modules/import-export/controllers/import.controller.spec.ts`
15. `apps/api/src/modules/inventory/dto/inventory-dtos.spec.ts`
16. `apps/api/src/modules/inventory/services/price-lists.service.spec.ts`
17. `apps/api/src/modules/inventory/services/warehouses.service.spec.ts`
18. `apps/api/src/modules/logger/logger.controller.spec.ts`
19. `apps/api/src/modules/manufacturing/services/bom.service.spec.ts`
20. `apps/api/src/modules/manufacturing/services/work-orders.service.spec.ts`
21. `apps/api/src/modules/projects/services/timesheets.service.spec.ts`
22. `apps/api/src/modules/reports/controllers/reports.controller.spec.ts`
23. `apps/api/src/modules/sales/services/delivery-challans.service.spec.ts`
24. `apps/api/src/modules/tax/services/tax-rates.service.spec.ts`

---

## Command Verification Logs

### 1. Static Typecheck

```text
$ pnpm type-check
• turbo 2.8.12
• Packages in scope: @mizano/shared-types, @mizano/validators, @mizano/web, api
 Tasks:    6 successful, 6 total
 Time:    27.63s
```

**Exit Code**: 0

### 2. Linting

```text
$ pnpm lint
• turbo 2.8.12
• Packages in scope: @mizano/shared-types, @mizano/validators, @mizano/web, api
 Tasks:    4 successful, 4 total
 Time:    33.141s (0 errors)
```

**Exit Code**: 0

### 3. Unit Test Coverage (22 Suites)

```text
$ pnpm --filter api exec jest \
  src/modules/assets/services/assets.service.spec.ts \
  src/modules/assets/services/depreciation.service.spec.ts \
  src/modules/banking/services/bank-accounts.service.spec.ts \
  src/modules/banking/services/bank-rules.service.spec.ts \
  src/modules/banking/services/bank-transactions.service.spec.ts \
  src/modules/crm/services/deals.service.spec.ts \
  src/modules/currency/services/currency.service.spec.ts \
  src/modules/documents/services/email.service.spec.ts \
  src/modules/hr/services/attendance.service.spec.ts \
  src/modules/hr/services/employees.service.spec.ts \
  src/modules/hr/services/payroll.service.spec.ts \
  src/modules/import-export/controllers/import.controller.spec.ts \
  src/modules/inventory/dto/inventory-dtos.spec.ts \
  src/modules/inventory/services/price-lists.service.spec.ts \
  src/modules/inventory/services/warehouses.service.spec.ts \
  src/modules/logger/logger.controller.spec.ts \
  src/modules/manufacturing/services/bom.service.spec.ts \
  src/modules/manufacturing/services/work-orders.service.spec.ts \
  src/modules/projects/services/timesheets.service.spec.ts \
  src/modules/reports/controllers/reports.controller.spec.ts \
  src/modules/sales/services/delivery-challans.service.spec.ts \
  src/modules/tax/services/tax-rates.service.spec.ts

Test Suites: 22 passed, 22 total
Tests:       199 passed, 199 total
Snapshots:   0 total
Time:        38.313 s
```

**Exit Code**: 0

### 4. Ledger Journals Unit Spec

```text
$ pnpm --filter api exec jest src/modules/accounting/services/journals.service.spec.ts
PASS src/modules/accounting/services/journals.service.spec.ts
Test Suites: 1 passed, 1 total
Tests:       49 passed, 49 total
Snapshots:   0 total
Time:        2.691 s
```

**Exit Code**: 0

---

## Bug Fix & Regression Proof (Red-Green Cycle)

### 1. Bank Accounts Null-Safety Bug Fix (`Finding 5867d6948416`)

- **Symptom**: Calling `PATCH /banking/accounts/:id` with `{ linkedAccountId: null }` previously passed `null` directly to Prisma query filters without a prior null-check, triggering unhandled database exceptions.
- **Root Cause**: `assertOwnLinkedAccount` did not guard against falsy/null inputs before issuing the `prisma.account.findFirst` query.
- **Fix**: Added explicit guard `if (!linkedAccountId) throw new BadRequestException('Linked ledger account not found')` in `apps/api/src/modules/banking/services/bank-accounts.service.ts`.
- **Regression Test**: `src/modules/banking/services/bank-accounts.service.spec.ts`:
  - `rejects (400) when linkedAccountId is null`
- **Observed Result**: Test passes (Exit code 0).

### 2. Manual Depreciation Error Codes Bug Fix (`6eff9ac6`)

- **Symptom**: Manual asset depreciation on un-scheduled or already depreciated periods previously resulted in unhandled 500 server errors.
- **Root Cause**: Missing entity and state check exceptions in `DepreciationService.runDepreciationForAsset`.
- **Fix**: Replaced unchecked operations with explicit `NotFoundException` (404) for missing schedule and `ConflictException` (409) for already depreciated periods in `apps/api/src/modules/assets/services/depreciation.service.ts`.
- **Regression Test**: `src/modules/assets/services/depreciation.service.spec.ts`:
  - `answers 404 for an unknown or foreign asset, scoped to the organization`
  - `answers 404 for a period without a schedule entry (a client error, not a 500)`
  - `answers 409 when the period was already depreciated`
- **Observed Result**: 3/3 passed (Exit code 0).

---

## UI Localization & RTL Verification

- **Suite**: `e2e-army/153-e2e-army-gate.e2e.ts` (AC4: `@issue-153 AC4: Arabic pages render right-to-left with Arabic text, English pages left-to-right`)
- **Arabic Inspection**:
  - Target: `/ar/login`
  - Arabic Heading: `تسجيل الدخول` visible
  - Direction: `document.documentElement.dir === 'rtl'`
  - Language: `document.documentElement.lang === 'ar'`
- **English Inspection**:
  - Target: `/en/login`
  - English Heading: `Sign In` visible
  - Direction: `document.documentElement.dir === 'ltr'`
  - Language: `document.documentElement.lang === 'en'`
- **Observed Result**: Verified in gate suite; exit code 0.
