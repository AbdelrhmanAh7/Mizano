# Development guide

Setup, environments, database, testing, CI, git workflow and deployment for Mizano. Architecture and coding rules are in [ARCHITECTURE.md](ARCHITECTURE.md); UI rules in [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md); agent process in [AGENTS.md](../AGENTS.md).

## Prerequisites

- Node 20 (CI and Docker images use Node 20; `engines` allows >=18)
- pnpm 8.14 via `corepack enable` (pinned in `packageManager`)
- Docker with Compose for PostgreSQL 16 and Redis 7
- Python 3 only for the planning scripts in `scripts/`

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

Never initialize, migrate or reset a shared or production database from a workstation. AI routes need an inference backend (`OLLAMA_BASE_URL`) until the CPU extraction work lands; they return errors rather than fake results when it is missing.

| Service    | Local port | URL                                                |
| ---------- | ---------- | -------------------------------------------------- |
| Web        | 5001       | `http://localhost:5001/en` or `/ar`                |
| API        | 6001       | `http://localhost:6001/api` (Swagger: `/api/docs`) |
| PostgreSQL | 5435       | `postgresql://mizano:…@localhost:5435/mizano_db`   |
| Redis      | 6380       | `redis://localhost:6380`                           |

Health: `GET /api/health`, `/api/health/ready`, `/api/health/live`.

## Commands

| Area      | Command                                                                                              | Notes                                   |
| --------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Dev       | `pnpm dev`, `pnpm dev:api`, `pnpm dev:web`                                                           | `dev:local` forces `APP_ENV=local`      |
| Build     | `pnpm build`, `pnpm build:{dev,sit,prod}`                                                            | sets `APP_ENV` for the build            |
| Quality   | `pnpm lint`, `pnpm lint:fix`, `pnpm type-check`, `pnpm format:check`                                 | `pnpm format` rewrites files            |
| Tests     | `pnpm test`, `pnpm test:api`, `pnpm test:web`, `pnpm test:cov`, `pnpm test:e2e`                      | E2E needs a seeded database             |
| CI gate   | `pnpm ci:full`                                                                                       | lint + type-check + unit tests (no E2E) |
| Database  | `pnpm db:{generate,push,migrate,seed,reset,studio,check}`                                            | `db:reset` drops data                   |
| Docker    | `pnpm docker:{up,down,logs,dev,sit,prod,prod:down}`, `pnpm status`                                   |                                         |
| Utilities | `pnpm env:check`, `pnpm generate:types`, `pnpm generate:validators`, `pnpm clean`, `pnpm clean:full` |                                         |

Agent slash-command recipes for these live in [`.agents/workflows/`](../.agents/workflows/).

## Environments

Four environment templates are tracked at the repository root. They hold placeholders (`__CHANGE_ME__`) or local-only defaults; real secrets are supplied outside source control.

| File         | `APP_ENV` | `NODE_ENV`  | Purpose                    |
| ------------ | --------- | ----------- | -------------------------- |
| `.env.local` | `local`   | development | Workstation (default)      |
| `.env.dev`   | `dev`     | development | Shared development server  |
| `.env.sit`   | `sit`     | production  | System integration testing |
| `.env.prod`  | `prod`    | production  | Production template        |

- **API** (`app.module.ts`): `ConfigModule` loads `.env.${APP_ENV || 'local'}`, then `.env`. Check with `pnpm env:check`.
- **Web**: Next.js loads its own `.env*` files from `apps/web`. Only `NEXT_PUBLIC_*` reaches the browser and is fixed at build time. `NEXT_PUBLIC_API_URL` must include the `/api` prefix (default `http://localhost:6001/api`).
- When adding a variable, add it to all four templates (secret placeholders as `__CHANGE_ME__`) and to the table below.

