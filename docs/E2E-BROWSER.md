# Browser journeys (Playwright)

Real Chromium clicking through Jarda, replacing the paid TestSprite runs. Free, in the repo, and run on every pull request
(`Browser Journeys` job in `.github/workflows/ci.yml`; it is not one of the four required checks). The Jest suites stay the
fast gate; `e2e-army/` is the separate API-level suite.

| Path                                               | What                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `specs/jarda-journeys.md`                          | The plan, written by the Playwright **planner**                                                                            |
| `e2e-browser/tests/*.spec.ts`                      | The tests, written by the **generator** and kept stable by the **healer**                                                  |
| `e2e-browser/support/`                             | `registerAccount` (fresh organization, `*@example.test`, random password), `signIn`, and API helpers that create documents |
| `e2e-browser/docker-compose.yml`, `env.ts`         | Throwaway Postgres (5499) and Redis (6499), API on 6101, web on 5101; values that only work locally                        |
| `.claude/agents/playwright-test-*.md`, `.mcp.json` | The three test agents for Claude Code (`npx playwright init-agents --loop=claude`)                                         |

No shared passwords, no API keys, no public URL, no AI (AI is off by default in Jarda).

```bash
pnpm e2e:up     # Prisma client, shared packages, Postgres + Redis, migrations (needs Docker)
pnpm e2e        # all journeys; the API and web dev servers start by themselves
pnpm e2e:down   # stops the stack; its data lives in memory and is gone
```

Rules: every test creates its own account; never weaken an assertion to hide a product bug: a real bug becomes a GitHub issue
labelled `bug` and the test is `test.fixme` with the issue number until it is fixed.

## Tags, output rule and running against a deployed copy

- `@happy` journeys run on every pull request (`pnpm e2e:happy`); `@edge` failure cases run nightly (`.github/workflows/e2e-nightly.yml`, `pnpm e2e:edge`).
- A happy test passes only when the **output** is what was expected: exact totals, VAT, statuses, balances and report figures, written in the test from a
  hand calculation (see `e2e-browser/tests/golden.spec.ts`, which reuses the exact cases of `docs/strategy/demo-acceptance.md`). A 200 or a page that loads is never a pass.
- Same suite against a deployed copy: `E2E_BASE_URL=https://app.example E2E_API_URL=https://app.example/api pnpm e2e:happy`. No servers are started and the
  seed is never run: each account registers its own organization named **QA Production Check <id>** with `*@example.test` addresses.
  Removing those organizations afterwards is not automated yet: see the status file (NEEDS-ORCHESTRATOR).
