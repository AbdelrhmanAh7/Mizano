# Review lessons

Every rule below comes from a real review finding on PRs #33–#47. Each one cost a review round. Read this file before you write code, a worker brief or a review, whatever agent you are (Claude, Codex, CodeRabbit or any other). Apply the _root cause_, not just the example: most findings came back in a different module with the same cause.

**When a review raises a new kind of problem, add it here in the same PR that fixes it.**

## 1. Locking and concurrency

- **Lock the ledger before reading what you post with.** Take `lockOrganizationLedger(tx, orgId)` (`common/utils/ledger-lock.ts`) before reading org settings, the base currency or default accounts that the journal depends on. Every path that makes a journal posted must hold it: `create`, `reverse` and `post`. _(bill approve, invoice send, VAT submit, journal post)_
- **Lock the document row before snapshotting the values you post.** If you post from a plain read, an edit that commits concurrently makes the ledger disagree with the document. Use `SELECT … FOR UPDATE` on the document first. _(invoice send/update)_
- **Pick one lock order per workflow and use it on every path that touches the same rows.** The default is document → other documents (sorted by id) → ledger. VAT returns are a deliberate exception: submit and payment both take ledger → return row, because submission must freeze the ledger before recomputing. What deadlocks is two paths taking the same locks in opposite orders. _(VAT submit vs. payment)_
- **Scope every row lock by organization:** `WHERE id = $1 AND "organizationId" = $2 FOR UPDATE`. A caller-supplied foreign id must lock nothing. _(lockInvoices, lockBills)_
- **A check and the write it guards share one transaction and one lock.** Duplicate and overlap checks run inside the same tx as the insert, under an advisory lock. _(VAT period overlap)_
- **Lock every record you read to decide a mutation.** For example, voiding a credit note must lock the note before reading `appliedToInvoiceId`, or a concurrent apply slips through. _(credit-note void vs. apply)_

## 2. Idempotency and retries

- **Every state change is a guarded transition:** `updateMany({ where: { id, organizationId, status: FROM } })` plus a `count` check that throws `ConflictException`. Journal idempotency is the tenant-scoped unique key `(organizationId, sourceType, sourceId)`.
- **An idempotency key must stay the same across retries of one action.** Generating a fresh random id on the server for each request defeats it. A client UUID created once per user action and reused on every retry is fine (`idempotencyKeyFor`); so are `profileId:YYYY-MM-DD` or a sha256 of file + row. _(manual recurring execute, import retries)_
- **Store idempotency markers where users cannot edit them.** Notes, reason and reference text get edited; use an append-only store such as AuditLog `IMPORT_ROW`. _(import markers)_
- **Bulk operations reuse the single-record command through `runBulk`** and report `{ processed, total, failures }`. Never write a bulk `updateMany` that skips the posting logic.

## 3. Use the accounts that were actually posted

- **Mutable default accounts change, so later events must use the account the original journal used,** not today's default. A refund credits the AP account the vendor-credit journal debited. A VAT payment debits the payable the settlement journal credited. A credit's VAT reverses the account the bill approval debited. _(vendor credits, VAT payment)_
- **Aggregate over historical accounts too.** VAT figures include every account that carried VAT lines, not only the current defaults.

## 4. Dates

- **A journal is dated on the document date.**
- **A reversal or refund never precedes its source.** Default to `max(today, sourceDate)` and reject an earlier explicit date. _(JournalsService.reverse, vendor-credit refund)_
- **A date-only end bound means end of day** (`endOfUtcDay`). A void at 10:00 on the end date belongs to that period.
- **Web defaults use the user's local calendar date** (`format(d, 'yyyy-MM-dd')`), never `toISOString()`, which gives yesterday in UTC+ zones such as Cairo.
- **"Current" figures exclude future-dated entries.** Cash today means lines dated ≤ end of today.
- **Side records carry the document date.** Inventory movements are dated on the adjustment date, not on `createdAt` = now.
- **Historical reports keep later-voided documents in their original period** and show the reversal on the void date. Filtering on today's status rewrites history. _(customer statement)_