| Group        | Variables                                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core         | `APP_ENV`, `NODE_ENV`, `API_PORT` (6001), `CORS_ORIGIN` (comma-separated; required in production), `FRONTEND_URL`                                                                                                               |
| Database     | `DATABASE_URL`, `DATABASE_POOL_SIZE`, `DATABASE_POOL_TIMEOUT`, `READ_DATABASE_URL`, `DATABASE_READ_POOL_SIZE`, `SLOW_QUERY_THRESHOLD_MS`                                                                                        |
| Redis        | `REDIS_URL`                                                                                                                                                                                                                     |
| Auth         | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRATION` (15m), `JWT_REFRESH_EXPIRATION` (7d), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`                                                                                                    |
| Web          | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `API_INTERNAL_URL`                                                                                                                                        |
| Limits       | `RATE_LIMIT_TTL`, `RATE_LIMIT_MAX`, `RATE_LIMIT_AUTH_MAX`                                                                                                                                                                       |
| Logging      | `LOG_LEVEL`, `PRISMA_LOG_QUERIES` (default off)                                                                                                                                                                                 |
| AI (current) | `OLLAMA_BASE_URL`, `OLLAMA_ENABLED`, `OLLAMA_{TEXT,VISION,FAST,SLOW}_MODEL`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_MAX_CONCURRENT`, `OLLAMA_NUM_CTX`, `OLLAMA_NUM_THREAD`, `OLLAMA_WEBHOOK_SECRET`                                       |
| Extraction   | `EXTRACTION_STRATEGY` (`vlm`/`ocr-llm`/`hybrid`), `EXTRACTION_OCR_CONFIDENCE_THRESHOLD`, `EXTRACTION_MAX_PDF_PAGES`, `PADDLE_OCR_{LANG,PKG_PATH,MODELS_DIR,TIMEOUT_MS}`, `PADDLE_OCR_API_{URL,TOKEN,TIMEOUT_MS}`, `PYTHON_PATH` |
| Email        | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`                                                                                                                                     |

`OCR_SERVICE_*` and `VLM_*` entries still present in `.env.local` belong to removed Python services and are not read by the code.

| Default          | Local | Dev   | SIT  | Prod |
| ---------------- | ----- | ----- | ---- | ---- |
| `LOG_LEVEL`      | debug | debug | info | warn |
| `RATE_LIMIT_MAX` | 100   | 100   | 60   | 30   |

### Logging and privacy

Logs must never contain invoice/OCR text, LLM prompts or output, credentials, bot tokens or auth headers (see [AGENTS.md](../AGENTS.md)). Log ids, counts and durations; use `describeError()` / `redactText()` from `apps/api/src/common/utils/redact.ts` for errors and any text that must appear.

