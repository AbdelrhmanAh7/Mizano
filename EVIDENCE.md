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

# Evidence: issue #94, decimal money math and idempotent posting

This file is a shared ledger. Everything above the `---` before this heading is the issue #95 merge-sprint audit, kept as it is on `master`. This section is issue #94 only.

Gate items: "Decimal arithmetic correct" and "Atomic, idempotent posting".

- **Base:** `master` at `b83d72b4cfa358f3a6ba4be9d9f1b613ac9fe1f2`. `615060e` (the #95 audit docs, merged into this branch in `10b0e2f`) is the newest master commit and touches no code.
- **Tested head:** `7955496e18521eab03ae6f5f51a785a2356a6fde`, clean tree. All output below was produced at this SHA on 2026-10-08, in the review round 2/3 for PR #99. The commit that records this file changes only `EVIDENCE.md` (`git diff --stat 7955496 HEAD`).
- **What earlier rounds are worth:** output pasted in earlier rounds could not be checked from the history, so it is gone. Each claim below is either a fact about the git history (commands given) or output re-run at the tested head.
- **Host:** Darwin arm64, Node v26.10.0, pnpm 8.14.0, PostgreSQL 16.15 (Homebrew).
- **Database:** a throwaway cluster started by this session (`initdb`, port 55594, `fsync=off`), dropped and re-created with `prisma migrate deploy` before each e2e run, `REDIS_URL` blank. No mocks, SQLite or in-memory database were used for the database tests. This is the implementer's own evidence, not an independent review.

## What changed, from the history

`git log --oneline master..HEAD` lists 12 commits (`10b0e2f` is the merge of master). Production code changed in two commits and two files only:

| Commit    | File                                                   | Change                                                                                                                                                                 |
| --------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7d5087f` | `apps/api/.../accounting/services/journals.service.ts` | `parseAmount` rejects more than 4 decimals or more than 15 integer digits, the `Decimal(19,4)` bounds. Before, `POST /journals` stored a journal that did not balance. |
| `beac7a9` | `packages/validators/src/index.ts`                     | `createJournalSchema` summed with `parseFloat` and an epsilon. It now sums BigInt ten-thousandths exactly. No new dependency.                                          |

Everything else is tests (`941a411`, `7afa66c`, `cd79694`, `328ca68`) and docs (`6e0891e`, `835f161`, `a997dd7`, `636c8af`, `7955496`, and this record). The idempotency design is unchanged: each post takes the per-org advisory lock `lockOrganizationLedger`, the unique key `(organizationId, sourceType, sourceId)` blocks duplicates, and the document row lock runs before the ledger lock. `document-totals.ts` and `decimal-string.ts` are not touched (`git diff master HEAD --stat` lists neither).

## Requirements and how each is verified

"Master's code" below means master's `journals.service.ts` and `validators/src/index.ts` swapped into this tree (the red run).

| REQ | Requirement                                                                                 | Verified by                                                                                                                                                                                                                                                                                                       | Result                                                          |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| R1  | Every money calculation is audited for floats                                               | The audit command below counts 697 hits on `b83d72b`, 697 on `615060e` and 695 on HEAD. Every hit is classified per file in [AI_QUESTIONS.md](AI_QUESTIONS.md). Two lines are fixed; the rest are deferred to follow-ups F1–F8.                                                                                   | audit done, fix partial: the gate stays open                    |
| R2  | EGP rounds to 2 dp, half-up (the documented rule)                                           | `document-totals.spec.ts` › "EGP 2 dp rounding and VAT": 0.005→0.01, 1.005→1.01, 2.675→2.68, 0.125→0.13, 1.004→1.00                                                                                                                                                                                               | pass on master's code and on HEAD                               |
| R3  | VAT: 14% of 99.99 is 14.00, the rate is stored apart from the amount, and gross = net + tax | Same block, plus 15% VAT on 99.99 → 15.00 / 114.99, per-line rounding (100.02 / 14.01 / 114.03), exact values at 15 integer digits and at zero, Arabic-Indic digits rejected, and no result is a JS `number`.                                                                                                     | pass on master's code and on HEAD                               |
| R4  | Money travels as decimal strings                                                            | `decimal-string.spec.ts` ("1234.10" survives the pipe's implicit conversion; Arabic-Indic digits are rejected). E2E: `1234.10` and `999999999999999.9999` round-trip as strings through POST and GET and are stored exactly.                                                                                      | pass on master's code and on HEAD                               |
| R5  | Balance is checked on the values that are stored                                            | `journals.service.spec.ts` (2 tests) and two E2E tests: "rejects amounts storage would round…" and "leaves the tenant ledger balanced as stored".                                                                                                                                                                 | **red on master's code, green on HEAD** (bug fixed)             |
| R6  | The shared journal schema checks balance exactly                                            | `shared-journal-schema.spec.ts` (2 float-trap cases). It lives in the API suite because `@mizano/validators` has no test runner and the suite maps the package to its source.                                                                                                                                     | **red on master's code, green on HEAD** (bug fixed)             |
| R7  | Posting the same event twice creates exactly one ledger entry                               | E2E "posts a retried source event once…": the replay gets a 409 `ConflictException` and the only journal is the first call's. E2E "sends the same invoice twice…". Existing: `sales.e2e-spec.ts` "rejects a second send without a second journal", `accountant-journey.e2e-spec.ts` "rejects a second approval…". | pass on master's code and on HEAD (tests added, no code needed) |
| R8  | Concurrent posts create exactly one ledger entry, checked on the real engine                | E2E: 8 concurrent posts of one event give 1 journal with 2 balanced lines and exactly +1/+2 rows. 5 concurrent invoice sends post 1 journal. The lock-wait log below shows the requests overlapped.                                                                                                               | pass on master's code and on HEAD (tests added, no code needed) |
| R9  | A failure in the middle of a post leaves no partial rows                                    | E2E: a failure after the insert inside the caller's transaction leaves journal and line counts unchanged, and the retry posts once. A failure mid-send leaves the invoice `DRAFT` with no journal, and the retry posts once.                                                                                      | pass on master's code and on HEAD (tests added, no code needed) |
| R10 | A repeated post still runs the lock-date and tenant checks                                  | E2E: a repeated send in a locked period is rejected with exactly 1 journal. Existing `sales.e2e-spec.ts` › "cannot mutate tenant A's documents": tenant B's `PATCH /invoices/:id/send` on tenant A's invoice gets a 404.                                                                                          | pass on master's code and on HEAD (tests added, no code needed) |

R7–R10 hold for the core ledger command and the invoice-send path only. Assets, payroll and manufacturing post outside that command; see "Known gaps".

## Commands and output

### Throwaway database

These commands ran outside the sandbox, because `initdb` needs shared memory and the sandbox blocks local TCP. Port 55494 (the spec header's example) was already taken by another cluster that this session did not start, so this session left it alone and used 55594.

```bash
initdb -D $TMPDIR/mz94-pg/data -U mizano --auth=trust -E UTF8 --locale=C
pg_ctl -D $TMPDIR/mz94-pg/data -l $TMPDIR/mz94-pg/server.log \
  -o "-k $TMPDIR/mz94-pg/sock -p 55594 -c listen_addresses=127.0.0.1 -c fsync=off" -w start
createdb -h 127.0.0.1 -p 55594 -U mizano mizano_e2e
export DATABASE_URL=postgresql://mizano@127.0.0.1:55594/mizano_e2e APP_ENV=e2e94 REDIS_URL=
(cd apps/api && npx prisma migrate deploy)
```

`APP_ENV=e2e94` has no `.env` file, so no developer env is loaded, and the blank `REDIS_URL` keeps the cache in memory.

### Red: the new tests against master's code

```bash
git checkout b83d72b -- apps/api/src/modules/accounting/services/journals.service.ts packages/validators/src/index.ts
# ... run the commands below, then restore:
git checkout HEAD -- apps/api/src/modules/accounting/services/journals.service.ts packages/validators/src/index.ts
```

```text
$ node apps/api/_run_tests.js '--testPathPattern="(journals.service|document-totals|decimal-string|shared-journal-schema).spec"'
PASS src/common/utils/document-totals.spec.ts
PASS src/common/dto/decimal-string.spec.ts
FAIL src/modules/accounting/services/journals.service.spec.ts
  ● JournalsService › create › checks balance on stored values: rejects amounts Decimal(19, 4) would round
  ● JournalsService › create › rejects amounts beyond Decimal(19, 4) up front and keeps the largest one exact
    Expected substring: "at most 15 integer digits and 4 decimal places"
    Received message:   "Cannot read properties of undefined (reading 'length')"
FAIL src/common/dto/shared-journal-schema.spec.ts
  ● createJournalSchema balance (@mizano/validators, @issue-94 AC2) › rejects debit 1000000.0001 against credit 1000000, which a float sum calls balanced
  ● createJournalSchema balance (@mizano/validators, @issue-94 AC2) › rejects debit 100000000000000.01 against credit 100000000000000.02, which a float sum calls balanced
    Expected: false   Received: true
Tests:       4 failed, 73 passed, 77 total

$ npx jest --config ./test/jest-e2e.json --runInBand test/posting-integrity.e2e-spec.ts     # fresh database
    ✕ @issue-94 AC2: leaves the tenant ledger balanced as stored
        Expected: "1000000000002050.5500"   Received: "1000000000002050.5501"
    ✕ @issue-94 AC2: rejects amounts storage would round instead of storing an unbalanced journal
        Expected: 400   Received: 201
    (the other 9 tests pass)
Tests:       2 failed, 9 passed, 11 total

$ psql ... -c 'SELECT j."journalNumber", sum(l.debit), sum(l.credit) FROM journals j JOIN journal_lines l ON l."journalId" = j.id
    GROUP BY j.id HAVING sum(l.debit) <> sum(l.credit)'
JRN-006|0.0002|0.0001
```

The first failure of each pair is the stored-scale bug (a journal that does not balance reached the database); the validator pair is the float sum. The idempotency, concurrency and rollback tests pass on master's code, so those properties held before this PR; the PR adds the proof.

### Green at the tested head

```text
$ git status --short            # (empty)
$ git rev-parse HEAD
7955496e18521eab03ae6f5f51a785a2356a6fde

$ node apps/api/_run_tests.js '--testPathPattern="(journals.service|document-totals|decimal-string|shared-journal-schema).spec"'
PASS src/common/utils/document-totals.spec.ts
PASS src/common/dto/decimal-string.spec.ts
PASS src/modules/accounting/services/journals.service.spec.ts
PASS src/common/dto/shared-journal-schema.spec.ts
Tests:       77 passed, 77 total

$ npx jest --config ./test/jest-e2e.json --runInBand      # every seeded E2E suite, fresh database
PASS test/purchases.e2e-spec.ts
PASS test/posting-integrity.e2e-spec.ts
PASS test/intake.e2e-spec.ts
PASS test/auth.e2e-spec.ts
PASS test/accountant-journey.e2e-spec.ts
PASS test/accounting.e2e-spec.ts
PASS test/sales.e2e-spec.ts
PASS test/reports.e2e-spec.ts
PASS test/inventory.e2e-spec.ts
PASS test/multi-tenancy.e2e-spec.ts
PASS test/ai.e2e-spec.ts
PASS test/banking.e2e-spec.ts
Test Suites: 12 passed, 12 total
Tests:       268 passed, 268 total

$ psql ... unbalanced journals            -> 0
$ psql ... duplicate (sourceType, sourceId) -> 0

$ pnpm ci:full --force        # lint + type-check + unit tests, 0 turbo cache hits
api:test: Test Suites: 137 passed, 137 total
api:test: Tests:       2220 passed, 2220 total
@mizano/web:test: Test Suites: 48 passed, 48 total
@mizano/web:test: Tests:       458 passed, 458 total
 Tasks:    12 successful, 12 total
Cached:    0 cached, 12 total
ci:full exit=0
```

`pnpm ci:full` printed 13 `no-unused-vars` and `exhaustive-deps` warnings from `apps/web` files that this branch does not touch, plus Turbo's "no output files found" notices for `api#lint` and `api#test`. Both already exist on master and are not caused by this PR.

The 11 tests of `posting-integrity.e2e-spec.ts` (all pass at the tested head):

| Test                                                                            | AC  |
| ------------------------------------------------------------------------------- | --- |
| leaves the tenant ledger balanced as stored (every journal balances, not empty) | AC2 |
| round-trips `1234.10` and `999999999999999.9999` as exact decimal strings (2)   | AC2 |
| rejects amounts storage would round instead of storing an unbalanced journal    | AC2 |
| posts a retried source event once and rejects the replay with a conflict        | AC3 |
| sends the same invoice twice and keeps the first journal as the only one        | AC3 |
| rejects a repeated send once the period is locked, still with one journal       | AC3 |
| posts exactly one balanced journal when one event is posted 8 times at once     | AC4 |
| sends one invoice 5 times at once and posts exactly one journal                 | AC4 |
| rolls back the header and every line when the post fails after the insert       | AC5 |
| keeps the invoice a draft with no journal when posting fails mid-send           | AC5 |

### The concurrent tests really overlap

The server was restarted with `log_lock_waits=on` and `deadlock_timeout=1ms`, the database re-created, and only the two AC4 tests run (`-t 'posted 8 times at once|5 times at once'`; both passed). Lock waits in the server log:

```text
6 still waiting for ExclusiveLock on advisory lock   (pg_advisory_xact_lock: the per-org ledger lock)
1 still waiting for AccessExclusiveLock on tuple     (the invoice row, SELECT ... FOR UPDATE)
1 still waiting for ShareLock on transaction

LOG:  process 52838 still waiting for ExclusiveLock on advisory lock [22216,4294967295,2291561962,1] after 2.404 ms
DETAIL:  Process holding the lock: 52901. Wait queue: 52838.
STATEMENT:  SELECT pg_advisory_xact_lock(hashtext($1))
```

### Float audit command

```bash
git grep -nE 'parseFloat\(|(^|[^A-Za-z0-9_.])Number\(|\.toNumber\(\)|Math\.round\(|IsNumber\(|z\.number\(\)' <rev> \
  -- apps/api/src packages/validators/src packages/shared-types/src | grep -v '\.spec\.ts' | grep -v __tests__ | wc -l
# b83d72b: 697   615060e: 697   HEAD: 695   (validators/src/index.ts:251-252 removed)
```

`Decimal#toFixed` calls are exact, so they are not counted. `shared-types` money fields typed `number` are listed separately in AI_QUESTIONS.md.

## Review rounds on PR #99

| Round | Commits                                    | Review asked for                                                                                                                                                                                    | Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `7d5087f` … `835f161`                      | The brief.                                                                                                                                                                                          | The two fixes above, the unit and E2E tests, the float audit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2     | `10b0e2f`, `cd79694`, `a997dd7`, `636c8af` | An explicit duplicate-posting test, more rounding tests, a test of the exact validator balance check, Postgres instructions for the E2E spec. No production code changed.                           | `journals.service.spec.ts` › "idempotent posting (@issue-94)" (replay of one source key gets a 409 with the tenant and key; a unique violation without a source key is not masked; a replay in a locked period never opens a transaction); the 15% VAT and no-`number` cases in `document-totals.spec.ts`; the `shared-journal-schema.spec.ts` cases; the recipe in `docs/DEVELOPMENT.md` › "API E2E against a throwaway PostgreSQL" and the spec header. `.github/workflows` is owner-only, so the CI job is proposed in AI_QUESTIONS.md. |
| 3     | `328ca68`, `7955496`                       | `AI_QUESTIONS.md` said the slice was complete; the final ledger check could pass on an empty ledger.                                                                                                | AI_QUESTIONS.md now says the slice is partly done and the gates stay open. The AC2 ledger test asserts the debit and credit sums are not null, keeps the tenant-wide check, and compares debit and credit for every journal (`groupBy journalId`). Only this test and markdown changed.                                                                                                                                                                                                                                                    |
| 4     | the commit that adds this text             | This file named the wrong tested heads (it said that nothing after round 2 touched the tests, but `328ca68` did), mixed #95 and #94 without saying so, and kept output that history cannot confirm. | The heads and claims above were rechecked against `git log`; the red and green runs were repeated at `7955496`; the R-table results now say what was observed on master's code. No code or test changed in this round.                                                                                                                                                                                                                                                                                                                     |
| 5     | the commit that adds this row              | The opening of the file should name the #95 audit and link to the #94 evidence, or #94 should move to its own file.                                                                                 | Not applied, on purpose. The file's own H1 already names the #95 audit, and `git diff --numstat master HEAD -- EVIDENCE.md` shows 203 added and 0 deleted lines, so master's record is intact. The council rejected PR #101 for changing the #95 text, so it stays byte for byte at the top and #94 follows after a `---` under its own H1. The brief asks for one `EVIDENCE.md`, so #94 is not split out. No code or test changed in this round.                                                                                          |

## Known gaps and pre-existing issues

- **Replay returns 409, not the original id.** This follows the repo's rule. See AI_QUESTIONS.md, decision 1.
- **JSON shape of amounts.** Journal line amounts in JSON are Decimal strings without trailing zeros (`"1234.1"`), and totals are fixed 4-dp (`"1234.1000"`). Neither is ever a JSON number. The API still accepts JSON _numbers_ for money (decision 3, F5).
- **Asset, payroll and manufacturing posting.** These modules post with `tx.journal.create`, outside the single command, with no ledger lock and no source key, so they are not idempotent (decision 2, F1–F3). The "atomic, idempotent posting" gate holds for the core ledger command and the invoice-send path only.
- **Float use remains.** 695 audit hits remain on HEAD; only the validator balance check and the storage bound are fixed. The "decimal arithmetic" gate is open for the rest (F1–F8).
- **`_run_tests.js` and `csv`.** Re-run at the tested head: `node apps/api/_run_tests.js '--testPathPattern="import.service.hardening"'` gives `TypeError: csv is not a function`, `Tests: 4 failed, 5 passed, 9 total`; `npx jest import.service.hardening` in `apps/api` (the CI config) gives `Tests: 9 passed, 9 total`. The cause is the runner's compile options (`esModuleInterop`), not this PR; the file is untouched here.
- **No CI coverage for E2E.** `pnpm ci:full` runs no E2E, so this spec needs a Postgres CI job (AI_QUESTIONS.md, CI suggestions).
- **Diff size.** The diff is over the ~300-line guide. About 30 lines are production code (`git diff --stat master HEAD -- apps/api/src packages ':!*.spec.ts'`); most of the rest is the evidence tests the issue asked for, plus this file and AI_QUESTIONS.md.
- **Sandbox.** Inside the sandbox `pnpm install` cannot write package files, jest cannot write its cache, and `initdb` cannot get shared memory, so those commands ran outside it.
