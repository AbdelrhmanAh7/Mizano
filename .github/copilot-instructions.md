# Copilot instructions for Mizano

Follow [AGENTS.md](../AGENTS.md). Before suggesting or reviewing code, apply every rule in [docs/agents/review-lessons.md](../docs/agents/review-lessons.md). Each rule there is a past review finding, so flag any change that repeats one of those root causes, even in a different module.

Key invariants to check in reviews:

- Money is Decimal end to end, sent as fixed 4-dp strings and bounded to Decimal(19,4).
- `organizationId` is on every query and every row lock; referenced accounts are validated for role, not just ownership.
- Postings go through `JournalsService.create(orgId, dto, { tx, source })` with a guarded transition, the ledger lock is taken before reading settings, and the lock order is document → ledger.
- Later events reuse the accounts from the original journal, never the mutable defaults.
- Reversals never precede their source, date-only bounds are end-of-day, and web dates use the local calendar day.
- Every new string has en and ar versions, error states are distinct from empty states, and UI permissions match the API's.
