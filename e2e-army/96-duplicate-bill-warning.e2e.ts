import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

/**
 * Issue #96: duplicate-invoice warning before posting (vendor + exact amount +
 * date window). The throwaway database is seeded with a duplicate pair
 * (prisma/seed.ts): the posted bill BILL-004 and the draft bill BILL-005,
 * same vendor (Supplier Alpha), same amount (2500), same currency, dated one
 * day apart — inside the ±3-day window. The demo admin has purchases.view.
 */

/** Demo admin sign-in with locators (the saved-session restore loses Mizano's auth state, so every test signs in itself). */
async function signIn(fx: { app: any; screen: any; browser: any }) {
  // First hit compiles the route and a submit before hydration is a plain GET: retry like the hub suite does.
  for (let i = 0; i < 3; i++) {
    await fx.app.open('/en/login');
    await expect(fx.screen.getByRole('button', 'Sign In')).toBeVisible();
    await fx.screen.getByRole('textbox', 'Email').fill('admin@mizano.com');
    await fx.screen.getByRole('textbox', 'Password').fill('password123');
    await fx.screen.getByRole('button', 'Sign In').tap();
    try {
      await expect(fx.browser).toHaveURL(/\/en\/(dashboard|onboarding|accounting|sales)/, {
        timeout: 40_000,
      });
      return;
    } catch (e) {
      if (i === 2) throw e;
    }
  }
}

test('@issue-96 AC1: a draft bill matching a posted bill shows a dismissible, non-blocking duplicate warning', async (fx) => {
  const { app, agent, screen } = fx;
  await signIn(fx);
  await app.open('/en/purchases/bills');
  await agent.waitFor('the bills list has finished loading');
  await agent.assert(
    'the bills list contains the draft bill BILL-005 from Supplier Alpha with the status Draft',
  );
  await app.open('/en/purchases/bills/bill-BILL-005');
  await agent.waitFor(
    'the bill page for the draft bill BILL-005 has finished loading and shows the bill number, the vendor Supplier Alpha and the amount',
  );
  await agent.assert(
    "a warning titled 'Possible duplicate bill' is shown, listing the posted bill BILL-004 of the same vendor with the same amount and a date within 3 days, and the 'Approve & post' button is still visible and enabled — the warning does not block approval",
  );
  await agent.act("dismiss the 'Possible duplicate bill' warning with its dismiss (X) button");
  await expect(screen.getByText('Possible duplicate bill')).toHaveCount(0);
  await agent.assert(
    "the duplicate warning is gone and the bill BILL-005 is still an unposted draft (status Draft, 'Approve & post' still offered)",
  );
});

test('@issue-96 AC1 (negative): a posted bill with no matching draft shows no duplicate warning', async (fx) => {
  const { app, agent, screen } = fx;
  await signIn(fx);
  await app.open('/en/purchases/bills/bill-BILL-001');
  await agent.waitFor('the bill page for the posted bill BILL-001 has finished loading');
  await expect(screen.getByText('Possible duplicate bill')).toHaveCount(0);
  await agent.assert(
    "no 'Possible duplicate bill' warning is shown on this posted bill and no approval button is offered for it",
  );
});

test('@issue-96 AC2: the Arabic draft bill page shows the warning right-to-left', async (fx) => {
  const { app, agent, browser } = fx;
  await signIn(fx);
  await app.open('/ar/purchases/bills/bill-BILL-005');
  await agent.waitFor('the Arabic bill page for the draft bill BILL-005 has finished loading');
  expect(await browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await agent.assert(
    "a warning titled 'فاتورة مكررة محتملة' (possible duplicate bill) is shown and lists the posted bill BILL-004",
  );
});
