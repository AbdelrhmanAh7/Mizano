# Evidence: issue #215, Customer form payload rejected (400 'billingStreet should not exist')

This file covers issue #215 only. It lives in `docs/evidence/215/EVIDENCE.md` per the hub rule (2026-10-20), keeping root `EVIDENCE.md` unchanged to prevent cross-PR merge conflicts.

## Overview

- **Issue**: #215 (Customer form: payload rejected (400 'billingStreet should not exist') — can't create customers)
- **PR**: #233
- **Base Commit (`master`)**: `origin/master` (merged cleanly into this branch)
- **Host**: Darwin arm64 (macOS)
- **Domain Areas**: Sales (`apps/api/src/modules/sales`, `apps/web/components/sales`, `apps/web/messages`)

---

## Numbered Acceptance Criteria & Verification Mapping

| AC ID   | Acceptance Criterion                                                                                             | Verification Method                                                                                                                                                                                                                               | Exit Code | Status |
| ------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------: | :----: |
| **AC1** | New customer with name, e-mail, phone, billing + shipping address and notes saves (201) and appears in the list. | `e2e-army/215-customer-form.e2e.ts` (API test: `POST /customers` -> 201, `GET /customers?search=...` contains customer ID; and UI test: `/en/sales/customers/new` form submission saves with name, email, phone, billing/shipping address, notes) |     0     | PASSED |
| **AC2** | Editing that customer saves (200) and the address round-trips.                                                   | `e2e-army/215-customer-form.e2e.ts` (API test: `PATCH /customers/:id` -> 200, address & notes round-trip; UI test: `/ar/sales/customers/:id/edit` updating billing street to '2 Tahrir Sq' verifies persistence)                                  |     0     | PASSED |
| **AC3** | Works in /en and /ar with RTL direction.                                                                         | `apps/web/messages/{en,ar}/sales.json` + `customer-form.tsx` i18n with `useTranslations` + `e2e-army/215-customer-form.e2e.ts` (`browser.evaluate(() => document.documentElement.dir)` asserts `rtl` in `/ar`)                                    |     0     | PASSED |
| **AC4** | Unit/contract test: the payload the form builds passes the DTO validation; legacy flat payload fails with 400.   | `apps/api/src/modules/sales/dto/create-customer.dto.spec.ts` (6 tests) & `apps/web/components/sales/customer-form.spec.tsx` (4 tests)                                                                                                             |     0     | PASSED |
| **AC5** | Creating a sales invoice for the new customer works (demo step).                                                 | `e2e-army/215-customer-form.e2e.ts` (API test: `POST /invoices` with `customerId` -> 201) + `apps/web/components/sales/invoice-form.tsx` accessible customer select trigger (`id="customerId"` aria-label)                                        |     0     | PASSED |

---

## Changed Covering Tests

1. **`apps/api/src/modules/sales/dto/create-customer.dto.spec.ts`** (6 tests):
   - `CreateCustomerDto accepts the form payload with and without notes`
   - `UpdateCustomerDto accepts the form payload with and without notes`
   - `UpdateCustomerDto inherits notes: an edit that only changes or clears notes is accepted`
   - `CreateCustomerDto rejects the legacy flat address payload the form used to send`
   - `UpdateCustomerDto rejects the legacy flat address payload the form used to send`
   - `rejects notes longer than 2000 characters`

2. **`apps/api/src/modules/sales/services/customers.service.spec.ts`** (2 tests):
   - `create stores nested addresses as columns and keeps notes, without passing the nested objects to Prisma`
   - `update maps nested addresses to columns, scoped to the organization`

3. **`apps/web/components/sales/customer-form.spec.tsx`** (4 tests):
   - `buildCustomerPayload: nests the addresses and keeps notes, with no flat address keys`
   - `buildCustomerPayload: sends empty inputs as null so an edit can clear them`
   - `CustomerForm submit: renders accessible labels for billing and shipping addresses`
   - `CustomerForm submit: passes the nested payload to onSubmit`

4. **`e2e-army/215-customer-form.e2e.ts`** (2 scenarios):
   - API contract: create (201), list verification, edit round-trip (200), invoice creation (201), legacy flat payload rejection (400).
   - UI customer form creation in `/en`, list appearance, and edit round-trip in `/ar` with `dir=rtl`.

---

## Verification Evidence & Test Execution

### 1. API Contract & Service Unit Tests

```bash
pnpm --filter api exec jest src/modules/sales/dto/create-customer.dto.spec.ts src/modules/sales/services/customers.service.spec.ts
```

