# Jarda online test: sign-up to partial payment over a public HTTPS address

Date: **1 November 2026**, Africa/Cairo. Session jarda-deploy. Test data only.

Tested Code Head: `4f5372be` (master; the API and web images were built from this commit).

## Where it ran

- **Host: the owner's MacBook** (Docker Desktop, arm64), because the Raspberry Pi was not reachable from
  this Mac (no SSH entry, no known host, nothing on the local network, no Tailscale). See the decision
  of 1 November in [DECISIONS.md](../../DECISIONS.md).
- **Stack:** the Pi compose file [`deploy/pi/docker-compose.pi.yml`](../../../deploy/pi/docker-compose.pi.yml)
  unchanged (Postgres 16, Redis 7, migrate, api, worker, web), plus a local override kept outside the
  repository that replaces the named tunnel with two **Cloudflare quick tunnels** (no account, no token,
  free). This is the README's two-hostname layout: one address for the web app, one for the API; the web
  image was built with the API address baked in, `CORS_ORIGIN` and `NEXTAUTH_URL` are the web address.
- **Public addresses (temporary):** web `https://monitored-downloading-cordless-travelers.trycloudflare.com`,
  API `https://fountain-panel-rob-hazards.trycloudflare.com/api`. A quick tunnel has no uptime promise and
  gets a new random address whenever it restarts, so these addresses are for this test only.
- **Checks on the public API:** `/api/health` reports database and Redis connected; `/api/docs` returns 404
  (Swagger off in production).
- No product code changed. Secrets were generated locally, kept in a private file outside every
  repository and never printed.

## How it was tested

Headless Chrome (`playwright-core` 1.64.1 with the system Chrome, in the session scratchpad, not added to
the repository) against the public web address. One script, run four times: English and Arabic, at
**390 px** and **1440 px**. Each run signs up a new organization, so the four runs share nothing.

Steps per run:

1. Page direction is `rtl` for Arabic, `ltr` for English.
2. Sign up with country Egypt, then sign in; the dashboard opens.
3. Settings → Organization shows base currency **EGP** (Egyptian pound).
4. Create a customer.
5. Create invoice INV-0001 for EGP 1,000.00 and send it (this posts the journal entry).
6. Record a partial payment of EGP 400.00 against it, **double-clicking** the save button.
7. The invoice shows EGP 400.00 paid and EGP 600.00 due; the payments list has **exactly one** row for
   the customer.
8. Accounting → Trial balance: cash 400.00 and receivables 600.00 (debit), revenue 1,000.00 (credit),
   totals 1,000.00 = 1,000.00, marked balanced.
9. Switch language from the header button; the address moves to the other locale and the direction
   flips.

## Results

| Run          | Steps passed | Notes                                                     |
| ------------ | ------------ | --------------------------------------------------------- |
| English 1440 | 9 / 9        | Double-click: 2 save requests counted, 1 payment visible. |
| English 390  | 9 / 9        | Same.                                                     |
| Arabic 1440  | 9 / 9        | Same; base currency reads "EGP - جنيه مصري".              |
| Arabic 390   | 9 / 9        | Same.                                                     |

**Verdict: PASS.** The tested journey (sign-up, base currency, customer, invoice, partial payment,
trial balance, language switch) passed in both languages and both widths over a public HTTPS address.

Observation (not a defect): the test counted two save requests leaving the browser on each double-click,
and afterwards exactly one payment was visible (invoice 400 paid / 600 due, one row in the payments
list). This is consistent with the duplicate-payment guard added in PR #623; the test did not inspect
the requests' keys or the server's replies.

## Screenshots in this folder

| File                                                                     | Shows                                      |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| [ar-1440-01-signup.png](ar-1440-01-signup.png)                           | Arabic sign-up, country Egypt (EGP)        |
| [en-1440-03-base-currency.png](en-1440-03-base-currency.png)             | Base currency EGP in organization settings |
| [en-1440-05-invoice-sent.png](en-1440-05-invoice-sent.png)               | INV-0001 sent, EGP 1,000.00                |
| [en-1440-06-payment-form.png](en-1440-06-payment-form.png)               | Partial payment of 400 before saving       |
| [en-1440-08-payments-list.png](en-1440-08-payments-list.png)             | One payment after the double-click         |
| [en-390-07-invoice-partly-paid.png](en-390-07-invoice-partly-paid.png)   | Invoice partly paid, phone width           |
| [ar-1440-07-invoice-partly-paid.png](ar-1440-07-invoice-partly-paid.png) | Invoice partly paid, Arabic                |
| [en-1440-09-trial-balance.png](en-1440-09-trial-balance.png)             | Trial balance, English                     |
| [ar-1440-09-trial-balance.png](ar-1440-09-trial-balance.png)             | Trial balance, Arabic, balanced            |
| [ar-390-09-trial-balance.png](ar-390-09-trial-balance.png)               | Trial balance, Arabic, phone width         |
| [en-390-10-language-switched.png](en-390-10-language-switched.png)       | English → Arabic switch                    |
| [ar-390-10-language-switched.png](ar-390-10-language-switched.png)       | Arabic → English switch                    |
