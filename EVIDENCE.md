# EVIDENCE: payslip PDF generator (#115)

Branch `ai/115`. Unit/lint results below were run at commit `895cc43` and re-run after the seed change that follows `5d41cfa` (HR specs: 3 suites, 52 tests, 0 failed).
Date 2026-10-17. Everything below was run in this session; what was not run is listed at the end.

## Contract

The spec draft said `POST /api/hr/payroll/:id/payslip`. The reviewed and CTO-approved contract is
`GET /api/payslips/:id/pdf?lang=ar|en` (read-only; default `ar`; other values 400; permission `hr.view`;
`Content-Type: application/pdf`; `Content-Disposition: attachment; filename="payslip-<id>.pdf"`).
The web payslip page has a "Download PDF" button (`data-testid="download-pdf-button"`, en/ar, RTL) that calls it.
Follow-ups kept out of this PR (issue creation is frozen, so they are recorded here): move
`EmailService` payslip attachments to `PayslipPdfService` and delete the legacy `PdfService.generatePayslipPdf`;
deprecate and later remove `/documents/payslip/:id/pdf`.

## Acceptance criteria

| AC   | Criterion                                                                         | Evidence                                                                                                                                                                                                                                                                                              | Result      |
| ---- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| AC1  | Authorised in-org payslip returns a PDF (`application/pdf`, attachment, no-store) | `payslips.controller.spec.ts`, `payslip-pdf.service.spec.ts` ("generates a valid PDF buffer")                                                                                                                                                                                                         | passed      |
| AC2  | `lang=ar` / `lang=en` supported, default `ar`, other value 400                    | `payslip-pdf.service.spec.ts` ("throws BadRequestException for an unsupported language"), controller spec                                                                                                                                                                                             | passed      |
| AC3  | Amounts exactly as stored, no float, no rounding (`123.4567`, `12345.60`)         | `formatDecimal` table and "preserves a four-decimal stored amount"                                                                                                                                                                                                                                    | passed      |
| AC4  | Same input gives byte-identical PDF                                               | "produces byte-identical output across repeated renders"                                                                                                                                                                                                                                              | passed      |
| AC5  | Other org, soft-deleted employee, unknown id: 404                                 | "propagates NotFoundException ... cross-tenant", e2e-army unknown-id UI test (not run, see below)                                                                                                                                                                                                     | unit passed |
| AC6  | Missing data gives 422 without values; zero-pay and net=0 give a PDF              | "throws UnprocessableEntityException ...", "renders a zero-pay payslip", "renders a net = 0 payslip"                                                                                                                                                                                                  | passed      |
| AC7  | Render errors log only the exception type                                         | "logs only the exception type name ..."                                                                                                                                                                                                                                                               | passed      |
| AC8  | One page, however long the names                                                  | "keeps one page for a 500-character organization name ..." (`numpages === 1`)                                                                                                                                                                                                                         | passed      |
| AC9  | `hr.view` (what default roles have)                                               | `payslips.controller.spec.ts`                                                                                                                                                                                                                                                                         | passed      |
| AC10 | Currency from `baseCurrency`, legacy `currency` only if null                      | "labels amounts with baseCurrency ..."                                                                                                                                                                                                                                                                | passed      |
| AC11 | Totals reconcile with what `calculatePayroll` persists                            | "maps the fields calculatePayroll persists ...", "shows a stored total with no itemised deductions as one Other Deductions row", "reconciles a payslip whose total column is 0 from gross - net", "shows earnings the line items do not explain ...", "does not list a figure twice ... (seed shape)" | passed      |
| AC12 | Arabic/mixed text in correct visual order                                         | `visualRuns` specs, x-position specs on the rendered ar and en pages, PNG renders in `docs/evidence/115/`                                                                                                                                                                                             | passed      |
| AC13 | Font found after `nest build` layouts                                             | `getPinnedFontPath` specs for `dist/modules` and `dist/src/modules` layouts, no cwd dependence                                                                                                                                                                                                        | passed      |
| AC14 | Web download client uses the new route with `lang`                                | `apps/web/lib/hooks/use-documents.spec.ts`                                                                                                                                                                                                                                                            | passed      |

## Commands and results

| Command                                                   | Result                                                                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cd apps/api && npx jest src/modules/hr --maxWorkers=2`   | 3 suites passed, 52 tests, 0 failed (run twice)                                                                                                     |
| `cd apps/web && npx jest lib/hooks/use-documents.spec.ts` | 1 suite passed, 2 tests, 0 failed                                                                                                                   |
| `pnpm --filter api lint`                                  | exit 0, no output                                                                                                                                   |
| `pnpm --filter api exec tsc --noEmit`                     | errors only in other modules (`@mizano/shared-types` is not built here, e.g. `logger.service.ts`); 0 errors in `hr/`, `payslip` or `e2e-army` files |

Root causes found while verifying:

- Arabic order: fontkit mis-ordered right-to-left runs that mix words and punctuation (`فترة الراتب:` came out
  as `الراتب: فترة`) and dropped spaces. Fixed by ordering runs with `bidi-js` and drawing Arabic word by word.
  Seen on a rendered page (macOS `sips`), before and after; final renders: `docs/evidence/115/payslip-ar.png`, `payslip-en.png`.
- A new spec failed only inside the full file with pdf.js "bad XRef entry". Cause: pdf.js rejects a Node `Buffer` for some
  documents inside the jest realm; the PDF itself parses in plain Node and renders in `sips`. The spec helper now passes a `Uint8Array`.
- e2e-army: the verify stack serves only the web origin (API on another port, no `/api` proxy), so the earlier
  request-level tests could not reach the endpoint. They are replaced by UI tests in `e2e-army/115-payslip-pdf.e2e.ts`.

## Dependency

`bidi-js` 1.1.0 (MIT, pure JS, Unicode bidi algorithm) in `apps/api`. `pnpm add` could not write the pnpm store from the
sandbox, so `package.json` and `pnpm-lock.yaml` were edited by hand to the entry pnpm printed (same integrity hash) and
`node_modules/bidi-js` was unpacked from the registry tarball. CI's `pnpm install --frozen-lockfile` will confirm the lockfile.

## Verification round 4 ("Payslip not found")

The last verifier opened `/en/hr/payslips/test-id`, `/ar/hr/payslips/test-id` and `/en/hr/payslips/zero-pay-id`. Those ids do not
exist in the seeded database, so the page correctly shows its not-found state (AC5); this is not a defect in the download flow.
The seeded payslips had random cuid ids, so a verifier could not guess a working URL. The seed now gives them stable ids
(`apps/api/prisma/seed.ts`): `payslip-feb-2026-emp-001`, `-emp-002`, `-emp-003`, all in run `payroll-feb-2026`.
Open `/en/hr/payslips/payslip-feb-2026-emp-001` (or `/ar/...`) to see a payslip and the "Download PDF" button.
`e2e-army/115-payslip-pdf.e2e.ts` has a scenario for it. Existing databases keep their old ids (the seed upserts with `update: {}`).
A zero-pay payslip has no seed row; it is covered by the unit specs only.

## Not verified

- `e2e-army/115-payslip-pdf.e2e.ts` was not run: `run-local.sh` needs the Keychain DB password, a database and ports, which are outside this session. It is the first thing to check on CI.
- `apps/api/test/payslip-pdf.e2e-spec.ts` needs a database and was not run here.
- Full `pnpm ci:full`, build and the full suites run on CI after the push (owner rule), not locally.
- Arabic PDF layout was checked on one fixture by eye plus the automated order specs, not on every payslip shape.
