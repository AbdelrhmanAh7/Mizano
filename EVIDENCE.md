# Evidence — #212 slice 1 (#162 items 1–2)

No e2e-army test: API-only service change, no UI flow. No screenshots. Sentry issue: none.

Command: `nice -n 10 pnpm --filter api exec jest --maxWorkers=2 src/modules/sales/services/delivery-challans.service.spec.ts`

| AC                                                                             | Verified by                                                                                              | Result                                                                      |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| AC1 `count: 0`, no row in org -> NotFoundException, no line writes             | "answers 404 and writes no lines…"                                                                       | fails on base (service reverted), passes on head                            |
| AC2 `count > 1` -> rejected, nothing persisted                                 | "rejects and writes no lines when … more than one row"                                                   | passes on head (ConflictException; the tx throws, so it rolls back)         |
| AC3 four validation failures assert `$transaction` and `updateMany` not called | `expectNoWrites` in the customer/invoice/item/warehouse tests                                            | passes on head                                                              |
| AC4 no write mock runs for a scoped-out id                                     | `expectNoWrites` covers update/updateMany/create/createMany/delete/deleteMany/upsert on challan and line | passes on head                                                              |
| AC5 spec passes                                                                | full spec file                                                                                           | head: 26 passed, jest exit 0; base: 2 failed (404 and 400 tests), 24 passed |

Also added: "answers 400 … already ISSUED" (fails on base).
Lint of both files: clean. `pnpm --filter api type-check`: 10 errors, none in delivery-challans files (logger.service.ts etc., not touched here).
