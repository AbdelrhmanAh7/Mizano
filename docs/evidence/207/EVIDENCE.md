# Evidence: Issue #207 — Specs for currency service (base conversion, unrealised FX)

## Overview

- **Issue**: #207 (test(api): specs for currency service (base conversion, unrealised FX) — #134 follow-up 2/5)
- **PR**: #297
- **Base**: `origin/master` (merged cleanly into `ai/207`)
- **Originating Sentry issue**: None (pure service spec and tenant-isolation hardening; no linked Sentry issue in brief)
- **User-facing flow / E2E**: Not user-facing (backend currency calculation and exchange rate service). An API-level `e2e-army` spec is provided at `e2e-army/207-currency-fx-tenant-and-idempotency.e2e.ts`.
- **Changed covering tests**:
  - `apps/api/src/modules/currency/services/currency.service.spec.ts` (new unit spec, 18 tests)
  - `e2e-army/207-currency-fx-tenant-and-idempotency.e2e.ts` (API-level e2e-army spec, 1 test)

---

## Numbered Acceptance Criteria

1. **AC1 (Base conversion & rounding)**: `convertToBaseCurrency` returns original amount at rate 1 for base currency without query; converts with latest rate on or before target date; rounds to 4 decimals with half-up rounding (0.50005 -> 0.5001); handles inverse and triangulated rates; defaults to SAR when organization has no base currency configured.
2. **AC2 (Missing rate error handling)**: Throws `NotFoundException` when no rate exists for the currency pair on or before date; never falls back to or leaks another organization's rates.
3. **AC3 (Unrealised FX gain/loss & zero ledger writes)**: `calculateGainLoss` computes correct sign/amounts for receivables (foreign currency strengthening = gain) and payables (foreign currency strengthening = loss); `calculateUnrealizedGainLoss` reads only open, non-deleted, foreign-currency documents within caller's organization; total matches sum of details; writes zero journal entries (`journal.create`, `journalLine.create`, `invoice.update`, `bill.update`, `$transaction` not called); repeated runs produce identical results (idempotent / pure reporting calculation).
4. **AC4 (Tenant scoping on reads and writes)**: Every Prisma read query (`findFirst`, `findMany`, `count`, `organization.findUnique`, raw SQL) filters strictly by `organizationId`; writes (`updateExchangeRate`, `deleteExchangeRate`, `createExchangeRate` upsert) include `organizationId` in their Prisma `where` clause (`{ id, organizationId }`), preventing cross-tenant mutation even if an ID is known; cross-tenant updates/deletes reject with `NotFoundException`.
5. **AC5 (Mocking, deterministic fake clock, test suite runners)**: Prisma client mocked via `apps/api/src/test/mocks/prisma.mock`; fixed fake clock (`2026-03-31T12:00:00.000Z`) used so tests are independent of wall-clock time; `node apps/api/_run_tests.js --testPathPattern=currency.service.spec`, `pnpm --filter api test -- --testPathPattern=currency.service.spec`, and the full API test suite `pnpm --filter api test` all pass with exit code 0.

---

## Verification Matrix

| AC ID   | Requirement Description                                                                | Verification Method / Command                                                                                                                                                                             | Result Summary                                                                          | Exit Code   | Status     |
| ------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------- | ---------- |
| **AC1** | Base conversion, latest rate lookup, 4-dp half-up rounding, triangulation, default SAR | `node apps/api/_run_tests.js --testPathPattern=currency.service.spec`                                                                                                                                     | 7 tests under `convertToBaseCurrency` and 1 under `getRate` PASS                        | 0           | **PASSED** |
| **AC2** | Missing rate throws `NotFoundException` across tenants                                 | `currency.service.spec.ts` test `throws NotFoundException when the org has no rate, even if another org has one`                                                                                          | PASS                                                                                    | 0           | **PASSED** |
| **AC3** | Unrealised FX gain/loss math, zero ledger writes, idempotent calculation               | `currency.service.spec.ts` 5 tests under `calculateGainLoss` & `calculateUnrealizedGainLoss`                                                                                                              | PASS (`expectNoLedgerWrites` verified, zero journals created, identical re-run outputs) | 0           | **PASSED** |
| **AC4** | Tenant scoping on all reads and writes (`{ id, organizationId }`)                      | `currency.service.spec.ts` 5 tests under `tenant scoping`                                                                                                                                                 | PASS (`organizationId` verified in all queries, raw SQL, and update/delete clauses)     | 0           | **PASSED** |
| **AC5** | Deterministic mocks & fake clock; runners pass (narrow & full)                         | 1. `node apps/api/_run_tests.js --testPathPattern=currency.service.spec`<br>2. `pnpm --filter api test -- --testPathPattern=currency.service.spec`<br>3. `pnpm --filter api test`                         | 1. 18/18 PASS<br>2. 18/18 PASS<br>3. 152/152 test suites PASS, 2406 tests PASS          | 0<br>0<br>0 | **PASSED** |
| —       | API TypeScript check                                                                   | `pnpm --filter api type-check`                                                                                                                                                                            | Clean (0 errors across `tsc --noEmit` and e2e tsconfig)                                 | 0           | **PASSED** |
| —       | API ESLint check                                                                       | `pnpm --filter api lint`                                                                                                                                                                                  | Clean (0 errors, 0 warnings)                                                            | 0           | **PASSED** |
| —       | Code formatting                                                                        | `pnpm prettier --check apps/api/src/modules/currency/services/currency.service.ts apps/api/src/modules/currency/services/currency.service.spec.ts e2e-army/207-currency-fx-tenant-and-idempotency.e2e.ts` | All matched files use Prettier code style                                               | 0           | **PASSED** |
| —       | Script / documentation tests                                                           | `python3 -m unittest discover -s scripts -p 'test_*.py' -v`                                                                                                                                               | 48/48 tests PASS (including conflict marker check)                                      | 0           | **PASSED** |

