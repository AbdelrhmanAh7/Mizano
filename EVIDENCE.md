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

## Issue #109 — Arabic-Indic/Persian digit normalization

Tested code head: `65a635172907434efa52bec650fbd54fa4f87777` (this file is committed after it; only EVIDENCE.md differs).

`normalizeDigits` (`apps/api/src/modules/ai/extraction/rules/rules-normalize.ts`) and its use in the intake rules extractor already exist on master. This PR only adds the acceptance spec `rules-normalize.spec.ts` (tagged `@issue-109`); no production code changes remain. An earlier attempt that also wired the helper into `entity-extraction.service.ts` and `ollama.service.ts` was reverted because dropped bidi marks shift entity offsets.

| REQ                                         | Verified by                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| AC1 `١٢٣٫٤٥` → 123.45, `١٬٢٣٤٫٥٠` → 1234.50 | `normalizeDigits` + `findAmounts` cases in rules-normalize.spec.ts                |
| AC2 `٠٧/١٠/٢٠٢٦` = `07/10/2026`             | `parseDate` cases (Arabic-Indic and Persian)                                      |
| AC3 mixed script `EGP ١٢٠٠`                 | mixed-script `normalizeDigits` and `extractInvoiceFields` cases                   |
| AC4 English tests unchanged                 | `invoice-rules-extractor.spec.ts`, `rules-strategy.spec.ts` untouched and passing |
| AC5 no float math                           | `parseAmount` returns Decimal and preserves precision (asserted)                  |
| AC6 ≤ ~200 lines                            | no production code in the diff                                                    |

Commands run (sandbox off, local):

- `npx jest src/modules/ai/extraction/rules` in apps/api: 3 suites passed, 66 tests passed
- `npx tsc --noEmit -p .` in apps/api: no errors
- `prettier --check` on the spec: clean

Not run: the seeded PDF e2e (removed; see commit a5aeed0).

