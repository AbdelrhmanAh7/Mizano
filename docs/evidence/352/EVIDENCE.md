# Evidence for Issue #352: Stronger RTL and Arabic-string checks in the searchable bill options e2e test

## Acceptance Criteria Mapping

| AC           | Requirement                                                             | Verification Method                                                                  | Status              |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------- |
| AC1 (FR-001) | Assert computed CSS `direction` of bill form container is `rtl`         | Playwright `toHaveCSS('direction', 'rtl')` on form container                         | Implemented in test |
| AC2 (FR-002) | Assert expense-account label is right-aligned via bounding-box geometry | Compare rightGap < leftGap of label within form container                            | Implemented in test |
| AC3 (FR-003) | Assert computed `direction` of open searchable account listbox is `rtl` | Playwright `toHaveCSS('direction', 'rtl')` on listbox                                | Implemented in test |
| AC4 (FR-004) | Keep existing `document.documentElement.dir === 'rtl'` check            | `browser.evaluate(() => document.documentElement.dir)`                               | Implemented in test |
| AC5 (FR-005) | Read expense-account label from Arabic catalog instead of hardcoded     | `fs.readFileSync` of `apps/web/messages/ar/purchases.json` → `expenses.form.account` | Implemented in test |
| AC6 (FR-006) | Custom assertion messages on all new assertions                         | Each `expect` has descriptive message parameter                                      | Implemented in test |
| AC7 (FR-007) | No product code changes, no new dependencies                            | Only `e2e-army/317-searchable-bill-options.e2e.ts` modified                          | Verified            |
| AC8 (FR-008) | Fallback to named constant if catalog entry missing                     | Nullish coalescing `?? 'حساب المصروفات'` on catalog read                             | Implemented in test |

## Test File Created

**File**: `e2e-army/317-searchable-bill-options.e2e.ts`

**Changes from base test (ai/317)**:

1. Added import of Arabic catalog via `fs.readFileSync`
2. Added `EXPENSE_ACCOUNT_LABEL_AR` constant sourced from catalog
3. Added RTL layout assertions in the Arabic test:
   - `billForm.toHaveCSS('direction', 'rtl')`
   - Bounding-box geometry check (rightGap < leftGap)
   - `listbox.toHaveCSS('direction', 'rtl')`
   - Catalog-sourced label text comparison with NFC normalization
4. All new assertions carry custom failure messages
5. Kept original `document.documentElement.dir` check

## Verification Commands

```bash
# Run the e2e-army test (via hub verify job)
# The test is tagged with @issue-317 and @issue-352 for traceability
npx playwright test e2e-army/317-searchable-bill-options.e2e.ts

# Local fail-first proof (uncommitted mutation):
# 1. Temporarily add dir="ltr" to bill form container in browser devtools
# 2. Re-run test → should fail on RTL assertions
# 3. Revert mutation → test passes
```

## Related Issues

- Originating review: #340 (QA) — Localization Reviewer findings P2 (line 47) and P3 (line 48)
- Feature issue: #317 / #340 — Searchable bill options implementation
- This issue: #352 — Follow-up hardening of e2e test

## Test Tags

- `feat:mz-purchase-bills` — Feature mapping for hub verification
- `lvl:ui` — UI-level test
- `@issue-317` — Original feature issue
- `@issue-352` — This hardening issue

## Notes

- The test assumes the bill-form component has searchable select controls with test-ids `line-0-item` and `line-0-account` (added in #317/#340).
- The Arabic catalog key used is `purchases.expenses.form.account` = "حساب المصروفات".
- The test uses Playwright built-ins only (`toHaveCSS`, `boundingBox`, `getByRole`, `getByText`, `getByTestId`).
- No new dependencies added.
- No product code modified.
