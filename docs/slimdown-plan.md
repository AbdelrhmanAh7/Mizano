# Mizano slim-down plan (2026-10-10)

Owner request (2026-10-10): make development, testing and code review faster, as for NileQuant. Mizano is **not** built
wrong, so this is a careful trim: no pilot feature is removed or changed. Pilot scope comes from
[strategy/vision.md](strategy/vision.md) and [roadmap.md](roadmap.md) (core ledger, AP/AR, reports, Arabic/English,
invoice intake/bill scan) and from the hub's feature inventory (`ops/verify/features/Mizano.json`, 79 features, 22 MVP).

Targets: PR CI under 5 minutes wall; unit tests only where they guard real logic (accounting, VAT/tax, ledger,
journals, currency/rounding, reports and intake math stay fully tested); the hub's `e2e-army` suite is the main
browser gate; unused dependencies removed and the lockfile trimmed.

## Evidence (master `cc1443b`, before)

| Measure | Value |
| --- | --- |
| Code LOC (non-blank; ts/tsx/js/css/sql/sh/yml/py/prisma) | 248,035 in 1,491 tracked files. `apps/api/src` 113,010 (of which `modules/ai` 55,097), `apps/web` 99,173, `apps/api/prisma` 8,327, `packages` 4,589 |
| Direct dependencies | 178 (root 9, api 90, web 74, packages 5); 1,845 packages in `pnpm-lock.yaml` (16,135 lines) |
| Unit tests (run in PR CI) | api: 136 suites / 2,197 tests (13.6 s locally); web: 48 suites / 458 tests (5.6 s) |
| API e2e-specs (`apps/api/test`, 11 files / 203 tests) | **never run anywhere**: jest `rootDir: src` excludes them and no workflow calls `test:e2e` |
| e2e-army | blocking suite 7 tests (`tests/Mizano.e2e.ts`); staging suite 147 tests over all 79 features (`tests-dev/Mizano`) |
| CI (`ci.yml`, 14 days) | 256 runs: 225 success, 14 failure, 3 cancelled, 14 action_required. Wall median 2.6 min, p90 2.8 min (30 PR runs sampled); 7.0 runner-min per run (9 billed-min, rounded per job) |
| CI jobs (median) | Build 2.6 min (`next build` 123 s, no build cache), Lint & Type Check 2.0 min (ESLint 38 s, tsc 51 s), Unit Tests 1.8 min (service containers 22 s + `db:push` 5 s + jest 53 s), Install Dependencies 0.6 min. No flaky job in the sample (0 failures in 23 completed PR runs) |
| Other workflows | `claude.yml` 954 runs/14 d (99 % skipped by its `if`); `deploy.yml` (GCP VM) disabled manually; `ai-implementers.yml` disabled (the hub replaced it); `demo-planning.yml` disabled, 0 runs |
| Committed generated files | none large: the only big files are `apps/api/{eng,ara}.traineddata` (7.5 MB), which are runtime OCR assets for bill scan (tesseract.js reads them from the API's working directory) and stay |

Dead code was found with `knip` (custom entry config for Nest + Next app router) and cross-checked with `git grep`
and against the diffs of all open PRs, so nothing an open PR builds on is removed.

## Keep / remove / simplify

### PR 1 — dead code, dependencies, retired deployment (this PR)

| Item | Decision | Evidence |
| --- | --- | --- |
| `.github/workflows/deploy.yml`, `docs/planning/rollout-exemption.json` | remove | GCP VM pipeline, disabled; production is the Mac mini (hub release job). The exemption file only fed `deploy.yml` |
| `deploy/pi/` (compose, systemd, scripts) | remove | owner 2026-10-10: all projects moved off the Pi, no Pi fallback |
| `.github/workflows/ai-implementers.yml` | remove | disabled; the Thoth hub runs the engineers |
| `.github/workflows/demo-planning.yml`, `scripts/*demo*planning*.py` (3 files) | remove | disabled, 0 runs in 14 days; the one-off sync already succeeded; the manifest stays in `docs/planning/` |
| Storybook (`.storybook/`, 10 `*.stories.tsx`, 6 packages, 2 scripts) | remove | never built in CI or by the hub; UI is covered by `e2e-army` |
| api deps `brain.js`, `ml-naivebayes`, `onnxruntime-node`, `form-data`, `ts-loader` | remove | no import anywhere (`knip` + grep); `ts-loader` is unused because `nest-cli.json` builds with SWC |
| web deps `react-dropzone`, `@types/react-dropzone`, `@testing-library/user-event` | remove | no import anywhere |
| 43 unused source files (api: unused DTOs, barrels, `base-crud.service`, `where-builder`, `date-filter`, `transform.interceptor`, `paddle-ocr-api.service`, `batch-processor`, `pdf-to-images`, redis mock; web: 20 unused hooks/components/utils) | remove | `knip` "unused files", no import in master or in any open PR |
| `common/utils/decimal.ts`, AI DTOs/`ai-alerts.tsx` used by PR #99, dashboard charts and `use-formatters` used by PR #84 | keep | unused on master but open PRs build on them |
| `apps/api/{eng,ara}.traineddata`, `services/ollama-proxy`, docker-compose files, `nginx/` | keep | runtime OCR assets / local dev stack / referenced by docs |

### PR 2 — test pruning (supersedes #155)

| Item | Decision | Evidence |
| --- | --- | --- |
| #155's changes (`command.spec`, `use-bulk-action.spec`, the `transformJournal` copy in `journals/page.spec`) | remove | trivial library wiring, mock-only, tautology (tests a copy of production code) |
| 11 API e2e-specs (203 tests) | move to a **nightly** workflow (Postgres + Redis, `db:push`, seed) | they guard money/ledger/tenancy end to end but never ran; nightly makes them run without slowing PRs |
| Web page/component render specs for non-pilot screens (HR, payroll, attendance, assets, manufacturing, bank transactions/accounts, AI insights detail, logger dashboard, sidebar, breadcrumbs, stat card) | remove | mock-only rendering, duplicated by `e2e-army` staging tests (people, banking, inventory, platform, ai suites cover each feature) |
| API specs of out-of-pilot HR/CRM/ops AI services (skills gap, compensation, workforce scheduling, attrition, route optimisation, predictive maintenance, quality prediction, voice command, sentiment, contract analysis, churn, CLV, cross-sell, lead scoring, dynamic pricing, pipeline forecast, resource optimisation) | remove | features with `mvp: false`, outside the pilot ("full ERP breadth … stay out of scope"), tests mock Prisma and only re-assert scoring constants |
| Accounting, sales, purchases, tax/VAT, banking, reconciliation, currency, reports, inventory valuation, intake/extraction, auth/tenancy guards, AI math utils, finance AI (cash flow, payment prediction, anomaly/fraud, audit risk, compliance) | **keep** | real domain logic; owner rule for Mizano |

### PR 3 — CI consolidation and caching

| Item | Decision | Evidence |
| --- | --- | --- |
| Unit Tests: Postgres/Redis service containers and `db:push` | remove | all 2,655 unit tests pass with an unreachable `DATABASE_URL`/`REDIS_URL` (verified locally); saves ~30 s and two containers per run |
| Build: `.next/cache` + turbo cache | add (`actions/cache`) | `next build` is the critical path (123 s) and starts cold every run |
| Lint & Type Check: turbo cache | add | unchanged packages (`shared-types`, `validators`) are re-linted every run |
| Job names (`Install Dependencies`, `Lint & Type Check`, `Unit Tests`, `Build`) | keep | the hub's local-CI and automerge gates require these exact contexts |
| `claude.yml` | keep | the owner's Claude review; its runs are skipped jobs (no runner minutes) |

## Results

Filled in as each PR merges (before → after): LOC, test counts, CI minutes per PR, dependency count.

| Measure | Before | After PR 1 |
| --- | --- | --- |
| Code LOC | 248,035 | 239,654 |
| Tracked files | 1,491 | 1,416 |
| Direct dependencies | 178 | 164 |
| Lockfile packages / lines | 1,845 / 16,135 | 1,615 / 13,999 |
