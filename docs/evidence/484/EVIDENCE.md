# Verification report for #484 (Supersedes part of #432)

Code under test: f8f8a1bb (fix). cc101271 only trims the e2e-army test to fit the time budget.
No Sentry issue was supplied for this finding, so none is linked.

## Acceptance criteria

- AC1: every Select trigger in `bill-form.tsx` (vendor, project, expense account, item) carries `dir` equal to the locale direction.
- AC2: the opened Select listbox (portal) carries the same `dir`.
- AC3: Arabic (`/ar`, rtl) and English (`/en`, ltr) both hold; no horizontal page overflow at 375px and 1280px.

## Mapping

| AC                   | Evidence                                                                    | Observed                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1-AC3 (unit)       | `cd apps/web && npx jest --maxWorkers=2 components/purchases/bill-form`     | exit 0, 2 suites, 7 tests pass (rerun this session)                                                                                                                                |
| AC1-AC3 (regression) | new tests in `apps/web/components/purchases/bill-form.spec.tsx`             | failed on base before the fix (earlier handoff run, not re-run this session), pass on head                                                                                         |
| AC1-AC3 (browser)    | `node docs/evidence/484/verify-browser.cjs` (Chromium, ar + en, 375 + 1280) | earlier handoff run passed; screenshots `bill-{ar,en}-{375,1280}.png` in this directory                                                                                            |
| AC1-AC3 (e2e-army)   | `e2e-army/484-bill-select-rtl.e2e.ts`, tag `feat:mz-purchase-bills`         | not run locally: needs the authenticated hub runner (earlier attempt exit 2 MODEL_UNAVAILABLE). Runs in the `e2e-army` gate; first CI run hit the 420s budget, trimmed in cc101271 |

## Other checks

- `pnpm --filter web lint`: exit 0, warnings only in files this change does not touch.
- `pnpm --filter web type-check`: exit 2 from unbuilt `@mizano/shared-types` / validators declarations, same as base. `tsc` output filtered for `bill-form` shows no errors.
- Full suite and build: left to CI per owner instruction.

## Review threads

- `verify-browser.cjs` thread: marked outdated. The script now has a header documenting its dependencies and a clear error when they are missing.
- `e2e-army/484-bill-select-rtl.e2e.ts` thread: marked outdated. The test was rewritten in cc101271 and uses only the seeded demo admin on a throwaway DB.

Skills used: tdd, systematic-debugging, rtl-arabic-qa, verification-before-completion, model-effort-routing.
