# AI_QUESTIONS — #182

Deferred from this slice (first slice = offset mapping only, per spec):

1. Restore the reverted async entity-extraction path (T3) in the service/controller/DTO.
2. Update the E2E PDF fixtures and run the full E2E suite for Unicode length handling.
3. Offsets are only set for subtotal/tax/total; date, invoice number, vendor and tax id still expose line evidence only.
4. Local `pnpm --filter api type-check` fails on the base because `@mizano/shared-types` is not built (logger/filter files); none of the errors are in the changed files.
