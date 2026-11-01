# Jarda browser journeys (plan)

Written with the Playwright planner on 1 Nov 2026 against the local stack (`pnpm e2e:up`), from the TestSprite journey names
(sign-up → onboarding, sign-in, language switch AR/EN, 390 px phone, customer, invoice, payment, credit note, vendor bill, bank
reconciliation, trial balance). Scope was cut on 1 Nov 2026 (the first-client launch) to the journeys that protect the first client.
Every test registers its own organization (`*@example.test`, random password); where a journey is about what a screen shows, the
documents it needs are created through the API in setup so the test stays fast and stable.

## In the suite (`e2e-browser/tests/`)

1. **Sign up in the form → dashboard** (`auth.spec.ts`; TestSprite ONB-004 / AUTH-006)
2. **Wrong password**: an error, still on sign-in, dashboard stays closed (`auth.spec.ts`)
3. **Sign in, sign out, dashboard closed again** (`auth.spec.ts`)
4. **Language switch**: sign-in page becomes Arabic and right to left (`auth.spec.ts`; TestSprite ONB-002)
5. **Create a customer in the form**: it appears in the list (`money.spec.ts`)
6. **Create an invoice in the form**: draft with the right total (`money.spec.ts`)
7. **Part payment**: status Partially Paid, balance due, payment history (`money.spec.ts`)
8. **Credit note**: Posted, customer balance after it (`money.spec.ts`; TestSprite AIO-010: the Posted status and customer balance are there)
9. **Vendor bill**: opened, listed with its balance (`money.spec.ts`)
10. **Trial balance**: Balanced, receivable 500, payable 300, totals 1,300 = 1,300 (`money.spec.ts`; RPT-015)
11. **Bank reconciliation page opens** for a new organization (`money.spec.ts`)
12. **390 px phone**: menu, Sales → Customers, no sideways scrolling (`money.spec.ts`)
13. _Skipped with a bug link:_ the invoice page lists its credit note with the right amount (issue #656)

## Added after the scope change (1 Nov 22:30-22:40)

- **Golden scenario** (`golden.spec.ts`, @happy): 3 invoices (14 % VAT), 2 receipts, a credit note, 2 bills, 2 payments; every figure hand-calculated in the file: totals to the piastre, statuses, balances, AR and AP aging, P&L, VAT payable and input, trial balance accounts and both totals (1,919.7193), and the same numbers on the screens.
- **Exact arithmetic** (@happy): the cases of `docs/strategy/demo-acceptance.md` (2 x 100 at 14 % = 200 / 28 / 228, a 10 % discount, mixed tax, decimals).
- **@edge** (`edge.spec.ts`): C07 the same payment sent twice posts once; C10 a locked month refuses posting and works again after unlocking; wrong password.
- Tags and `E2E_BASE_URL` for a deployed copy (docs/E2E-BROWSER.md).

## Backlog

C03 quote to invoice, PDF contents; C04 expense, vendor credit; C06 bill reading (needs the intake worker and the sample bill fixture `e2e-browser/fixtures/sample-bill.pdf`, total 114 EGP); C08 bank import and matching; C11 team; C12 settings; C05 Arabic on every screen; forgot-password mail, onboarding wizard, Arabic accounting screens, vendor payment, reports pages, bank statement import and matching,
role permissions, tenant isolation in the browser (covered by the API suites in `e2e-army/`).
