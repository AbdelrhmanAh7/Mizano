# Questions for the owner (#134)

## 1. Add the `e2e` job to `.github/workflows/ci.yml` (AC1 needs a workflow edit; workflow files are owner-only)

Everything else for AC1 and AC2 is in this PR (`test:e2e` turbo task, `pnpm test:e2e` runs in band, one jest config).
The workflow edit was reverted by the harness, so please paste this job under `jobs:` (after `build`), and add
`"E2E Tests"` to the job-name comment. `apps/api/test/test-gate.e2e-spec.ts` skips its "ci.yml has an e2e job" check
until the job exists and enforces it (postgres:16, `prisma migrate deploy`, `run: pnpm test:e2e`, no `continue-on-error`)
as soon as it does. The job was verified locally step by step (4/4 fresh runs green; a deliberately failing
`reports.e2e-spec.ts` test makes `pnpm test:e2e` exit 1), but has never run on GitHub.

```yaml
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

    - name: Run E2E tests
      run: pnpm test:e2e
      env:
        DATABASE_URL: postgresql://test:test@localhost:5432/mizano_e2e
        # Blank on purpose: the cache and the intake queue run in-process, as in the verified local runs.
        REDIS_URL: ''
```

Also change the unit-job comment "The real-database API e2e specs run in nightly.yml." (no such workflow exists) to point at the `e2e` job.

## 2. Follow-up issues (split out for the ~300-line PR limit): specs for ledger-writing services with none

#206 costing (FIFO/COGS), #207 currency (`convertToBaseCurrency`, unrealised FX), #208 depreciation,
#209 bank-transactions + bulk-operations, #210 bank-statement-import.