---

## Detailed Execution Outputs

### AC5: Isolated Spec Run (`_run_tests.js`)

Command:

```bash
node apps/api/_run_tests.js --testPathPattern=currency.service.spec
```

Output:

```text
Using jest from: /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-207/node_modules/jest/bin/jest.js
PASS src/modules/currency/services/currency.service.spec.ts
  CurrencyService
    convertToBaseCurrency
      ✓ returns the amount unchanged at rate 1 for the base currency, without a rate lookup (3 ms)
      ✓ converts with the latest rate on or before the date and rounds to 4 decimals
      ✓ rounds a half at the 5th decimal up (0.50005 -> 0.5001) (1 ms)
      ✓ uses an older rate for an older date and never a future-dated one (fixed clock)
      ✓ inverts a base->foreign rate when no direct rate exists
      ✓ throws NotFoundException when the org has no rate, even if another org has one (8 ms)
      ✓ defaults the base currency to SAR when the organization has none
    getRate
      ✓ triangulates through the base currency when neither direct nor inverse exists (1 ms)
    calculateGainLoss
      ✓ books a receivable gain when the foreign currency strengthens
      ✓ books a payable loss when the foreign currency strengthens
    calculateUnrealizedGainLoss
      ✓ computes exact receivable and payable gain/loss per open document
      ✓ only reads open, non-deleted, foreign-currency documents of the caller org (1 ms)
      ✓ posts nothing: running it twice gives the same figures and writes no journal
    tenant scoping
      ✓ scopes every exchange-rate lookup by organizationId (1 ms)
      ✓ passes organizationId into the latest-rates raw query
      ✓ does not update or delete another org rate (1 ms)
      ✓ keeps organizationId on the update and delete writes themselves
      ✓ creates a new rate in the caller org with an exact Decimal rate

Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
Snapshots:   0 total
Time:        6.713 s
Ran all test suites matching /currency.service.spec/i.
```

Exit code: 0

---

### AC5: Filtered Spec Run via pnpm

Command:

```bash
pnpm --filter api test -- --testPathPattern=currency.service.spec
```

Output:

```text
> api@0.1.0 test /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-207/apps/api
> jest --maxWorkers=2 "--testPathPattern=currency.service.spec"

PASS src/modules/currency/services/currency.service.spec.ts
  CurrencyService
    convertToBaseCurrency
      ✓ returns the amount unchanged at rate 1 for the base currency, without a rate lookup (4 ms)
      ✓ converts with the latest rate on or before the date and rounds to 4 decimals (2 ms)
      ✓ rounds a half at the 5th decimal up (0.50005 -> 0.5001) (1 ms)
      ✓ uses an older rate for an older date and never a future-dated one (fixed clock) (1 ms)
      ✓ inverts a base->foreign rate when no direct rate exists
      ✓ throws NotFoundException when the org has no rate, even if another org has one (14 ms)
      ✓ defaults the base currency to SAR when the organization has none
    getRate
      ✓ triangulates through the base currency when neither direct nor inverse exists (1 ms)
    calculateGainLoss
      ✓ books a receivable gain when the foreign currency strengthens
      ✓ books a payable loss when the foreign currency strengthens
    calculateUnrealizedGainLoss
      ✓ computes exact receivable and payable gain/loss per open document (2 ms)
      ✓ only reads open, non-deleted, foreign-currency documents of the caller org (5 ms)
      ✓ posts nothing: running it twice gives the same figures and writes no journal (2 ms)
    tenant scoping
      ✓ scopes every exchange-rate lookup by organizationId (2 ms)
      ✓ passes organizationId into the latest-rates raw query
      ✓ does not update or delete another org rate (1 ms)
      ✓ keeps organizationId on the update and delete writes themselves
      ✓ creates a new rate in the caller org with an exact Decimal rate

Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
Snapshots:   0 total
Time:        4.392 s, estimated 7 s
Ran all test suites matching /currency.service.spec/i.
```

