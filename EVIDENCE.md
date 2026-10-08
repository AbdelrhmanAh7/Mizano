# EVIDENCE.md — PR Merge Sprint Audit (#95)

## Overview

- **Issue**: #95 (MZ · PR merge sprint until queue ≤ 5)
- **Base Commit (`master`)**: `b83d72b5a1900350d7575dfa39396e95b058a5c4`
- **Audit Date**: 2026-10-07
- **Reviewed Scope**: 6 oldest open pull requests (#58, #60, #65, #66, #67, #68)

---

## Requirements Verification Matrix

| REQ ID | Requirement                                         | Verification Method                                | Status |
| ------ | --------------------------------------------------- | -------------------------------------------------- | ------ |
| REQ-1  | Retrieve 6 oldest open PRs                          | `gh pr list --search "sort:created-asc" --limit 6` | PASSED |
| REQ-2  | Record exact tested commit SHAs                     | Git ref inspection (`headRefOid` per PR)           | PASSED |
| REQ-3  | Execute local test suites per PR                    | Run unit/web suites with output captured           | PASSED |
| REQ-4  | Domain risk audit (money, tenant, idempotency, RTL) | Diff inspection against AGENTS.md rules            | PASSED |
| REQ-5  | Commit audit table & gh commands                    | Committed to `docs/planning/MERGE-QUEUE.md`        | PASSED |
| REQ-6  | Non-destructive execution (<300 doc lines)          | No PRs merged; doc-only additions                  | PASSED |

---

## Detailed Test Logs & Commit Evidence

### PR #58

- **Commit SHA**: `2b3f01c3d7e9fe4877bb29b8af903437b3eee92a`
- **Branch**: `demo/20-telegram-intake`
- **Commands**:
  ```bash
  git checkout --detach 2b3f01c3d7e9fe4877bb29b8af903437b3eee92a
  pnpm --filter ./apps/api exec prisma generate
  pnpm --filter ./apps/api test telegram
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/telegram/telegram.client.spec.ts
  PASS src/modules/telegram/telegram-link.service.spec.ts
  PASS src/modules/telegram/telegram-intake.service.spec.ts
  Test Suites: 3 passed, 3 total
  Tests:       74 passed, 74 total
  Lint: 4 packages successful
  ```

### PR #60

- **Commit SHA**: `d01e25239b4a3a62c1034a0258c53e614655ed69`
- **Branch**: `demo/38-arm64-images`
- **Commands**:
  ```bash
  git checkout --detach d01e25239b4a3a62c1034a0258c53e614655ed69
  pnpm --filter ./apps/api test intake
  pnpm lint
  ```
- **Output**:
  ```text
  Test Suites: 1 skipped, 17 passed, 17 of 18 total
  Tests:       9 skipped, 284 passed, 293 total
  Lint: 4 packages successful
  ```

### PR #65

- **Commit SHA**: `5eb0340b0e002730f52709d3a7ad8a6097203f77`
- **Branch**: `demo/followup-vat`
- **Commands**:
  ```bash
  git checkout --detach 5eb0340b0e002730f52709d3a7ad8a6097203f77
  pnpm --filter ./apps/api test vat
  pnpm --filter ./apps/api test default-roles
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/tax/controllers/vat-returns.controller.spec.ts
  PASS src/modules/tax/interceptors/vat-decimal.interceptor.spec.ts
  PASS src/modules/tax/services/vat-returns.service.spec.ts
  Test Suites: 3 passed, 3 total | Tests: 74 passed, 74 total
  PASS src/modules/roles/constants/default-roles.constant.spec.ts (1 passed)
  Lint: 4 packages successful
  ```

### PR #66

- **Commit SHA**: `310ac2b1aa7129b4c51403f46eb6ee36f4d1e778`
- **Branch**: `demo/followup-reports-ledger`
- **Commands**:
  ```bash
  git checkout --detach 310ac2b1aa7129b4c51403f46eb6ee36f4d1e778
  pnpm --filter ./apps/api test aging-reports
  pnpm --filter ./apps/api test depreciation
  pnpm --filter ./apps/api test work-orders
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/reports/services/aging-reports.receivables.spec.ts (28 passed)
  PASS src/modules/assets/services/depreciation.service.spec.ts (22 passed)
  PASS src/modules/manufacturing/services/work-orders.service.spec.ts (29 passed)
  Test Suites: 6 passed, 6 total | Tests: 79 passed, 79 total
  Lint: 4 packages successful
  ```

### PR #67

- **Commit SHA**: `be7478f715f1e0f0efb8447e922db9d79d37fbc1`
- **Branch**: `demo/followup-sales-banking`
- **Commands**:
  ```bash
  git checkout --detach be7478f715f1e0f0efb8447e922db9d79d37fbc1
  pnpm --filter ./apps/api test recurring-profiles credit-notes
  pnpm --filter ./apps/web test payments bill-form invoices
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/accounting/services/recurring-profiles.service.spec.ts (41 passed)
  PASS src/modules/sales/services/credit-notes.service.spec.ts (47 passed)
  PASS @mizano/web (payments, bill-form, invoices): 4 passed, 16 passed
  Total: 8 suites passed, 104 tests passed
  Lint: 4 packages successful
  ```

### PR #68

- **Commit SHA**: `7c632bdf74832cfc94f97cb49c196d168e99127f`
- **Branch**: `demo/followup-org-currency`
- **Commands**:
  ```bash
  git checkout --detach 7c632bdf74832cfc94f97cb49c196d168e99127f
  pnpm --filter ./apps/api test organizations
  pnpm --filter ./apps/web test report-currency report-labels purchases-currency
  pnpm lint
  ```
- **Output**:
  ```text
  PASS src/modules/organizations/organizations.service.spec.ts (26 passed)
  PASS @mizano/web (report-currency, report-labels, purchases-currency): 3 passed, 78 passed
  Total: 4 suites passed, 104 tests passed
  Lint: 4 packages successful
  ```

## Issue #109 — Arabic-Indic/Persian digit normalization

Tested code head: `a5aeed02dcd38442bca11c75ca6b13d4945152e5` (this file is committed after it; only EVIDENCE.md differs).

`normalizeDigits` (`apps/api/src/modules/ai/extraction/rules/rules-normalize.ts`) and its use in the intake rules extractor already exist on master. This PR only adds the acceptance spec `rules-normalize.spec.ts` (tagged `@issue-109`); no production code changes remain. An earlier attempt that also wired the helper into `entity-extraction.service.ts` and `ollama.service.ts` was reverted because dropped bidi marks shift entity offsets.

| REQ                                         | Verified by                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| AC1 `١٢٣٫٤٥` → 123.45, `١٬٢٣٤٫٥٠` → 1234.50 | `normalizeDigits` + `findAmounts` cases in rules-normalize.spec.ts                |
| AC2 `٠٧/١٠/٢٠٢٦` = `07/10/2026`             | `parseDate` cases (Arabic-Indic and Persian)                                      |
| AC3 mixed script `EGP ١٢٠٠`                 | mixed-script `normalizeDigits` and `extractInvoiceFields` cases                   |
| AC4 English tests unchanged                 | `invoice-rules-extractor.spec.ts`, `rules-strategy.spec.ts` untouched and passing |
| AC5 no float math                           | `parseAmount` returns Decimal (asserted)                                          |
| AC6 ≤ ~200 lines                            | no production code in the diff                                                    |

Commands run (sandbox off, local):

- `npx jest src/modules/ai` in apps/api: Test Suites 60 passed, Tests 1096 passed
- `npx tsc --noEmit -p .` in apps/api: no errors
- `prettier --check` on the spec: clean

Not run: the seeded PDF e2e (removed; see commit a5aeed0).

E2E: not needed — #109 changes no production code and no UI or user-flow files, only the jest acceptance spec `rules-normalize.spec.ts`, so `e2e-army` reports "n/a" (the blocking gate is tester-army/e2e, status `e2e-army`). The legacy Playwright `e2e-first` status looks only for an e2e file and cannot be satisfied by a jest `.spec.ts`. No e2e-army test was added because none could exercise the Arabic-digit acceptance criteria; a smoke test that never checks them would only satisfy the gate.

Review round 3 (#109): the PDF-fixture, offset-preservation and async-path threads target code removed in a5aeed0 (no e2e PDF spec, no wiring in `entity-extraction.service.ts` / `ollama.service.ts`), so nothing remains to fix there. CodeRabbit's spec notes are fixed in `rules-normalize.spec.ts`: amount tests now pass `normalizeDigits(...)` output into `parseAmount`, the European-format case is renamed, and the Decimal(19,4) bound test covers 15/16 integer digits and 4/5 decimals. `npx jest src/modules/ai/extraction/rules` in apps/api: 3 suites, 66 tests passed.

Review round 4 (#109): the three code threads (Unicode PDF fixtures, original-text offsets, async entity-extraction path) are all OUTDATED. They target the e2e PDF spec and the `entity-extraction.service.ts` / `ollama.service.ts` wiring, which were removed in a5aeed0 and are not on this branch, so no code change is needed. The EVIDENCE.md e2e note is reworded to the `E2E: not needed — <reason>` waiver form. The spec fixes from round 3 (aed8cb7) are unchanged.
