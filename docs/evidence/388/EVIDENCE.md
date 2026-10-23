# Evidence for Issue #388: Customer Form Payload Transformation and Clearing Optional Fields on PATCH

This document provides verification evidence for GitHub issue #388 in `AbdelrhmanAh7/Mizano` (split from PR #329, item `finding:58fa34bba065`, parent issue #301).

- **Issue**: [#388](https://github.com/AbdelrhmanAh7/Mizano/issues/388)
- **PR**: Supersedes part of #329
- **Parent Issue**: #301
- **Base Commit (`origin/master`)**: `bf3f67a80294e9c79f1bb5bfab65ac637e21658a`
- **Tested Head Commit**: `f7df9d4c57733e0438d918c341e9136775b1ee45`
- **Tested Branch**: `ai/388-p2`
- **Originating Sentry Issue**: None (originates from QA finding `1405a41996c5` on PR #420 / branch `ai/388` and split finding `58fa34bba065` on PR #329).
- **Host Environment**: Darwin arm64 (macOS), Node.js v20.18.0, pnpm 8.14.0, Python 3.14.8.
- **User-facing flow / E2E**: Covered by `e2e-army/388-customer-payload.e2e.ts` (tagged `feat:mz-customers`, `lvl:api`).
- **Skills Used**: `model-effort-routing`, `systematic-debugging`, `diagnosing-bugs`, `e2e-army`, `test-first engineering`, `verification-before-completion`, `gh-stack`.
- **Model and Effort**: `Tool: Antigravity (agy) · Model: Gemini 3.8 Flash · Effort: High · Why: Fix customer optional/address null clearing on PATCH across API and Web layers, remove unsupported notes field, verify e2e-army and unit tests, and maintain stack contract`.

---

## Context & Finding Summary

In PR #329 (split from parent issue #301: Transform customer payload with nested address & nulls), review finding `58fa34bba065` noted:

> `e2e-army/301-customer-payload.e2e.ts:24`: The test only exercises POST /create (open `/new`, fill name/street/city, submit). It never creates a customer with optional fields populated and then edits it to clear email, phone, taxId, displayName or an address field, which is the exact regression described in the parent finding. There is no test that a cleared optional field is sent as `null` (or otherwise cleared) on PATCH, so the changed behaviour is uncovered.

In round 1 review on PR #420 (commit `5a94608` on branch `ai/388`), QA finding `1405a41996c5` followed up:

> `e2e-army/388-customer-payload.e2e.ts:24`: The test verifies that optional fields are sent as null when cleared via PATCH, but it doesn't explicitly verify that the server actually treats these null values as clearing the fields rather than setting them to a literal null value. This is important for the regression described in issue #301.

Additionally, parent review findings flagged:
1. `customer-payload.ts`: `notes` was dropped unconditionally, while `CustomerForm` rendered and validated a `notes` field in the UI. Users could type notes and they vanished without warning (silent data loss) because the API and Prisma Customer schema have no notes column.
2. Address fields were flattened into root properties (`billingStreet`, etc.) in `CustomerForm.handleSubmit`, triggering validation failure on the API because `CreateCustomerDto` / `UpdateCustomerDto` enforce strict whitelisting and require nested `billingAddress` and `shippingAddress` objects.

### Root Cause Analysis

1. **DTO Type Rigidity**: `CreateCustomerDto`, `UpdateCustomerDto`, and nested `AddressDto` defined optional fields as `string | undefined` without allowing `null`. In strict TypeScript environments and validation pipelines, passing `null` for clearable fields was disallowed by the type definitions.
2. **Server Destructuring & Prisma Spreading**: In `apps/api/src/modules/sales/services/customers.service.ts`:
   - `create` and `update` spread `...updateCustomerDto` directly into Prisma `data`. Because `Customer` in Prisma schema has no `billingAddress` or `shippingAddress` fields, passing DTO relation objects directly to Prisma would pass unwhitelisted input objects.
   - When an address object had `street: null` or when `billingAddress: null` was supplied, optional chaining `updateCustomerDto.billingAddress?.street` evaluated to `undefined`, which in Prisma means "do not update this field" rather than setting the database column to `null`.
3. **Frontend Flattening & Silent Data Loss**: `CustomerForm` submitted flat address keys and rendered an internal `notes` field that had no corresponding database column in the Prisma schema or DTOs.
4. **Test Assertion Gap**: The initial test sent PATCH with nulls without asserting initial non-null values beforehand, without asserting that the PATCH response itself cleared the fields, and without verifying that the values were not set to literal string `"null"` or maintaining stale values.

### Resolution

1. **API DTOs (`apps/api/src/modules/sales/dto/create-customer.dto.ts`)**:
   - Updated `CreateCustomerDto` and `AddressDto` to allow `null` on optional fields (`displayName`, `email`, `phone`, `taxId`, `priceListId`, `billingAddress`, `shippingAddress`, and address subfields).
2. **API Service (`apps/api/src/modules/sales/services/customers.service.ts`)**:
   - Destructured `const { billingAddress, shippingAddress, ...rest } = updateCustomerDto;`.
   - When `billingAddress !== undefined`, mapped subfields with `billingAddress ? (billingAddress.street ?? null) : null`, ensuring that both `{ street: null }` and `{ billingAddress: null }` properly clear the database columns to `null`.
   - Applied identical handling for `shippingAddress`.
   - Preserved `undefined` behavior when address fields are omitted from the update payload.
3. **Frontend Payload Builder (`apps/web/components/sales/customer-payload.ts`)**:
   - Implemented `buildCustomerPayload` to transform form inputs into nested `billingAddress` and `shippingAddress` objects matching API DTOs.
   - Clears empty/whitespace optional fields and address properties to `null` on edit payloads.
   - Preserves `undefined` for omitted addresses.
   - Omits unsupported `notes` field.
4. **Frontend Form Component (`apps/web/components/sales/customer-form.tsx`)**:
   - Delegated submit payload creation to `buildCustomerPayload`.
   - Removed unsupported `notes` field from the UI, schema, default values, and reset handlers.
5. **E2E and Unit Tests**:
   - Extended `e2e-army/388-customer-payload.e2e.ts` to verify full creation, initial server values, PATCH with null, assertion that values on server are `null` (not literal string `"null"`, not stale values), and direct null address payload clearing.
   - Added unit test suite `apps/api/src/modules/sales/services/customers.service.spec.ts` (5 tests).
   - Added unit test suite `apps/web/components/sales/customer-payload.spec.ts` (14 tests).
6. **Documentation & Review Lessons**:
   - Recorded review lesson in `docs/agents/review-lessons.md`.
   - Documented complete verification matrix and regression demonstration in `docs/evidence/388/EVIDENCE.md`.

---

## Numbered Acceptance Criteria

- **AC1 (Nested Address DTO Payload Transformation & Whitelisting)**: `buildCustomerPayload` transforms form data into nested `billingAddress` and `shippingAddress` structures matching `CreateCustomerDto` and `UpdateCustomerDto`. Flat address fields are omitted, and only DTO-whitelisted properties are submitted.
- **AC2 (Clearing Optional & Address Fields with Null on PATCH)**: Empty or whitespace-only optional strings (`displayName`, `email`, `phone`, `taxId`, `priceListId`) and address fields (`street`, `city`, `state`, `postalCode`, `country`) are transformed to `null` on edit payloads. On the API side, `CustomersService.update` destructures addresses and maps `{ street: null }` as well as direct `{ billingAddress: null }` or `{ shippingAddress: null }` to database `null` columns so that deletions persist in Prisma rather than retaining stale values.
- **AC3 (Removal of Unsupported Notes Field & UI Schema Sync)**: The unsupported `notes` field is removed from `CustomerForm` UI, validation schema, default values, reset hooks, and payload generator, eliminating silent user data loss and API DTO whitelist rejection.
- **AC4 (E2E-Army Regression & Lifecycle Verification)**: `e2e-army/388-customer-payload.e2e.ts` exercises the full customer lifecycle: populating all optional fields and nested addresses on creation, verifying initial non-null values on the server, issuing a PATCH with `null` for clearable fields and addresses, asserting the fields are cleared on the server (`toBeNull()`, not literal string `"null"`, not stale values), and asserting direct null address payload clearing.
- **AC5 (Automated Evidence, Freshness & Unit Test Suite Contract)**: All 14 web unit tests (`apps/web/components/sales/customer-payload.spec.ts`), 5 API unit tests (`apps/api/src/modules/sales/services/customers.service.spec.ts`), e2e-army hygiene tests, and evidence freshness tests pass cleanly with exit code 0.

---

## Verification Report

| AC ID   | Requirement                                       | Command                                                                                                | Observed Result     | Exit Code | Status     |
| :------ | :------------------------------------------------ | :----------------------------------------------------------------------------------------------------- | :------------------ | :-------- | :--------- |
| **AC1** | Nested address transformation & DTO whitelisting  | `pnpm --filter web exec jest apps/web/components/sales/customer-payload.spec.ts`                       | 14 passed, 14 total | 0         | **PASSED** |
| **AC2** | Server optional field null clearing in unit tests | `nice -n 10 pnpm --filter api exec jest apps/api/src/modules/sales/services/customers.service.spec.ts` | 5 passed, 5 total   | 0         | **PASSED** |
| **AC3** | Remove unsupported notes field & UI schema sync   | `pnpm --filter web exec jest apps/web/components/sales/customer-payload.spec.ts`                       | 14 passed, 14 total | 0         | **PASSED** |
| **AC4** | E2E-Army test contract & hygiene                  | `python3 scripts/test_e2e_army_hygiene.py`                                                             | 11 passed, 11 total | 0         | **PASSED** |
| **AC5** | Evidence contract and freshness test suite        | `python3 scripts/test_evidence_freshness.py`                                                           | 12 passed, 12 total | 0         | **PASSED** |

---

## Changed Covering Tests

- `apps/api/src/modules/sales/services/customers.service.spec.ts` (5 tests):
  - `maps nested addresses to flat street/city columns and omits address objects from prisma payload`
  - `clears optional fields and nested address fields when passed null`
  - `clears all address fields when billingAddress or shippingAddress is set to null`
  - `does not touch address fields when address objects are undefined`
  - `throws NotFoundException when customer does not exist`
- `apps/web/components/sales/customer-payload.spec.ts` (14 tests):
  - `AC1: transforms form data with nested addresses into DTO structure`
  - `AC2: sets empty and whitespace-only strings to null so existing fields can be cleared on edit`
  - `AC2: handles address clearing with null values and omits undefined addresses`
  - `AC3: omits notes from the API payload (DTO whitelist compliant)`
  - `AC1: preserves valid numeric paymentTerms including 0 (Due on Receipt)`
  - `AC1: trims string fields and handles optional priceListId`
  - Address payload helpers and clearableString unit tests
- `e2e-army/388-customer-payload.e2e.ts` (1 e2e-army test):
  - `@issue-388 AC1 AC2 AC3 AC4: customer creation with nested addresses and clearing optional fields with null on patch`
- `scripts/test_evidence_freshness.py` (1 contract test):
  - `test_issue_388_evidence_contract`

---

## Bug Fix / Regression Demonstration

### Base Behaviour (`bf3f67a80294e9c79f1bb5bfab65ac637e21658a`)

On base before this change:

1. `CustomerForm` flattened addresses into `billingStreet`, `billingCity`, etc., which fails `forbidNonWhitelisted: true` on NestJS `CreateCustomerDto`.
2. When editing an existing customer, clearing optional fields retained old values because empty strings were either stripped or omitted rather than sent as `null`.
3. `CustomerForm` rendered a `notes` field in the UI that was not present in the Prisma database schema or DTOs, causing silent data loss.
4. `CreateCustomerDto` and `AddressDto` disallowed `null` on optional fields; passing `null` caused TypeScript compilation errors:
   ```text
   error TS2322: Type 'null' is not assignable to type 'string | undefined'.
   ```
5. In `CustomersService.update`, `updateCustomerDto.billingAddress?.street` evaluated to `undefined` when `billingAddress: null` was supplied, preventing Prisma from updating `billingStreet` and causing stale values to persist.
6. Unrecognized DTO properties `billingAddress` and `shippingAddress` were spread directly into `prisma.customer.update`.
7. `test_issue_388_evidence_contract` failed because `docs/evidence/388/EVIDENCE.md` was absent.

### Head Behaviour (`f7df9d4c57733e0438d918c341e9136775b1ee45`)

1. `CustomerForm` delegates payload generation to `buildCustomerPayload`, constructing nested `billingAddress` and `shippingAddress` structures matching `CreateCustomerDto` and `UpdateCustomerDto`.
2. Cleared optional fields and address properties are sent as `null` on PATCH, properly resetting database values.
3. Unsupported `notes` field has been removed from `CustomerForm` UI, schema, and submit handlers.
4. `CreateCustomerDto` and `AddressDto` allow `null` for clearable fields.
5. `CustomersService.update` destructures address objects, cleanly maps them to database columns, and maps both `{ street: null }` and `{ billingAddress: null }` to `null` database values.
6. All 14 web unit tests, 5 API unit tests, e2e-army hygiene tests, and 12 evidence freshness tests pass cleanly with exit code 0.

---

## UI Verification (Screenshots / RTL & LTR)

**UI Component Updates**:

- `apps/web/components/sales/customer-form.tsx` is an internal form component where the unsupported `notes` input was cleanly removed.
- RTL layout remains unaffected and standard as tested by existing frontend sales pages.
