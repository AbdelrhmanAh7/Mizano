# Evidence: Issue #114, VAT return draft generated from the Mizano ledger

**Tested code head**: `1357d2a81433987b83e21202bce0f186f5359a1f` (`ai/114`). Everything below was run on that tree.

This file is separate from the root `EVIDENCE.md`, which is unchanged from `master` (it still holds the #95 audit).

## Requirements

| REQ ID | Requirement                                             | Verification                                                                                                                                                                                                                                                                      | Status |
| ------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| REQ-1  | Authenticated and org-scoped; cross-org returns no data | `reports.e2e-spec.ts`: anonymous call is `401`; tenant B queries tenant A's exact window and must get `200` with one exact body (`complete`, all totals `0.0000`, `exceptions: []`). Unit test asserts both queries carry `organizationId`.                                       | PASSED |
| REQ-2  | Decimal strings match fixtures (output, input, net)     | e2e: output `140`, input `70`, net `70` from real invoices and a bill; unit tests cover mixed rates and 4-dp rounding.                                                                                                                                                            | PASSED |
| REQ-3  | Only posted, non-deleted documents are included         | e2e: a DRAFT and a VOID invoice in the window are excluded. Unit test asserts the query filters `status notIn [DRAFT, VOID]` and `deletedAt: null`.                                                                                                                               | PASSED |
| REQ-4  | Missing/foreign-currency data goes to `exceptions[]`    | Unit tests (foreign code, null tax) and e2e (invoice marked `EUR` yields exactly one exception). A missing `currencyCode` counts as base currency, as in the posting guards. See "Defect found" below.                                                                            | PASSED |
| REQ-5  | Invalid range returns 400                               | Enforced in the controller (there is no class-validator check for `from <= to`; the DTO only checks ISO dates). Controller unit test: `from > to` throws `BadRequestException` and never calls the service; `from = to` is accepted. e2e: `from > to` returns `400` with message. | PASSED |
| REQ-6  | No schema migration, no CI/workflow changes, scoped     | Diff against `master` is 9 files, all VAT draft code, tests and `docs/reports.md`. Unrelated edits (paddleocr script, employee-form spec, planning and strategy docs, unused validators schema) were removed.                                                                     | PASSED |
| REQ-7  | Docs commands are copy-pasteable                        | `docs/reports.md` corrected to match the real response shape and limits. The cURL command was not executed against a running server; the response shape is asserted by the e2e body check.                                                                                        | PASSED |
| REQ-8  | Follow-up issues for ETA mismatch and metric            | Filed: #119 (flag ETA e-invoice mismatches pre-filing) and #120 (measure reduced filing corrections).                                                                                                                                                                             | PASSED |
| Label  | Output labelled as a draft                              | Response carries `label: "DRAFT, not for filing"`; asserted in unit and e2e tests.                                                                                                                                                                                                | PASSED |

## Defect found while collecting this evidence

The earlier head (`19f18a8`) recorded REQ-2, REQ-3 and REQ-4 as passed, but its own happy-path e2e failed: every API-created invoice and bill has `currencyCode = NULL`, and the service treated a null code as an exception and compared against `Organization.currency` instead of `baseCurrency`. Every document landed in `exceptions` and all totals were `0.0000`. The cross-org check also queried with `startDate`/`endDate` instead of `from`/`to` and outside tenant A's data, so it proved nothing. Both are fixed in `1357d2a`.

Known behaviour left as is, and stated in `docs/reports.md`: no maximum period, UTC date parsing, no credit-note netting, and a zero-tax invoice counts as `0` rather than an exception (`taxAmount` is never null in the schema).

## Commands run (on `1357d2a`)

- `npx jest src/modules/reports` (apps/api): 8 suites, 68 tests passed.
- `npx jest` (apps/api, full unit suite): 138 suites, 2208 tests passed.
- `npx jest --config ./test/jest-e2e.json reports.e2e-spec` against a throwaway local Postgres 16, no Redis: 17 of 17 passed.
- Same setup, every e2e suite except `intake` on a fresh database: 9 of 10 suites passed (242 of 243 tests); `sales` was the other one, see below.
- `npx tsc --noEmit` and `npx tsc --noEmit -p test/tsconfig.e2e.json` (apps/api): clean.
- `npx eslint --max-warnings=0` on the changed API files and `npx prettier --check` on all changed files: clean.

## Not verified

- **`intake.e2e-spec.ts` was not verified.** It needs Redis, which is not available on the test host (`ECONNREFUSED` on 6380). Its queued jobs also block app start-up for any suite that boots afterwards, so a parallel run that includes it fails the other suites too. This is infrastructure, not a pass. It is unrelated to the VAT draft.
- The one other e2e failure seen (`sales.e2e-spec.ts`, 1 test, in a 10-suite parallel run) did not reproduce: the suite passes alone, 34 of 34. Nothing in it touches the VAT draft.
- The cURL command in `docs/reports.md` was not run against a live server.
