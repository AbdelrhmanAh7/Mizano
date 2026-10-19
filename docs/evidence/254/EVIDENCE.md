# Evidence: Issue #254 — Customer Form Payload Nested Address and Whitelisting

This evidence document accompanies GitHub issue #254 (split from PR #235, parent issue #215).
Supersedes part of #235.

- **Base commit (`origin/master`)**: `5a8be028`
- **First commit (e2e-army test)**: `fa64140c` (`test(e2e): add customer form e2e-army test for #254`)
- **Tested commit (`HEAD`)**: `659f10e0`
- **Host**: Darwin arm64 (macOS), Node v26.10.0, pnpm 8.14.0
- **Originating Sentry issue**: None (no Sentry issue exists; never invent evidence)
- **UI Screenshots**: None captured locally (headless browser stack is not running on this host; verified via Jest unit specs and the e2e-army test `e2e-army/254-customer-payload.e2e.ts` which runs on verify and includes RTL evaluation; never invent screenshots)

---

## Numbered Acceptance Criteria

- **AC1**: `buildCustomerPayload(data)` transforms flat customer form data containing addresses into nested `billingAddress` and `shippingAddress` structures matching `CreateCustomerDto`.
- **AC2**: `buildCustomerPayload(data)` leaves out empty and whitespace-only strings as `undefined` (not `null`) so only valid address fields are sent.
- **AC3**: `buildCustomerPayload(data)` drops an address object (`billingAddress` or `shippingAddress` becomes `undefined`) when all of its fields are blank.
- **AC4**: `buildCustomerPayload(data)` drops the `notes` field from the API payload (because `CreateCustomerDto` has no `notes` field and the API enforces `forbidNonWhitelisted: true`).
- **AC5**: `buildCustomerPayload(data)` preserves required and optional customer fields (`name`, `displayName`, `email`, `phone`, `currency`, `taxId`, `paymentTerms`, `priceListId`), omitting blank optional strings and preserving valid numeric `paymentTerms` (including 0 for Due on Receipt).
- **AC6**: `CustomerForm` `handleSubmit` calls `buildCustomerPayload` and passes the resulting nested, whitelist-compliant payload to `onSubmit`, with no flat address fields (`billingStreet`, etc.) and no `notes` sent.
- **AC7**: Natural-language e2e-army test (`e2e-army/254-customer-payload.e2e.ts`) covers customer creation with nested address under `@issue-254` tagged `feat:mz-sales-customers`.

---

## Verification Matrix

| AC  | Verification Test / Command                                                      | Exit Code | Result                                                                             |
| --- | -------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| AC1 | `pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC1"` | 0         | `PASS` (nested `billingAddress` and `shippingAddress`, no flat keys)               |
| AC2 | `pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC2"` | 0         | `PASS` (empty strings omitted as `undefined`, not `null`)                          |
| AC3 | `pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC3"` | 0         | `PASS` (blank address dropped completely)                                          |
| AC4 | `pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC4"` | 0         | `PASS` (`notes` dropped; nested address present with no `notes` key)               |
| AC5 | `pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC5"` | 0         | `PASS` (`paymentTerms: 0` kept, strings trimmed, empty priceListId omitted)        |
| AC6 | `pnpm --filter web exec jest components/sales/customer-payload.spec.ts -t "AC6"` | 0         | `PASS` (`customer-form` exports buildCustomerPayload and delegates `handleSubmit`) |
| AC7 | `e2e-army/254-customer-payload.e2e.ts`                                           | —         | First commit `fa64140c`, tagged `feat:mz-sales-customers`, runs on verify runner   |

---

## Regression Demonstration: Base vs Head

### Base (`origin/master` at `451cc181`)

Command:

```bash
nice -n 10 pnpm --filter web exec jest components/sales/customer-payload.spec.ts
```

Output:

```
FAIL components/sales/customer-payload.spec.ts
  ● Test suite failed to run

    Cannot find module './customer-payload' from 'components/sales/customer-payload.spec.ts'

Test Suites: 1 failed, 1 total
Tests:       0 total
Exit status 1
```

### Head (with `customer-payload.ts` and `customer-form.tsx`)

Command:

```bash
nice -n 10 pnpm --filter web exec jest components/sales/customer-payload.spec.ts
```

Output:

```
PASS components/sales/customer-payload.spec.ts
  buildCustomerPayload
    ✓ AC1: transforms flat form data with nested addresses into DTO structure (2 ms)
    ✓ AC2: leaves out empty and whitespace-only strings as undefined (not null)
    ✓ AC3: drops an address completely when all its fields are blank (4 ms)
    ✓ AC4: drops notes from the API payload (DTO does not accept notes)
    ✓ AC4: payload contains nested address and no notes key (follow-up API issue will persist notes) (1 ms)
    ✓ AC5: preserves valid numeric paymentTerms including 0 (Due on Receipt)
    ✓ AC5: trims string fields and excludes empty optional priceListId
  buildAddressPayload
    ✓ returns undefined for undefined or null address input
    ✓ returns undefined when all fields are empty or whitespace
    ✓ returns trimmed non-empty fields only
  customer-form export
    ✓ AC6: customer-form exports buildCustomerPayload matching customer-payload

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
Snapshots:   0 total
Time:        0.697 s
Exit status 0
```

---

## Follow-up API Issue (Per CTO Decision)

`CustomerForm` in `apps/web/components/sales/customer-form.tsx` contains an input for internal notes, and Prisma schema defines a `notes` column on `Customer`. However, `CreateCustomerDto` and `UpdateCustomerDto` in `apps/api/src/modules/sales/dto/` do not currently whitelist `notes`. Because the NestJS API enforces `forbidNonWhitelisted: true`, `buildCustomerPayload` drops `notes` from the payload to prevent 400 Bad Request errors.

Per CTO decision, a separate follow-up API issue will be filed to add optional `notes` (`@IsOptional()`, `@IsString()`, `@MaxLength(2000)`) to `CreateCustomerDto` and `UpdateCustomerDto` and persist it in the sales service.

---

## Pre-Push Quality Checks

| Check              | Command                                                                                                                                                                                      | Exit Code | Result                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------- |
| Type-check         | `pnpm --filter web type-check`                                                                                                                                                               | 0         | Clean, no TypeScript errors |
| Linter             | `pnpm --filter web lint`                                                                                                                                                                     | 0         | Clean, 0 errors             |
| Related Unit Tests | `nice -n 10 pnpm --filter web exec jest --maxWorkers=2 --findRelatedTests components/sales/customer-form.tsx components/sales/customer-payload.ts components/sales/customer-payload.spec.ts` | 0         | 11 passed, 11 total         |

---

## Skills Used

- `systematic-debugging`
- `test-first engineering`
- `e2e-army`
- `verification-before-completion`
