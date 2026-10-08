# e2e-army: Mizano's E2E gate

[tester-army/e2e](https://github.com/tester-army/e2e) tests (npm `e2e` + `@e2e-dev/web`, Apache-2.0), configured in [`../e2e.config.ts`](../e2e.config.ts) and run by `pnpm e2e:army` ([`../scripts/e2e-army.sh`](../scripts/e2e-army.sh)). The rule for PRs is in [CONTRIBUTING.md](../CONTRIBUTING.md#e2e-tests-e2e-army-blocking).

| Path                    | What                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<issue>-<flow>.e2e.ts` | A PR's own tests, tagged `feat:<feature-id>`. Self-contained: the hub's verify job copies the top-level `*.e2e.ts` files into its runner and runs them next to the feature shards. |
| `features/*.e2e.ts`     | The feature suite: every feature of the feature map has at least one test, `[<feature>.<n>]` tagged `feat:<feature>`, `shard:<shard>` and `lvl:ui` / `lvl:api` / `lvl:job`.        |
| `features/_mz.e2e.ts`   | Shared helpers of the feature suite (API client, tenants, sign-in, decimal helpers). It declares no tests.                                                                         |
| `lib.ts`                | Seeded test data (`seeded`, `seededEmail`, `seededInt`), `needsModel()` and `apiBase()`.                                                                                           |
| `cli-model.ts`          | Model adapter for agent steps through a subscription CLI (`E2E_ARMY_CLI=agy` for Gemini Flash, free, or `claude` for Haiku).                                                       |
| `shards.json`           | Shard ids (feature groups), each run within 5 minutes: `pnpm e2e:army --tag shard:<id>`.                                                                                           |

`features/`, `lib.ts` and `cli-model.ts` are ported from the hub (nql-agents `ops/verify/e2e-army/tests-dev/Mizano/`, `tests-dev/lib.ts` and `cli-model.ts`, 2026-10-08). The test files are unchanged, so they diff cleanly against the hub copy. When a test changes, change it here and in the hub.

Shards: `smoke` (sign-in, health, dashboard, landing, Arabic/RTL; it also runs for files no feature claims), browser shards `ui-*` and request-level shards `*-api`. Without a model the `ui` agent tests skip themselves (`needsModel()`), and the locator and API tests still run.
