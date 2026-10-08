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
  { tags: ['feat:mz-sales-invoices'] },
  async ({ app, agent, screen }) => {
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
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/mizano_e2e pnpm e2e:army                                     # everything
DATABASE_URL=… pnpm e2e:army e2e-army/123-vat-rate.e2e.ts                                                        # your test
DATABASE_URL=… E2E_ARMY_SKIP_SETUP=1 pnpm e2e:army --tag shard:smoke                                             # one shard, reuse the setup
```

Agent steps need a model, which is configured through the environment only (see `e2e.config.ts`). Without one, agent tests skip and locator and API tests still run. Existing Playwright and Jest E2E specs stay as plain tests.