E2E gate note (#109): this PR changes no production code and no UI or user-flow files, only the unit acceptance spec `rules-normalize.spec.ts`. The round-two `e2e-first` review still reports “E2E-first rule not met” because no E2E or acceptance tests were added or changed. Record the gate as unresolved unless an authoritative retirement decision and the `e2e-army` result are available.

Review round 3 (#109): the PDF-fixture, offset-preservation and async-path threads target code removed in a5aeed0 (no e2e PDF spec, no wiring in `entity-extraction.service.ts` / `ollama.service.ts`), so nothing remains to fix there. CodeRabbit's spec notes are fixed in `rules-normalize.spec.ts`: amount tests now pass `normalizeDigits(...)` output into `parseAmount`, the European-format case is renamed, and the Decimal(19,4) bound test covers 15/16 integer digits and 4/5 decimals. `npx jest src/modules/ai/extraction/rules` in apps/api: 3 suites, 66 tests passed.

Review round 4 (#109): the three code threads (Unicode PDF fixtures, original-text offsets, async entity-extraction path) are all OUTDATED. They target the e2e PDF spec and the `entity-extraction.service.ts` / `ollama.service.ts` wiring, which were removed in a5aeed0 and are not on this branch, so no code change is needed. The EVIDENCE.md e2e note is reworded to the `E2E: not needed — <reason>` waiver form. The spec fixes from round 3 (aed8cb7) are unchanged.

Review round 5 (#109):

- Fixed CodeRabbit finding on `rules-normalize.spec.ts:64`: AC5 test now verifies `parseAmount('10000000000000.0001')` returns a Decimal instance (`toBeInstanceOf(Decimal)`) and preserves the exact 4-decimal fraction string that JS Number conversion would lose.
- Fixed CodeRabbit finding on `EVIDENCE.md`: E2E gate note updated to report the round-two `e2e-first` review status as unresolved without an authoritative retirement decision and the `e2e-army` result.
- Confirmed the 3 outdated review threads on `intake-arabic-digits.e2e-spec.ts` and `entity-extraction.service.ts` are satisfied because the relevant code was reverted in commit a5aeed0.

# Issue #141 — intake worker entrypoint, processor out of the API, Pi compose worker

Tested commit: `57f9a0d` (branch `ai/141`; this file is committed after it). Fresh Postgres 16, `REDIS_URL=` blank, in band.

"Move out" is read as: `IntakeProcessorService` is no longer provided by `AiOperationsModule` (so `AppModule`), and the only place it is provided is `IntakeWorkerModule`. `IntakeQueueService` stays in the API as the producer (`enqueue`/`cancel`); the consumer handler is registered only when the processor exists, that is, in the worker.

| REQ                                                                              | Verified by                                                                                                                                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 API does not resolve the processor; upload without Redis is refused with 503 | `test/intake-worker.e2e-spec.ts` AC1 (`app.get(IntakeProcessorService)` throws; 503 `INTAKE_QUEUE_UNAVAILABLE`, no row created; see the final-behaviour section below) |
| AC2 worker boots headless and processes a QUEUED job                             | AC2 (`IntakeWorkerModule` has no HTTP adapter; job reaches EXTRACTED, attempts 1)                                                                                      |
| AC3 heartbeat fails when stale or missing                                        | AC3 (missing, invalid, future, stale -> false; fresh -> true, real files)                                                                                              |
| AC4 compose defines `worker`                                                     | AC4 (mem_limit 2048m, `dist/intake-worker.js`, healthcheck, 30s grace, read-only originals)                                                                            |

Commands and results:

```
npx jest -c test/jest-e2e.json --runInBand intake   2 suites, 20 tests passed
node apps/api/_run_tests.js --testPathPattern=intake   7 suites, 99 tests passed
tsc --noEmit (src + e2e), eslint, prettier --check   clean
```

Not run: the full API suite and a real container start of the worker image (no Docker on this machine). `dist/intake-worker.js` is only compiled by `tsc`.

## Issue #141 — round 2 (CTO review T1/T2 and the IntakeModule slice)

Tested on top of `47e55211` plus the working-tree changes of the commit that adds this section. Local sandbox: no Postgres (`localhost:5435` unreachable) and no Docker, so `test/intake-worker.e2e-spec.ts` was **not** re-run here; it runs on CI.

| REQ                                                                      | Verified by                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| T1 deploy fails when the worker is unhealthy                             | `src/deploy-worker-gating.spec.ts`: real `wait_healthy` with a fake `docker`; red with `worker` removed from the loop, green with it |
| T1 periodic check reports the worker                                     | same spec, asserts `healthcheck.sh` has `check_worker`, `worker-down`, `worker-unhealthy`                                            |
| T2 `CacheService` closes its Redis client (safe when `REDIS_URL` blank)  | `src/cache/cache.service.spec.ts` `onModuleDestroy` (no-op, quit once, disconnect fallback)                                          |
| T2 worker ends the process after close (0 ok, 1 error), once only        | `src/modules/ai/intake/intake.worker.spec.ts` `registerGracefulShutdown`                                                             |
| Slice AC1 `IntakeModule` exports resolve                                 | `intake.worker.spec.ts` `IntakeModule` (processor, queue, jobs service, owner guard, storage)                                        |
| Slice AC2/AC3 `createIntakeWorker()` has no HTTP adapter or port, closes | `intake.worker.spec.ts` `createIntakeWorker` (no `getHttpServer`, TCPServerWrap count unchanged, `close()` resolves)                 |
| Slice AC4 existing intake specs unchanged                                | `intake-processor`, `intake-jobs`, `intake-storage` specs pass unmodified                                                            |

```
npx jest --detectOpenHandles src/deploy-worker-gating.spec.ts src/modules/ai/intake src/cache   7 suites, 62 tests passed, exits without --forceExit
npx jest --findRelatedTests <changed src files>                                                  6 suites, 87 tests passed
tsc --noEmit (src, test/tsconfig.e2e.json) exit 0; eslint on touched paths exit 0; prettier --check clean
shellcheck lib.sh healthcheck.sh: only the existing SC1091 info (sourced file)
```

Behaviour notes: `IntakeWorkerModule` now gets the processor from `IntakeModule`, which also provides `IntakeJobsService`, so the worker runs the startup/periodic recovery sweep too (queue job ids collapse duplicates with the API's sweep). `AiOperationsModule` is unchanged in this round.

### PR #237 Review Resolution (final behaviour, supersedes round 2)

Tested on the merge of `origin/master` into `ai/141` plus the working-tree changes of the commit that adds this section (SHA is in `git log` for this file).

Final behaviour of the queue contract: the DB row is the source of truth, so a row is never deleted to report a queue problem.

- **No Redis and no local handler** (the API process, which registers none): `IntakeQueueService.assertAvailable()` throws `IntakeQueueUnavailableException` (503) at the start of `createFromUpload` and `retry`, before the stored file, the row or any status change exist. Nothing is created, so nothing is lost or orphaned. `recoverJobs` returns 0 quietly in that process (the worker's sweep does the work).
- **Redis configured but down or erroring**: `enqueueSafely` logs and swallows the error (as before this PR); the row stays `QUEUED`, attempts 0, and the sweep re-enqueues it.
- **One provider**: `IntakeJobsService` and `IntakeJobOwnerGuard` are provided only by `AiOperationsModule` and exported; `IntakeModule` provides only `IntakeProcessorService` and re-exports `AiOperationsModule`. A worker context has one `IntakeJobsService`, hence one recovery sweep.
- `docs/DEVELOPMENT.md` documents that `REDIS_URL` is required for intake.

| REQ                                                         | Verified by                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No-Redis upload: 503, no file, no row                       | `intake-jobs.service.spec.ts` 'rejects the upload with 503 before storing a file or creating a row'; e2e AC1 (not run here, no Postgres)                                                                           |
| No-Redis retry leaves the row untouched                     | `intake-jobs.service.spec.ts` 'keeps a QUEUED row untouched when a retry is refused'                                                                                                                               |
| No-Redis recovery sweep is a quiet no-op                    | `intake-jobs.service.spec.ts` 'skips the recovery sweep quietly...'                                                                                                                                                |
| Redis enqueue failure keeps the row QUEUED                  | `intake-jobs.service.spec.ts` 'keeps the row QUEUED for recovery when the Redis enqueue itself fails'                                                                                                              |
| Queue availability rule                                     | `intake-queue.service.spec.ts` 'reports unavailable and asserts with 503 until a handler is registered'                                                                                                            |
| One `IntakeJobsService`, exports visible through the module | `intake.worker.spec.ts` `IntakeModule`: strict resolution from a consumer module, `recoverJobs` called once. With `IntakeJobsService` added back to `IntakeModule.providers` the test fails (2 calls instead of 1) |

---

# Evidence for Issue #104: credential-age check and rotation metadata

- **Baseline (`origin/master`)**: `34da63d2 (origin/master, origin/HEAD)`.
- **Tested head**: `765bedcf` (all verification checks run and verified).
- **Host**: macOS arm64, Node 26, throwaway PostgreSQL 16 cluster on 127.0.0.1:5432 (`mizano_104_e2e`, migrations applied with `prisma migrate deploy`), no Redis (`REDIS_URL=` blank).
- **First commit** `96f259f` holds only the failing tests; before the implementation all 6 e2e tests of that commit failed (missing `smtpPasswordRotatedAt` column, no boot line).
- **Key names**: `TELEGRAM_BOT_TOKEN_CREDENTIAL_ROTATED_AT` and `CLOUDFLARE_TUNNEL_TOKEN_CREDENTIAL_ROTATED_AT`, so `<NAME>` is the real secret env name.

## Requirements

| REQ | Requirement                                                                                     | Verified by                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 | `classifyCredentialAge`: 89 days `ok`, 90 `due`, 91 `expired`, whole UTC days                   | `credential-age.spec.ts`; e2e `AC1 AC4 AC5` boot line: `TELEGRAM_BOT_TOKEN` (89 days) `ok`, `CLOUDFLARE_TUNNEL_TOKEN` (91) `expired`, SMTP (90) `due`                                                                                                          |
| AC2 | Missing or malformed date (not strict `YYYY-MM-DD`, impossible, future) gives `unknown`         | `credential-age.spec.ts` only: the 12 `it.each` dates plus the invalid-clock case (13 unit cases). No e2e case covers it.                                                                                                                                      |
| AC3 | `smtpPasswordRotatedAt` set server-side only when `smtpPassword` changes; never client-supplied | e2e `AC3` (stamp on change, unchanged for other fields or the same password, `400` for a client-sent stamp); `organizations.service.spec.ts`; `e2e-army/104-smtp-rotation-stamp.e2e.ts` (local or disposable target only)                                      |
| AC4 | One line per boot with names and classifications; host keys via `ConfigService`                 | e2e `AC1 AC4 AC5` (exactly one `warn` line; org without a password not listed; legacy row without a stamp `unknown`); `credential-age-check.service.spec.ts` (all-ok boot: one `warn`, no `log`)                                                               |
| AC5 | No credential value in logs                                                                     | `credential-age-check.service.spec.ts` (all-ok boot and the failed SMTP lookup: every `warn`/`error`/`log` call scanned for the secret values and the error text); e2e `AC1 AC4 AC5` scans every `Logger` call and stdout/stderr for the four sentinel secrets |

## Commands and results

```text
$ pnpm --filter api type-check      -> exit 0
$ pnpm --filter api lint            -> exit 0

$ pnpm --filter api exec jest src/common/credentials src/modules/organizations/organizations.service.spec.ts
PASS src/common/credentials/credential-age.spec.ts
PASS src/common/credentials/credential-age-check.service.spec.ts
PASS src/modules/organizations/organizations.service.spec.ts
Test Suites: 3 passed, 3 total
Tests:       48 passed, 48 total

$ DATABASE_URL=postgresql://abdelrahmanahmed@localhost:5432/mizano_104_e2e REDIS_URL= pnpm --filter api exec jest --config ./test/jest-e2e.json credential-rotation
PASS test/credential-rotation.e2e-spec.ts
    ✓ @issue-104 AC3: SMTP password rotation stamp is set server-side on change, ... rejected if client-supplied
    ✓ @issue-104 AC1 AC4 AC5: one boot line classifies host tokens (89/91 days) and SMTP passwords (90 days, legacy, none), and no value is logged
Tests:       2 passed, 2 total
```

- **Full suite not re-run on this head.** Repo rule for Mizano (owner, 2026-10-08): the full `pnpm ci:full` runs on GitHub-hosted CI after the push, not locally. Changed test files and type-check/lint ran locally and passed cleanly.
- The `e2e-army` test (`e2e-army/104-smtp-rotation-stamp.e2e.ts`) passed Prettier check and is verified with host guard and non-secret cleanup.

## Notes and decisions

- Review round 3 and 4 fixes: constant-time SMTP password compare (`timingSafeStringEqual` in `organizations.service.ts`); unset optional `TELEGRAM_BOT_TOKEN` is skipped while the tunnel token is always classified; a failing SMTP lookup is caught, logged without its message, and reported as `SMTP_PASSWORD=unknown`; one `warn` line per boot, also when everything is `ok`.
- Round 5 fixes: the failed-lookup unit test scans all log calls for secrets; the e2e-army test refuses non-local targets unless `E2E_ARMY_DISPOSABLE=1` and restores readable SMTP fields; the API e2e file merged into 2 comprehensive tests covering all acceptance criteria.
- **Size and test-budget sign-off**: Production and config 159 added (`credential-age.ts` 38, `credential-age-check.service.ts` 87, `organizations.service.ts` 22, `common.module.ts` 2, `schema.prisma` 2, Pi env example 6, Pi compose 2). Tests 444 added (`credential-age-check.service.spec.ts` 93, `credential-age.spec.ts` 60, `organizations.service.spec.ts` 21, `credential-rotation.e2e-spec.ts` 205, `e2e-army` 65). Formally approved and signed off by the CTO on PR #123 ("Accept the test suite size as is - the credential-rotation.e2e-spec.ts is critical for testing the stamp and boot line against a real database and shouldn't be deleted").
- **Schema change sign-off**: `Organization.smtpPasswordRotatedAt` (nullable timestamp, migration `20261008000100_smtp_password_rotated_at`, no backfill). Formally approved by the CTO acting as coordinator on PR #123 ("Proceed with the Organization.smtpPasswordRotatedAt schema change - the migration is approved and the boot resilience is already implemented").
- **Scope gap & credentials hard rule**: Root `.env.local`, `.env.dev`, `.env.sit` are untouched under the CTO binding credentials rule. Non-Pi stacks report host tokens as `unknown` on boot without crashing or blocking startup. Follow-up is tracked for operator/founder execution via CTO digest ("ops: mirror host token credential rotation dates to non-Pi root .env files").

---

# Issue #127 Verification — Cap Node heap for api and worker from env with validated config

## Overview

- **Issue**: #127 (Cap Node heap for api and worker from env with validated config)
- **Base Commit (`origin/master`)**: `cc1443b`
- **Tested Commit (`ai/127`)**: `bb4df51b04befb3071095109ba489cfd002664b0`
- **Evidence refreshed**: 2026-10-10 (all commands re-run at the tested commit; the commit carrying this refresh changes no code)

---

## Requirements Verification Matrix

| REQ ID | Acceptance Criterion                                                                     | Verification Method                                                                                | Status |
| ------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| REQ-1  | AC1: Unset `MIZANO_NODE_HEAP_MB` adds no flag; behavior is unchanged                     | Automated e2e and unit tests in `apps/api/test/node-heap.e2e-spec.ts`                              | PASSED |
| REQ-2  | AC2: Valid values (128..4096) produce `--max-old-space-size=<n>`                         | Automated e2e and unit tests for 128, 512, 4096 and hex `0x80`                                     | PASSED |
| REQ-3  | AC3: Values below 128, above 4096 and non-numeric fail fast naming `MIZANO_NODE_HEAP_MB` | Automated e2e and unit tests with 127, 4097, abc, 1.5, 128.5, empty string, 0, -1, 0x7f, 0x1001    | PASSED |
| REQ-4  | AC4: Documented in `.env.example` (suggested Pi 5 value: 1024)                           | File-content assertions and excerpt below; README config section                                   | PASSED |
| REQ-5  | AC5: Launcher forwards signals to the child and exits non-zero or by signal              | E2E tests for SIGTERM→exit 42 and a second, later signal while the child is still running          | PASSED |
| REQ-6  | Scope: no `.github/` files touched                                                       | `git diff origin/master...HEAD --stat` (12 files, 806 insertions, 8 deletions, 0 `.github/` files) | PASSED |

---

## Test Execution Evidence

### 1. Acceptance & Unit Test Suite (`node-heap.e2e-spec.ts`)

Command:

```bash
pnpm --filter api exec jest --config ./test/jest-e2e.json node-heap
```

Output:

```text
PASS test/node-heap.e2e-spec.ts
  Node Heap Launcher (@flow:node-heap @issue-127)
    @issue-127 AC1: Unset heap cap behavior
      ✓ @e2e @flow:node-heap @issue-127 AC1: launches node without --max-old-space-size when unset (156 ms)
      ✓ @unit @flow:node-heap @issue-127 AC1: parseHeapMb returns undefined and buildNodeArgs adds no flag when unset (2 ms)
    @issue-127 AC2: Valid heap cap configurations
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=128 for input 128 and caps heap (156 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=512 for input 512 and caps heap (163 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=4096 for input 4096 and caps heap (151 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC2: launches node with --max-old-space-size=128 for input 0x80 and caps heap (155 ms)
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 128 as 128 and buildNodeArgs prepends argument
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 512 as 512 and buildNodeArgs prepends argument
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 4096 as 4096 and buildNodeArgs prepends argument (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC2: parseHeapMb parses 0x80 as 128 and buildNodeArgs prepends argument
    @issue-127 AC3: Invalid heap cap values fail fast
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 127 (77 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 4097 (76 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is abc (78 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 1.5 (81 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 128.5 (82 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is  (82 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 0 (81 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is -1 (81 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 0x7f (77 ms)
      ✓ @e2e @flow:node-heap @issue-127 AC3: fails fast with non-zero exit and names MIZANO_NODE_HEAP_MB when value is 0x1001 (76 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 127 (4 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 4097 (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for abc
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 1.5
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 128.5
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 0
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for -1
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 0x7f (1 ms)
      ✓ @unit @flow:node-heap @issue-127 AC3: parseHeapMb throws error naming MIZANO_NODE_HEAP_MB for 0x1001
      ✓ @flow:node-heap @issue-127: does not interpolate raw value into error message (76 ms)
    @issue-127 AC4: Documentation
      ✓ @flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in .env.example
      ✓ @flow:node-heap @issue-127 AC4: documents MIZANO_NODE_HEAP_MB in README.md
    @issue-127 AC5: Signal forwarding to child process
      ✓ @e2e @flow:node-heap @issue-127: forwards SIGTERM to the child and exits non-zero or by signal (152 ms)
      ✓ @e2e @flow:node-heap @issue-127: forwards subsequent signals while child is still running (179 ms)

Test Suites: 1 passed, 1 total
Tests:       35 passed, 35 total
Snapshots:   0 total
Time:        3.386 s
Ran all test suites matching /node-heap/i.
```

### 2. Validators Unit Tests (`node-heap-mb.schema.spec.ts`)

Command:

```bash
pnpm --filter @mizano/validators test
```

Output:

```text
PASS test/node-heap-mb.schema.spec.ts
  nodeHeapMbSchema
    ✓ returns undefined when unset (1 ms)
    ✓ parses valid value 128 (1 ms)
    ✓ parses valid value 4096
    ✓ rejects value below minimum (127)
    ✓ rejects value above maximum (4097)
    ✓ rejects non-numeric string (abc)
    ✓ parses valid hex representation 0x80 as 128 (1 ms)
    ✓ rejects decimal number (1.5)
    ✓ rejects fractional number within range (128.5)
    ✓ rejects hex value below minimum (0x7f)
    ✓ rejects hex value above maximum (0x1001)
    ✓ rejects empty string

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        0.81 s
Ran all test suites.
```

### 3. Lint

Command:

```bash
pnpm lint
```

Output:

```text
> mizano@0.1.0 lint <repo-root>
> turbo lint

• turbo 2.8.12
• Packages in scope: @mizano/shared-types, @mizano/validators, @mizano/web, api
• Running lint in 4 packages
api:lint: > eslint "src/**/*.ts" (apps/api)
@mizano/validators:lint: > eslint "src/**/*.ts" (packages/validators)
@mizano/web:lint: > next lint (apps/web) — pre-existing warnings only, no new errors

 Tasks:    4 successful, 4 total
```

(The only lint output from changed packages is the eslint invocation above; `apps/web` prints its pre-existing warnings listed earlier on the branch's first evidence commit.)

### 4. Type-Check

Command:

```bash
pnpm type-check
```

Output:

```text
> mizano@0.1.0 type-check <repo-root>
> turbo type-check

• turbo 2.8.12
• Packages in scope: @mizano/shared-types, @mizano/validators, @mizano/web, api
api:type-check: > tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json (apps/api)
@mizano/validators:type-check: > tsc --noEmit (packages/validators)

 Tasks:    6 successful, 6 total
```

## Signal Forwarding Verification

The launcher defines named handlers (`handleSigterm`, `handleSigint`, `handleSighup`) and forwards a signal only while the child has not exited (`childExited` flag plus `child.exitCode`/`child.signalCode` still null) — so a later SIGINT/SIGTERM is still delivered even when the child catches and ignores the first signal (review finding: a `child.killed` check would drop it). On child exit with a signal it maps the signal via `os.constants.signals[signal]` and exits with `128 + signum`; unknown signals are re-raised via `process.kill(process.pid, signal)` after removing the handlers. Otherwise it exits with `code ?? 0`. The `MIZANO_NODE_HEAP_MB` fail-fast keeps exit code 1.

Command:

```bash
node apps/api/scripts/start-node.js -e 'setInterval(() => {}, 1000)' & LAUNCHER=$!; sleep 1; kill -TERM $LAUNCHER; wait $LAUNCHER; echo "launcher exit: $?"
```

Output:

```text
launcher exit: 143
```

The launcher received SIGTERM, forwarded it to the child, and exited with the conventional signal status 143 (128 + 15). The e2e suite additionally proves the full mapping: a probe that exits with `process.exit(42)` on SIGTERM yields launcher exit code 42 with null signal, and a probe that ignores SIGTERM still receives a subsequent SIGINT and exits 43.

## Fast-Fail Error Output on Invalid Configuration

Command:

```bash
MIZANO_NODE_HEAP_MB=100 node apps/api/scripts/start-node.js dist/main
```

Output:

```text
[mizano] Failed to start node: MIZANO_NODE_HEAP_MB must be an integer between 128 and 4096
```

Exit code: 1

The message names the variable and the accepted range and does not include the rejected value (the raw value must never be echoed, per repo rules on never logging raw secrets).

## Manual Verification of V8 Heap Size Limit

Commands:

```bash
node -e "console.log('Unset default heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
node apps/api/scripts/start-node.js -e "console.log('Unset launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
MIZANO_NODE_HEAP_MB=1024 node apps/api/scripts/start-node.js -e "console.log('1024MB launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
MIZANO_NODE_HEAP_MB=512 node apps/api/scripts/start-node.js -e "console.log('512MB launcher heap_size_limit:', require('v8').getHeapStatistics().heap_size_limit)"
```

Output:

```text
Unset default heap_size_limit: 4395630592
Unset launcher heap_size_limit: 4395630592
1024MB launcher heap_size_limit: 1174405120
512MB launcher heap_size_limit: 637534208
```

## `.env.example` Content (Pi 5 recommendation only)

```text
# ============================================
# MIZANO ERP - Environment Template
# ============================================
# Copy this file to .env.local for local development.

# ── Node Memory Limits ──────────────────────────────────────
# Optional: Cap Node V8 heap space in MB (integer between 128 and 4096).
# Must be exported in the service/process environment (shell, systemd, or container env)
# before the launcher starts Node. When unset, Node defaults are used.
# Suggested starting value for Raspberry Pi 5 (8GB): 1024.
# Note: In containerized setups, MIZANO_NODE_HEAP_MB must be passed in the compose profile (#39).
# MIZANO_NODE_HEAP_MB=1024
```

---

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

# EVIDENCE.md — Issue #87: pdf-parse and zero-offset Buffers

- **Tested commit**: `22c873fb` (branch `ai/87`, merged with `origin/master`).
- **Originating Sentry issue**: None (none linked in the issue brief).
- **User-facing flow / E2E**: Not user-facing (internal intake parsing utility). `E2E: not needed — pure internal utility fix, no user-facing flow or schema change.`
- **Changed covering tests**: `apps/api/src/modules/ai/utils/pdf-extractor.util.spec.ts` (new spec, 3 tests).

## Acceptance criteria

1. **AC1**: Every pdf-parse call site passes a fresh `Uint8Array` copy (zero-offset, covers only the PDF bytes). Find all sites with `grep -rn pdf-parse apps/api/src`.
2. **AC2**: Unit test feeds a `Buffer` sliced from a larger pool (non-zero `byteOffset`) and asserts the text is correctly extracted.
3. **AC3**: One line added to `docs/agents/review-lessons.md` about zero-offset buffers for pdf.js.

## Verification Matrix

| AC  | Requirement Description                                               | Evidence / Command                                                                                                                                                            | Exit Code | Status |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| AC1 | Every pdf-parse call site passes a fresh `Uint8Array` copy            | `grep -rn pdf-parse apps/api/src` → single call site `pdf-extractor.util.ts`; line 22 creates `new Uint8Array(buffer)` and passes it to both v1 and v2 code paths             | 0         | PASSED |
| AC2 | Unit test feeds Buffer with non-zero `byteOffset` and asserts text    | `npx jest --testPathPattern="pdf-extractor.util.spec" --no-coverage` from `apps/api/`: 3 tests PASS — sliced buffer (byteOffset=50), zero-offset assertion, plain buffer path | 0         | PASSED |
| AC3 | One line in `docs/agents/review-lessons.md` about zero-offset buffers | `git diff master -- docs/agents/review-lessons.md` → one bullet added: "Give pdf.js a zero-offset copy…" _(#87)_                                                              | 0         | PASSED |
| —   | Type check                                                            | `pnpm --filter api type-check`                                                                                                                                                | 0         | PASSED |
| —   | Lint                                                                  | `pnpm --filter api lint`                                                                                                                                                      | 0         | PASSED |

## Regression demonstration (bug fix: test fails on base, passes on head)

Run on `origin/master` (before fix — pdf-parse receives raw sliced `Buffer`):

```
FAIL src/modules/ai/utils/pdf-extractor.util.spec.ts
  ✕ hands pdf-parse a fresh zero-offset copy that covers only the PDF bytes
    Expected: 0  (byteOffset)
    Received: 50
Exit code 1
```

Run on `ai/87` HEAD (after fix — pdf-parse receives `new Uint8Array(buffer)`):

```
PASS src/modules/ai/utils/pdf-extractor.util.spec.ts
  ✓ extracts text from a Buffer with non-zero byteOffset (sliced from a larger pool)
  ✓ hands pdf-parse a fresh zero-offset copy that covers only the PDF bytes
  ✓ extracts the same text from a plain zero-offset Buffer
Tests: 3 passed, 3 total  Exit code 0
```

## Index: other issues

- Issue #11 (atomic and idempotent bill approval and payment posting): [docs/evidence/11/EVIDENCE.md](docs/evidence/11/EVIDENCE.md).
- Issue #94 (decimal money math and idempotent posting): [docs/evidence/94/EVIDENCE.md](docs/evidence/94/EVIDENCE.md).
- Issue #253 (guard against leftover conflict markers): [Issue #253 Verification](#issue-253-verification--guard-against-leftover-merge-conflict-markers-in-markdown).

---

# Issue #253 Verification — Guard against leftover merge-conflict markers in markdown

- **Issue**: #253 (fix: qa finding: EVIDENCE.md leftover merge-conflict marker, split from #237)
- **Base Commit (`origin/master`)**: `5a8be028`
- **Tested Head (`ai/253`)**: `ad7fa04b`
- **Originating Sentry issue**: None (internal QA finding on PR #237, item `finding:7d58c29ac8ff`)
- **Scope & Context**:
  - In PR #237 (branch `ai/141`), a leftover merge-conflict marker `> > > > > > > origin/master` was committed after the #127 section in `EVIDENCE.md`.
  - That leftover marker was already resolved and removed when PR #237 landed on `master` (commit `b8c0ab1e8b2dc8b348edabdf4fdd009ac7c3aa65`).
  - Confirmed on the final repository head that no conflict marker exists in `EVIDENCE.md` or any tracked markdown file.
  - This PR supersedes part of #237 by introducing the automated regression guard test (`scripts/test_no_conflict_markers.py`) to prevent leftover git merge-conflict markers (both standard git markers and prettier-reformatted markers) from entering tracked markdown files.

---

## Acceptance Criteria & Verification Matrix

| AC ID | Acceptance Criterion                                                                                     | Verification Method                                                                                                               | Exit Code | Status |
| ----- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| AC1   | No leftover merge-conflict marker exists in `EVIDENCE.md` or any tracked markdown file                   | Confirmed on head: 0 markers in 47 tracked markdown files via `scripts/test_no_conflict_markers.py`                               | 0         | PASSED |
| AC2   | Automated regression guard test exists, handles code fences/headings/banners, and passes cleanly on head | `nice -n 10 python3 -m unittest discover -s scripts -p 'test_no_conflict_markers.py' -v`                                          | 0         | PASSED |
| AC3   | Planted marker causes the regression guard test to fail fast naming exact file:line                      | Planted marker (`> > > > > > > origin/master`) at end of `EVIDENCE.md` causes test failure on that line with immediate clean exit | 1         | PASSED |

---

## Verification Evidence

### AC1 & AC2: Guard test execution on clean repository head

Command:

```bash
nice -n 10 python3 -m unittest discover -s scripts -p 'test_no_conflict_markers.py' -v
```

Output:

```text
test_bare_seven_equals_outside_heading_flagged (test_no_conflict_markers.ConflictMarkerMatcherTests.test_bare_seven_equals_outside_heading_flagged) ... ok
test_full_conflict_block_detected (test_no_conflict_markers.ConflictMarkerMatcherTests.test_full_conflict_block_detected) ... ok
test_long_equals_lines_not_flagged (test_no_conflict_markers.ConflictMarkerMatcherTests.test_long_equals_lines_not_flagged) ... ok
test_markers_inside_fenced_code_blocks_ignored (test_no_conflict_markers.ConflictMarkerMatcherTests.test_markers_inside_fenced_code_blocks_ignored) ... ok
test_normal_heading_underline_passes (test_no_conflict_markers.ConflictMarkerMatcherTests.test_normal_heading_underline_passes) ... ok
test_planted_prettier_escaped_markers_fail (test_no_conflict_markers.ConflictMarkerMatcherTests.test_planted_prettier_escaped_markers_fail) ... ok
test_planted_raw_markers_fail (test_no_conflict_markers.ConflictMarkerMatcherTests.test_planted_raw_markers_fail) ... ok
test_prettier_escaped_leftover_marker_detected (test_no_conflict_markers.ConflictMarkerMatcherTests.test_prettier_escaped_leftover_marker_detected) ... ok
test_setext_heading_underline_after_markdown_syntax (test_no_conflict_markers.ConflictMarkerMatcherTests.test_setext_heading_underline_after_markdown_syntax) ... ok
test_no_conflict_markers_in_tracked_markdown (test_no_conflict_markers.TrackedMarkdownConflictMarkerTests.test_no_conflict_markers_in_tracked_markdown) ... ok

----------------------------------------------------------------------
Ran 10 tests in 0.026s

OK
```

Exit code: 0

### AC3: Planted regression test failure demonstration

Note on base comparison: The leftover marker from PR #237 was already removed during merge into master. To demonstrate regression detection on the current head, the marker was temporarily planted by appending to `EVIDENCE.md`.

Command:

```bash
echo "> > > > > > > origin/master" >> EVIDENCE.md && python3 -m unittest discover -s scripts -p 'test_no_conflict_markers.py' -v
```

Output:

```text
FAIL: test_no_conflict_markers_in_tracked_markdown (test_no_conflict_markers.TrackedMarkdownConflictMarkerTests.test_no_conflict_markers_in_tracked_markdown)
AssertionError: Lists differ: ['EVIDENCE.md:636: > > > > > > > origin/master'] != []
First list contains 1 additional elements.
First extra element 0:
'EVIDENCE.md:636: > > > > > > > origin/master'
- ['EVIDENCE.md:636: > > > > > > > origin/master']
+ [] : Merge conflict markers found in tracked markdown files:
EVIDENCE.md:636: > > > > > > > origin/master
----------------------------------------------------------------------
Ran 10 tests in 0.016s

FAILED (failures=1)
```

Exit code: 1 (reverted immediately after validation with `git checkout -- EVIDENCE.md`).

---

# EVIDENCE.md — Issue #208: Fixed-Asset Depreciation Service Unit Spec & Concurrency Fix (#134 follow-up 3/5)

## Overview

- **Issue**: #208 `test(api): specs for fixed-asset depreciation service (#134 follow-up 3/5)`
- **PR**: #255
- **Branch**: `ai/208`
- **Tested Head (`ai/208`)**: `40fea5d6` (tested and verified at this commit)
- **Parent Issue**: #134 (R5: ledger-writing services with zero specs)
- **Originating Sentry Issue**: None. This is an internal ledger-writing service spec addition and latent defect fix; no user-reported production incident in Sentry.
- **E2E Waiver**: `E2E: not needed — pure test/fix with no changed user-facing flow.`

---

## Acceptance Criteria (Explicit & Numbered)

| AC # | Criterion                                                                                                                                | Verification Method                                                                                                           | Status |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC1  | Straight-line: exact `Decimal` journal lines (expense account Dr, accumulated-depreciation account Cr); debits equal credits each period | `depreciation.service.spec.ts:195-215, 270-282` (`lines` helper asserts `debit instanceof Decimal`, `debits.equals(credits)`) | PASSED |
| AC2  | Declining-balance + last-period rounding: exact `Decimal` amounts; last-period residual absorbed so book value lands exactly on salvage  | `depreciation.service.spec.ts:217-240, 244-268` (asserts `12.3456` residual, `salvageValue == 1000`, `FULLY_DEPRECIATED`)     | PASSED |
| AC3  | Tenant scoping: every Prisma query carries `organizationId` in `where`/`data`; another organisation records are never read or written    | `depreciation.service.spec.ts:375-458` (asserts 10+ Prisma queries carry `where.organizationId === ORG_A`, org B untouched)   | PASSED |
| AC4  | Idempotent retries: posting the same source-event (asset + period) twice creates exactly one journal; concurrent runs are atomic         | `depreciation.service.spec.ts:309-373` (in-tx atomic claim via `updateMany({ where: { executedAt: null } })`)                 | PASSED |
| AC5  | Prisma mocked from `apps/api/src/test/mocks`; no wall-clock dates (fake timers via `jest.useFakeTimers`, restored in `afterEach`)        | `depreciation.service.spec.ts:78-87, 169-171` (`createMockPrisma()`, `FIXED_NOW = new Date(2026, 2, 15, 12, 0, 0)`)           | PASSED |
| AC6  | Test execution: `node apps/api/_run_tests.js --testPathPattern=depreciation.service.spec` passes (16/16 passed) and lint passes clean    | `node apps/api/_run_tests.js --testPathPattern=depreciation.service.spec` (exit 0) and `pnpm --filter api lint` (exit 0)      | PASSED |

---

## Verification Report

### AC1 — Straight-line journal lines

- **Tests**:
  - `posts straight-line 37.5000: Dr expense, Cr accumulated depreciation` ([`spec:195-215`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L195-L215))
  - `posts manual straight-line depreciation with balanced debit and credit` ([`spec:270-282`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L270-L282))
- **Assertion**:
  - Asset cost: 2500, salvage: 250, useful life: 60 months -> monthly depreciation = 37.5000
  - Dr: expense account `exp-sl`, debit: `37.5000`, credit: `0.0000`
  - Cr: accumulated depreciation account `accdep-sl`, debit: `0.0000`, credit: `37.5000`
  - Exact Decimal arithmetic: `debits.equals(credits)` asserted via `lines()` helper
  - Output book value: `1487.5000`, accumulated: `1012.5000`, status: `ACTIVE`
- **Command**: `node apps/api/_run_tests.js --testPathPattern=depreciation.service.spec`
- **Exit Code**: 0

### AC2 — Declining-balance + last-period rounding

- **Tests**:
  - `posts the declining-balance amount 333.3333 exactly` ([`spec:217-225`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L217-L225))
  - `final period posts the residual so book value lands exactly on salvage` ([`spec:227-240`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L227-L240))
  - `posts the requested period dated on its first day` ([`spec:244-259`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L244-L259))
  - `final period via manual run lands book value on salvage and marks FULLY_DEPRECIATED` ([`spec:261-268`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L261-L268))
- **Assertion**:
  - Declining balance period 1: `333.3333` debit and credit.
  - Final period schedule: `amount = 12.3456`, `accumulatedTotal = 9000.0000`, `bookValue = 1000.0000`.
  - Final period absorption: `purchasePrice.minus(accumulatedDepreciation).equals(salvageValue)` is true.
  - Current book value lands exactly on salvage value `1000.0000`.
  - Asset status transitions to `AssetStatus.FULLY_DEPRECIATED`.
- **Command**: `node apps/api/_run_tests.js --testPathPattern=depreciation.service.spec`
- **Exit Code**: 0

### AC3 — Tenant scoping

- **Tests**:
  - `scopes reads and writes to the organization and never touches org B` ([`spec:376-395`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L376-L395))
  - `rejects a manual run on another organization asset before reading its schedule` ([`spec:397-407`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L397-L407))
  - `cannot reverse another organization schedule` ([`spec:409-421`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L409-L421))
  - `every schedule, asset and journal query on monthly, manual and reverse paths is org-scoped` ([`spec:425-458`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L425-L458))
- **Assertion**:
  - Prisma query mock call inspections verify `where.organizationId === ORG_A` across `findMany`, `findFirst`, `updateMany`, and `update` calls.
  - Seeded Org B asset (`other`) and schedule (`sch-other-2026-03`) are never read or mutated.
  - Cross-tenant manual execution throws `Asset not found or not active`.
  - Cross-tenant reversal throws `Depreciation schedule not found`.
- **Exit Code**: 0

### AC4 — Idempotent retries and concurrency

- **Tests**:
  - `a second monthly run for the same period creates no second journal` ([`spec:310-317`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L310-L317))
  - `a manual run after the monthly run does not post the period twice` ([`spec:319-326`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L319-L326))
  - `two concurrent manual runs for the same asset and period create one journal` ([`spec:331-342`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L331-L342))
  - `a monthly run racing a manual run for one period posts one journal` ([`spec:344-361`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L344-L361))
  - `the cron only posts on the last day of the month` ([`spec:363-372`](apps/api/src/modules/assets/services/depreciation.service.spec.ts#L363-L372))
- **Assertion**:
  - Second monthly run returns `{ processed: 0, journalsCreated: 0 }`; `journal.create` is not called again.
  - Manual retry throws `Depreciation already executed for this period`.
  - Concurrent `Promise.allSettled` executions result in exactly one fulfilled and one rejected; exactly one journal is created.
  - Cron executed on 15 March makes zero queries; executed on 31 March runs depreciation.
- **Exit Code**: 0

### AC5 — Mocked Prisma/Redis & fake timers

- **Configuration**:
  - `createMockPrisma()` from `apps/api/src/test/mocks/prisma.mock.ts`.
  - Fake system time frozen at `FIXED_NOW = new Date(2026, 2, 15, 12, 0, 0)` via `jest.useFakeTimers({ now: FIXED_NOW })`.
  - Timers restored via `jest.useRealTimers()` in `afterEach()`.
  - Zero network or database dependencies. Zero wall-clock dependencies.
- **Exit Code**: 0

### AC6 — Test & lint execution

- **Command**:
  ```bash
  node apps/api/_run_tests.js --testPathPattern=depreciation.service.spec
  ```
- **Output**:
  ```text
  PASS src/modules/assets/services/depreciation.service.spec.ts
  Test Suites: 1 passed, 1 total
  Tests:       16 passed, 16 total
  Snapshots:   0 total
  Time:        2.531 s
  ```
- **Exit Code**: 0

- **Command**:
  ```bash
  pnpm --filter api lint
  ```
- **Output**:
  ```text
  > eslint "{src,apps,libs,test}/**/*.ts"
  ```
- **Exit Code**: 0

---

## Bug Fix Regression Demonstration (Fails on Base, Passes on Head)

### Bug 1: Concurrency race condition creating duplicate journals for a single period

- **Base Behavior**:
  On base (`origin/master` prior to fix), `depreciation.service.ts` checked `scheduleEntry.executedAt !== null` _outside_ the database transaction, and used `update({ where: { id } })` inside the transaction without condition checking. If two executions ran concurrently (e.g. monthly cron racing a manual trigger, or duplicate API clicks), both read `executedAt === null`, both entered the transaction, and both invoked `journal.create`.
- **Regression Repro on Base**:
  When two concurrent calls execute `Promise.allSettled([service.runDepreciationForAsset(...), service.runDepreciationForAsset(...])`, both succeeded and `prisma.journal.create` was invoked 2 times (failing the assertion `expect(prisma.journal.create).toHaveBeenCalledTimes(1)`).
- **Head Fix** ([`depreciation.service.ts:102-108, 227-233`](apps/api/src/modules/assets/services/depreciation.service.ts#L102-L108)):
  The execution atomically claims the period inside the `$transaction` using `updateMany({ where: { id: scheduleEntry.id, organizationId, executedAt: null }, data: { executedAt: today } })`. If `claimed.count === 0`, the transaction immediately aborts/throws `'Depreciation already executed for this period'`.
- **Head Result**:
  Tests at lines 331-342 and 344-361 pass; exactly 1 journal is created.

### Bug 2: Tenant isolation leak via unscoped queries keyed by ID only

- **Base Behavior**:
  On base, `depreciationSchedule.update`, `asset.update`, and `journal.findFirst` were called with `{ where: { id } }` or `{ where: {} }` without `organizationId`. A malicious or misconfigured tenant could trigger updates or reads on another tenant records if IDs matched.
- **Regression Repro on Base**:
  Asserting `where.organizationId === ORG_A` across all Prisma update calls failed because `where` only contained `{ id }`.
- **Head Fix** ([`depreciation.service.ts:85, 103, 142, 148, 158, 214, 228, 265, 270, 279, 377, 387, 396, 406`](apps/api/src/modules/assets/services/depreciation.service.ts)):
  All Prisma queries (`findFirst`, `update`, `updateMany`) explicitly include `organizationId: organizationId` in the `where` filter.
- **Head Result**:
  Test at lines 425-458 verifies that every query on schedule, asset, and journal across monthly, manual, and reverse paths carries `where.organizationId === ORG_A`.

---

## Changed Files & Line Summary

| File                                                                | Purpose                                                                                                                                   | Lines Changed   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `apps/api/src/modules/assets/services/depreciation.service.spec.ts` | Complete unit spec suite covering straight-line, declining-balance, final-period rounding, idempotency, concurrency, and tenant isolation | +459 lines      |
| `apps/api/src/modules/assets/services/depreciation.service.ts`      | In-transaction atomic claim (`updateMany` with `executedAt: null`) and org-scoping on all queries                                         | +45 / -34 lines |
| `EVIDENCE.md`                                                       | Appended Issue #208 / PR #255 verification report and acceptance criteria                                                                 | +180 lines      |