## 5. Single-currency ledger and data

- **Reject a document whose `currencyCode` differs from the org `baseCurrency`.** Never post foreign amounts one-for-one. Carry the currency when copying, for example quote → invoice.
- **Only bank registers (`BankAccount.currency`) carry a meaningful currency.** `Account.currency` is a schema default and must not be used for eligibility.
- **Freeze the base currency once journals exist,** and serialize that check with posting through the ledger lock.
- **Never write a data migration that guesses.** If no stored evidence separates "explicitly chosen" from "default", do not backfill; fix the read rule instead. _(baseCurrency and account-currency backfills, both removed)_
- **Missing organization settings stay unknown.** Reject validation when the organization or its base currency is unavailable; never substitute SAR. Tax-ID and VAT rules come from the organization's base currency, so a misread extracted currency cannot select another country's rules. _(intake field validation)_
- **Handle legacy rows.** Journals created before source linking have `sourceType = null`, for example opening balance `OB-001`. Reversal and replacement must find them, or explicitly refuse.

## 6. Money arithmetic

- **Use Decimal end to end for money arithmetic and comparisons, and send fixed 4-dp strings.** No `parseFloat`, `Number()` or `toNumber()` in sums, balances or checks. Converting an exact API string to a number only at the display boundary (formatting, chart plotting via `moneyToNumber`) is allowed.
- **Bound inputs to `Decimal(19,4)`:** at most 15 integer and 4 fraction digits, validated with `common/dto/decimal-string.ts`. Bound computed totals before writing.
- **Allocate VAT cumulatively.** Each partial credit's VAT = `round(totalVAT × cumulative/total) − already allocated`, so the parts sum exactly to the whole.
- **The web preview rounds per line exactly like the server** (`computeDocumentTotals`), otherwise the shown and stored totals differ.
- **When storage changes (net vs. gross), update every view:** list, detail, PDF and report. _(tax-inclusive expenses)_
- **Keep accepted amounts.** Converting a quote copies its stored lines and totals rather than recomputing them.

## 7. Tenancy, roles and validation

- **Scope every tenant resource by `organizationId`** in queries, locks and lookups. Child rows are scoped through their tenant-scoped parent, and pre-authentication lookups such as login by email are the documented exception. Another tenant's ids return 404 (or 400 when they come from the body), and soft-deleted parents return 404.
- **Ownership checks for `@Sse` routes live in a guard, not the handler.** Once the stream starts the status is already 200, so a `NotFoundException` thrown in the handler arrives as an in-band error event and the tenant probe sees 200. `IntakeJobOwnerGuard` returns the real 404. _(intake progress SSE)_
- **Validate the role of every referenced account, not only ownership.** Refund, payment and paid-from accounts must pass the bank/cash rule (`common/utils/bank-cash-accounts.ts`). Expense offsets must be `EXPENSE`. Credit accounts must come from the source document's lines.
- **Validate direction and type.** A withdrawal can't settle an invoice, and switching a recurring profile to JOURNAL must validate the journal template.
- **When a form needs data the role can't read, add a narrow lookup endpoint guarded by the form's own permission,** for example `/invoices/tax-rate-options` (`sales.view`) or `/inventory-adjustments/account-options` (`inventory.create`). Never widen permissions.
- **Gate UI actions with exactly the API route's permission.**
- **Money-bearing imports require the same per-entity create permission as the single-record routes.**
- **Adding auth to a server endpoint or socket changes its contract: update every client in the same PR** (send the token, handle expiry and reconnect). A server-only change silently breaks the client. _(events gateway vs `use-realtime`)_

## 8. Voided and deleted records

- **Posted documents that were voided stay readable** (read-only, with `deletedAt` set) on their detail endpoint so journal source links resolve. Lists exclude them. Deleted drafts, which never posted, return 404.
- **Current figures (open balances, aging, dashboards) exclude DRAFT, VOID and deleted documents.** Historical statements and period reports keep a posted document that was voided later in its original period, with the reversal on the void date (see 4).

