# AI_QUESTIONS — #134

## 1. Six ledger-service specs: follow-up issues?

#134 also asks for specs for six ledger-writing services that have none. This PR is already about 290 changed lines (CI job, turbo task, jest config, gate tests, pinned clocks, docs). Together the six services are about 1,900 lines, so their specs cannot fit the ~300-line limit. Can they be filed as sequential issues, one per service or pair? Suggested order (ledger risk first):

1. `inventory/services/costing.service.ts` (FIFO/COGS, 215 lines)
2. `currency/services/currency.service.ts` (`convertToBaseCurrency`, unrealised FX, 484 lines)
3. `assets/services/depreciation.service.ts` (422 lines)
4. `banking/services/bank-transactions.service.ts` (195) and `bulk-operations/bulk-operations.service.ts` (115)
5. `banking/services/bank-statement-import.service.ts` (492 lines)

Each spec should assert exact Decimal journal lines, tenant scoping and idempotent retries (review-lessons §2, §6, §7).

## 2. CI changes need the owner

The issue is explicitly about CI, and AC1 requires the job, so this PR edits `.github/workflows/ci.yml` (one new `e2e` job, other jobs untouched). The job could not run on GitHub because the workflows are disabled. It was reproduced locally (see EVIDENCE.md). Please review it before merging.

Optional follow-ups, deliberately not done here:

- The unit `test` job still provisions PostgreSQL and Redis and runs `db:push`, although unit tests mock Prisma. They could be removed once the `e2e` job has run green on GitHub.
- The e2e job runs without Redis (`REDIS_URL` blank), as all verified local runs did. Running it against a Redis service would also exercise BullMQ, but that has never been verified.
- `createTestApp` could `listen(0, '127.0.0.1')` so supertest never shares an ephemeral port with another local process (see the `accountant-journey` flake in EVIDENCE.md). That flake was not reproduced, so this is a hypothesis.
