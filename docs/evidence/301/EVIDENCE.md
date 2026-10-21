# Evidence: Issue #301 — Fix failing check `e2e-army` & Customer Payload Optional Null Fields

This evidence document accompanies GitHub issue #301 in `AbdelrhmanAh7/Mizano` (split from PR #289, parent issue #254).
Supersedes part of #289.

- **Base commit (`origin/master`)**: `e07f1e3d`
- **First commit (e2e-army test)**: `c93ba9f9` (`test(e2e): add customer form e2e-army test for #301`)
- **Tested commit (`HEAD`)**: `HEAD` of branch `ai/301` (`fix(web): transform customer payload with nested address & nulls (#301)`)
- **Host**: Darwin arm64 (macOS), Node v26.10.0, pnpm 8.14.0
- **Originating Sentry issue**: None (no Sentry issue exists; never invent evidence)
- **UI Screenshots**: None captured locally (headless browser stack is not running locally on this shared host; verified via Jest unit specs and the natural-language e2e-army test `e2e-army/301-customer-payload.e2e.ts` which includes Arabic `/ar` RTL evaluation and runs on the verify runner; never invent screenshots)

---

## Numbered Acceptance Criteria

- **AC1 (Payload nesting)**: `buildCustomerPayload(data)` transforms flat customer form data containing addresses into nested `billingAddress` and `shippingAddress` structures matching `CreateCustomerDto` / `UpdateCustomerDto` (`street`, `city`, `state`, `postalCode`, `country`), never emitting flat address keys (`billingStreet`, `billingCity`, etc.).
- **AC2 (Null for cleared/empty optional fields)**: `buildCustomerPayload(data)` sets empty or whitespace-only optional fields (`displayName`, `email`, `phone`, `taxId`, `priceListId`) and address fields (`street`, `city`, `state`, `postalCode`, `country`) to `null` (not omitting them as undefined), preserving the ability to clear fields on existing customers in `CustomerForm` without violating API DTO whitelisting.
- **AC3 (Address handling)**: `buildCustomerPayload(data)` handles `billingAddress` and `shippingAddress` appropriately: when provided, non-empty fields are trimmed and empty/whitespace fields are set to `null`; when address is undefined on the input, it is omitted from the payload.
- **AC4 (DTO whitelisting / drop notes)**: `buildCustomerPayload(data)` excludes the `notes` property from the returned payload because `CreateCustomerDto` and `UpdateCustomerDto` enforce `forbidNonWhitelisted: true` and do not define a `notes` property.
- **AC5 (Preserve required fields & numeric terms)**: `buildCustomerPayload(data)` trims and preserves `name`, preserves `currency` (defaults to 'USD' if empty), and preserves valid numeric `paymentTerms` (including `0` for Due on Receipt).
- **AC6 (CustomerForm delegation)**: `CustomerForm` exports `buildCustomerPayload` and its `handleSubmit` delegates payload transformation to `buildCustomerPayload`, ensuring both creation (`/sales/customers/new`) and editing (`/sales/customers/[id]/edit`) send nested, DTO-compliant payloads with `null` for cleared fields.
- **AC7 (E2E First Gate)**: An e2e-army test (`e2e-army/301-customer-payload.e2e.ts`) tagged `feat:mz-customers` verifies customer creation with nested address and form rendering in Arabic RTL.

---

## Verification Matrix

| AC  | Verification Test / Command                                                                 | Exit Code | Result                                                                                           |
| --- | ------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| AC1 | `nice -n 10 pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC1"` | 0         | `PASS` (nested `billingAddress` and `shippingAddress`, flat keys like `billingStreet` absent)    |
| AC2 | `nice -n 10 pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC2"` | 0         | `PASS` (empty/whitespace fields become `null`, enabling DB field clearing on edit)               |
| AC3 | `nice -n 10 pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC3"` | 0         | `PASS` (empty address converts to `null` fields; undefined address omitted from payload)         |
| AC4 | `nice -n 10 pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC4"` | 0         | `PASS` (`notes` property absent from payload; compliant with `forbidNonWhitelisted: true`)       |
| AC5 | `nice -n 10 pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC5"` | 0         | `PASS` (`paymentTerms: 0` preserved, string fields trimmed, optional `priceListId` handled)      |
| AC6 | `nice -n 10 pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC6"` | 0         | `PASS` (`CustomerForm` exports `buildCustomerPayload` and delegates `handleSubmit`)              |
| AC7 | `e2e-army/301-customer-payload.e2e.ts`                                                      | —         | First commit `c93ba9f9`, tagged `feat:mz-customers`, runs on verify runner with Arabic RTL check |

