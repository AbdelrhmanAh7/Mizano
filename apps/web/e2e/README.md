# Seeded accountant browser gate (issue #23)

Run from the repository root:

```sh
pnpm install --offline --frozen-lockfile
pnpm db:generate
pnpm --filter "./packages/*" build
pnpm test:browser:offline
pnpm test:cpu-fixtures
pnpm test:browser
```

Playwright is pinned in the lockfile. Provision its matching Chromium once on
an approved connected setup machine with `pnpm --filter @mizano/web exec playwright install chromium`;
an offline machine needs that browser cache copied/provisioned ahead of time.
The runner never downloads a browser. Missing binaries fail the gate, never skip it.
An already installed Google Chrome can be used offline by setting
`MIZANO_BROWSER_CHANNEL=chrome`; record its actual version with the run evidence.
CI should use the pinned Playwright Chromium cache.
The runner launches and closes the selected browser before creating a database or
building apps, and records its actual version.

PostgreSQL must listen on `127.0.0.1:5435`, with the local development role allowed
to create `mizano_e2e_cxe2e`; Redis must listen on `127.0.0.1:6380`.
Only that database is accepted. The runner creates it if absent, deploys migrations,
then builds API and web sequentially. Existing data is retained; each journey
registers fresh synthetic tenants through the real API. Playwright global setup starts
directly owned Node servers on API `6103` and web `5103`, refuses existing listeners,
and stops only its own children with bounded teardown on success or failure. This
does not depend on Windows shell-wrapper process-tree termination. Fixture IDs are
retained in the ignored `apps/web/e2e/.test-results/` directory.
Synthetic auth secrets and loopback API URLs are set explicitly before the build.
The read-replica client is pinned to the same isolated database, query logging is
disabled, and the intake strategy is pinned to CPU rules even if the shell inherits
different settings.
No real Telegram token, document or external model is needed or used.

The API harness follows `createTestApp` from API E2E: real modules, database, guards,
validation and posting commands, with only the IP rate counter replaced so repeated
synthetic logins cannot trip the production five-per-minute limit. It does not
test production rate limiting. Web runs the production Next build.

Four cases run serially: English and Arabic at desktop and 375px widths. Each seeds
two tenants, company/chart/tax onboarding, an opening-balance journal, counterparties,
a bank register and a draft bill. Browser interactions log in, create and send an
invoice, approve the bill, receive payment and partially pay the supplier. Report
cells and API figures are asserted against exact expected totals and posted-ledger
account balances. Every trial-balance row and both total aliases reconcile to net
posted account turnover; AR/AP aging reconciles to the ledger controls. Rejected
approval, transport failure and locked-period actions must leave every ledger
account unchanged. Required routes have one expected status. Independent concurrent
tenant refresh requests, anonymous/cross-tenant reads, approval retry, a synthetic
503 transport failure and locked-period rejection are also checked.

After a normal run builds the apps, exercise the full browser negative controls:

```sh
MIZANO_BROWSER_MUTATION=required-route pnpm --filter @mizano/web exec playwright test --config e2e/playwright.config.mjs --project chromium-desktop --grep 'en:'
MIZANO_BROWSER_MUTATION=wrong-total pnpm --filter @mizano/web exec playwright test --config e2e/playwright.config.mjs --project chromium-desktop --grep 'en:'
```

Use `$env:MIZANO_BROWSER_MUTATION='required-route'` (or `'wrong-total'`) in
PowerShell and remove it after the run. Both commands must exit nonzero at the
invoice assertion. The first injects a 404; the second changes the real creation
response total. They are deliberately failing runs, never passing alternatives.
The optional browser channel applies to these commands too.

`test:browser:offline` tests database isolation, Decimal aggregation, and negative
controls: a required-route 404 or a wrong total must throw. It is a runner/assertion
unit gate, not browser acceptance. The opt-in mutation runs above test the actual
browser journey assertions.
`pnpm ci:full` is unchanged and does **not** include this gate. A separate CI job
must provision PostgreSQL/Redis, dependencies and Chromium, then execute the commands
above. Run seeded API E2E separately (including `accountant-journey` and `intake`).

`test:cpu-fixtures` runs the existing EN/AR invoice rules corpus (Egypt, Saudi
Arabia and UAE, missing totals and mismatches) without a model or network. It is
CPU parser evidence; it does not establish scanned-document OCR accuracy. The
intake E2E uses a stub extraction resolver and likewise is not an OCR benchmark.

Limits: onboarding/opening balances and draft-bill preparation use real API setup,
because there is no financial onboarding wizard in the current web tree. Some forms
still use English labels even on Arabic routes; Arabic login/actions and RTL are
checked, but full localization is not claimed. Telegram ingestion, CPU extraction,
worker restart, same-session expired-token races, concurrent double-click posting
and transactional fault injection remain API/intake acceptance gates. This suite
does not claim those gates pass. Traces/HAR/video/screenshots and server output are
disabled to avoid persisting credentials or document payloads. The metadata reporter
prints status/source locations, failed route paths/statuses and a sanitized final page path. Fixture IDs and a
metadata-only error-context replace Playwright's automatic failure page snapshot
for the pinned version. No issue is closed until exact-head independent review and merged
acceptance evidence exist.

The browser journey exposed three application defects fixed in this lane: financial
create-page navigation now preserves the locale, and payment-received pages preserve
the allocations already validated by the form. AP aging uses the required accounting
date instead of nullable legacy bill-date metadata, which previously crashed the
drilldown for manually created bills. The navigation/payload Jest suite checks EN/AR
save, cancel, back links and failure behavior; the affected AP report spec covers
both absent and conflicting legacy dates.