Exit code: 0

---

### AC5: Full API Test Suite Execution

Command:

```bash
/Users/abdelrahmanahmed/agents/hub-live/bin/suite.sh pnpm --filter api test
```

Output summary:

```text
> api@0.1.0 test /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-207/apps/api
> jest --maxWorkers=2

PASS src/modules/sales/services/invoices.service.spec.ts (11.834 s)
PASS src/modules/sales/services/credit-notes.service.spec.ts
PASS src/common/dto/shared-journal-schema.spec.ts
PASS src/modules/ai/services/document-intake.service.spec.ts
PASS src/deploy-worker-gating.spec.ts (6.347 s)
...
PASS src/modules/currency/services/currency.service.spec.ts
...
PASS src/modules/logger/logger.service.tenancy.spec.ts (20.884 s)

Test Suites: 152 passed, 152 total
Tests:       1 todo, 2406 passed, 2407 total
Snapshots:   0 total
Time:        116.327 s
Ran all test suites.
```

Exit code: 0

---

## Zero Ledger Postings & Idempotency Audit (AC3)

`CurrencyService` intentionally performs zero ledger postings. It is an advisory/reporting and conversion service, not an automated booking engine.

The suite asserts this via `expectNoLedgerWrites(prisma)`:

```ts
function expectNoLedgerWrites(prisma: MockPrismaClient): void {
  expect(prisma.journal.create).not.toHaveBeenCalled();
  expect(prisma.journal.createMany).not.toHaveBeenCalled();
  expect(prisma.journal.upsert).not.toHaveBeenCalled();
  expect(prisma.journalLine.create).not.toHaveBeenCalled();
  expect(prisma.journalLine.createMany).not.toHaveBeenCalled();
  expect(prisma.invoice.update).not.toHaveBeenCalled();
  expect(prisma.bill.update).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
}
```

Repeated execution of `calculateUnrealizedGainLoss` produces strictly identical outputs with zero mutations:

```ts
it('posts nothing: running it twice gives the same figures and writes no journal', async () => {
  const asOf = new Date('2026-03-15T00:00:00Z');
  const first = await service.calculateUnrealizedGainLoss(ORG_A, asOf);
  const second = await service.calculateUnrealizedGainLoss(ORG_A, asOf);

  expect(second).toEqual(first);
  expectNoLedgerWrites(prisma);
});
```

---

## Bug Fix Regression Demonstration (AC4)

### Vulnerability on Base (`origin/master`)

In `apps/api/src/modules/currency/services/currency.service.ts`, `updateExchangeRate` and `deleteExchangeRate` previously queried `organizationId` in the initial `findFirst` lookup, but omitted `organizationId` from the actual Prisma `update` and `delete` statements (`where: { id }` instead of `where: { id, organizationId }`). Similarly, `createExchangeRate` upsert updated via `where: { id: existing.id }`.

When running `currency.service.spec.ts` against the base implementation:

```text
FAIL src/modules/currency/services/currency.service.spec.ts
  ● CurrencyService › tenant scoping › keeps organizationId on the update and delete writes themselves

    expect(received).toEqual(expected) // deep equality

    - Expected  - 1
    + Received  + 0

      Object {
        "id": "r-a-usd",
    -   "organizationId": "org-a",
      }

      374 |       for (const [args] of writes) {
    > 375 |         expect(args.where).toEqual({ id: 'r-a-usd', organizationId: ORG_A });
          |                            ^
      376 |       }

Tests: 1 failed, 17 passed, 18 total  Exit code 1
```

### Verification on Head (`ai/207`)

With the fix in `currency.service.ts`:

```ts
return this.prisma.exchangeRate.update({
  where: { id: existing.id, organizationId },
  ...
});

return this.prisma.exchangeRate.update({
  where: { id, organizationId },
  ...
});

await this.prisma.exchangeRate.delete({ where: { id, organizationId } });
```

All 18 tests pass with exit code 0.
