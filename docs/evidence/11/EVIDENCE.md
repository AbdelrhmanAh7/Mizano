# Evidence: issue #11, atomic and idempotent bill approval and payment posting

This file documents verification and evidence for GitHub issue #11 in `AbdelrhmanAh7/Mizano`.
It lives under `docs/evidence/11/EVIDENCE.md` and is indexed in root `EVIDENCE.md`.

## Overview

- **Issue:** #11 ([P0] Make bill approval and payment posting atomic and idempotent)
- **Base commit (`origin/master`):** `451cc181`
- **Tested HEAD commit:** `6e5959201c5d5cdac27310231c8b9311e08a4770`
- **Verification Date:** 2026-10-19
- **Skills Used:** `writing-plans`, `test-first-engineering`, `verification-before-completion`

---

## Numbered Acceptance Criteria

- **AC1: Concurrent/retried bill approval creates exactly one posting.**
  Two simultaneous approval requests for the same draft bill serialize under transaction isolation and organization ledger locking. Exactly one request succeeds with HTTP 201 (moving status from `DRAFT` to `OPEN`), exactly one request fails with HTTP 400/409, exactly one journal entry is posted with balanced debit/credit lines, and the ledger trial balance remains balanced.

- **AC2: Concurrent payments serialize and prevent overpayment.**
  Two simultaneous payments that would together overpay an approved bill serialize via row-level locking (`SELECT ... FOR UPDATE` via `BillsService.lockBills`). Exactly one payment succeeds with HTTP 201 (updating bill status to `PAID`, setting `balanceDue` to `0`, creating 1 allocation and 1 payment journal), and the second payment fails with HTTP 400 (`Allocation exceeds the balance due on bill ...`). No duplicate payment, orphan allocation, or extra journal is created, and the trial balance debits equal credits.

- **AC3: Atomic rollback on failure and pre-mutation validations.**
  Missing required default AP or VAT accounts, foreign currency without exchange handling, or actions within a locked accounting period reject with HTTP 400 before any state change. Any failure during journal creation rolls back bill status, payments, allocations, and journal lines together within the Prisma `$transaction`.

- **AC4: Tenant isolation under concurrent actions.**
  Bills, payments, allocations, and journal entries created during concurrent requests for Tenant A are strictly tenant-scoped and inaccessible to Tenant B (404 on direct lookup, excluded from lists and aggregations).

---

## Verification Matrix

| AC #    | Description                                                             | Verification Method / Covering Test                                                                                                                                                  | Exit Code | Result Summary                                                                                       |
| ------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------- |
| **AC1** | Concurrent bill approval produces exactly 1 posting and balances ledger | `accountant-journey.e2e-spec.ts` (`posts exactly once under concurrent approvals`) & `e2e-army/11-bill-approval-payment-atomic.e2e.ts` (AC1)                                         | 0         | 1 succeeded (201), 1 rejected (400/409), exactly 1 journal posted with debit = credit = 342.0000     |
| **AC2** | Concurrent payments serialize without overpayment or duplicate journals | `accountant-journey.e2e-spec.ts` (`serializes concurrent payments that would overpay the same bill`) & `e2e-army/11-bill-approval-payment-atomic.e2e.ts` (AC2)                       | 0         | 1 succeeded (201), 1 rejected (400), bill status PAID, balanceDue 0, trial balance debits == credits |
| **AC3** | Atomic validation and lock date enforcement                             | `accountant-journey.e2e-spec.ts` (`enforces the lock date on approval, manual journals and payments`, `rejects an overpayment without creating a payment`) & `bills.service.spec.ts` | 0         | Rejection with HTTP 400, zero partial writes, rollback confirmed                                     |
| **AC4** | Cross-tenant isolation of concurrent records                            | `accountant-journey.e2e-spec.ts` (`leaves tenant A's documents out of tenant B's lists`, `hides tenant A's documents from tenant B by id`)                                           | 0         | Tenant B queries return empty lists and 404 for all Tenant A document IDs                            |

---