| Variable             | Values / default                                                                                                                                      | Effect                                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOG_LEVEL`          | `verbose`, `debug`, `info` (= Nest `log`), `warn`, `error`, `fatal`, `silent`; case-insensitive. Unset or invalid: `info` in production, else `debug` | Applied at startup in `main.ts` to the NestJS logger. Each level also enables everything more severe (`warn` = fatal + error + warn). An invalid value never silences logging.                              |
| `PRISMA_LOG_QUERIES` | `true` to enable; anything else (default) is off, in every environment                                                                                | Logs each SQL statement and its duration at debug level (still subject to `LOG_LEVEL`). Off by default because Prisma's own query log prints bound parameters (amounts, tax ids, e-mails, password hashes). |

Error-log endpoints (`/api/logger/*`) and the `/logger` WebSocket require a signed-in user with the Admin-level `settings.edit` permission (`settings.delete` for clearing), see `LoggerController`. Entries are scoped to the caller's organization; entries without an organization (unauthenticated requests, schedulers) are never returned. The WebSocket handshake needs `auth: { token: <access token> }` (or an `Authorization: Bearer` header) and joins the caller's organization room only.

The `ollama-proxy` container (`services/ollama-proxy`) has no default `WEBHOOK_SECRET`: it refuses to start when the variable is missing or a placeholder such as `change-me`. Set the same value as the API's `OLLAMA_WEBHOOK_SECRET`.

### Payslip PDF export

Generate a deterministic, single-page payslip PDF in Arabic (default) or English using exact decimal strings:

```bash
# Arabic export (default)
curl -s -H "Authorization: Bearer <ACCESS_TOKEN>" \
  "http://localhost:6001/api/payslips/<PAYSLIP_ID>/pdf?lang=ar" \
  --output payslip-ar.pdf

# English export
curl -s -H "Authorization: Bearer <ACCESS_TOKEN>" \
  "http://localhost:6001/api/payslips/<PAYSLIP_ID>/pdf?lang=en" \
  --output payslip-en.pdf
```

## Database

- Schema: `apps/api/prisma/schema.prisma`; migrations in `apps/api/prisma/migrations/`; seed in `apps/api/prisma/seed.ts` (`prisma db seed`).
- After any schema change: `pnpm db:generate`, then `pnpm db:migrate` locally. Production applies `prisma migrate deploy` during deployment.
- The schema has one owner at a time (the coordinator). Workers request changes instead of editing it in parallel.

Troubleshooting: `docker ps` to confirm `mizano-postgres`/`mizano-redis`, `redis-cli -p 6380 ping`, `pnpm env:check` for the active env file, restart `pnpm dev:web` after changing `NEXT_PUBLIC_*`.

## Testing

| Layer          | Location                                                   | Run                                                     |
| -------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| API unit       | `apps/api/src/**/*.spec.ts`                                | `node apps/api/_run_tests.js [--testPathPattern=…]`     |
| Web unit       | `apps/web/**/*.spec.ts(x)` (Jest + Testing Library, jsdom) | `cd apps/web && npx jest [--testPathPattern=…]`         |
| API E2E        | `apps/api/test/*.e2e-spec.ts` (supertest, `jest-e2e.json`) | `pnpm test:e2e` against a seeded database               |
| Browser E2E    | not wired yet                                              | tracked by the seeded API/browser journey issue         |
| Planning tools | `scripts/test_*.py`                                        | `python -m unittest discover -s scripts -p 'test_*.py'` |

`_run_tests.js`, `_jest.config.js` and `_jest_resolver.js` make the API suite resolve pnpm's store on Windows/WSL; use them instead of calling Jest directly.

Unit-test infrastructure lives in `apps/api/src/test/`: `mocks/prisma.mock.ts` (deep Prisma mock, transactions call back with the mock), `mocks/redis.mock.ts` (in-memory cache), `mocks/{sharp,tesseract}.mock.js` (heavy native/OCR libraries), `helpers/test-utils.ts` (typed factories) and `helpers/decimal.helpers.ts`. Unit tests must not need Redis, PostgreSQL, Ollama or the network.

Rules:

- After any change run the affected spec, then the full API and web suites before finishing.
- Business-logic changes add or update tests. Financial paths assert exact Decimal values, tenant isolation (two organizations, rejected cross-tenant IDs, unchanged balances) and idempotent retries.
- Never delete assertions, skip tests or accept a 404 for a required route to get green. Infrastructure failure is reported as blocked, not passed.
- Demo go/no-go is decided by the [acceptance contract](strategy/demo-acceptance.md), not by unit-test counts or coverage.

## CI

Checks on PRs and pushes to `master`, by source:

- **`.github/workflows/ci.yml` (GitHub-hosted runners):** runs on pushes to `master` and on PRs to `master`/`develop`, on GitHub-hosted runners only (`ubuntu-latest`; free and unlimited because the repository is public; no self-hosted labels, no secrets beyond `GITHUB_TOKEN`). Four independent parallel jobs, each limited to 5 minutes (`timeout-minutes: 5`; split a job rather than raising the limit): **Install Dependencies** (pnpm 8, Node 20, `prisma generate`), **Lint & Type Check**, **Unit Tests** (PostgreSQL 16 and Redis 7 service containers, `db:push`) and **Build**. Their names are the check names the automerge gates wait for, so keep them stable. A newer push to a PR cancels its older run. The workflow uses `pull_request` (never `pull_request_target`); fork PRs run only after approval in the repository settings. E2E is not part of this workflow. `deploy.yml` stays disabled (it needs deployment secrets).
- **Hub `localci` job (Mac mini):** runs the full CI (`pnpm ci:full`: lint, type-check, test, build) locally and posts GitHub commit statuses under the same job names, so the gates see the same check names whichever runner produced them.
- **`e2e-army` status (hub verify suite):** feature-level E2E for the features a PR touches, run by the hub against a throwaway environment; it is a separate commit status, not a job in `ci.yml`.
- **Local pre-push hook:** only fast checks (`turbo run type-check test --filter=...[<base>]`, see Git workflow below); full CI, build and E2E are left to the sources above.

`.github/workflows/demo-planning.yml` validates and syncs `docs/planning/` metadata with `scripts/sync-demo-planning.py`; see the [planning guide](planning/README.md).

Zero-tolerance policy: `pnpm ci:full` must pass with no warnings or errors (no `any`, no unused symbols, no `console.log` in the API, explicit return types on exports, no unexplained `eslint-disable`/`@ts-ignore`, floating promises handled).

## Git workflow

- Branch from current `master`; one issue, branch and worktree per worker (`demo/<issue>-<topic>` during the sprint). Every change goes through a PR linked to an issue, using `.github/pull_request_template.md`, with independent review of the exact tested head.
- Conventional commits enforced by commitlint (`commitlint.config.js`): types `feat fix docs style refactor perf test build ci chore revert`, lower-case subject, max 72 characters, no trailing period.
- Hooks (husky): `pre-commit` runs `_lint_staged.js` (ESLint `--fix` + Prettier on staged files, Windows-safe replacement for lint-staged); `commit-msg` runs commitlint; `pre-push` runs `turbo run type-check test --filter=...[<base>]` (type-check + unit tests for the changed packages and their dependents — every package when root config such as `package.json`/`pnpm-lock.yaml`/`turbo.json` changes, or when the pushed commit differs from checked-out HEAD; ~20–40 s, ≤ 2.5 min cold for all packages; no lint, build or E2E). Both hooks run under a watchdog: 60 s for pre-commit, 290 s for pre-push (the 5-minute rule). The full CI (`pnpm ci:full`, build, E2E) runs on CI / via the hub's `localci` job, which posts the GitHub commit statuses. Hooks work in linked worktrees and skip with a one-line note when that worktree has no `node_modules` (they never install); bypass deliberately with `HUSKY=0` (or `SKIP_LOCAL_CI=1` for pre-push).
- Prettier: single quotes, semicolons, trailing commas, width 100 (`.prettierrc`).

## Deployment

**Production pipeline** (`.github/workflows/deploy.yml`): after CI succeeds on `master` (or on release/manual dispatch) it

1. skips the rollout only for the reviewed planning-only paths in `docs/planning/rollout-exemption.json`;
2. builds `apps/api/Dockerfile` and `apps/web/Dockerfile`, pushing `ghcr.io/abdelrhmanah7/mizano-{api,web}` tagged with the short SHA and `latest`;
3. copies `docker-compose.production.yml`, `apps/api/prisma/` and `nginx/` to the VM, writes `~/mizano/.env` from repository secrets;
4. starts PostgreSQL/Redis, syncs the DB password, restarts `api`, `web`, `nginx`, then runs `prisma migrate deploy` and the idempotent seed;
5. checks `GET /api/health` over SSH.

Required secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `PRODUCTION_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NEXTAUTH_SECRET`.

The workflow still pulls an Ollama vision model on the host; the CPU-only demo mandate replaces that through the deployment/runtime issues (immutable digest deploys, restore and rollback evidence). Never report a deployment as verified without health and acceptance evidence for the exact SHA.

**Production stack** (`docker-compose.production.yml`): `api` (6001), `web` (5001, standalone Next.js), `postgres` (5432), `redis` (6379, AOF), `nginx` (80/443 using `nginx/nginx.conf`) and optional `certbot` (`--profile with-nginx`). Manual equivalent: `pnpm docker:prod` with `.env.prod`; stop with `pnpm docker:prod:down`.

**Other compose files:** `docker-compose.yml` (local PostgreSQL + Redis), `docker-compose.sit.yml` (SIT resource overrides, `pnpm docker:sit`), `docker-compose.dev.yml` (shared dev server env override).

**Operations.** Back up PostgreSQL daily, for example `docker exec mizano-postgres pg_dump -U mizano mizano_db | gzip > /backups/mizano-$(date +%Y%m%d).sql.gz`, and keep uploaded originals with the same retention. Generate secrets with `openssl rand -base64 48`; never commit them or paste them into issues.

Historical VPS sizing and provider notes: [archive/deployment-requirements-2026-03.md](archive/deployment-requirements-2026-03.md).

**Raspberry Pi 5.** The tiny live deployment (compose, Cloudflare Tunnel, digest deploys, encrypted backups, monitoring) is documented in [deploy/pi/README.md](../deploy/pi/README.md).
