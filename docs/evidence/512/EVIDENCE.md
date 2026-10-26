# Issue #512: acceptance criteria and verification report

Supersedes part of #494. Issue: https://github.com/AbdelrhmanAh7/Mizano/issues/512
Originating review: https://github.com/AbdelrhmanAh7/Mizano/pull/494#discussion_r4365495472
Sentry: no originating Sentry issue supplied in the live issue or its comments.

## Acceptance criteria

1. **AC1:** A monthly run processes an active asset whose scheduled book value plus accumulated depreciation exceeds purchase price by `0.0001`, creates one balanced journal, and links the executed schedule.
2. **AC2:** A manual run with the same residue resolves with the journal ID and amount, creates a balanced journal, and links the executed schedule.

## Verification report

Base: `4770ea7905fa2d21bc51d82da4683f82ad701bba` (fetched `origin/master`).
Tested Code Head: `1969bd21569e0b394743e54f5e7d591b38e7782d`.
The subsequent evidence commit changes documentation only.

Changed covering tests: `apps/api/src/modules/assets/services/depreciation.service.spec.ts`, describe `rounding residue (#512)`, tests prefixed `AC1:` and `AC2:`.
Fixtures reuse existing Jest/Prisma mocks and Decimal helpers: cost `2500.0000`, accumulated `1012.5000`, book `1487.5001`, charge `37.5000`. The fixture asserts the exact `0.0001` residue; `lines` verifies Decimal debit/credit equality.

| AC / check                          | Command                                                                                                          | Observed result                                                                                   | Exit      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------- |
| AC1, AC2 and existing service cases | `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/modules/assets/services/depreciation.service.spec.ts` | 20 passed, 0 failed, 0 skipped                                                                    | 0         |
| AC1, AC2 mutation probe             | Same Jest command with `--testNamePattern='rounding residue'`, temporary guard below                             | 2 failed, 18 excluded; monthly processed 0, manual rejected                                       | 1         |
| API types                           | `nice -n 10 pnpm --filter api type-check`                                                                        | Missing shared-types declarations and related logger errors; reproduced with unmodified base spec | 1 (tsc 2) |
| API lint                            | `nice -n 10 pnpm --filter api lint`                                                                              | No lint errors                                                                                    | 0         |
| Patch formatting                    | `git diff --check`                                                                                               | No whitespace errors                                                                              | 0         |

### Regression sensitivity

Both new tests pass on the base service too: master already omits the disputed guard. This is a regression lock, not a failing-on-master repair. No service code changes are needed.

Before committing, temporarily inserted this predicate inside the monthly per-asset `try`, before its transaction, and immediately before the manual transaction:

```ts
if (!scheduleEntry.bookValue.plus(scheduleEntry.accumulatedTotal).equals(asset.purchasePrice)) {
  throw new Error('Schedule sum does not equal purchase price');
}
```

The focused run failed both ACs: monthly returned `{ processed: 0, journalsCreated: 0, totalDepreciation: 0 }`; manual rejected with `Schedule sum does not equal purchase price`. A `finally` restored the original service bytes. The subsequent full changed spec passed all 20 cases. `git diff --exit-code origin/master -- apps/api/src/modules/assets/services/depreciation.service.ts` exited 0.

## Scope and limitations

E2E: not needed — tests/documentation only, with identical production behavior, as directed by the manager plan. No UI changes; Playwright screenshots and Arabic RTL/LTR checks do not apply. No full suite or application build ran locally, per the owner load rule; CI and independent review remain pending.

Callers inspected: `AssetsController.runAssetDepreciation`, `AssetsController.runMonthlyDepreciation`, and `DepreciationService.runMonthlyDepreciationCron`. Their contracts and orchestrator behavior are unchanged. No new dependency: existing Jest, Decimal, fixtures and helpers cover the finding.

Provider: OpenAI Codex (GPT-6); no additional model run launched. Intended effort: high; exact backend revision/run header is not exposed in this session. Sandbox denied the nice priority adjustment; commands still ran to the recorded exits. API type-check has a pre-existing dependency-artifact failure; it is not reported as passing.

Skills used: model-effort-routing, using-superpowers, diagnosing-bugs, systematic-debugging, typescript-best-practices, principle-type-system-discipline, verification-before-completion, principle-explain-the-number, humanizer, pr. The opencode-delegate skill was consulted; financial assertions were handled directly under the money-path exception.