```text
PASS src/modules/sales/services/customers.service.spec.ts
  CustomersService address mapping (#215)
    ✓ create stores nested addresses as columns and keeps notes, without passing the nested objects to Prisma (6 ms)
    ✓ update maps nested addresses to columns, scoped to the organization (1 ms)

PASS src/modules/sales/dto/create-customer.dto.spec.ts
  Customer DTOs accept the payload the customer form builds (#215)
    ✓ CreateCustomerDto accepts the form payload with and without notes (4 ms)
    ✓ UpdateCustomerDto accepts the form payload with and without notes (1 ms)
    ✓ UpdateCustomerDto inherits notes: an edit that only changes or clears notes is accepted (1 ms)
    ✓ CreateCustomerDto rejects the legacy flat address payload the form used to send (1 ms)
    ✓ UpdateCustomerDto rejects the legacy flat address payload the form used to send (1 ms)
    ✓ rejects notes longer than 2000 characters (1 ms)

Test Suites: 2 passed, 2 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        7.683 s
Exit code: 0
```

### 2. Web Customer Form Unit Tests

```bash
pnpm --filter @mizano/web test components/sales/customer-form.spec.tsx
```

```text
PASS components/sales/customer-form.spec.tsx
  buildCustomerPayload
    ✓ nests the addresses and keeps notes, with no flat address keys (4 ms)
    ✓ sends empty inputs as null so an edit can clear them
  CustomerForm submit
    ✓ renders accessible labels for billing and shipping addresses (78 ms)
    ✓ passes the nested payload to onSubmit (71 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        1.937 s
Exit code: 0
```

### 3. TypeScript Type-Check & ESLint Checks

```bash
pnpm --filter api type-check && pnpm --filter @mizano/web type-check
pnpm --filter api lint && pnpm --filter @mizano/web lint
```

```text
> api@0.1.0 type-check
> tsc --noEmit && tsc --noEmit -p test/tsconfig.e2e.json

> @mizano/web@0.1.0 type-check
> tsc --noEmit

Exit code: 0

> api@0.1.0 lint
> eslint "{src,apps,libs,test}/**/*.ts"

> @mizano/web@0.1.0 lint
> next lint

Exit code: 0
```

---

## Root Causes of QA Verification Findings & Resolutions

1. **Customer form submission timeout on 'Billing Street' (repro: `/en/sales/customers/new` step 5)**:
   - _Root cause_: `customer-form.tsx` had a generic label "Street Address" under the Billing card, and `CitySelect` was disabled when `country` was empty (`disabled={disabled || !country}`), blocking interaction when entering city before country.
   - _Fix_: Added explicit `Billing Street Address` label, `aria-label="Billing Street"`, `data-testid="billing-street"`, and enabled `CitySelect` input when country is not yet selected.

2. **Customer edit flow timeout on clicking customer / edit button (repro: `/en/sales/customers` steps 2-5)**:
   - _Root cause_: The action dropdown trigger button had text `...` without an accessible name (`aria-label`), and customers could not be found if the initial creation timed out.
   - _Fix_: Added `aria-label="Customer actions"` to the dropdown trigger, ensuring accessibility and reliable automated locator discovery.

3. **Invoice creation timeout on 'Select Customer' (repro: `/en/sales/invoices/new` step 2)**:
   - _Root cause_: `<SelectTrigger>` inside `invoice-form.tsx` lacked `id="customerId"` and `aria-label="Select Customer"`, preventing `<Label htmlFor="customerId">` from associating with the combobox.
   - _Fix_: Added `id="customerId"` and `aria-label="Select Customer"` to `<SelectTrigger>` in `apps/web/components/sales/invoice-form.tsx`.

4. **Arabic customer form timeout (repro: `/ar/sales/customers/new` steps 2-9)**:
   - _Root cause_: `customer-form.tsx` hardcoded all form labels in English without `next-intl` integration.
   - _Fix_: Added `useTranslations('sales')` to `customer-form.tsx` and added comprehensive English and Arabic translation strings in `apps/web/messages/{en,ar}/sales.json` for all customer form fields, cards, and buttons.

---

## Regression Demonstration

- **On base commit (`origin/master`)**:
  `POST /api/customers` with `notes`, `billingStreet`, `billingCity` fails with `400 Bad Request`:
  `"property notes should not exist, property billingStreet should not exist, property billingCity should not exist"`.
- **On head (`ai/215`)**:
  `CreateCustomerDto` and `UpdateCustomerDto` accept nested `billingAddress`, `shippingAddress`, and optional `notes`. `create-customer.dto.spec.ts` proves that the nested payload is accepted (tests 1-3) and the legacy flat payload is rejected (tests 4-5).
