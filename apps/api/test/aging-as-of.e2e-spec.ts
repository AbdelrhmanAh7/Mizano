/**
 * Aging as of a cutoff (#586): one tenant posts a bill and an invoice before the cutoff, pays part
 * before it, voids a pre-cutoff payment after it and settles the rest after it, all through the
 * real HTTP API. Aging as of the cutoff must rebuild the balances the ledger had then (and equal
 * the AR/AP control accounts as of that date), while today's aging shows today's balances.
 */
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { isoDay } from './helpers/journey.helper';
import { PrismaService } from '../src/prisma/prisma.service';

const D = (v: unknown): Prisma.Decimal => new Prisma.Decimal(String(v));

describe('Aging as of a cutoff (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: TestTenant;
  let a: ApiHelper;
  const acc = { ar: '', ap: '', bank: '', rent: '' };
  const cutoff = isoDay(-10);

  /** Credit-minus-debit (AP) or debit-minus-credit (AR) of an account up to the end of `day`. */
  async function controlAsOf(accountId: string, day: string, side: 'debit' | 'credit') {
    const sum = await prisma.journalLine.aggregate({
      where: {
        accountId,
        journal: {
          organizationId: tenant.organizationId,
          isPosted: true,
          deletedAt: null,
          date: { lte: new Date(`${day}T23:59:59.999Z`) },
        },
      },
      _sum: { debit: true, credit: true },
    });
    const debit = sum._sum.debit ?? D(0);
    const credit = sum._sum.credit ?? D(0);
    return side === 'debit' ? debit.sub(credit) : credit.sub(debit);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    tenant = await registerTenant(app, 'AgingAsOf');
    a = tenant.api;
    expect((await a.post('/accounts/seed-defaults')).status).toBe(201);
    const settings = (await a.get('/organization/account-settings')).body;
    acc.ar = settings.defaultArAccountId;
    acc.ap = settings.defaultApAccountId;
    acc.bank = settings.defaultBankAccountId;
    const list = await a.get('/accounts').query({ limit: 500 });
    acc.rent = list.body.data.find((x: { code: string }) => x.code === '6100').id;
    for (const id of Object.values(acc)) expect(id).toEqual(expect.any(String));
  });

  afterAll(async () => {
    await app.close();
  });

  it('rebuilds payables as of the cutoff: later payment unpaid, later void still paid', async () => {
    const vendor = await a.post('/vendors').send({ name: 'Aging Vendor' });
    expect(vendor.status).toBe(201);
    const bill = await a.post('/bills').send({
      vendorId: vendor.body.id,
      date: isoDay(-40),
      dueDate: isoDay(-25),
      lines: [
        { description: 'Rent', accountId: acc.rent, quantity: '1', rate: '1000', taxRate: '0' },
      ],
    });
    expect(bill.status).toBe(201);
    expect((await a.post(`/bills/${bill.body.id}/approve`)).status).toBe(201);

    const pay = async (date: string, amount: string): Promise<string> => {
      const res = await a.post('/payments-made').send({
        vendorId: vendor.body.id,
        date,
        amount,
        paymentMode: 'BANK_TRANSFER',
        paidFromAccountId: acc.bank,
        allocations: [{ billId: bill.body.id, amount }],
      });
      expect(res.status).toBe(201);
      return res.body.id;
    };
    await pay(isoDay(-20), '300');
    const voided = await pay(isoDay(-15), '200');
    // Voided today, after the cutoff: on the cutoff date it still paid 200.
    expect((await a.delete(`/payments-made/${voided}`)).status).toBe(200);
    await pay(isoDay(-2), '500');

    const today = (await a.get('/reports/payables-aging')).body;
    const past = (await a.get('/reports/payables-aging').query({ asOfDate: cutoff })).body;

    expect(D(today.summary.total).equals('200')).toBe(true);
    expect(D(past.summary.total).equals('500')).toBe(true);
    // The bill was 15 days overdue on the cutoff date.
    expect(past.buckets.days1_30).toEqual([
      expect.objectContaining({ billId: bill.body.id, balanceDue: '500.0000', daysOverdue: 15 }),
    ]);
    expect(D(past.summary.netTotal).equals(await controlAsOf(acc.ap, cutoff, 'credit'))).toBe(true);
    expect(D(today.summary.netTotal).equals(await controlAsOf(acc.ap, isoDay(0), 'credit'))).toBe(
      true,
    );
  });

  it('rebuilds receivables as of the cutoff: an invoice paid after it is still open on it', async () => {
    const customer = await a.post('/customers').send({ name: 'Aging Customer' });
    expect(customer.status).toBe(201);
    const invoice = await a.post('/invoices').send({
      customerId: customer.body.id,
      date: isoDay(-40),
      dueDate: isoDay(-30),
      lines: [{ description: 'Service', quantity: '1', rate: '750', taxRate: '0' }],
    });
    expect(invoice.status).toBe(201);
    expect((await a.patch(`/invoices/${invoice.body.id}/send`)).status).toBe(200);
    const pay = await a.post('/payments-received').send({
      customerId: customer.body.id,
      date: isoDay(-3),
      amount: '750',
      paymentMode: 'BANK_TRANSFER',
      depositToAccountId: acc.bank,
      allocations: [{ invoiceId: invoice.body.id, amount: '750' }],
    });
    expect(pay.status).toBe(201);

    const today = (await a.get('/reports/receivables-aging')).body;
    const past = (await a.get('/reports/receivables-aging').query({ asOfDate: cutoff })).body;

    expect(today.invoiceCount).toBe(0);
    expect(past.invoiceCount).toBe(1);
    expect(past.buckets.days1_30[0]).toMatchObject({
      invoiceId: invoice.body.id,
      balanceDue: '750.0000',
      daysOverdue: 20,
    });
    expect(D(past.summary.netTotal).equals(await controlAsOf(acc.ar, cutoff, 'debit'))).toBe(true);
  });
});
