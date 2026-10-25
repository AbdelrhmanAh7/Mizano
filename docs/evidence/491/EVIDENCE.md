# Issue #491 — acceptance criteria and verification report

Supersedes part of #408. Closes #491 when the blocking hub checks pass.

- Issue: [#491](https://github.com/AbdelrhmanAh7/Mizano/issues/491), open with no comments when checked.
- Origin: [PR #408 finding](https://github.com/AbdelrhmanAh7/Mizano/pull/408#issuecomment-6347991706).
- Originating Sentry issue: unavailable; no Sentry URL was supplied in the issue. No link invented.
- Base: `bcdf37040c26fc9cff56a95dd4fd44daa4960351` (fetched `origin/master`).
- Tested Code Head: `0e336bea19ec14aae3dbbbb1d9cb1d115cc6f89a`, branch `ai/491`.
- Runtime: Node v26.10.0, pnpm 8.14.0, React 18.3.1, next-intl 4.8.3.

## Numbered acceptance criteria

1. **AC1 / REQ-491-1:** English create/edit forms expose distinct visible and accessible names, “Create Customer” / “Update Customer”.
2. **AC2 / REQ-491-2:** Arabic create/edit names are “إنشاء عميل” / “تحديث العميل”; Arabic routes are RTL and English routes LTR.
3. **AC3 / REQ-491-3:** Submission disables the button with localized saving text; an empty customer name never invokes submission.
4. **AC4 / REQ-491-4:** The tagged natural-language customer E2E scenario passes against the branch application in the hub gate.
5. **AC5 / REQ-491-5:** Web TypeScript type-check and lint exit 0; changed customer tests pass, with base/head regression evidence.

## Verification report

| AC  | Tests / commands / screenshots                                                                   | Observed result                                                         | Exit Code                | Status  |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------ | ------- |
| AC1 | JEST + BROWSER below; [EN create](screenshots/en-create.png), [EN edit](screenshots/en-edit.png) | Exact role/name and visible text checked                                | 0                        | PASSED  |
| AC2 | JEST + BROWSER; [AR create](screenshots/ar-create.png), [AR edit](screenshots/ar-edit.png)       | Arabic names verified; full application route direction awaits hub      | 0 component; route unrun | PARTIAL |
| AC3 | JEST + BROWSER                                                                                   | Both saving states disabled/localized; empty input rejected             | 0                        | PASSED  |
| AC4 | ARMY below; `@issue-491`, `feat:mz-customers`                                                    | CONFIG_NOT_FOUND; no authenticated flow executed                        | 2                        | PENDING |
| AC5 | JEST; `pnpm --filter @mizano/web type-check`; `pnpm --filter @mizano/web lint`                   | 25 tests passed; type-check clean; lint has existing unrelated warnings | 0                        | PASSED  |

Commands run from repository root:

- **JEST:** `nice -n 10 pnpm --filter @mizano/web exec jest components/sales/customer-form-actions.spec.tsx components/sales/customer-form.spec.ts --maxWorkers=2`.
- **BROWSER:** `nice -n 10 node docs/evidence/491/verify-browser.cjs`. Six locale/mode checks completed, four screenshots captured. Uses installed hub Playwright; override `MIZANO_PLAYWRIGHT_MODULE` if needed.
- **ARMY:** `nice -n 10 /Users/abdelrahmanahmed/agents/hub-live/ops/verify/e2e-army/node_modules/.bin/e2e run e2e-army/491-customer-submit-actions.e2e.ts --workers 1 --retries 0 --output /tmp/mizano-491-army`.
- `python3 scripts/test_evidence_freshness.py docs/evidence/491/EVIDENCE.md`: exit 0; all four relative screenshot links resolve.
- `git diff --check`, `node --check docs/evidence/491/verify-browser.cjs`: exit 0. E2E TypeScript transpilation diagnostics: none, exit 0; this is syntax verification only.

The browser harness renders the real form and real Intl provider without application CSS, authentication, API calls, or application routing. It sets document language/direction explicitly; it does **not** prove route layout. ARMY checks actual route direction and captures application screenshots when the hub runs it. Supply throwaway `E2E_LOGIN_EMAIL`/`E2E_LOGIN_PASSWORD` (or `E2E_USER_EMAIL`/`E2E_USER_PASSWORD`); no credentials are embedded.

### Base → head regression

Before the implementation, JEST failed on the English literals on Arabic pages. Repeated with the final regression tests over the pristine base form and both base catalogs (restored from `git show bcdf3704:<path>`): exit **1**, **4 failed / 21 passed**. Arabic create, update, and both saving cases failed. Restored head files immediately. On committed tested code head, the same command exited **0**, **25 passed**.

Changed covering tests: new `customer-form-actions.spec.tsx` (10 locale/action/validation cases); existing `customer-form.spec.ts` adds only a next-intl import mock, preserving all 15 payload assertions; new `e2e-army/491-customer-submit-actions.e2e.ts`. Jest mocks only translation lookup using real catalogs because existing Jest cannot load next-intl ESM; BROWSER exercises the real provider.

### Scope, checks, and handoff

Reused next-intl; no dependency added. Base already derives accessible names from distinct English button text; the remaining defect was English literals in Arabic. Both callers (`sales/customers/new/page.tsx`, `sales/customers/[id]/edit/page.tsx`) inherit the existing locale provider and need no changes. No orchestrator callers exist. Other parent findings are outside this owned submit-action item.

Initial type-check exited 1 because workspace declarations were absent. Generated only the two existing prerequisite libraries via `suite.sh pnpm --filter @mizano/shared-types --filter @mizano/validators build` (exit 0); subsequent web type-check exited 0. Full application build/full suite deliberately left to CI per owner instruction. Local `nice` reports sandbox priority restrictions; authorized browser runs use nice successfully.

The first commit contains only E2E coverage (`bf77a63`). The commit hook rejected `layer 1/1:` subjects; conventional subjects retain the one-layer plan in their bodies. No hook/config bypass. No push, PR creation, deployment, or independent-review claim. Harness must attach this report, run ARMY/full CI, arrange independent exact-head review, and release its assignment.

Provider: Codex session (GPT-6 family; exact backend version/effort header unavailable). Requested reasoning: high. Free OpenCode/Nemotron low-effort test delegation returned NO AVAILABLE IMPLEMENTER due to quota; no delegated output used. Peak check: all providers off-peak.

Skills used: model-effort-routing, using-superpowers, diagnosing-bugs, systematic-debugging, test-driven-development, test-first engineering, e2e-army, typescript-best-practices, principle-type-system-discipline, verification-before-completion, humanizer, pr, opencode-delegate, ai-peak-hours.
