# Contributing to Mizano

Read [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), [agent operations](docs/agents/README.md) and the [review lessons](docs/agents/review-lessons.md) first. Every change goes through a PR linked to an issue, using the [PR template](.github/pull_request_template.md). Setup, tests and CI are described in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Commits

Conventional commits (`feat(sales): …`, `fix(api): …`, `test(e2e-army): …`), enforced by commitlint. Write or update the test first, then the code until it passes. Keep a PR under about 300 changed lines; split bigger work into sequential issues.

## E2E tests: e2e-army (blocking)

The E2E gate is [tester-army/e2e](https://github.com/tester-army/e2e) (npm `e2e`, Apache-2.0): Playwright-based tests whose steps are written in plain language. The check `e2e-army` must be green before a PR merges.

**Every PR that touches a user flow adds or updates an `e2e-army/<issue>-<flow>.e2e.ts` test in its first commit**, with one test per feature it touches, tagged `feat:<feature-id>`. Feature ids and the files each feature owns are listed in the hub's feature map (`ops/verify/features/Mizano.json` in nql-agents). Backend-only changes need one as well; they get a request-level test. Only a pure refactor with identical behaviour may skip it, by writing `E2E: not needed — <reason>` in the PR description.

```ts
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test(
  '@issue-123 AC2: a negative VAT rate is rejected',
  { tags: ['feat:mz-sales-invoices', 'lvl:ui'] },
  async ({ app, agent, screen }) => {
    // agent steps need a model; without one (E2E_ARMY_NOAGENT=1, e.g. the GitHub job) the test skips itself
    test.skip(process.env.E2E_ARMY_NOAGENT === '1', 'no model available');
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open('/en/sales/invoices/new');
    await agent.act('fill the VAT rate with {rate} and submit the invoice', {
      params: { rate: '-5' },
    });
    await agent.assert(
      'an error says the VAT rate must not be negative and the invoice was not created',
    );
    await expect(screen.getByRole('alert')).toBeVisible();
  },
);
```

Rules for these tests:

- Import only `@e2e-dev/web` and `e2e`. The hub's verify job copies the top-level `e2e-army/*.e2e.ts` files into its own runner, so a PR test cannot import local helpers.
- Use one goal per `agent.act`, then `agent.assert` and/or an exact `expect`. API behaviour gets a request-level test (`fetch` against `process.env.E2E_ARMY_API`, no model); a job is triggered and its observable result asserted.
- Keep them deterministic: fixed data (no `Date.now()`/`Math.random()`), no sleeps (`expect.poll` for async state), throwaway data only. Sign in as the seeded demo admin (`admin@mizano.com` / `password123`, test database only). Add the Arabic/RTL check for UI text (`/ar/…`, `document.documentElement.dir === "rtl"`).
- Cover the happy path of each acceptance criterion plus one invalid or empty case. Never weaken or delete a test to get green.

The feature suite lives in `e2e-army/features/` (see [e2e-army/README.md](e2e-army/README.md)): `test("[<feature>.<n>] …", { tags: ["feat:<feature>", "shard:<shard>", "lvl:ui|api|job"] }, …)`.

Run it locally against a throwaway database:

```bash
export E2E_ARMY_DB_DISPOSABLE=1   # every run wipes and reseeds the database below
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/mizano_e2e pnpm e2e:army                                     # everything
DATABASE_URL=… pnpm e2e:army e2e-army/123-vat-rate.e2e.ts                                                        # your test
DATABASE_URL=… E2E_ARMY_SKIP_SETUP=1 pnpm e2e:army --tag shard:smoke                                             # one shard, reuse the setup
```

The runner refuses a database unless one `_`/`-` separated part of its name is exactly `test`, `e2e` or `verify`, and it needs Node `^22.22.3` or `>=24.8.0` (the `e2e` package's engines; the app itself targets Node 20).

Agent steps need a model, which is configured through the environment only (see `e2e.config.ts`). Without one, agent tests skip and locator and API tests still run. Existing Playwright and Jest E2E specs stay as plain tests.

## Git hooks (fast by design)

No git hook or CI job may exceed 5 minutes.

| Hook         | What runs                                                                                                 | Budget   | Measured (Mac mini)                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `pre-commit` | `_lint_staged.js` (ESLint `--fix` + Prettier) on staged files only; preserves unstaged hunks              | <= 60 s  | 0.3 s (staged docs) to 1.2 s (staged TS)                                                             |
| `pre-push`   | `turbo run type-check test --filter=...[<base>]` for the packages the push changes (and their dependents) | <= 290 s | 0.7 s (0 packages affected), 3.4 s (warm turbo cache replay), ~20–40 s (cold run on changed package) |

The hooks are a fast gate only. `pre-commit` runs the custom `_lint_staged.js` runner (it hard-codes its
file groups and preserves unstaged hunks in partially staged files, rather than using the `lint-staged` block
in `package.json`). The full CI is not a hook: `pnpm ci:full` runs lint, type-check and unit tests (no E2E, no build);
the hub's **localci** job runs it (plus the build), sharded, and posts the GitHub commit statuses under the
`ci.yml` job names. Feature E2E is a separate gate, the `e2e-army` commit status (see `docs/DEVELOPMENT.md`).
All of these must be green before merge. Run `pnpm ci:full` manually when you need the whole monorepo suite locally.

How `.husky/pre-push` works:

- It reads the refs git sends on stdin; `<base>` is the remote ref's old sha, or the merge-base with
  `origin/master` for a new branch. Root config changes (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
  `.npmrc`, `turbo.json`, `tsconfig*` including `tsconfig.json`, `tsconfig.base.json`, etc.) or a pushed sha that
  differs from the checked-out `HEAD` check every package.
- When the pushed changes include `apps/api/prisma/schema.prisma` the hook regenerates the Prisma client first.
- A perl watchdog kills the whole process group after 290 s (`MZ_PREPUSH_LIMIT_SECONDS` overrides it).
- A worktree without `node_modules` skips with a note instead of installing anything.
- Escape hatch: `SKIP_LOCAL_CI=1 git push` (or `HUSKY=0`); localci still runs the full CI.
- `python3 -m unittest discover -s scripts -p 'test_husky_hooks.py'` runs the real hook against a throwaway repo with
  stub tools: ref parsing, base selection (deleted ref, new branch, multi-ref, non-HEAD sha), root-config (including
  `pnpm-workspace.yaml` and `.npmrc`) and schema triggers, the skip paths, and the watchdog kill; the same file runs
  the real `pre-commit` against `_lint_staged.js` (staged files only, unstaged hunk preservation, blocking exit code,
  skip path, 60 s watchdog).

Measured on the Mac mini:

- `pre-commit`: 0.3 s on a staged docs change, ~1.2 s on staged TypeScript files (enforced <= 60 s watchdog).
- `pre-push`:
  - **No affected packages (0 tasks):** 0.7 s when pushing ref deletions or non-package changes.
  - **Warm turbo cache scenario:** 3.4 s when running type-check and tests across packages with cached artifacts (turbo replay).
  - **Cold changed package:** ~20–40 s when type-checking and testing a changed package and its direct dependents with a cold cache (cold run across all packages takes ≤ 2.5 min; enforced <= 290 s watchdog).

All measurements fit safely within the <= 60 s and <= 290 s budgets. Budgets are hard caps enforced by the watchdogs.
