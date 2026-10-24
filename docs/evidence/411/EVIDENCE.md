# Issue #411 — ACCEPTANCE CRITERIA and VERIFICATION REPORT

Supersedes part of #337. Issue: https://github.com/AbdelrhmanAh7/Mizano/issues/411.
PR: https://github.com/AbdelrhmanAh7/Mizano/pull/519.

Tested Code Head: `411b5e09031795df1d2d6a4933afa05bb014f139`.
Fetched master/base: `109ece9ec350add5e7d5a002bff6c8b457f505d5`.
The subsequent evidence commit changes documentation/screenshots only.
Provider: OpenAI Codex (GPT-6 session; exact runtime version/effort not exposed).
Routing choice: Codex · high · recurring RTL regression diagnosis.
Free mechanical delegate returned NO AVAILABLE IMPLEMENTER; no delegated patch used.

## ACCEPTANCE CRITERIA

1. **AC1:** Reject inactive expense accounts without submitting the bill.
2. **AC2:** Reject non-expense accounts; continue accepting active expense accounts.
3. **AC3:** The actual line Item/Account Select trigger and open portal use RTL in Arabic and LTR in English.
4. **AC4:** Amount/Total headers and numeric cells align to the logical end in both directions.
5. **AC5:** The line Select opens and accepts Manual Entry with an empty item list, then closes without submitting.
6. **AC6:** Arabic validation copy renders correctly in the authenticated Arabic page, without missing translation keys.
7. **AC7:** The issue-tagged purchase-bills e2e-army scenario passes against the application built from this branch.

## VERIFICATION REPORT

| AC  | Covering test / evidence                                                                                        | Observed result                                                           |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| AC1 | `bill-form.scan.spec.tsx`: rejects inactive expense account                                                     | PASS, Jest exit 0                                                         |
| AC2 | Same file: rejects invalid account type; accepts active expense account                                         | PASS, Jest exit 0                                                         |
| AC3 | New parameterized `opens the line Select…` test at line 104; real Radix, no Select mocks                        | PASS, Jest exit 0; Playwright fixture exit 0                              |
| AC4 | Same test, headers and cells at lines 116–121; computed browser alignment                                       | PASS, Jest exit 0; Playwright fixture exit 0                              |
| AC5 | Same test, keyboard open and option selection at lines 110–115; browser fixture selects empty-list Manual Entry | PASS, Jest exit 0; Playwright fixture exit 0                              |
| AC6 | Existing English/Arabic catalog-key test passes; hooks mock translations                                        | PENDING authenticated localized rendering; no translation-rendering claim |
| AC7 | Updated `e2e-army/317-searchable-bill-options.e2e.ts`, `@issue-411`, `feat:mz-purchase-bills`                   | PENDING harness; syntax diagnostics 0, exit 0; not an E2E pass            |

Commands executed on Tested Code Head:

- `nice -n 10 pnpm --filter @mizano/web exec jest --maxWorkers=2 components/purchases/bill-form.scan.spec.tsx`: **exit 0**, 13 passed, 1 suite. Changed covering test: the parameterized open-line-Select test above. Existing account regression tests remain intact.
- `nice -n 10 pnpm --filter @mizano/web lint`: **exit 0**, existing warnings outside changed files.
- `nice -n 10 pnpm --filter @mizano/web type-check`: **exit 1** (pnpm; underlying tsc exit 2). 20 diagnostics caused by missing generated `@mizano/shared-types`/`@mizano/validators` declarations and resulting unrelated logger/customer test errors. Restoring all four changed web files to master produced the identical 20 diagnostics, exit 1. No declaration stubs or CI changes added.
- `node /tmp/mz411-browser.cjs`: **exit 0**. Temporary esbuild/PostCSS fixture renders the real BillForm and Radix wrappers with repository Tailwind configuration; mocks only locale/translation hooks and vendor lookup. Playwright drives installed Chrome locally, verifies both directions and selection, and captures screenshots. This component fixture does not authenticate, access a database, or verify Arabic copy.
- `git diff --check`: **exit 0**.

Regression red/green: transplanted the new test onto the master version of `bill-form.tsx`, ran the Jest command above with `-t 'opens the line Select'`: **exit 1**, 2 failed, 11 skipped. Restored branch source; all 13 tests pass, **exit 0**. The same two tests also failed on pre-fix branch source. An initial fixture-only failure required jsdom's missing `scrollIntoView` stub before the meaningful red run.

## Root cause and screenshots

The prior commit already passes `dir` to the real line Select (`bill-form.tsx:419–420`); there is no separate expense-account dropdown. Closed-trigger tests did not prove portal behavior. Four `text-right` overrides kept numeric columns physically right-aligned in RTL. The fix uses `text-end` (`bill-form.tsx:406`, `408`, `460`, `471`). Existing `tailwindcss-rtl` resolves end to left in RTL/right in LTR; browser assertions account for that. Existing Radix positioning already works; no extra alignment override or new dependency needed.

- [Arabic-locale RTL component fixture](411-ar-rtl.png)
- [English-locale LTR component fixture](411-en-ltr.png)

Screenshots use mocked translations; English labels in RTL are existing component text, not proof of Arabic localization. The committed E2E scenario also requests full-app RTL/LTR screenshots when the harness runs it.

Full suite/build deliberately not run locally under the explicit Mizano work order. The local army launcher builds API/web during setup/start, so it was not invoked. Full CI, authenticated E2E and independent exact-head review remain harness gates. No Sentry issue was supplied or found in the originating issue/PR metadata; origin is the QA finding linked in #411, not a fabricated Sentry URL.

Callers: purchase bill `new/page.tsx:77`, `[id]/edit/page.tsx:103`, and `scan/page.tsx:812` all reuse BillForm and inherit this rendering fix; props/commands unchanged, so no orchestrator contract changes. No workflow, financial-command, schema or dependency changes.

Skills used: model-effort-routing, using-superpowers, diagnosing-bugs, systematic-debugging, test-first engineering, e2e-army, typescript-best-practices, principle-type-system-discipline, ui-headless-components, radix-ui, vercel-react-best-practices, verification-before-completion, humanizer, pr, opencode-delegate, ai-peak-hours. Lease: scoped to #411 for this session; released at handoff. Next: harness pushes local commits to #519 and runs pending gates.
