# Development guide

Setup, environments, database, testing, CI, git workflow and deployment for Mizano. Architecture and coding rules are in [ARCHITECTURE.md](ARCHITECTURE.md); UI rules in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md); agent process in [AGENTS.md](../AGENTS.md).

## Prerequisites

- Node 20 (CI and Docker images use Node 20; `engines` allows >=18)
- pnpm 8.14 via `corepack enable` (pinned in `packageManager`)
- Docker with Compose for PostgreSQL 16 and Redis 7
- Python 3 for the planning scripts in `scripts/` and the docs-check tests; Bash (Git Bash on Windows) for the worktree helpers and docs-check tests

## Quick start

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm docker:up          # PostgreSQL :5435, Redis :6380
pnpm db:migrate         # dedicated local database only
pnpm db:seed
pnpm dev                # docker-compose up -d && turbo dev → web :5001, API :6001
```

Never initialize, migrate or reset a shared or production database from a workstation. CPU rules extraction exists; select `INTAKE_EXTRACTION_STRATEGY=rules` without a request override and set `OLLAMA_ENABLED=false` for optional inference. Legacy scan presets can still override rules mode. See [implementation limits](ARCHITECTURE.md#pi-invoice-pipeline); the live path requires Tesseract/Poppler and no LLM, with offline assets packaged before go-live.

| Service    | Local port | URL                                                |
| ---------- | ---------- | -------------------------------------------------- |
| Web        | 5001       | `http://127.0.0.1:5001/en` or `/ar`                |
| API        | 6001       | `http://127.0.0.1:6001/api` (Swagger: `/api/docs`) |
| PostgreSQL | 5435       | `postgresql://mizano:…@127.0.0.1:5435/mizano_db`   |
| Redis      | 6380       | `redis://127.0.0.1:6380`                           |

Health: `GET /api/health`, `/api/health/ready`, `/api/health/live`.

## Commands

