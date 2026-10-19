# Evidence: issue #94, decimal money math and idempotent posting

This file covers issue #94 only. It lives in `docs/evidence/94/` (council ruling on PR #99), next to [FLOAT-AUDIT.md](FLOAT-AUDIT.md) (the per-file float audit and follow-ups F1–F8; it replaces `AI_QUESTIONS.md`, whose questions the CTO answered on PR #99). The root `EVIDENCE.md` keeps the issue #95 merge-sprint audit exactly as on `master`, plus a one-line index that points here.

Gate items: "Decimal arithmetic correct" and "Atomic, idempotent posting".

- **Base:** `master` at `fcaed262cd11876a9876c921f9dc4d04a351a0ed`, merged into this branch in `9d4c20d` (the only conflict was the root `EVIDENCE.md` index, resolved by taking master's text plus the index). The merge brings no change to the two production files of this PR; master's changes under `apps/api/src` and `packages` are delivery-challan scoping (#131) and the `MIZANO_NODE_HEAP_MB` config (#127).
- **Tested head:** `76ed8e8f2d30a1796a7c8893459f81d2f8d6e504`, clean tree, on 2026-10-11 (review round 8; see re-verifications at `e1d4a47` and `cf6f625` below). The unit, narrow e2e (`posting-integrity.e2e-spec.ts`), and type-check outputs under "Red" and "Green at the tested head" were produced there. Full seeded E2E and `pnpm ci:full` were not run on this head or subsequent heads (`e1d4a47`, `cf6f625`); their results on the tested head are unknown.
- **Older output at `7955496`:** The full seeded E2E run (12 suites, 268 tests) and `pnpm ci:full` were run only at `7955496` (2026-10-08) and were not repeated at `76ed8e8`, `e1d4a47`, `cf6f625`, or any later head. Those runs do not verify `e1d4a47` or later heads; on all later heads, full seeded E2E and `pnpm ci:full` results remain unknown. GitHub CI runs the unit suite on the pushed head; no CI job runs the full E2E specs.
- **Host:** Darwin arm64, Node v26.10.0, pnpm 8.14.0, PostgreSQL 16.15 (Homebrew).
- **Database:** a throwaway cluster started by this session (`initdb`, port 55595, `fsync=off`), dropped and re-created with `prisma migrate deploy` before each e2e run, `REDIS_URL` blank. No mocks, SQLite or in-memory database were used for the database tests. This is the implementer's own evidence, not an independent review.

## Re-verification at head `e1d4a478e5233ca505d9ee037a3583e30b50b539` (2026-10-18)

The branch was merged with `origin/master` (0 commits behind, 25 ahead) and every check below was run again on that clean tree. The commit that records this section changes only this file. Same host as above; the throwaway cluster ran on port 55631 and was empty before `prisma migrate deploy`.

| Check                                                                                                                    | Exit | Result line                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ---- | -------------------------------------------- |
| `jest --config ./test/jest-e2e.json --runInBand test/posting-integrity.e2e-spec.ts` (`DATABASE_URL` on the throwaway DB) | 0    | `Tests: 11 passed, 11 total`                 |
| `jest src/common/dto src/common/utils/document-totals.spec.ts src/modules/accounting/services/journals.service.spec.ts`  | 0    | `Test Suites: 7 passed`, `Tests: 119 passed` |
| `pnpm --filter @mizano/validators test`                                                                                  | 0    | `Tests: 12 passed, 12 total`                 |
| `pnpm run type-check` (turbo, includes `tsc -p test/tsconfig.e2e.json`)                                                  | 0    | `Tasks: 6 successful, 6 total`               |
| `pnpm --filter api lint`, `pnpm --filter @mizano/validators lint`                                                        | 0    | no output                                    |

Notes:

- In the e2e run, the `prisma:error` and `Nest ERROR` lines are the expected ones: unique-key conflicts from replayed posts and the injected "failure after the journal insert". The tests that provoke them pass.
- A fresh worktree needs `pnpm --filter @mizano/shared-types build`, `pnpm --filter @mizano/validators build` and `pnpm --filter api exec prisma generate` before these commands, and `@types/js-yaml` (declared in `apps/api/package.json`, pinned in `pnpm-lock.yaml`) installed. None of those outputs is tracked.
- The `initdb` and `pg_ctl` start, and the commands that connect to the cluster, ran outside the agent sandbox (it blocks shared memory and local TCP).
- Not re-run at this head: the e2e-army test `e2e-army/94-journal-decimal-posting.e2e.ts` (needs the hub's verify stack), the red comparison on master's code, and the full seeded E2E suite and `pnpm ci:full` listed below.

## Re-verification at head `cf6f62546ee8eb08e4635cb693bc0d53ac2bfad6` (2026-10-19)

The branch is 0 commits behind `origin/master` (`git rev-list --left-right --count origin/master...HEAD` gives `0 32`). The checks below ran on this clean tree; the commit that records this section changes only this file. Same host as above; a new throwaway cluster on port 55777 (`initdb`, `fsync=off`, `REDIS_URL` blank), `prisma migrate deploy` first, stopped and deleted afterwards. The cluster start ran outside the agent sandbox (it blocks shared memory: `shmget … Operation not permitted`).

| Check                                                                                                                    | Exit | Result line                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ---- | -------------------------------------------- |
| `jest --config ./test/jest-e2e.json --runInBand test/posting-integrity.e2e-spec.ts` (`DATABASE_URL` on the throwaway DB) | 0    | `Tests: 11 passed, 11 total`                 |
| `jest src/common/dto src/common/utils/document-totals.spec.ts src/modules/accounting/services/journals.service.spec.ts`  | 0    | `Test Suites: 7 passed`, `Tests: 125 passed` |
| `pnpm --filter @mizano/validators test`                                                                                  | 0    | `Tests: 12 passed, 12 total`                 |
| `pnpm run type-check` (turbo)                                                                                            | 0    | `Tasks: 6 successful, 6 total`               |
| `pnpm --filter api lint`, `pnpm --filter @mizano/validators lint`                                                        | 0, 0 | no output                                    |

Not run at this head, so their result stays unknown here: the e2e-army test `e2e-army/94-journal-decimal-posting.e2e.ts` (needs the hub's verify stack, which runs it on the pushed head), the red comparison on master's code, the full seeded E2E suite and `pnpm ci:full` (the full suite runs on GitHub CI after the push, per the owner's speed rule). The older runs of those below stay bound to the SHAs named there (`7955496` for the 12-suite E2E run and `ci:full`, `76ed8e8` for the red/green comparison). The `e1d4a478` section above is superseded by this one for the checks listed in the table.

## What changed, from the history

`git log --oneline --no-merges origin/master..HEAD` lists the branch's own commits (`10b0e2f`, `9a37475`, `078cc09` and `9d4c20d` are merges of master). Production code changed in two commits and two files only:

| Commit    | File                                                   | Change                                                                                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7d5087f` | `apps/api/.../accounting/services/journals.service.ts` | `parseAmount` rejects more than 4 decimals or more than 15 integer digits, the `Decimal(19,4)` bounds. Before, `POST /journals` stored a journal that did not balance.                                                                                                                  |
| round 5   | `apps/api/.../accounting/services/journals.service.ts` | `parseAmount` now accepts only plain decimals (`/^\d+(\.\d+)?$/`), the grammar of the shared validator. `decimal.js` alone also parsed `1e3`, `0x10` and `1_0`. Test: `journals.service.spec.ts` `rejects the non-plain-decimal amount …` (4 of 6 cases failed before, all pass after). |
| `beac7a9` | `packages/validators/src/index.ts`                     | `createJournalSchema` summed with `parseFloat` and an epsilon. It now sums BigInt ten-thousandths exactly. No new dependency.                                                                                                                                                           |

Everything else is tests (`941a411`, `7afa66c`, `cd79694`, `328ca68`, `1195f8d`, `76ed8e8`) and docs (`6e0891e`, `835f161`, `a997dd7`, `636c8af`, `7955496`, and this record). The idempotency design is unchanged: each post takes the per-org advisory lock `lockOrganizationLedger`, the unique key `(organizationId, sourceType, sourceId)` blocks duplicates, and the document row lock runs before the ledger lock. `document-totals.ts` and `decimal-string.ts` are not touched (`git diff origin/master HEAD --stat` lists neither).

## Requirements and how each is verified

"Master's code" below means master's `journals.service.ts` and `validators/src/index.ts` swapped into this tree (the red run).

| REQ | Requirement                                                                                 | Verified by                                                                                                                                                                                                                                                                                                       | Result                                                          |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| R1  | Every money calculation is audited for floats                                               | The audit command below counts 697 hits on `b83d72b`, 698 on master `fcaed26` and 696 on HEAD. Every hit is classified per file in [FLOAT-AUDIT.md](FLOAT-AUDIT.md). Two lines are fixed; the rest are deferred to follow-ups F1–F8.                                                                              | audit done, fix partial: the gate stays open                    |
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

The red run happens in a disposable worktree, so this checkout and its index are never touched. The worktree has this branch's tests and master's two production files:

```bash
W=$TMPDIR/mz94-red
git worktree add --detach "$W" HEAD
cd "$W"
git checkout origin/master -- apps/api/src/modules/accounting/services/journals.service.ts packages/validators/src/index.ts
ln -s "$OLDPWD/node_modules" node_modules
cp -R "$OLDPWD/apps/api/node_modules" apps/api/node_modules   # relative pnpm links, so @mizano/* resolve inside $W
cp -R "$OLDPWD/packages/shared-types/dist" packages/shared-types/dist
(cd packages/validators && npx tsc)                           # the unit suite loads @mizano/validators from dist
# ... run the commands below from "$W/apps/api", then:
cd "$OLDPWD" && git worktree remove --force "$W" && git status --short   # prints nothing
```

```text
$ npx jest src/modules/accounting/services/journals.service.spec.ts src/common/utils/document-totals.spec.ts \
    src/common/dto/decimal-string.spec.ts src/common/dto/shared-journal-schema.spec.ts
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

The first failure of each pair is the stored-scale bug (a journal that does not balance reached the database); the validator pair is the float sum. The idempotency, concurrency and rollback tests pass on master's code, so those properties held before this PR; the PR adds the proof. Full seeded E2E and `pnpm ci:full` were not run against master's code; those results are unknown.

### Green at the tested head

```text
$ git status --short            # (empty)
$ git rev-parse HEAD
76ed8e8f2d30a1796a7c8893459f81d2f8d6e504

$ npx jest src/modules/accounting/services/journals.service.spec.ts src/common/utils/document-totals.spec.ts \
    src/common/dto/decimal-string.spec.ts src/common/dto/shared-journal-schema.spec.ts
PASS src/common/dto/shared-journal-schema.spec.ts
PASS src/common/utils/document-totals.spec.ts
PASS src/common/dto/decimal-string.spec.ts
PASS src/modules/accounting/services/journals.service.spec.ts
Tests:       77 passed, 77 total

$ npx jest --config ./test/jest-e2e.json --runInBand test/posting-integrity.e2e-spec.ts   # fresh database
PASS test/posting-integrity.e2e-spec.ts
Tests:       11 passed, 11 total

$ psql ... unbalanced journals            -> 0
$ psql ... duplicate (sourceType, sourceId) -> 0
$ npx tsc --noEmit -p apps/api/tsconfig.json   -> exit 0
```

Full seeded E2E (12 suites) and `pnpm ci:full` were not run at tested head `76ed8e8` (or subsequent heads `e1d4a47`, `cf6f625`); their results at the tested head are **unknown**.

### Historical reference runs at `7955496` (not run on final head; unknown at `76ed8e8`, `e1d4a47`, or later)

These historical runs are recorded strictly for commit `7955496` (2026-10-08). They do not verify `76ed8e8`, `e1d4a47`, `cf6f625`, or any later head; on all subsequent heads, full seeded E2E and `pnpm ci:full` results remain unknown.

```text
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

$ pnpm ci:full --force        # lint + type-check + unit tests, 0 turbo cache hits
api:test: Test Suites: 137 passed, 137 total
api:test: Tests:       2220 passed, 2220 total
@mizano/web:test: Test Suites: 48 passed, 48 total
@mizano/web:test: Tests:       458 passed, 458 total
 Tasks:    12 successful, 12 total
Cached:    0 cached, 12 total
ci:full exit=0
```

`pnpm ci:full` at `7955496` printed 13 `no-unused-vars` and `exhaustive-deps` warnings from `apps/web` files that this branch does not touch, plus Turbo's "no output files found" notices for `api#lint` and `api#test`. Both already exist on master and are not caused by this PR.

The 11 tests of `posting-integrity.e2e-spec.ts` (all pass at `76ed8e8`):

| Test                                                                            | AC  |
| ------------------------------------------------------------------------------- | --- |
| leaves the tenant ledger balanced as stored (every journal balances, not empty) | AC2 |
| round-trips `1234.10` and `999999999999999.9999` as exact decimal strings (2)   | AC2 |
| rejects amounts storage would round instead of storing an unbalanced journal    | AC2 |
| posts a retried source event once and rejects the replay with a conflict        | AC3 |
| sends the same invoice twice and keeps the first journal as the only one (400)  | AC3 |
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
# b83d72b: 697   615060e: 697   fcaed26 (master now): 698   HEAD: 696   (validators/src/index.ts:251-252 removed)
```

`Decimal#toFixed` calls are exact, so they are not counted. `shared-types` money fields typed `number` are listed separately in FLOAT-AUDIT.md.

## Review rounds on PR #99

| Round | Commits                                    | Review asked for                                                                                                                                                                                    | Done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `7d5087f` … `835f161`                      | The brief.                                                                                                                                                                                          | The two fixes above, the unit and E2E tests, the float audit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2     | `10b0e2f`, `cd79694`, `a997dd7`, `636c8af` | An explicit duplicate-posting test, more rounding tests, a test of the exact validator balance check, Postgres instructions for the E2E spec. No production code changed.                           | `journals.service.spec.ts` › "idempotent posting (@issue-94)" (replay of one source key gets a 409 with the tenant and key; a unique violation without a source key is not masked; a replay in a locked period never opens a transaction); the 15% VAT and no-`number` cases in `document-totals.spec.ts`; the `shared-journal-schema.spec.ts` cases; the recipe in `docs/DEVELOPMENT.md` › "API E2E against a throwaway PostgreSQL" and the spec header. `.github/workflows` is owner-only, so the CI job is proposed in AI_QUESTIONS.md. |
| 3     | `328ca68`, `7955496`                       | `AI_QUESTIONS.md` said the slice was complete; the final ledger check could pass on an empty ledger.                                                                                                | AI_QUESTIONS.md now says the slice is partly done and the gates stay open. The AC2 ledger test asserts the debit and credit sums are not null, keeps the tenant-wide check, and compares debit and credit for every journal (`groupBy journalId`). Only this test and markdown changed.                                                                                                                                                                                                                                                    |
| 4     | the commit that adds this text             | This file named the wrong tested heads (it said that nothing after round 2 touched the tests, but `328ca68` did), mixed #95 and #94 without saying so, and kept output that history cannot confirm. | The heads and claims above were rechecked against `git log`; the red and green runs were repeated at `7955496`; the R-table results now say what was observed on master's code. No code or test changed in this round.                                                                                                                                                                                                                                                                                                                     |
| 5     | the commit that adds this row              | The opening of the file should name the #95 audit and link to the #94 evidence, or #94 should move to its own file.                                                                                 | Superseded by round 6: #94 now has its own file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 6     | the commit that adds this row              | Council ruling: move the #94 files to `docs/evidence/94/`, keep replays at 409, hide the unsafe posting paths until F1–F3, open F1–F8.                                                              | Moved: `docs/evidence/94/EVIDENCE.md` and `AI_QUESTIONS.md`; root `EVIDENCE.md` is `master`'s text plus a 3-line index (`git diff --numstat origin/master -- EVIDENCE.md` shows 6 added, 0 deleted). Replays still return 409 (unchanged code). Hiding the assets, payroll and manufacturing paths in the demo and opening F1–F8 are owner actions, not done by this PR (see AI_QUESTIONS.md). No code or test changed.                                                                                                                    |

Round 7 (rework after the council ruling): the verify gate needs an e2e-army test for each touched feature (`mz-journals`), so `e2e-army/94-journal-decimal-posting.e2e.ts` was added. It is a request-level test: a journal with 5 decimals and one that is off by 0.0001 are both refused with 400, and a balanced EGP 2dp journal is stored with equal totals. It was written but not run on this host, because it needs the hub's throwaway stack; the verify job runs it. The PR description should say `Refs #94`, not `Closes #94` (council ruling); the PR body is edited by the harness, not by this branch.

Round 8 (`9d4c20d`, `76ed8e8` and the commit that records this text; CodeRabbit review of 2026-10-09 and the CTO answers on PR #99):

- Master `fcaed26` merged; the root `EVIDENCE.md` conflict was resolved by keeping master's text plus the index line.
- `posting-integrity.e2e-spec.ts`: the three invoice-send replay assertions now expect exactly 400 with "Only draft invoices can be sent" instead of "400 or 409". The review asked for exactly 409, but 409 is unreachable on that path: the status check runs under the invoice row lock, before the lock-date check and the guarded `DRAFT -> SENT` update. The ledger-command replay keeps its exact 409.
- e2e-army test: `totalDebit` and `totalCredit` are compared with the exact strings `"1234.5600"`, not with `parseFloat`.
- The red-run recipe now uses a disposable worktree; the red and green runs above were repeated at `76ed8e8` with it.
- `AI_QUESTIONS.md` is replaced by `FLOAT-AUDIT.md` (CTO housekeeping): the questions became the answered decisions, and the audit, CI suggestions and follow-ups F1–F8 are kept. Hiding assets, payroll and manufacturing for go-live and opening F1–F8 as issues stay owner actions.

## Known gaps and pre-existing issues

- **Replay returns 409, not the original id.** This follows the repo's rule. The CTO confirmed it on PR #99 (FLOAT-AUDIT.md, decision 1). The invoice-send path refuses a replay earlier, with exactly 400 "Only draft invoices can be sent".
- **JSON shape of amounts.** Journal line amounts in JSON are Decimal strings without trailing zeros (`"1234.1"`), and totals are fixed 4-dp (`"1234.1000"`). Neither is ever a JSON number. The API still accepts JSON _numbers_ for money (decision 3, F5).
- **Asset, payroll and manufacturing posting.** These modules post with `tx.journal.create`, outside the single command, with no ledger lock and no source key, so they are not idempotent (decision 2, F1–F3). The "atomic, idempotent posting" gate holds for the core ledger command and the invoice-send path only.
- **Float use remains.** 696 audit hits remain on HEAD; only the validator balance check and the storage bound are fixed. The "decimal arithmetic" gate is open for the rest (F1–F8).
- **`_run_tests.js` and `csv`.** Run at `7955496`: `node apps/api/_run_tests.js '--testPathPattern="import.service.hardening"'` gives `TypeError: csv is not a function`, `Tests: 4 failed, 5 passed, 9 total`; `npx jest import.service.hardening` in `apps/api` (the CI config) gives `Tests: 9 passed, 9 total`. The cause is the runner's compile options (`esModuleInterop`), not this PR; the file is untouched here.
- **No CI coverage for E2E.** `pnpm ci:full` runs no E2E, so this spec needs a Postgres CI job (FLOAT-AUDIT.md, CI suggestions).
- **Diff size.** The diff is over the ~300-line guide. About 30 lines are production code (`git diff --stat master HEAD -- apps/api/src packages ':!*.spec.ts'`); most of the rest is the evidence tests the issue asked for, plus this file and FLOAT-AUDIT.md.
- **Sandbox.** Inside the sandbox `pnpm install` cannot write package files, jest cannot write its cache, and `initdb` cannot get shared memory, so those commands ran outside it.

## Round 5 re-run (head `05def4a`)

`posting-integrity.e2e-spec.ts` on a throwaway PostgreSQL (`DEVELOPMENT.md` steps, `prisma migrate deploy` applied): 11 tests, 11 passed, exit 0. The `e2e-army` journal test needs the hub stack and was not run locally.

## Round 6 re-run (head `b518012`, master `2fc63724` merged)

The merge conflicted only in the root `EVIDENCE.md` (the #95 audit); master's text was kept and the one-line #94 index re-added. Both open review threads (`journals.service.ts` amount bound, `packages/validators` exact balance check) describe code that is already on this branch and was not changed in this round. Commands run on `b518012`:

| Check                                                                             | Command                                                                                                                                    | Result                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| E2E on throwaway PostgreSQL 16 (`DEVELOPMENT.md` steps, `migrate deploy` applied) | `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand test/posting-integrity.e2e-spec.ts`                                     | 11 tests, 11 passed, exit 0     |
| Unit tests of the changed specs                                                   | `cd apps/api && npx jest src/common/dto src/common/utils/document-totals.spec.ts src/modules/accounting/services/journals.service.spec.ts` | 7 suites, 125 tests, 125 passed |
| Types                                                                             | `pnpm --filter api type-check`, `pnpm --filter @mizano/validators type-check`                                                              | exit 0, no output               |
| Lint                                                                              | `pnpm --filter api lint`, `pnpm --filter @mizano/validators lint`                                                                          | exit 0, no warnings             |

The `e2e-army` journal test needs the hub stack and was not run locally.
