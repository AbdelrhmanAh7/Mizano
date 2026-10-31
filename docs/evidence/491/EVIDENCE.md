# Verification report: #491 customer submit action names

Supersedes part of #408. Origin review: https://github.com/AbdelrhmanAh7/Mizano/pull/408#issuecomment-6347991706. No originating Sentry issue was supplied.

Component code head tested: `0e336bea19ec14aae3dbbbb1d9cb1d115cc6f89a`. The e2e-army file changed afterwards (see AC5).

| AC  | Criterion                                                                                      | REQ       | Verified by                                                                                                                                                              | Result                                        |
| --- | ---------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| AC1 | Create mode shows "Create Customer" (en) / "إنشاء عميل" (ar) as the accessible name            | REQ-491-1 | `apps/web/components/sales/customer-form-actions.spec.tsx`; `docs/evidence/491/verify-browser.cjs`; screenshots `screenshots/en-create.png`, `screenshots/ar-create.png` | pass                                          |
| AC2 | Edit mode shows "Update Customer" / "تحديث العميل", distinct from create                       | REQ-491-2 | same spec; `screenshots/en-edit.png`, `screenshots/ar-edit.png`                                                                                                          | pass                                          |
| AC3 | Pending state shows the localized "Saving..." / "جارٍ الحفظ..." and stays disabled             | REQ-491-3 | same spec; `verify-browser.cjs`                                                                                                                                          | pass                                          |
| AC4 | Arabic renders RTL, English LTR                                                                | REQ-491-4 | `verify-browser.cjs` checks `html[dir]` per locale; screenshots above                                                                                                    | pass (isolated component, not the real route) |
| AC5 | Customer form routes stay behind login in both locales; the e2e-army test reads no credentials | REQ-491-5 | `e2e-army/491-customer-submit-actions.e2e.ts` (request-level, `lvl:api`)                                                                                                 | not run locally: runner config is hub-owned   |

## Commands run on this head

- Base regression (`bcdf3704`, spec without the fix): exit 1, 4 failed / 21 passed.
- `cd apps/web && npx jest --testPathPattern=components/sales/customer-form`: exit 0, 2 suites, 25 tests passed.
- `pnpm --filter @mizano/web type-check`: exit 0.
- `pnpm --filter @mizano/web lint`: exit 0 (existing unrelated warnings only).

## Limits

- The real-route, signed-in RTL/LTR check needs a session. The first e2e-army test read credentials from env vars and logged in; the CTO blocked that. The test is now credential-free and only covers the route guard, so the signed-in button names are covered only by the jest spec and the isolated Playwright harness.
- `tsc -p e2e-army` cannot resolve `@e2e-dev/web` and `e2e` locally; they come from the hub runner, as for every other file in that folder.