| Area      | Command                                                                                              | Notes                                           |
| --------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Dev       | `pnpm dev`, `pnpm dev:api`, `pnpm dev:web`                                                           | `dev:local` forces `APP_ENV=local`              |
| Build     | `pnpm build`, `pnpm build:{dev,sit,prod}`                                                            | sets `APP_ENV` for the build                    |
| Quality   | `pnpm lint`, `pnpm lint:fix`, `pnpm type-check`, `pnpm format:check`                                 | `pnpm format` rewrites files                    |
| Tests     | `pnpm test`, `pnpm test:api`, `pnpm test:web`, `pnpm test:cov`, `pnpm test:e2e`                      | E2E needs a seeded database                     |
| CI gate   | `pnpm ci:full`                                                                                       | lint + type-check + unit tests (no E2E)         |
| Database  | `pnpm db:{generate,push,migrate,seed,reset,studio,check}`                                            | `db:reset` drops data                           |
| Docker    | `pnpm docker:{up,down,logs,dev,sit,prod,prod:down}`, `pnpm status`                                   |                                                 |
| Utilities | `pnpm env:check`, `pnpm generate:types`, `pnpm generate:validators`, `pnpm clean`, `pnpm clean:full` |                                                 |
| Worktrees | `pnpm wt:new <lane> [base]`, `pnpm wt:clean`                                                         | Bash; see [worktree helpers](#worktree-helpers) |

Agent slash-command recipes live in [`.agents/workflows/`](../.agents/workflows/). The `/ci` recipe matches the `ci:full` script above: lint, type-check and unit tests; format check and E2E run separately.

## Environments

Four environment templates are tracked at the repository root. They hold placeholders (`__CHANGE_ME__`) or local-only defaults; real secrets are supplied outside source control.

| File         | `APP_ENV` | `NODE_ENV`  | Purpose                    |
| ------------ | --------- | ----------- | -------------------------- |
| `.env.local` | `local`   | development | Workstation (default)      |
| `.env.dev`   | `dev`     | development | Shared development server  |
| `.env.sit`   | `sit`     | production  | System integration testing |
| `.env.prod`  | `prod`    | production  | Production template        |

- **API** (`app.module.ts`): `ConfigModule` loads `.env.${APP_ENV || 'local'}`, then `.env`. Check with `pnpm env:check`.
- **Web**: Next.js loads its own `.env*` files from `apps/web`. Only `NEXT_PUBLIC_*` reaches the browser and is fixed at build time. `NEXT_PUBLIC_API_URL` must include the `/api` prefix (default `http://127.0.0.1:6001/api`).
- When adding a variable, add it to all four templates (secret placeholders as `__CHANGE_ME__`) and to the table below.

| Group              | Variables                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core               | `APP_ENV`, `NODE_ENV`, `API_PORT` (6001), `CORS_ORIGIN` (comma-separated; required in production), `FRONTEND_URL`                                                                                                                                                                                                                                       |
| Database           | `DATABASE_URL`, `DATABASE_POOL_SIZE`, `DATABASE_POOL_TIMEOUT`, `READ_DATABASE_URL`, `DATABASE_READ_POOL_SIZE`, `SLOW_QUERY_THRESHOLD_MS`                                                                                                                                                                                                                |
| Redis              | `REDIS_URL`                                                                                                                                                                                                                                                                                                                                             |
| Auth               | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRATION` (15m), `JWT_REFRESH_EXPIRATION` (7d), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`                                                                                                                                                                                                                            |
| Web                | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `API_INTERNAL_URL`                                                                                                                                                                                                                                                                |
| Limits             | `RATE_LIMIT_TTL`, `RATE_LIMIT_MAX`, `RATE_LIMIT_AUTH_MAX`                                                                                                                                                                                                                                                                                               |
| Logging            | `LOG_LEVEL`, `PRISMA_LOG_QUERIES` (default off)                                                                                                                                                                                                                                                                                                         |
| Legacy optional AI | `OLLAMA_BASE_URL`, `OLLAMA_ENABLED`, `OLLAMA_{TEXT,VISION,FAST,SLOW}_MODEL`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_MAX_CONCURRENT`, `OLLAMA_NUM_CTX`, `OLLAMA_NUM_THREAD`, `OLLAMA_WEBHOOK_SECRET`                                                                                                                                                               |
| Extraction         | `INTAKE_EXTRACTION_STRATEGY` (`rules`/`llm`), `INTAKE_TESSDATA_DIR`; legacy `EXTRACTION_STRATEGY` (`ocr` default; `rules`/`vlm`/`ocr-llm`/`hybrid`/`auto`/`fast`/`slow`), `EXTRACTION_OCR_CONFIDENCE_THRESHOLD`, `EXTRACTION_MAX_PDF_PAGES`, `PADDLE_OCR_{LANG,PKG_PATH,MODELS_DIR,TIMEOUT_MS}`, `PADDLE_OCR_API_{URL,TOKEN,TIMEOUT_MS}`, `PYTHON_PATH` |
| Intake jobs        | `INTAKE_STORAGE_DIR`, `INTAKE_CONCURRENCY` (default 1, range 1–4), `INTAKE_LEASE_MS`, `INTAKE_RETRY_BASE_MS`, `INTAKE_MAX_ACTIVE_JOBS`                                                                                                                                                                                                                  |
| Email              | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`                                                                                                                                                                                                                                                             |

`OCR_SERVICE_*` and `VLM_*` entries still present in `.env.local` belong to removed Python services and are not read by the code.

| Default          | Local | Dev   | SIT  | Prod |
| ---------------- | ----- | ----- | ---- | ---- |
| `LOG_LEVEL`      | debug | debug | info | warn |
| `RATE_LIMIT_MAX` | 100   | 100   | 60   | 30   |

### Logging and privacy

Logs must never contain invoice/OCR text, LLM prompts or output, credentials, bot tokens or auth headers (see [AGENTS.md](../AGENTS.md)). Log ids, counts and durations; use `describeError(error, { includeMessage: false })` from `apps/api/src/common/utils/redact.ts` when an error may include user data. `redactText()` only masks credential-shaped strings; it does not make document text or amounts safe to log.

| Variable             | Values / default                                                                                                                                      | Effect                                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOG_LEVEL`          | `verbose`, `debug`, `info` (= Nest `log`), `warn`, `error`, `fatal`, `silent`; case-insensitive. Unset or invalid: `info` in production, else `debug` | Applied at startup in `main.ts` to the NestJS logger. Each level also enables everything more severe (`warn` = fatal + error + warn). An invalid value never silences logging.                              |
| `PRISMA_LOG_QUERIES` | `true` to enable; anything else (default) is off, in every environment                                                                                | Logs each SQL statement and its duration at debug level (still subject to `LOG_LEVEL`). Off by default because Prisma's own query log prints bound parameters (amounts, tax ids, e-mails, password hashes). |

Error-log endpoints (`/api/logger/*`) and the `/logger` WebSocket require a signed-in user with the Admin-level `settings.edit` permission (`settings.delete` for clearing), see `LoggerController`. Entries are scoped to the caller's organization; entries without an organization (unauthenticated requests, schedulers) are never returned. The WebSocket handshake needs `auth: { token: <access token> }` (or an `Authorization: Bearer` header) and joins the caller's organization room only.

The historical `ollama-proxy` service (outside the Pi live path) (`services/ollama-proxy`) has no default `WEBHOOK_SECRET`: it refuses to start when the variable is missing or a placeholder such as `change-me`. Set the same value as the API's `OLLAMA_WEBHOOK_SECRET`.

## Database

- Schema: `apps/api/prisma/schema.prisma`; migrations in `apps/api/prisma/migrations/`; seed in `apps/api/prisma/seed.ts` (`prisma db seed`).
- After any schema change: `pnpm db:generate`, then `pnpm db:migrate` locally. Production applies `prisma migrate deploy` during deployment.
- The schema has one owner at a time (the coordinator). Workers request changes instead of editing it in parallel.

Troubleshooting: `docker ps` to confirm `mizano-postgres`/`mizano-redis`, `redis-cli -h 127.0.0.1 -p 6380 ping`, `pnpm env:check` for the active env file, restart `pnpm dev:web` after changing `NEXT_PUBLIC_*`.

## Testing

| Layer          | Location                                                   | Run                                                     |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| API unit       | `apps/api/src/**/*.spec.ts`                                | `cd apps/api && npx jest [--testPathPattern=…]`         |
| Web unit       | `apps/web/**/*.spec.ts(x)` (Jest + Testing Library, jsdom) | `cd apps/web && npx jest [--testPathPattern=…]`         |
| API E2E        | `apps/api/test/*.e2e-spec.ts` (supertest, `jest-e2e.json`) | `pnpm test:e2e` against a seeded database               |
| Browser E2E    | not wired yet                                              | tracked by the seeded API/browser journey issue         |
| Planning tools | `scripts/test_*.py`                                        | `python -m unittest discover -s scripts -p 'test_*.py'` |
| Docs guard     | `.github/tests/test_docs_check.py`                         | `python .github/tests/test_docs_check.py`               |
| Worktree tools | `scripts/test-wt.sh`                                       | `bash scripts/test-wt.sh`                               |

Native Windows pnpm works with the package Jest configuration. Use `cd apps/api && npx jest`
(or `pnpm test:api`) and bound workers on a small host (`--maxWorkers=2`). `_run_tests.js`,
`_jest.config.js` and `_jest_resolver.js` are a legacy WSL symlink workaround, not the
standard runner.

The API compiler (`apps/api/tsconfig.json`) enables `esModuleInterop`, matching the legacy
runner's ts-jest setting, so both runners compile imports the same way. Import callable
CommonJS modules such as `csv-parser` with a default import; a namespace import becomes an
object under this setting (`csv is not a function`). For the import regression check, run
`node apps/api/_run_tests.js --testPathPattern=import --runInBand` from the repository root,
then run `npx jest src/modules/import-export --runInBand` from `apps/api` to verify the
standard Jest configuration too. Run targeted tests serially on shared low-memory hosts.

For seeded API E2E, use a dedicated `mizano_e2e_<lane>` database on `127.0.0.1:5435`
and Redis on `127.0.0.1:6380`. Create the lane database, set `DATABASE_URL`/`REDIS_URL`
in the current shell, run `cd apps/api && npx prisma migrate deploy`, then
`npx jest --config test/jest-e2e.json --runInBand`. Never use shared/production data.
If infra is unreachable, retain the tests and report them as not run.

The documentation CI guard has offline tests:
`python .github/tests/test_docs_check.py` (Git Bash or bash required). The harness executes
**the exact Bash block extracted from ci.yml**, maps fake JSON PR payloads to its env vars,
and mocks only git diff outputs/errors; no commits, network or database are required.

Unit-test infrastructure lives in `apps/api/src/test/`: `mocks/prisma.mock.ts` (deep Prisma mock, transactions call back with the mock), `mocks/redis.mock.ts` (in-memory cache), `mocks/{sharp,tesseract}.mock.js` (heavy native/OCR libraries), `helpers/test-utils.ts` (typed factories) and `helpers/decimal.helpers.ts`. Unit tests must not need Redis, PostgreSQL, Ollama or the network.

Rules:

- After application code changes run affected specs, then full API/web suites and builds; seeded E2E/browser acceptance remains separate. Documentation-only changes need links/content/format checks and repository CI. CI/planning scripts also need offline behavior tests.
- Business-logic changes add or update tests. Financial paths assert exact Decimal values, tenant isolation (two organizations, rejected cross-tenant IDs, unchanged balances) and idempotent retries.
- Never delete assertions, skip tests or accept a 404 for a required route to get green. Infrastructure failure is reported as blocked, not passed.
- Demo go/no-go is decided by the [acceptance contract](strategy/demo-acceptance.md), not by unit-test counts or coverage.

## CI

`.github/workflows/ci.yml` runs on pushes and PRs to `master`/`develop`: install (pnpm 8, Node 20, `prisma generate`) → parallel lint/type-check, unit tests (with PostgreSQL 16 and Redis 7 services, `db:push`) and build. E2E is not part of CI yet. A separate PR-only `docs-check` job uses full checkout history and compares the event base/head SHAs.

`docs-check` fails when `apps/`, `packages/`, `deploy/` or `.github/` changes without
an added/modified Markdown file anywhere in the PR, unless the PR body contains a line
starting exactly with `Docs: not needed because`. Markdown deletion alone does not count.
PR body edits rerun it. The body is passed through an environment variable, never evaluated
as shell code. Diff failures fail the job. A green result checks presence only; reviewers
and CodeRabbit must verify every affected doc and assess exemptions.

`.github/workflows/demo-planning.yml` validates and syncs `docs/planning/` metadata with `scripts/sync-demo-planning.py`; see the [planning guide](planning/README.md).

Zero-tolerance policy: `pnpm ci:full` must pass with no warnings or errors (no `any`, no unused symbols, no `console.log` in the API, explicit return types on exports, no unexplained `eslint-disable`/`@ts-ignore`, floating promises handled).

## Git workflow

- Branch from current `master`; one issue, branch and worktree per worker (`demo/<issue>-<topic>` during the sprint). Every change goes through a PR linked to an issue, using `.github/pull_request_template.md`, with independent review of the exact tested head. Update every affected Markdown file in the same PR, or explain a behavior change without docs with `Docs: not needed because ...`; see [AGENTS.md](../AGENTS.md#documentation-is-part-of-the-change).
- Conventional commits enforced by commitlint (`commitlint.config.js`): types `feat fix docs style refactor perf test build ci chore revert`, lower-case subject, max 72 characters, no trailing period.
- Hooks (husky): `pre-commit` runs `_lint_staged.js` (ESLint `--fix` + Prettier on staged files, Windows-safe replacement for lint-staged); `commit-msg` runs commitlint; `pre-push` runs `pnpm ci:full`.
- Prettier: single quotes, semicolons, trailing commas, width 100 (`.prettierrc`).

### Worktree helpers

Use Bash (Git Bash on Windows), Git and pnpm 8.14. Run from the owning checkout:

```bash
pnpm wt:new intake           # new branch intake from cached origin/master
pnpm wt:new ledger develop   # new branch ledger from cached origin/develop
pnpm wt:clean                # remove eligible worktrees and their local branches
bash scripts/test-wt.sh      # bounded offline tests with real Git and stubbed pnpm
```

`wt:new <lane> [base]` creates `.worktrees/<lane>` with a branch named `<lane>`.
Lane names start with a letter or digit and contain only letters, digits, hyphens
and underscores, so a slashed sprint name such as `demo/<issue>-<topic>` needs a
`git branch -m` rename afterwards. Existing branches or paths are rejected. The default base is
`master`; the helpers use existing `origin/<base>` refs and never fetch. The
coordinator must refresh remote refs before use. Creation then runs
`pnpm install --offline --frozen-lockfile`, `pnpm db:generate` and
`pnpm -r --filter './packages/*' --workspace-concurrency=1 run build` inside the
new worktree. Only shared packages are built, sequentially. Populate the local
pnpm store beforehand; missing offline dependencies fail setup. A failed setup
keeps the worktree and branch for inspection and manual retry.

`wt:clean` considers registered worktrees physically inside the owning checkout's
`.worktrees/` directory. It removes only clean, unlocked worktrees with a local
branch whose tip is an ancestor of cached `origin/master`, then deletes that
branch and prints both removals. Tracked modifications, staged changes and
untracked files block removal; ignored install/build outputs do not. Unmerged,
detached, locked, missing, outside and unregistered paths are preserved. Symlinked
`.worktrees/` directories are rejected. The owning checkout is never removed.
Stop workers and release their leases before cleanup; do not run helpers
concurrently with branch/ref changes. Helpers do not migrate or reset databases.
The offline tests need no database, network, dependency installation or build.

## Deployment

**Legacy VM production pipeline** (`.github/workflows/deploy.yml`): after CI succeeds on `master` (or on release/manual dispatch) it

1. skips the rollout only for the reviewed planning-only paths in `docs/planning/rollout-exemption.json`;
2. builds `apps/api/Dockerfile` and `apps/web/Dockerfile`, pushing `ghcr.io/abdelrhmanah7/mizano-{api,web}` tagged with the short SHA and `latest`;
3. copies `docker-compose.production.yml`, `apps/api/prisma/` and `nginx/` to the VM, writes `~/mizano/.env` from repository secrets;
4. starts PostgreSQL/Redis, syncs the DB password, restarts `api`, `web`, `nginx`, then runs `prisma migrate deploy` and the idempotent seed;
5. checks `GET /api/health` over SSH.

Required secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `PRODUCTION_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NEXTAUTH_SECRET`.

The VM workflow still enables Ollama/VLM and pulls a vision model on the host. It is legacy infrastructure, not the CPU-only Pi live path. Its planning-only rollout exemption is restricted to a reviewed historical allowlist, so this docs/CI change is not guaranteed exempt from automatic VM rollout on merge. Coordinate with the lead/operator; do not redeploy the application for documentation/planning-only work. Never report a deployment as verified without health and acceptance evidence for the exact SHA.

**Legacy VM production stack** (`docker-compose.production.yml`): `api` (6001), `web` (5001, standalone Next.js), `postgres` (5432), `redis` (6379, AOF), `nginx` (80/443 using `nginx/nginx.conf`) and optional `certbot` (`--profile with-nginx`). Manual equivalent: `pnpm docker:prod` with `.env.prod`; stop with `pnpm docker:prod:down`.

**Other compose files:** `docker-compose.yml` (local PostgreSQL + Redis), `docker-compose.sit.yml` (SIT resource overrides, `pnpm docker:sit`), `docker-compose.dev.yml` (shared dev server env override).

**Operations.** Back up PostgreSQL daily, for example `docker exec mizano-postgres pg_dump -U mizano mizano_db | gzip > /backups/mizano-$(date +%Y%m%d).sql.gz`, and keep uploaded originals with the same retention. Generate secrets with `openssl rand -base64 48`; never commit them or paste them into issues.

Historical VPS sizing and provider notes: [archive/deployment-requirements-2026-03.md](archive/deployment-requirements-2026-03.md).

**Raspberry Pi 5.** The tiny live deployment (compose, Cloudflare Tunnel, digest deploys, encrypted backups, monitoring) is documented in [deploy/pi/README.md](../deploy/pi/README.md); the first demo and every release candidate are accepted with the [Pi runbook](../deploy/pi/RUNBOOK.md) (evidence-bound GO/NO-GO).
