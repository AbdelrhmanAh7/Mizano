import { expect, test } from '@playwright/test';
import { registerAccount, signIn } from '../support/account';
import * as api from '../support/api';

/**
 * Golden scenario, hand-calculated BEFORE running (EGP, VAT 14 %). The expected numbers are written here, never read back
 * from the app.
 *
 *  Invoices   INV-0001 2 x 500 + 14 %  = 1,000 + 140 = 1,140     INV-0002 1 x 250, no VAT = 250
 *             INV-0003 3 x 100 + 14 %  =   300 +  42 =   342
 *  Receipts   600 on INV-0001 (balance 540), 250 on INV-0002 (paid)
 *  Credit     100 on INV-0003, a gross amount: net 100 / 1.14 = 87.7193, VAT 12.2807 -> balance 242
 *  Bills      BILL-0001 1 x 400 + 14 % = 400 + 56 = 456   BILL-0002 2 x 150 = 300
 *  Payments   456 on BILL-0001 (paid), 100 on BILL-0002 (balance 200)
 *
 *  Receivable 540 + 242 = 782        Payable 200        Bank 600 + 250 - 456 - 100 = 294
 *  Revenue 1,000 + 250 + 300 = 1,550 less returns 87.7193 = 1,462.2807   Expenses 400 + 300 = 700
 *  Profit 762.2807   VAT: output 182 - 12.2807 = 169.7193 payable, input 56 -> net due 113.7193
 *  Trial balance: debits 294 + 782 + 56 + 87.7193 + 700 = 1,919.7193 = credits 200 + 169.7193 + 1,550
 */
