# Evidence for Issue #301: Transform Customer Payload with Nested Address & Nulls

This document provides verification evidence for GitHub issue #301 in `AbdelrhmanAh7/Mizano` (split from PR #289, item `check:e2e-army`, parent issue #254).

- **Issue**: [#301](https://github.com/AbdelrhmanAh7/Mizano/issues/301)
- **PR**: Supersedes part of #289
- **Parent Issue**: #254
- **Base Commit (`origin/master`)**: `e5d9b805170d103ea57d9f9571f5c6bb096c1df2`
- **Tested Head Commit**: `45a9a49d439597732040813722184e7c0fbd645a`
- **Tested Branch**: `ai/301`
- **Originating Sentry Issue**: None (originates from CI finding `e2e-army` on PR #289 commit `6b014fe` and Claude Sonnet 5.5 review finding on optional field clearing).
- **Host Environment**: Darwin arm64 (macOS), Node.js v20+, pnpm 8.14.0.
- **User-Facing Flow / E2E**: Covered by `e2e-army/301-customer-payload.e2e.ts` (tagged `feat:mz-customers`).
- **Skills Used**: `systematic-debugging`, `test-first engineering`, `tdd`, `e2e-army`, `verification-before-completion`, `model-effort-routing`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Customer form DTO payload transformation, address nesting, null-clearing semantics, and E2E coverage for issue #301`.

---

## Context & Finding Summary

In PR #289 (split from parent issue #254), two defects were identified:

1. **Failing check `e2e-army`**:
   - The test was previously tagged with `feat:mz-sales-customers`.
   - In `ops/verify/features/Mizano.json`, the feature ID mapped to customer paths is `mz-customers`.
   - Because of this mismatch, the verify gate rejected the PR for missing feature coverage.

2. **Claude Sonnet 5.5 Review Finding & QA Review Findings**:
   - The old code converted empty optional fields to `undefined` and omitted them from the payload.
   - `CustomerForm` is used for both creating and editing customers (`customer` prop in `/sales/customers/[id]/edit`).
   - When a user clears an optional field (e.g. `displayName`, `email`, `phone`, `taxId`, or address fields `street`, `city`, etc.), omitting the field or sending `undefined` causes Prisma to ignore the field during `update`, so the old server values persist.
   - Furthermore, `CustomerForm` previously flattened address fields into `billingStreet`, `billingCity`, etc., and included `notes`. `CreateCustomerDto` and `UpdateCustomerDto` expect nested `billingAddress` and `shippingAddress` objects and do not whitelist `notes`, causing 400 Bad Request validation failures.

---

## Numbered Acceptance Criteria

- **AC1 (Nested Address DTO Structure)**: `buildCustomerPayload` transforms form data into nested `billingAddress` and `shippingAddress` objects matching `CreateCustomerDto` and `UpdateCustomerDto`, omitting flat keys (`billingStreet`, `billingCity`, etc.).
- **AC2 (Null-Clearing for Optional Fields)**: Cleared and whitespace-only strings for optional fields (`displayName`, `email`, `phone`, `taxId`, `priceListId`) are converted to `null` (not omitted as `undefined`) so that editing existing customers clears old database values.
- **AC3 (Address Clearing with Nulls)**: When an address object contains only blank/whitespace fields, it produces an address object with all subfields set to `null` so database address columns are cleared on update. When an address is entirely `undefined`, it is omitted.
- **AC4 (DTO Whitelisting / Drop Notes)**: Unwhitelisted `notes` property is dropped from the API payload to prevent 400 Bad Request errors.
- **AC5 (Preserve Numeric Payment Terms & Trim Strings)**: Preserves valid numeric `paymentTerms` (including `0` for Due on Receipt) and trims string inputs.
- **AC6 (CustomerForm Delegation & Export)**: `CustomerForm` delegates `handleSubmit` to `buildCustomerPayload` and re-exports it.
- **AC7 (E2E Army Test Coverage)**: `e2e-army/301-customer-payload.e2e.ts` covers customer creation with nested addresses and RTL Arabic direction (`lvl:ui`), as well as PATCH update clearing optional fields (`lvl:api`), ensuring old server values do not persist.

---

## Verification Matrix

| AC ID   | Requirement Description               | Verification Method / Command                                                                              | Observed Result                                                  | Exit Code | Status     |
| :------ | :------------------------------------ | :--------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- | :-------- | :--------- |
| **AC1** | Nested address transformation         | `nice -n 10 pnpm --filter web exec jest --maxWorkers=2 components/sales/customer-payload.spec.ts -t "AC1"` | `PASS` (nested `billingAddress`/`shippingAddress`, no flat keys) | 0         | **PASSED** |
| **AC2** | Clearable optional fields set to null | `nice -n 10 pnpm --filter web exec jest --maxWorkers=2 components/sales/customer-payload.spec.ts -t "AC2"` | `PASS` (empty/whitespace fields converted to null)               | 0         | **PASSED** |
| **AC3** | Address clearing with null fields     | `nice -n 10 pnpm --filter web exec jest --maxWorkers=2 components/sales/customer-payload.spec.ts -t "AC3"` | `PASS` (address subfields set to null; undefined omitted)        | 0         | **PASSED** |
| **AC4** | Notes dropped for DTO whitelisting    | `nice -n 10 pnpm --filter web exec jest --maxWorkers=2 components/sales/customer-payload.spec.ts -t "AC4"` | `PASS` (no notes key in payload)                                 | 0         | **PASSED** |
| **AC5** | Numeric paymentTerms and trimming     | `nice -n 10 pnpm --filter web exec jest --maxWorkers=2 components/sales/customer-payload.spec.ts -t "AC5"` | `PASS` (paymentTerms: 0 preserved, strings trimmed)              | 0         | **PASSED** |
| **AC6** | CustomerForm re-exports and delegates | `nice -n 10 pnpm --filter web exec jest --maxWorkers=2 components/sales/customer-payload.spec.ts -t "AC6"` | `PASS` (exported function matches customer-payload)              | 0         | **PASSED** |
| **AC7** | E2E-army suite hygiene and spec check | `python3 scripts/test_e2e_army_hygiene.py`                                                                 | 11/11 hygiene checks passed (no illegal imports or shims)        | 0         | **PASSED** |

---

## Changed Covering Tests

- `apps/web/components/sales/customer-payload.spec.ts` (15 unit tests covering AC1–AC6):
  - `AC1: transforms flat form data with nested addresses into DTO structure`
  - `AC2: sets empty and whitespace-only strings to null (not omitted as undefined) so existing fields can be cleared on edit`
  - `AC3: handles address clearing with null values and omits undefined addresses`
  - `AC4: drops notes from the API payload (DTO does not accept notes)`
  - `AC4: payload contains nested address and no notes key (DTO whitelisting compliant)`
  - `AC5: preserves valid numeric paymentTerms including 0 (Due on Receipt)`
  - `AC5: trims string fields and handles optional priceListId`
  - `buildAddressPayload: returns undefined for undefined address input`
  - `buildAddressPayload: returns all null fields for null address input to clear existing address`
  - `buildAddressPayload: returns all null fields when all fields are empty or whitespace`
  - `buildAddressPayload: returns trimmed non-empty fields and null for blank fields`
  - `clearableString: returns undefined when input is undefined`
  - `clearableString: returns null when input is null, empty string, or whitespace`
  - `clearableString: returns trimmed string for non-empty input`
  - `AC6: customer-form exports buildCustomerPayload matching customer-payload`
- `e2e-army/301-customer-payload.e2e.ts` (e2e-army test covering AC1, AC2, AC3, AC6, AC7):
  - `@issue-301 AC1 AC6: customer form transforms address fields into nested structure and posts successfully`
  - `@issue-301 AC2 AC3: editing customer to clear optional fields sends null on PATCH and clears server values`

---

## Regression Demonstration: Base vs Head

### Base (`origin/master` at `e5d9b805`)

Command:

```bash
nice -n 10 pnpm --filter web exec jest --maxWorkers=2 components/sales/customer-payload.spec.ts
```

Output:

```text
FAIL components/sales/customer-payload.spec.ts
  ● Test suite failed to run

    Cannot find module './customer-payload' from 'components/sales/customer-payload.spec.ts'

Test Suites: 1 failed, 1 total
Tests:       0 total
Exit status 1
```

### Head (commit `45a9a49d`)

Command:

```bash
nice -n 10 pnpm --filter web exec jest --maxWorkers=2 components/sales/customer-payload.spec.ts
```

Output:

```text
PASS components/sales/customer-payload.spec.ts
  buildCustomerPayload
    ✓ AC1: transforms flat form data with nested addresses into DTO structure (2 ms)
    ✓ AC2: sets empty and whitespace-only strings to null (not omitted as undefined) so existing fields can be cleared on edit (1 ms)
    ✓ AC3: handles address clearing with null values and omits undefined addresses
    ✓ AC4: drops notes from the API payload (DTO does not accept notes)
    ✓ AC4: payload contains nested address and no notes key (DTO whitelisting compliant) (1 ms)
    ✓ AC5: preserves valid numeric paymentTerms including 0 (Due on Receipt)
    ✓ AC5: trims string fields and handles optional priceListId
  buildAddressPayload
    ✓ returns undefined for undefined address input
    ✓ returns all null fields for null address input to clear existing address (1 ms)
    ✓ returns all null fields when all fields are empty or whitespace
    ✓ returns trimmed non-empty fields and null for blank fields
  clearableString
    ✓ returns undefined when input is undefined
    ✓ returns null when input is null, empty string, or whitespace
    ✓ returns trimmed string for non-empty input
  customer-form export
    ✓ AC6: customer-form exports buildCustomerPayload matching customer-payload

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        0.825 s
Exit status 0
```

---

## Pre-Push Quality Checks

| Check              | Command                                                                                                                                                                                      | Exit Code | Result              |
| :----------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :------------------ |
| Type-check         | `pnpm --filter web type-check`                                                                                                                                                               | 0         | Clean, 0 errors     |
| Linter             | `pnpm --filter web lint`                                                                                                                                                                     | 0         | Clean, 0 errors     |
| Related Unit Tests | `nice -n 10 pnpm --filter web exec jest --maxWorkers=2 --findRelatedTests components/sales/customer-form.tsx components/sales/customer-payload.ts components/sales/customer-payload.spec.ts` | 0         | 15 passed, 15 total |
| E2E Hygiene        | `python3 scripts/test_e2e_army_hygiene.py`                                                                                                                                                   | 0         | 11 passed, 11 total |
| Evidence Freshness | `python3 scripts/test_evidence_freshness.py`                                                                                                                                                 | 0         | 10 passed, 10 total |
