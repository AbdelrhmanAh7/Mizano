# AI_QUESTIONS — #134

## 1. Six ledger-service specs: follow-up issues?

#134 also asks for specs for six ledger-writing services that have none. This PR is already about 290 changed lines (CI job, turbo task, jest config, gate tests, pinned clocks, docs). Together the six services are about 1,900 lines, so their specs cannot fit the ~300-line limit. Can they be filed as sequential issues, one per service or pair? Suggested order (ledger risk first):

1. `inventory/services/costing.service.ts` (FIFO/COGS, 215 lines)
2. `currency/services/currency.service.ts` (`convertToBaseCurrency`, unrealised FX, 484 lines)
3. `assets/services/depreciation.service.ts` (422 lines)
4. `banking/services/bank-transactions.service.ts` (195) and `bulk-operations/bulk-operations.service.ts` (115)
5. `banking/services/bank-statement-import.service.ts` (492 lines)

Each spec should assert exact Decimal journal lines, tenant scoping and idempotent retries (review-lessons §2, §6, §7).

## 2. AC1 needs the owner to add the `e2e` job (`ci-change`)

AC1 ("ci.yml shows an e2e job that fails when reports.e2e-spec.ts fails") can only be met by editing `.github/workflows/ci.yml`. The hub reverted that edit on this branch because workflows are owner-only. Everything else the job needs is in this PR: the `test:e2e` turbo task (never cached), the in-band `apps/api` script and the gate test. So `test/test-gate.e2e-spec.ts` › `AC1: ci.yml has an e2e job …` fails on purpose until the job exists. It was not weakened.

Please either label #134 `ci-change` so the implementer can add the job, or add it yourself. It is written in the style of master's ci.yml (#149: `ubuntu-latest`, 5-minute limit, pnpm store cache, no secrets) and goes under `jobs:` (indented two spaces) after the `build` job:

```yaml
# ==========================================
# E2E Tests (real PostgreSQL; every apps/api/test/*.e2e-spec.ts suite)
# ==========================================
e2e:
  name: E2E Tests
  runs-on: ubuntu-latest
  timeout-minutes: 5
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_USER: test
        POSTGRES_PASSWORD: test
        POSTGRES_DB: mizano_e2e
      ports:
        - 5432:5432
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5

  steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup pnpm
      uses: pnpm/action-setup@v2
      with:
        version: ${{ env.PNPM_VERSION }}

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'pnpm'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Generate Prisma client
      run: pnpm db:generate

    - name: Apply database migrations
      run: pnpm --filter api exec prisma migrate deploy
      env:
        DATABASE_URL: postgresql://test:test@localhost:5432/mizano_e2e

    # reports, accountant journey, multi-tenancy, intake, ...: any failing suite fails this job.
    - name: Run E2E tests
      run: pnpm test:e2e
      env:
        DATABASE_URL: postgresql://test:test@localhost:5432/mizano_e2e
        # Blank on purpose: cache and intake queue run in-process, as in the verified local runs.
        REDIS_URL: ''
```

Notes:

- **Time.** Locally the 12 suites take about 40 s in band. Install and migrations come on top. The job has never run on GitHub, so whether it fits in 5 minutes is not verified. If it does not, split the suites across two jobs rather than raising the limit.
- **Gate name.** `E2E Tests` is a new check name. The hub's `localci.ts` lists Mizano's required checks (`Install Dependencies`, `Lint & Type Check`, `Unit Tests`, `Build`), so the job blocks automerge only if it is added there too.
- **Redis.** `REDIS_URL` is blank, so the cache and the intake queue run in-process, as in every verified local run. A Redis service would also exercise BullMQ, but that has never been verified.
- **Unit job.** It still provisions PostgreSQL and Redis and runs `db:push`, although unit tests mock Prisma. Those steps can go once the `e2e` job is green.
- **Flake hypothesis.** `createTestApp` could `listen(0, '127.0.0.1')` so supertest never shares an ephemeral port with another local process (see the `accountant-journey` flake in EVIDENCE.md). That flake was not reproduced, so this is a hypothesis.
