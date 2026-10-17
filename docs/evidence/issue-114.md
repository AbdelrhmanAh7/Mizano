# Evidence: Issue #114, VAT return draft generated from the Mizano ledger

**Tested code head**: `dfb07c6` (`ai/114`). Every result below was run on that tree; the commit that adds this file changes only `docs/`.

The root `EVIDENCE.md` is unchanged from `master`.

## Rework after the CTO decision and review threads on PR #117

| Finding                                                     | Resolution                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1: totals must come from posted VAT ledger lines           | `outputTax`/`inputTax` come from `VatReturnsService.getVatSummary` (the calculation behind VAT returns). Expenses, credit notes and reversals count (e2e below). Per-document ETA and exception checks stay on invoices and bills. |
| P2: restrict bills to posted statuses                       | Documents use the exported `TAXABLE_INVOICE_STATUSES` / `TAXABLE_BILL_STATUSES` allow-lists. A `PENDING` bill is ignored (unit and e2e).                                                                                           |
| P2: date-only upper bound                                   | The range is UTC calendar days through `parseReportDate`/`startOfUtcDay`; an invoice at `T12:00Z` on the `to` date is checked (e2e).                                                                                               |
| P2: unbounded scan                                          | Over 366 days returns `400`; documents are read in id-cursor pages of 500 with only the needed fields selected (unit).                                                                                                             |
| P2: precision                                               | Net and per-line tax use `Decimal.clone({ precision: 40 })`; a 17-integer-digit total keeps 4 places and `999999999000000.0050 × 99.90%` is not falsely flagged (unit).                                                            |
| P2: currency                                                | The response carries `currency` (organization base currency); the shared type is updated.                                                                                                                                          |
| QA gaps: zero-amount, odd rates, partial data, negative tax | New exceptions "Negative tax amount" and "Invalid tax rate"; unit tests for zero-amount, no-lines, null tax and rates `-1`, `100.01`, `250`, `0`, `100`.                                                                           |
| P1: evidence bound to the reviewed head                     | This file now names the tested head, and the results below were run on it.                                                                                                                                                         |

## Acceptance criteria

All tests carry `@issue-114`. The endpoint is `GET /api/reports/vat-return-draft?from&to` (chosen in the first slice), not the `/tax/vat-returns/draft` path in the planner spec.

| AC  | Requirement                                                            | Verification                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1 | Authenticated and organization-scoped                                  | e2e: anonymous `401`; tenant B without VAT accounts gets `400`, then after setup an exact empty body for tenant A's window. Unit: queries carry `organizationId`. e2e-army: anonymous `401`.                                   |
| AC2 | Totals are the posted VAT ledger, decimal strings, with `currency`     | e2e: invoice, bill and foreign-marked invoice give `154.0000`/`70.0000`/`84.0000`; an expense, a credit note and a manual journal with its reversal move the figures as expected. Unit: ledger values, refund sign, 17 digits. |
| AC3 | Only posted, non-deleted documents; date-only end covers the whole day | e2e: draft, void and `PENDING` documents ignored; midday invoice on the end date checked. Unit: allow-lists, window `lt` = day after `to`.                                                                                     |
| AC4 | Documents that cannot be checked go to `exceptions[]`                  | Unit: foreign currency, null tax, negative tax, invalid rates, base-currency defaulting. e2e: the foreign-marked invoice.                                                                                                      |
| AC5 | Invalid range returns 400                                              | e2e: `from > to` and a malformed date. Unit: also no query runs and the expected `400` is not logged.                                                                                                                          |
| AC6 | ETA mismatches flagged before filing                                   | e2e: header changed to `139.99` and `139.5` are listed with the line tax `140.0000`, the ledger total stays `140.0000`. Unit: per-line rounding, no lines, zero-amount, large-line precision.                                  |
| AC7 | Period capped at 366 days, bounded scan                                | e2e: 366 days `200`, 367 days `400`. Unit: same boundary; cursor paging with `take: 500`, `skip: 1`.                                                                                                                           |

## Commands run on `dfb07c6`

- `npx jest --findRelatedTests` (apps/api) on the changed source files: 3 suites, 67 tests passed (`vat-return-draft.service.spec`, `vat-return-draft.controller.spec`, `vat-returns.service.spec`).
- `npx jest --config ./test/jest-e2e.json --runInBand test/reports.e2e-spec.ts` with `REDIS_URL=` on a freshly migrated throwaway Postgres 16: 1 suite, 22 tests passed (before the fix the same suite had 3 failures on the old document-sum totals).
- `pnpm --filter @mizano/shared-types type-check`, `pnpm --filter api type-check` (includes the e2e tsconfig) and `pnpm --filter api lint`: exit 0, no output beyond the command banner.

## Not verified

- `e2e-army/114-vat-return-draft.e2e.ts` was not run locally: it needs the hub runner stack (`run-local.sh`) and runs in the `e2e-army` verify job.
- The full API and web suites were not run locally (owner rule: they run on CI after the push).
- The old service could not be run against the new e2e as a red baseline: it does not compile with the new `currency` field.
- No comparison against real ETA portal data (none stored): #119. The filing-corrections metric: #120.
