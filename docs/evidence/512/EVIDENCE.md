# Issue #512: acceptance criteria and verification report

Supersedes part of #494. Issue: https://github.com/AbdelrhmanAh7/Mizano/issues/512
Originating review: https://github.com/AbdelrhmanAh7/Mizano/pull/494#discussion_r4365495472
Sentry: no originating Sentry issue supplied in the live issue or its comments.

## Acceptance criteria

1. **AC1:** A monthly run processes an active asset whose scheduled book value plus accumulated depreciation differs from purchase price by `+0.0001` or `-0.0001`, creates one balanced journal, and links the executed schedule.
2. **AC2:** A manual run with the same residue resolves with the journal ID and amount, creates a balanced journal, and links the executed schedule.

## Verification report

Base: `4770ea7905fa2d21bc51d82da4683f82ad701bba` (fetched `origin/master`).
Round-1 tested working tree based on `2627a1ec095dd5a246caf0269f4c10463024610f`.
Spec SHA-256: `b36ab38c82590be30be324cb44a004c906c316a467eeb7cd64ebc014609fc8ba`. These round-1 edits are not yet committed.

Changed covering tests: `apps/api/src/modules/assets/services/depreciation.service.spec.ts`, describe `rounding residue (#512)`, tests prefixed `AC1:` and `AC2:`.
Fixtures reuse existing Jest/Prisma mocks and Decimal helpers: cost `2500.0000`, accumulated `1012.5000`, book `1487.5001` / `1487.4999`, charge `37.5000`. The fixture asserts each exact signed residue; `lines` verifies Decimal debit/credit equality.

| AC / check                          | Command                                                                                                          | Observed result                                                                                   | Exit      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| AC1, AC2 and existing service cases | `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/modules/assets/services/depreciation.service.spec.ts` | 22 passed, 0 failed, 0 skipped                                                                    | 0         |
| AC1, AC2 mutation probe             | Same Jest command with `--testNamePattern='rounding residue'`, temporary guard below                             | 4 failed, 18 excluded; monthly processed 0, manual rejected                                       | 1         |
| API types                           | `nice -n 10 pnpm --filter api type-check`                                                                        | Missing shared-types declarations and related logger errors; reproduced with unmodified base spec | 1 (tsc 2) |
| API lint                            | `nice -n 10 pnpm --filter api lint`                                                                              | No lint errors                                                                                    | 0         |
| Patch formatting                    | `git diff --check`                                                                                               | No whitespace errors                                                                              | 0         |

### Round-1 QA clarification

Findings `b23df970f476` and `7f7781973f16` assert that the current service retains an exact sum guard. Inspection disproves that premise: the service at HEAD and in this working tree is identical to the recorded master base. There is no guard to remove. The tests import the real service; only Prisma persistence is mocked.

| Source state                              | Exact sum guard       | Result                                  |
| ----------------------------------------- | --------------------- | --------------------------------------- |
| Recorded master base / PR service         | Absent                | All 22 changed-spec cases pass (exit 0) |
| Temporary local mutation, never committed | Artificially inserted | Four residue cases fail (exit 1)        |
| Restored PR service                       | Absent                | All 22 changed-spec cases pass (exit 0) |

The earlier report's failing output belongs exclusively to the artificial mutation, not to the PR implementation. The mutation used Decimal `bookValue.plus(accumulatedTotal).equals(purchasePrice)` and threw on inequality before each posting transaction. A `finally` restored the original bytes before the passing run. This experiment demonstrates that the tests detect reintroduction of the rejected guard.

Source verification: `git diff --exit-code 4770ea7905fa2d21bc51d82da4683f82ad701bba HEAD -- apps/api/src/modules/assets/services/depreciation.service.ts` and `git diff --exit-code -- apps/api/src/modules/assets/services/depreciation.service.ts` both exited 0. Service SHA-256: `beae95f5a7ae196ae406cdaa4098982f4c1ff46deceba18783e403d6206bba71`.

Posting paths: `depreciation.service.ts:103` (monthly transaction) and `:225` (manual transaction) proceed without a sum guard. Covering tests: `depreciation.service.spec.ts:195` parameterizes both signs; `:210` covers AC1 and `:222` covers AC2. This extends coverage without changing the already-correct production behavior. Both new tests also pass on master; a failing-on-master claim would be false.

## Scope and limitations

E2E: not needed — tests/documentation only, with identical production behavior, as directed by the manager plan. No UI changes; Playwright screenshots and Arabic RTL/LTR checks do not apply. No full suite or application build ran locally, per the owner load rule; CI and independent review remain pending.

Callers inspected: `AssetsController.runAssetDepreciation`, `AssetsController.runMonthlyDepreciation`, and `DepreciationService.runMonthlyDepreciationCron`. Their contracts and orchestrator behavior are unchanged. No new dependency: existing Jest, Decimal, fixtures and helpers cover the finding.

Provider: OpenAI Codex (GPT-6); no additional model run launched. Intended effort: high; exact backend revision/run header is not exposed in this session. Sandbox denied the nice priority adjustment; commands still ran to the recorded exits. API type-check has a pre-existing dependency-artifact failure; it is not reported as passing.

Skills used: receiving-code-review, model-effort-routing, using-superpowers, diagnosing-bugs, systematic-debugging, typescript-best-practices, principle-type-system-discipline, verification-before-completion, principle-explain-the-number, humanizer, pr. The opencode-delegate skill was consulted; financial assertions were handled directly under the money-path exception.
