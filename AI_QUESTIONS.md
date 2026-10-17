# AI_QUESTIONS — #130 follow-up

## Source-level correction commands for protected journal sources (review thread, `journals.service.ts:49`)

`PAYROLL`, `ASSET_DISPOSAL` and `COGM` journals are system-generated, so `JournalsService.reverse` rejects
them without an authorized source. Depreciation already has its own linked-reversal command
(`DepreciationService.reverse`). Payroll un-pay, disposal reversal and completed-work-order reversal have none.

This is a new feature (three posting-reversal commands that also revert the source record: payroll status,
asset status/register, stock movements), not part of "route the postings through JournalsService", and it would
push this PR well past the ~300-line guideline (it is already ~1,150 lines, mostly tests). Proposed follow-up
issues, one per command:

1. Payroll: `POST /payroll/:id/reverse-payment` (PAID -> PROCESSED, linked reversal of `PAYROLL:runId`).
2. Assets: `POST /assets/:id/reverse-disposal` (DISPOSED -> prior status, linked reversal of `ASSET_DISPOSAL:assetId`).
3. Manufacturing: `POST /work-orders/:id/reverse-completion` (COMPLETED -> IN_PROCESS, reverse the stock movements and `COGM:workOrderId`).

Question for the owner/CTO: accept these as follow-ups, or must #130 block on them?