test.describe('golden scenario @happy', () => {
  test('every figure matches the hand calculation', async ({ page }) => {
    test.setTimeout(180_000);
    const a = await registerAccount('golden');
    const customer = await api.createCustomer(a);
    const i1 = await api.createInvoice(a, customer.id, [
      { description: 'Consulting', quantity: '2', rate: '500', taxRate: '14' },
    ]);
    const i2 = await api.createInvoice(a, customer.id, [
      { description: 'Setup', quantity: '1', rate: '250' },
    ]);
    const i3 = await api.createInvoice(a, customer.id, [
      { description: 'Licences', quantity: '3', rate: '100', taxRate: '14' },
    ]);

    // Invoice totals to the piastre, as returned when each invoice was created.
    expect([i1['subtotal'], i1['taxAmount'], i1['grandTotal']]).toEqual(['1000', '140', '1140']);
    expect([i2['subtotal'], i2['taxAmount'], i2['grandTotal']]).toEqual(['250', '0', '250']);
    expect([i3['subtotal'], i3['taxAmount'], i3['grandTotal']]).toEqual(['300', '42', '342']);

    await api.recordPayment(a, i1.id, '600');
    await api.recordPayment(a, i2.id, '250');
    await api.createCreditNote(a, customer.id, i3.id, '100');
    const vendor = await api.createVendor(a);
    const b1 = await api.createBill(a, vendor.id, [
      { description: 'Hosting', quantity: '1', rate: '400', taxRate: '14' },
    ]);
    const b2 = await api.createBill(a, vendor.id, [
      { description: 'Stationery', quantity: '2', rate: '150' },
    ]);
    expect([b1['subtotal'], b1['taxAmount'], b1['grandTotal']].map(String)).toEqual([
      '400',
      '56',
      '456',
    ]);
    await api.payBill(a, vendor.id, b1.id, '456');
    await api.payBill(a, vendor.id, b2.id, '100');

    // Statuses and balances.
    const inv = async (id: string) => api.read<Record<string, string>>(a, `/invoices/${id}`);
    expect(await inv(i1.id)).toMatchObject({ status: 'PARTIALLY_PAID', balanceDue: '540' });
    expect(await inv(i2.id)).toMatchObject({ status: 'PAID', balanceDue: '0' });
    expect(await inv(i3.id)).toMatchObject({ status: 'PARTIALLY_PAID', balanceDue: '242' });
    const bill = async (id: string) => api.read<Record<string, string>>(a, `/bills/${id}`);
    expect(await bill(b1.id)).toMatchObject({ status: 'PAID', balanceDue: '0' });
    expect(await bill(b2.id)).toMatchObject({ status: 'PARTIALLY_PAID', balanceDue: '200' });

    // Aging: only the two unpaid invoices and the one unpaid bill, all current.
    const ar = await api.read<{
      summary: Record<string, string>;
      buckets: { current: { invoiceNumber: string; balanceDue: string }[] };
    }>(a, '/reports/receivables-aging');
    expect(ar.summary).toMatchObject({ current: '782.0000', total: '782.0000', over90: '0.0000' });
    expect(ar.buckets.current.map((x) => [x.invoiceNumber, x.balanceDue])).toEqual([
      ['INV-0001', '540.0000'],
      ['INV-0003', '242.0000'],
    ]);
    const ap = await api.read<{
      summary: Record<string, string>;
      buckets: { current: { billNumber: string; balanceDue: string }[] };
    }>(a, '/reports/payables-aging');
    expect(ap.summary).toMatchObject({ current: '200.0000', total: '200.0000' });
    expect(ap.buckets.current.map((x) => [x.billNumber, x.balanceDue])).toEqual([
      ['BILL-0002', '200.0000'],
    ]);

    // Profit and loss.
    const pl = await api.read<Record<string, { total: string } | string>>(
      a,
      '/reports/profit-and-loss',
    );
    expect((pl['revenue'] as { total: string }).total).toBe('1462.2807');
    expect((pl['operatingExpenses'] as { total: string }).total).toBe('700.0000');
    expect(pl['operatingProfit']).toBe('762.2807');

    // Trial balance: every account and both totals.
    const tb = await api.read<{ accounts: { code: string; debit: string; credit: string }[] }>(
      a,
      '/reports/trial-balance',
    );
    // Every account of the hand calculation, both sides, and nothing else.
    expect(tb.accounts.map((x) => [x.code, x.debit, x.credit]).sort()).toEqual(
      [
        ['1010', '294.0000', '0.0000'], // bank: 600 + 250 - 456 - 100
        ['1200', '782.0000', '0.0000'], // receivable: 540 + 242
        ['2000', '0.0000', '200.0000'], // payable
        ['2200', '0.0000', '169.7193'], // VAT payable: 182 - 12.2807
        ['2210', '56.0000', '0.0000'], // VAT input
        ['4000', '0.0000', '1550.0000'], // revenue
        ['4400', '87.7193', '0.0000'], // sales returns: 100 / 1.14
        ['6999', '700.0000', '0.0000'], // expenses
      ].sort(),
    );
    // Totals in whole ten-thousandths, so no floating point is involved.
    const units = (k: 'debit' | 'credit') =>
      tb.accounts.reduce((s, x) => s + Math.round(Number(x[k]) * 10_000), 0);
    expect(units('debit')).toBe(19_197_193);
    expect(units('credit')).toBe(19_197_193);

    // And the screens show the same figures.
    await signIn(page, a);
    await page.goto('/en/accounting/trial-balance');
    await expect(page.getByText('Balanced', { exact: true })).toBeVisible();
    const totals = page.getByRole('row', { name: /^Total/ }).getByRole('cell');
    await expect(totals.nth(1)).toHaveText('1,919.72');
    await expect(totals.nth(2)).toHaveText('1,919.72');
    await page.goto(`/en/sales/invoices/${i1.id}`);
    await expect(page.getByText('Partially Paid').first()).toBeVisible();
    await expect(page.getByText('Balance Due').locator('..')).toContainText('EGP 540.00');
    await expect(page.getByText('Grand Total').locator('..')).toContainText('EGP 1,140.00');
  });

  // docs/strategy/demo-acceptance.md case 6: exact arithmetic. Expected values are hand-calculated, never read back.
  for (const c of [
    {
      name: '2 x 100 at 14 %',
      lines: [{ description: 'Item', quantity: '2', rate: '100', taxRate: '14' }],
      net: '200',
      tax: '28',
      gross: '228',
    },
    {
      name: 'a 10 % line discount: 1 x 1,000 less 10 % at 14 %',
      lines: [{ description: 'Item', quantity: '1', rate: '1000', discount: '10', taxRate: '14' }],
      net: '900',
      tax: '126',
      gross: '1026',
    },
    {
      name: 'mixed tax: 100 at 14 % and 100 at no tax',
      lines: [
        { description: 'Taxed', quantity: '1', rate: '100', taxRate: '14' },
        { description: 'Exempt', quantity: '1', rate: '100' },
      ],
      net: '200',
      tax: '14',
      gross: '214',
    },
    {
      name: 'decimals: 3 x 33.33 at 14 %',
      lines: [{ description: 'Item', quantity: '3', rate: '33.33', taxRate: '14' }],
      net: '99.99',
      tax: '14',
      gross: '113.99',
    },
  ]) {
    test(`exact arithmetic: ${c.name} @happy`, async () => {
      const a = await registerAccount('maths');
      const customer = await api.createCustomer(a);
      const invoice = await api.createInvoice(a, customer.id, c.lines, false);
      expect(
        [invoice['subtotal'], invoice['taxAmount'], invoice['grandTotal']].map(Number),
      ).toEqual([c.net, c.tax, c.gross].map(Number));
    });
  }
});