## 9. Reports must reconcile

- **Every headline figure equals its ledger control account.** AR = open invoice balances − unapplied credit notes; AP = open bill balances − unapplied vendor credits; cash = bank + cash ledger. Assert these equalities in E2E.
- **Ledger figures come only from posted, non-deleted journal lines.** Never add `Account.openingBalance`; opening balances are journals.
- **Scope every component of a report to the same period** (bills and credits alike).
- **Use grouped aggregates, not one query per account.**

## 10. Logging, audit and secrets

- **Never log or audit values:** no document text, amounts, tax ids, LLM output, query parameters or raw error objects. Log metadata instead (ids, counts, lengths, durations, field names, status), and use `describeError(error, { includeMessage: false })` wherever an error message could contain document or user data. `redactText` only masks credential-shaped strings, so it does not make document text safe to log.
- **Clients can't claim trusted provenance.** HTTP log captures are forced to `FRONTEND`.
- **Compare secrets in constant time, with no default secrets.** Re-apply file permissions on files that already exist.

## 11. Web UI

- **Every new string needs en and ar,** including dialog titles, confirm and cancel buttons, placeholders, selector labels and report row names. Shared components accept localized label props.
- **Keep error, loading and empty distinct.** Never collapse a failed query into `[]` ("no accounts"). Show an error with Retry, and block submit while a required lookup is loading or failed.
- **Show the currency of the document**, falling back to the org base currency, never the counterparty's default. The API must actually return the fields the UI relies on (for example `baseCurrency`).
- **Payment-wide effects get payment-wide warnings.** Voiding a payment affects every allocated bill.
- **Changing lines does not acknowledge extracted amount blockers.** A different net alone proves nothing about tax or gross reconciliation. Keep amount blockers subject to explicit acknowledgement, including when extracted amounts are missing. _(intake field validation)_

## 12. Caches, tests and scope

- **Every endpoint that posts or reverses uses one `@InvalidatesLedger(...)`,** imports included.
- **After changing behaviour, rerun the affected seeded E2E before pushing,** and update E2E expectations that legitimately changed. Never weaken an assertion to pass.
- **Don't add a new money path inside a fix PR.** If a feature needs its own posting (for example bank-account opening journals), reject the input and route to the existing command, such as Opening Balances. New paths bring currency, retry, relink and equity-account edge cases.
- **Keep files LF** (`core.autocrlf=false`), with lower-case conventional commit subjects of 72 characters or fewer. Never use `--no-verify`.

## Review process

- Run `/code-review` on every PR (inline comments). CodeRabbit (configured in `.coderabbit.yaml`, which points it at this file) does full reviews once a seat is assigned; if one doesn't start automatically then, comment `@coderabbitai review`.
- Fix every valid finding at its root, reply on the thread with the commit, and resolve it. When a finding is wrong, reply once with the reason and resolve it.
- Add any new root cause to this file in the same PR.

## Ops and deploy

- **Health checks must probe a route that exists.** Grep the app's routes first (Next has no `/api/health` unless a route file exists; `/robots.txt` returns 200 without auth). A probe of a missing route makes the container permanently unhealthy.
- **Next standalone in Docker needs `HOSTNAME=0.0.0.0`.** Docker sets `HOSTNAME` to the container id and Next binds to it, so probes on `127.0.0.1` and peers fail. Probe `127.0.0.1`, not `localhost` (IPv6 in alpine).
- **Persist deploy state where later commands read it.** Pinned digests live in `.env.pi` (atomic rewrite of those keys only), or a later `compose up` silently reverts to the old images.
- **Rollback must be repeatable.** Track an active pointer in `deployments.log` (`OK`/`ROLLBACK` lines), not "the previous OK line", or the second rollback is a no-op.
- **Check DB readiness over TCP** (`pg_isready -h 127.0.0.1`). The temporary init server listens on the unix socket only and passes a socket probe.
- **Dedupe alerts on stable keys** (check name), never on live values like percentages; alert once on start and once on recovery.