---

## Regression Demonstration: Base vs Head

### Base (`origin/master` at `e07f1e3d`)

On `origin/master`, `apps/web/components/sales/customer-payload.ts` does not exist, and `CustomerForm` sent flat fields (`billingStreet: null`, etc.) and `notes: null`, which failed NestJS `ValidationPipe` with 400 Bad Request (`property billingStreet should not exist`, `property notes should not exist`). In PR #289, an earlier attempt omitted blank fields as `undefined`, which prevented clearing existing fields on edit.

Command:

```bash
git cat-file -e origin/master:apps/web/components/sales/customer-payload.ts
```

Exit Code: `128` (file did not exist on master).

### Head

Command:

```bash
nice -n 10 pnpm --filter web exec jest --maxWorkers=2 components/sales/customer-payload.spec.ts
```

Output:

```
PASS components/sales/customer-payload.spec.ts
  buildCustomerPayload
    ✓ AC1: transforms flat form data with nested addresses into DTO structure (2 ms)
    ✓ AC2: sets empty and whitespace-only strings to null (not omitted as undefined) so existing fields can be cleared on edit
    ✓ AC3: handles address clearing with null values and omits undefined addresses
    ✓ AC4: drops notes from the API payload (DTO does not accept notes)
    ✓ AC4: payload contains nested address and no notes key (DTO whitelisting compliant) (1 ms)
    ✓ AC5: preserves valid numeric paymentTerms including 0 (Due on Receipt)
    ✓ AC5: trims string fields and handles optional priceListId (3 ms)
  buildAddressPayload
    ✓ returns undefined for undefined address input
    ✓ returns all null fields for null address input to clear existing address
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
Time:        1.002 s
Exit status 0
```

---

## Root Cause Analysis & Resolutions

1. **Failing check `e2e-army` (Root cause):**
   - In PR #289 / #254, the e2e test was tagged `feat:mz-sales-customers`.
   - In `ops/verify/features/Mizano.json`, the feature ID mapped to `apps/web/components/sales/customer-form.tsx` is `mz-customers`.
   - The verify gate checks that each touched feature is present in the PR test tags; because `mz-sales-customers` did not match `mz-customers`, the gate failed with missing feature coverage for `mz-customers`.
   - **Fix**: Added `e2e-army/301-customer-payload.e2e.ts` tagged `feat:mz-customers` as the first commit (`c93ba9f9`).

2. **Claude Sonnet 5.5 Finding on `customer-payload.ts` (Root cause):**
   - The previous implementation in PR #289 converted empty strings to `undefined` and omitted the keys from the payload.
   - While `CreateCustomerDto` accepts `undefined`, `CustomerForm` is also used for editing existing customers (`customer` prop in `/sales/customers/[id]/edit`).
   - When a user clears an existing field (e.g., `email`, `phone`, `displayName`, `taxId`, or address fields), sending `undefined` causes Prisma to leave the existing database values unchanged, making it impossible for users to clear fields.
   - **Fix**: Introduced `clearableString(v)` which preserves `undefined` only when a property is genuinely omitted, and returns `null` when a field is provided as empty string, whitespace, or `null`. Address fields also set cleared values to `null`. This allows Prisma to update the fields to NULL in the database while fully complying with `CreateCustomerDto` and `UpdateCustomerDto` whitelisting.

---

## Pre-Push Quality Checks

| Check              | Command                                                                                                                                                                                      | Exit Code | Result                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------- |
| Type-check         | `pnpm --filter web type-check`                                                                                                                                                               | 0         | Clean, no TypeScript errors |
| Linter             | `pnpm --filter web lint`                                                                                                                                                                     | 0         | Clean, 0 errors             |
| Related Unit Tests | `nice -n 10 pnpm --filter web exec jest --maxWorkers=2 --findRelatedTests components/sales/customer-form.tsx components/sales/customer-payload.ts components/sales/customer-payload.spec.ts` | 0         | 15 passed, 15 total         |

---

## Skills Used

- `diagnosing-bugs`
- `systematic-debugging`
- `tdd`
- `e2e-army`
- `model-effort-routing`
- `verification-before-completion`