## Changed Covering Tests

1. `e2e-army/11-bill-approval-payment-atomic.e2e.ts`:
   - Natural language request-level E2E test for the verify gate.
   - Tags: `feat:mz-purchase-bills`, `feat:mz-purchase-payments`, `lvl:api`.
   - Title: `@issue-11 AC1 AC2: concurrent bill approval and payment posting are atomic and idempotent`.

2. `apps/api/test/accountant-journey.e2e-spec.ts`:
   - Updated `it('posts exactly once under concurrent approvals')`: asserts exactly 1 success (201), 1 failure (400/409), journal debit/credit totals equal 342.0000, trial balance balanced.
   - Added `it('serializes concurrent payments that would overpay the same bill')`: asserts 1 payment success (201, bill status PAID, balance 0, 1 payment journal with AP debit 100 / Bank credit 100), 1 rejection (400), balanced trial balance.
   - Updated `tenant isolation` spec: verifies Tenant B lists exclude all concurrent payment and approval IDs.

---

## Local Verification Commands and Results

### 1. Typecheck

```bash
pnpm --filter api type-check
```

**Output:**

```text
> api@0.1.0 type-check /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-11/apps/api
> tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json
```

**Exit Code:** `0`

### 2. Lint

```bash
pnpm --filter api lint
```

**Output:**

```text
> api@0.1.0 lint /Users/abdelrahmanahmed/agents/work.noindex/impl/Mizano-11/apps/api
> eslint "{src,apps,libs,test}/**/*.ts"
```

**Exit Code:** `0`

### 3. Changed E2E Test Suite

```bash
DATABASE_URL="postgresql://mizano:mizano_secret@localhost:5432/mizano_11_e2e?schema=public" pnpm --filter api exec jest --config test/jest-e2e.json test/accountant-journey.e2e-spec.ts
```

**Output:**

```text
PASS test/accountant-journey.e2e-spec.ts
  Accountant journey (e2e)
    tenant A: purchases to ledger
      ✓ logs in as a real user of a real organization (5 ms)
      ✓ seeds the chart of accounts and links the organization default accounts (83 ms)
      ✓ creates a vendor and an auto-numbered bill with exact decimal totals (22 ms)
      ✓ approves a bill: OPEN, one balanced journal dated on the bill date (23 ms)
      ✓ rejects a second approval and still has exactly one journal (9 ms)
      ✓ posts exactly once under concurrent approvals (24 ms)
      ✓ approves a bill whose two lines share one expense account (16 ms)
      ✓ records a partial payment from the bank account (31 ms)
      ✓ rejects an overpayment without creating a payment or touching the bill (7 ms)
      ✓ keeps the trial balance balanced and the AP control account equal to open bills (13 ms)
      ✓ shows the open balances, and not drafts, in payables aging (7 ms)
      ✓ voids the payment with a linked reversal and restores the bill (20 ms)
      ✓ keeps posted journals immutable and reverses a manual journal exactly once (25 ms)
      ✓ does not reverse a system journal behind its source document (4 ms)
      ✓ enforces the lock date on approval, manual journals and payments (21 ms)
      ✓ bulk-approves per record: the locked bill fails, the other posts (23 ms)
      ✓ bulk-pays full balances by recording real payments (41 ms)
      ✓ approves the old bill once the lock is lifted, dated on its own bill date (12 ms)
      ✓ serializes concurrent payments that would overpay the same bill (34 ms)
      ✓ ends with a balanced ledger whose AP equals the open bill balances (4 ms)
    tenant isolation
      ✓ hides tenant A's documents from tenant B by id (10 ms)
      ✓ leaves tenant A's documents out of tenant B's lists (48 ms)
      ✓ cannot mutate tenant A's documents (25 ms)
      ✓ rejects tenant A's accounts and vendors in tenant B's postings (6 ms)
    anonymous access
      ...
Test Suites: 1 passed, 1 total
Tests:       37 passed, 37 total
Snapshots:   0 total
Time:        4.94 s
```

**Exit Code:** `0`
