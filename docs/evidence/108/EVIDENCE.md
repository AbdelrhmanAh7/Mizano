# EVIDENCE.md — Cross-tenant isolation of ledger and invoice reads (#108)

- **Tested commit**: `34a8ca9c` (branch `ai/108`; the only later commit changes this file, `git diff 34a8ca9c HEAD --stat` lists EVIDENCE.md alone). Every result below, including all mutation rows, was produced at that commit in this round.
- **Suite**: `apps/api/test/tenant-isolation.e2e-spec.ts` (7 tests). Two registered tenants (A: 1111, B: 7777), each with a sent invoice, an approved bill, a manual journal and a distinct unapplied vendor credit (A 222.22, B 333.33).
- **Database**: throwaway Postgres 16 (`mizano_e2e_108` on `127.0.0.1:55432`, `prisma migrate deploy`) and Redis (`127.0.0.1:56380`), both started from a temp dir for this run. No new services or secrets.
- **Production code changed**: a cursor guard in `findAllCursor` of `invoices.service.ts`, `bills.service.ts` and `journals.service.ts` (a cursor id from another tenant, or unknown, gives 404). No auth-model change.
- **e2e-army**: no new test. This issue adds API integration tests and a guard on a query parameter; no screen or user flow changes. The foreign-cursor 404 is asserted by `AC2b` in the suite above. The earlier `e2e-army/108-cursor-isolation.e2e.ts` was removed because it repeated that check.

| REQ  | Requirement                                                        | Test (`@issue-108`)                                                                          | Status |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------ |
| AC1  | A's token on B's invoice, bill, journal, GL account id returns 404 | `AC1: returns 404 for every foreign id` (both GL routes; own ids return 200)                 | PASSED |
| AC2  | Lists, AP aging and both trial balances hold no B rows or totals   | three `AC2:` tests: lists + `meta.total` vs own rows, AP aging + own credits, trial balances | PASSED |
| AC2b | Cursor endpoints reject the other tenant's id                      | `AC2b: foreign ids as cursor return 404, own ids 200`                                        | PASSED |
| AC3  | No token or an expired token gets 401 on all 14 routes             | two `AC3:` tests                                                                             | PASSED |
| AC4  | Existing command, no new services                                  | `jest --config ./test/jest-e2e.json` (`pnpm --filter api test:e2e`)                          | PASSED |
| AC5  | Change ≤ ~300 lines                                                | 307 changed lines of test and source (see Size)                                              | MET    |

**Commands and output** (at `34a8ca9c`, from `apps/api`):

```text
$ DATABASE_URL=…mizano_e2e_108 pnpm exec jest --config ./test/jest-e2e.json --maxWorkers=1 tenant-isolation
Test Suites: 1 passed, 1 total   Tests: 7 passed, 7 total
$ pnpm exec jest --maxWorkers=2 src/modules/sales/services/invoices.service.spec.ts \
    src/modules/purchases/services/bills.service.spec.ts src/modules/accounting/services/journals.service.spec.ts
Test Suites: 3 passed, 3 total   Tests: 155 passed, 155 total
$ pnpm exec tsc --noEmit && pnpm exec tsc --noEmit -p test/tsconfig.e2e.json    # exit 0
$ pnpm exec eslint "{src,test}/**/*.ts" --max-warnings 0                         # exit 0
```

**Mutation check** (issue test plan: drop one tenant filter, confirm the matching test fails, restore). Each row was run at `34a8ca9c`; the suite exited 1 with only the named test failing, and the file was restored with `git checkout` afterwards.

| Removed tenant guard                                                                      | Failing test                                             |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `invoices.service.ts:219` `organizationId` in `findOne`                                   | AC1 every foreign id                                     |
| `invoices.service.ts:198` `organizationId` in the cursor guard                            | AC2b cursor 404                                          |
| `invoices.service.ts:118` `organizationId` in the list filter (data and count)            | AC2 lists and `meta.total`                               |
| `bills.service.ts:120` `organizationId` in the cursor guard                               | AC2b cursor 404                                          |
| `bills.service.ts:78` `organizationId` in the list filter                                 | AC2 lists and `meta.total`                               |
| `journals.service.ts:230` `organizationId` in the cursor guard                            | AC2b cursor 404                                          |
| `aging-reports.service.ts:187` `organizationId` in the vendor-credit query                | AC2 AP aging                                             |
| `aging-reports.service.ts:171` `organizationId` in payables aging                         | AC2 AP aging                                             |
| `report-utils.ts:207` line-totals filter plus `financial-reports.service.ts:576` accounts | AC2 trial balances (`/reports/trial-balance`)            |
| `report-utils.ts:207` line-totals filter plus `accounting-reports.service.ts:65` accounts | AC2 trial balances (`/accounting-reports/trial-balance`) |
| `jwt.strategy.ts:23` `ignoreExpiration: true`                                             | AC3 expired token                                        |

Each trial balance has two tenant filters: the account list and the line totals. Removing only one of them leaks nothing, because foreign totals are keyed by foreign account ids that the org-scoped account list never holds. Removing both makes the AC2 trial balance test fail, as the two trial-balance rows show.

**Size (AC5).** `git diff --numstat origin/master HEAD -- apps/api e2e-army` at the tested commit: `tenant-isolation.e2e-spec.ts` 285, three services 23, e2e-army 0 = 308 added lines of test and source. The earlier 501 came from a 367-line spec and a 108-line e2e-army file; the e2e-army file was removed and the three AC2 list tests were merged. All four earlier reviewer requests stay covered: second general-ledger route, `meta.total`, vendor-credit netting in AP aging, foreign cursor ids.

**Suite stability.** Before `34a8ca9c` the unmutated suite failed in about 1 of 7 to 16 consecutive runs on this shared machine, always while seeding or on one request (405 on `POST /bills/:id/approve`, 404 on `POST /vendor-credits`, `socket hang up`), never in an assertion. Cause: supertest binds and releases a fresh ephemeral port per request, and another process can claim it in between. `beforeAll` now calls `app.listen(0, '127.0.0.1')` once. After the change, 60 consecutive runs passed. The cause is inferred from the pattern and the fix, not traced to a specific foreign process.

---

## Index: other issues

- Issue #94 (decimal money math and idempotent posting): [docs/evidence/94/EVIDENCE.md](docs/evidence/94/EVIDENCE.md).
