# Evidence: issue #94, decimal money math and idempotent posting

Gate items: "Decimal arithmetic correct" and "Atomic, idempotent posting".

- **Base:** `master` at `b83d72b4cfa358f3a6ba4be9d9f1b613ac9fe1f2`
- **Tested SHA:** `6e0891e8ea06db5518588bc96de9e70446850f22`, clean tree. Later commits on `ai/94` only add this file and `AI_QUESTIONS.md`.
- **Author:** Claude Opus 5.5 (`claude-opus-5-5`) in Claude Code. This is the implementer's own evidence, not an independent review.
- **Host:** Darwin arm64, Node v26.10.0, pnpm 8.14.0.
- **Database:** a throwaway PostgreSQL 16.15 cluster. No mocks, SQLite or in-memory database were used for the database tests.

## Requirements and how each is verified

| REQ | Requirement                                                                                 | Verified by                                                                                                                                                                                                                  | Result                        |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| R1  | Every money calculation is audited for floats                                               | The audit command below lists 697 hits on master and 695 on HEAD. Every hit is classified per file in [AI_QUESTIONS.md](AI_QUESTIONS.md). Two lines are fixed here; the rest are deferred to follow-ups F1–F8.               | done                          |
| R2  | EGP rounds to 2 dp, half-up (the documented rule)                                           | `document-totals.spec.ts` › "EGP 2 dp rounding and VAT": 0.005→0.01, 1.005→1.01, 2.675→2.68, 0.125→0.13, 1.004→1.00                                                                                                          | pass (already true on master) |
| R3  | VAT: 14% of 99.99 is 14.00, the rate is stored apart from the amount, and gross = net + tax | Same block. Per-line rounding makes the header the sum of the rounded lines (100.02 / 14.01 / 114.03). Values are exact at 15 integer digits and at zero, and Arabic-Indic digits are rejected.                              | pass (already true on master) |
| R4  | Money travels as decimal strings                                                            | `decimal-string.spec.ts` ("1234.10" survives the pipe's implicit conversion; Arabic-Indic digits are rejected). E2E: `1234.10` and `999999999999999.9999` round-trip as strings through POST and GET and are stored exactly. | pass                          |
| R5  | Balance is checked on the values that are stored                                            | `journals.service.spec.ts` (2 tests). E2E "rejects amounts storage would round…" and "leaves the tenant ledger balanced as stored".                                                                                          | **red → green** (bug fixed)   |
| R6  | The shared journal schema checks balance exactly                                            | `shared-journal-schema.spec.ts`                                                                                                                                                                                              | **red → green** (bug fixed)   |
| R7  | Posting the same event twice creates exactly one ledger entry                               | E2E "posts a retried source event once…": the replay gets a 409 `ConflictException` and the only journal is the first call's. Existing: sales "rejects a second send…", journey "rejects a second approval…".                | pass                          |
| R8  | Concurrent posts create exactly one ledger entry, checked on the real engine                | E2E: 8 concurrent posts of one event give 1 journal with 2 balanced lines and exactly +1/+2 rows. 5 concurrent invoice sends post 1 journal. The Postgres lock-wait log below shows the requests overlapped.                 | pass                          |
| R9  | A failure in the middle of a post leaves no partial rows                                    | E2E: a failure after the insert inside the caller's transaction leaves journal and line counts unchanged, and the retry posts once. A failure mid-send leaves the invoice `DRAFT` with no journal, and the retry posts once. | pass                          |
| R10 | A repeated post still runs the lock-date and tenant checks                                  | E2E: a repeated send in a locked period is rejected with exactly 1 journal. Existing sales E2E: tenant B sending tenant A's invoice gets a 404.                                                                              | pass                          |

## What changed

- `apps/api/.../journals.service.ts`: `parseAmount` rejects amounts with more than 4 decimals or more than 15 integer digits, the `Decimal(19,4)` bounds. Before this, `POST /journals` stored an unbalanced journal (red run below). Every internal caller already passes `toFixed(4)` values.
- `packages/validators/src/index.ts`: `createJournalSchema` summed with `parseFloat` and allowed an epsilon. It now sums BigInt ten-thousandths exactly. No new dependency, no lockfile change.
- Tests: `posting-integrity.e2e-spec.ts` is new, plus the unit specs above. `docs/agents/review-lessons.md` §6 has two new root causes.
- The idempotency design is unchanged and already correct. Each post takes the per-org advisory lock `lockOrganizationLedger`, the unique key `(organizationId, sourceType, sourceId)` blocks duplicates, and the document row lock runs before the ledger lock.

## Commands and output

### Throwaway database

These commands run outside the sandbox, because `initdb` needs SysV shared memory and the sandbox blocks local TCP.

```bash
initdb -D $TMPDIR/mz94-pg/data -U mizano --auth=trust -E UTF8 --locale=C
pg_ctl -D $TMPDIR/mz94-pg/data -o "-k $TMPDIR/mz94-pg/sock -p 55494 -c listen_addresses=127.0.0.1" -w start
createdb -h 127.0.0.1 -p 55494 -U mizano mizano_e2e
cd apps/api && DATABASE_URL=postgresql://mizano@127.0.0.1:55494/mizano_e2e npx prisma migrate deploy
#   -> 5 migrations applied (the Pi deploy also uses `migrate deploy`)
export DATABASE_URL=postgresql://mizano@127.0.0.1:55494/mizano_e2e APP_ENV=e2e94
#   APP_ENV=e2e94 has no .env file, so no developer env is loaded; without REDIS_URL the cache is in-memory
```

Baseline on master, before any change: `npx jest --config ./test/jest-e2e.json --runInBand test/accountant-journey.e2e-spec.ts` → `Tests: 36 passed, 36 total`.

### Red: new tests against master's code

This ran on the working tree before the fixes. To reproduce: `git checkout 7afa66c && git checkout b83d72b -- apps/api/src/modules/accounting/services/journals.service.ts packages/validators/src/index.ts`.

```text
$ node apps/api/_run_tests.js '--testPathPattern="(journals.service|document-totals|decimal-string|shared-journal-schema).spec"'
FAIL src/modules/accounting/services/journals.service.spec.ts
FAIL src/common/dto/shared-journal-schema.spec.ts
  ● JournalsService › create › checks balance on stored values: rejects amounts Decimal(19, 4) would round
    Expected substring: "at most 15 integer digits and 4 decimal places"
    Received message:   "Cannot read properties of undefined (reading 'length')"   (passed validation, reached the account lookup)
  ● createJournalSchema balance (@mizano/validators) › rejects debit 1000000.0001 against credit 1000000, which a float sum calls balanced
    Expected: false
    Received: true
Tests:       4 failed, 67 passed, 71 total

$ npx jest --config ./test/jest-e2e.json --runInBand test/posting-integrity.e2e-spec.ts
  ✕ rejects amounts storage would round instead of storing an unbalanced journal   Expected: 400  Received: 201
  ✕ leaves the tenant ledger balanced as stored   Expected: "1000000000001936.5600"  Received: "1000000000001936.5601"
Tests:       2 failed, 8 passed, 10 total

$ psql -h 127.0.0.1 -p 55494 -U mizano -d mizano_e2e -At -c 'SELECT j."journalNumber", sum(l.debit), sum(l.credit)
    FROM journals j JOIN journal_lines l ON l."journalId" = j.id GROUP BY j.id HAVING sum(l.debit) <> sum(l.credit)'
JRN-006|0.0002|0.0001
```

### Green

```text
$ node apps/api/_run_tests.js '--testPathPattern="(journals.service|document-totals|decimal-string|shared-journal-schema).spec"'
Tests:       71 passed, 71 total
$ (cd apps/api && npx jest --maxWorkers=2 shared-journal-schema document-totals decimal-string journals.service)
  # CI jest config, @mizano/validators resolved from its freshly built dist
Tests:       71 passed, 71 total

$ npx jest --config ./test/jest-e2e.json --runInBand test/posting-integrity.e2e-spec.ts
    ✓ leaves the tenant ledger balanced as stored
      ✓ posts a retried source event once and rejects the replay with a conflict (28 ms)
      ✓ posts exactly one balanced journal when one event is posted 8 times at once (25 ms)
      ✓ rolls back the header and every line when the post fails after the insert (8 ms)
      ✓ round-trips 1234.10 as an exact decimal string (11 ms)
      ✓ round-trips 999999999999999.9999 as an exact decimal string (7 ms)
      ✓ rejects amounts storage would round instead of storing an unbalanced journal (4 ms)
      ✓ sends one invoice 5 times at once and posts exactly one journal (27 ms)
      ✓ keeps the invoice a draft with no journal when posting fails mid-send (29 ms)
      ✓ rejects a repeated send once the period is locked, still with one journal (20 ms)
Tests:       10 passed, 10 total
```

### The concurrent tests really overlap

With `log_lock_waits = on` and `deadlock_timeout = 1ms`, I ran the two concurrent tests again (`-t "posted 8 times at once|5 times at once"`, both passed). The Postgres server log during that run:

```text
LOG:  process 4241 still waiting for ExclusiveLock on advisory lock [16388,0,1715770629,1] after 7.762 ms
DETAIL:  Process holding the lock: 4240. Wait queue: 4241, 4243, 4244, 4242, 4245.
STATEMENT:  SELECT pg_advisory_xact_lock(hashtext($1))
  (the same wait is logged for 4244, 4243, 4242 and 4245)
LOG:  process 4245 still waiting for ShareLock on transaction 1643 after 4.614 ms
DETAIL:  Process holding the lock: 4242. Wait queue: 4245.
STATEMENT:  SELECT id FROM "invoices" WHERE id = $1 AND "organizationId" = $2 FOR UPDATE
```

### Full gates at the tested SHA

```text
$ pnpm ci:full --force        # lint + type-check + unit tests, 0 turbo cache hits
api:test: Tests:       2214 passed, 2214 total     (137 suites)
@mizano/web:test: Tests:       458 passed, 458 total     (48 suites)
 Tasks:    12 successful, 12 total
Cached:    0 cached, 12 total
ci:full exit=0

$ npx jest --config ./test/jest-e2e.json --runInBand      # every seeded E2E suite, real Postgres
Test Suites: 12 passed, 12 total
Tests:       267 passed, 267 total
```

`pnpm ci:full` ran outside the sandbox. Inside it, jest cannot write its cache to `/private/tmp/jest_dx` (EPERM), because turbo drops `TMPDIR`.

### Float audit command

```bash
git grep -nE 'parseFloat\(|(^|[^A-Za-z0-9_.])Number\(|\.toNumber\(\)|Math\.round\(|IsNumber\(|z\.number\(\)' <rev> \
  -- apps/api/src packages/validators/src packages/shared-types/src | grep -v '\.spec\.ts' | grep -v __tests__
# master: 697 hits; HEAD: 695 hits (validators/src/index.ts:251-252 removed)
```

`Decimal#toFixed` calls are exact, so they are not counted. `shared-types` money fields typed `number` are listed separately in AI_QUESTIONS.md.

## Known gaps and pre-existing issues

- **Replay returns 409, not the original id.** This follows the repo's rule. See AI_QUESTIONS.md Q1.
- **JSON shape of amounts.** Journal line amounts in JSON are Decimal strings without trailing zeros (`"1234.1"`), and totals are fixed 4-dp (`"1234.1000"`). Neither is ever a JSON number. The API still accepts JSON _numbers_ for money (Q3, F5).
- **Asset, payroll and manufacturing posting.** These modules post outside the single command and are not idempotent (Q2, F1–F3). This gate only holds for the core ledger.
- **`_run_tests.js` failures.** On this host, a full `_run_tests.js` run fails 4 tests in `import.service.hardening.spec.ts` with "csv is not a function". The same failure occurs with master's code, and the suite passes under `pnpm ci:full`.
- **Web lint warnings.** `next lint` reports 13 pre-existing warnings in untouched `apps/web` files.
- **No CI coverage for E2E.** `pnpm ci:full` runs no E2E, so this spec needs a Postgres CI job (AI_QUESTIONS.md, CI suggestions).
- **Diff size.** The diff is about 30 lines of source and about 355 lines of tests, over the ~300-line guide. Most of it is the evidence tests the issue asked for.
