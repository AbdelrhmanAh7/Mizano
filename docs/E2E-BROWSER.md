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
