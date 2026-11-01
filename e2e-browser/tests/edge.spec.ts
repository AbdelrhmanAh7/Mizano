import { expect, test } from '@playwright/test';
import { registerAccount } from '../support/account';
import * as api from '../support/api';

test.describe('failure cases @edge', () => {
  test('C07: the same payment sent twice posts once', async () => {
    const a = await registerAccount('idem');
    const customer = await api.createCustomer(a);
    const invoice = await api.createInvoice(a, customer.id, [
      { description: 'Consulting', quantity: '2', rate: '500' },
    ]); // 1,000
    const body = {
      amount: '400',
      date: api.todayIso(),
      paymentMode: 'CASH',
      idempotencyKey: 'dbl-click-1',
    };
    const [first, second] = await Promise.all([
      api.attempt(a, 'POST', `/invoices/${invoice.id}/record-payment`, body),
      api.attempt(a, 'POST', `/invoices/${invoice.id}/record-payment`, body),
    ]);
    expect([first.status, second.status].every((s) => s === 200 || s === 201 || s === 409)).toBe(
      true,
    );
    // Whatever the second answer was, only one payment of 400 exists and the balance moved once.
    const after = await api.read<Record<string, string>>(a, `/invoices/${invoice.id}`);
    expect(after).toMatchObject({ status: 'PARTIALLY_PAID', balanceDue: '600' });
    const bank = (
      await api.read<{ accounts: { code: string; debit: string }[] }>(a, '/reports/trial-balance')
    ).accounts.find((x) => x.code === '1010');
    expect(bank).toMatchObject({ debit: '400.0000' });
  });

  test('C10: a locked month refuses new postings, and works again after unlocking', async () => {
    const a = await registerAccount('lock');
    const customer = await api.createCustomer(a);
    const draft = await api.createInvoice(
      a,
      customer.id,
      [{ description: 'Consulting', quantity: '1', rate: '300' }],
      false,
    );
    expect(
      (await api.attempt(a, 'PATCH', '/organization/lock-date', { lockDate: api.todayIso() }))
        .status,
    ).toBe(200);
    const refused = await api.attempt(a, 'PATCH', `/invoices/${draft.id}/send`);
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toMatch(/lock|locked|مقفل|مغلق/i);
    // Nothing was posted: the receivable is still zero.
    const tb = await api.read<{ accounts: { code: string }[] }>(a, '/reports/trial-balance');
    expect(tb.accounts.find((x) => x.code === '1200')).toBeUndefined();
    expect(
      (await api.attempt(a, 'PATCH', '/organization/lock-date', { lockDate: null })).status,
    ).toBe(200);
    expect((await api.attempt(a, 'PATCH', `/invoices/${draft.id}/send`)).status).toBe(200);
    const ar = (
      await api.read<{ accounts: { code: string; debit: string }[] }>(a, '/reports/trial-balance')
    ).accounts.find((x) => x.code === '1200');
    expect(ar).toMatchObject({ debit: '300.0000' });
  });
});
