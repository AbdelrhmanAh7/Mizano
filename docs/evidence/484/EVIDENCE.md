# Issue #484 verification report

Issue: https://github.com/AbdelrhmanAh7/Mizano/issues/484
Supersedes part of #432: https://github.com/AbdelrhmanAh7/Mizano/pull/432

Tested code head: `f8f8a1bb2e6847ce6d6f838ac9824cd005727ede`.
Fetched master/base: `bcdf37040c26fc9cff56a95dd4fd44daa4960351`.
Later evidence-only commits do not change the tested code.

## ACCEPTANCE CRITERIA

1. **AC1 / REQ-484-1:** Arabic bill Select triggers and opened listboxes use `rtl`, including the line-item control and empty/manual-entry cases.
2. **AC2 / REQ-484-2:** English bill Select triggers and opened listboxes retain `ltr`; manual entry remains selectable.
3. **AC3 / REQ-484-3:** Demonstrate the regression failing before the fix and passing afterward; capture RTL/LTR dropdown screenshots at 375px and 1280px. The authenticated e2e-army gate must pass before merge.

## VERIFICATION REPORT

| AC       | Evidence                                                                                                                         | Observed result                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1      | `bill-form.spec.tsx`, Arabic case, all four real Radix triggers and portals                                                      | Before fix: exit 1, expected `rtl`, received `ltr`; English passed. After fix: exit 0.                                                          |
| AC2      | Same spec, English case; both locales select Manual Entry with no items                                                          | Exit 0.                                                                                                                                         |
| AC1, AC2 | `node docs/evidence/484/verify-browser.cjs`                                                                                      | Exit 0; all four triggers/listboxes have expected direction at both widths; no page horizontal overflow in all four cases.                      |
| AC3      | Targeted Jest command below                                                                                                      | Exit 0, 2 suites / 7 tests passed on tested code head. Red run used unchanged base implementation at `eeb1a8ab` before editing production code. |
| AC3      | [Arabic 375](bill-ar-375.png), [Arabic 1280](bill-ar-1280.png), [English 375](bill-en-375.png), [English 1280](bill-en-1280.png) | Actual Playwright Chromium 1.63.0 full-page component screenshots, dropdown open.                                                               |
| AC3      | New `e2e-army/484-bill-select-rtl.e2e.ts`, tagged `feat:mz-purchase-bills`, `lvl:ui`                                             | **PENDING** authenticated gate. Exact test collected locally; exit 2 `MODEL_UNAVAILABLE` before test execution. No E2E pass claimed.            |

Commands run against the tested code head:

```sh
nice -n 10 pnpm --filter @mizano/web exec jest components/purchases/bill-form.spec.tsx components/purchases/bill-form.scan.spec.tsx --maxWorkers=2
pnpm --filter @mizano/web lint
pnpm --filter @mizano/web type-check
node docs/evidence/484/verify-browser.cjs
```

- Jest: exit 0, 7 passed. Base regression command used only `components/purchases/bill-form.spec.tsx`: exit 1, 1 failed / 1 passed.
- Lint: exit 0, existing warnings in unrelated CRM/manufacturing/projects/purchases/tax/hooks files; no new warnings in changed files.
- Type-check: pnpm exit 1 (tsc exit 2), **same on base and head**. Workspace packages `@mizano/shared-types` and `@mizano/validators` have absent built declarations; errors surface in logger files and customer-form specs. No full build attempted, per owner directive.
- Browser: exit 0 outside sandbox; initial sandbox launch exited 1 with macOS Mach port permission denial. Browser fixture bundles the real BillForm, real Radix and next-intl using existing esbuild/Tailwind; only vendor lookup is stubbed. It tests the component, not login/backend integration. Set `E2E_ARMY_NODE_MODULES` if the hub runner dependencies are elsewhere.
- E2E attempt: copied the exact committed test into `/tmp/mz484-army`, linked hub runner dependencies, configured `tests: ['*.e2e.ts']`, web target `http://127.0.0.1:5001`, workers 1, retries 0. Ran `nice -n 10 /tmp/mz484-army/node_modules/.bin/e2e run --config /tmp/mz484-army/e2e.config.ts /tmp/mz484-army/484-bill-select-rtl.e2e.ts --workers 1 --reporter list`: exit 2, model unavailable. Earlier sandbox attempt exited 3 at browser launch. CI must provide the throwaway stack, credentials and approved model.

## Coverage and limits

Changed covering tests: new `bill-form.spec.tsx` and `484-bill-select-rtl.e2e.ts`; existing `bill-form.scan.spec.tsx` adds the required locale mock and its five tests pass. No production dependency added: reuse next-intl 4.8.3, Radix Select 2.2.6 and `localeDirections`.

Callers: new bill, edit bill and scan-review pages all render BillForm; its public contract is unchanged. No orchestrator or API change applies. Current code has no expense-account dropdown; the line-item Item/Account Select is the matching control. The other two issue items are review-handling boilerplate without a concrete reproducible finding.

No originating Sentry issue was supplied or linked in issue #484 (live issue/comments checked); do not invent one. Source is PR #432.

Screen | viewport | issue | selector | fix: BillForm component | 375/1280 | Radix defaults to LTR | all comboboxes/listboxes | pass locale direction to Select roots. Screenshots retain existing English labels on the Arabic tree; translation changes are outside this issue. Authenticated new/edit/scan screens, screenshot baseline comparison, full tab order and unbroken-token stress were not verified. Full suite/build are deferred to CI by owner instruction.

Provider: OpenAI Codex / GPT-6; exact runtime model version is not exposed. Chosen effort: high. Free delegate `d-mvngriyf4f3b` returned NO AVAILABLE IMPLEMENTER; no generated work accepted. Independent cross-provider review remains pending; self-check is not approval.

Skills used: model-effort-routing, using-superpowers, diagnosing-bugs, systematic-debugging, tdd/test-first engineering, e2e-army, rtl-arabic-qa, typescript-best-practices, ui-headless-components, radix-ui, opencode-delegate (unavailable), verification-before-completion, humanizer, pr. No deployment or PR publication performed.
