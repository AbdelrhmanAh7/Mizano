/**
 * AP subledger vs control-account reconciliation (#125). Tenant A builds bills, payments (one
 * voided), an applied and an unapplied vendor credit, a draft and a void bill through the real
 * HTTP API; GET /reports/reconciliation/ap must tie the open bill balances to the AP control
 * account on both sides of the same as-of date. Tenant B proves isolation.
 */
import { INestApplication } from '@nestjs/common';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { isoDay } from './helpers/journey.helper';
import { PrismaService } from '../src/prisma/prisma.service';

interface Setup {
  api: ApiHelper;
  vendorId: string;
  bank: string;
  rent: string;
}

describe('@e2e @flow:ap-reconciliation @issue-125 AP subledger vs control account', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: Setup;
  const bills: Record<string, string> = {};

  async function setup(tenant: TestTenant): Promise<Setup> {
    const api = tenant.api;
    expect((await api.post('/accounts/seed-defaults')).status).toBe(201);
    const settings = (await api.get('/organization/account-settings')).body;
    const list = await api.get('/accounts').query({ limit: 500 });
    const rent = list.body.data.find((x: { code: string }) => x.code === '6100').id;
    const vendor = await api.post('/vendors').send({ name: `Recon Vendor ${uniqueSuffix()}` });
    expect(vendor.status).toBe(201);
    return { api, vendorId: vendor.body.id, bank: settings.defaultBankAccountId, rent };
  }

  async function bill(s: Setup, rate: string, date: string, approve = true): Promise<string> {
    const created = await s.api.post('/bills').send({
      vendorId: s.vendorId,
      date,
      dueDate: isoDay(30),
      lines: [{ description: 'Line', accountId: s.rent, quantity: '1', rate, taxRate: '14' }],
    });
    expect(created.status).toBe(201);
    if (approve) expect((await s.api.post(`/bills/${created.body.id}/approve`)).status).toBe(201);
    return created.body.id;
  }

  async function pay(s: Setup, billId: string, amount: string, date: string): Promise<string> {
    const res = await s.api.post('/payments-made').send({
      vendorId: s.vendorId,
      date,
      amount,
      paymentMode: 'BANK_TRANSFER',
      paidFromAccountId: s.bank,
      allocations: [{ billId, amount }],
    });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  async function credit(s: Setup, billId: string, amount: string, date: string): Promise<string> {
    const res = await s.api
      .post('/vendor-credits')
      .send({ vendorId: s.vendorId, billId, date, reason: 'Returned goods', amount });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  async function recon(api: ApiHelper, asOf = isoDay(0)): Promise<Record<string, unknown>> {
    const res = await api.get('/reports/reconciliation/ap').query({ asOf });
    expect(res.status).toBe(200);
    return res.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    tenantA = await registerTenant(app, 'ApRecA');
    tenantB = await registerTenant(app, 'ApRecB');
    a = await setup(tenantA);

    // 800 / 400 / 100 + 14% VAT = 912 / 456 / 114.
    bills.b1 = await bill(a, '800', isoDay(-10));
    bills.b2 = await bill(a, '400', isoDay(-10));
    bills.b3 = await bill(a, '100', isoDay(-2));
    bills.draft = await bill(a, '999', isoDay(-10), false);
    // No bill-void route exists yet (#11/#12 own posting); a never-posted VOID bill is a fixture.
    bills.void = await bill(a, '777', isoDay(-10), false);
    await prisma.bill.update({ where: { id: bills.void }, data: { status: 'VOID' } });

    await pay(a, bills.b1, '912', isoDay(-1));
    const voided = await pay(a, bills.b2, '100', isoDay(-6));
    expect((await a.api.delete(`/payments-made/${voided}`)).status).toBe(200);
    await pay(a, bills.b2, '56', isoDay(-3));
    await credit(a, bills.b2, '50', isoDay(-1));
    const applied = await credit(a, bills.b2, '20', isoDay(-1));
    const apply = await a.api
      .post(`/vendor-credits/${applied}/apply-to-bill`)
      .send({ billId: bills.b2 });
    expect(apply.status).toBe(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('@issue-125 AC1: approved and paid bills reconcile with ok true and a zero difference', async () => {
    // Open: b1 0 + b2 (456 - 56 - 20) + b3 114 - unapplied credit 50 = 444.
    expect(await recon(a.api)).toEqual({
      asOf: isoDay(0),
      subledgerTotal: '444.0000',
      controlBalance: '444.0000',
      difference: '0.0000',
      ok: true,
    });
  });

  it('@issue-125 AC3: voided and draft bills are excluded from the subledger total', async () => {
    const stored = await prisma.bill.findMany({
      where: { id: { in: [bills.draft, bills.void] } },
      select: { balanceDue: true },
    });
    expect(stored.map((b) => b.balanceDue.toFixed(4)).sort()).toEqual(['1138.8600', '885.7800']);
    expect((await recon(a.api)).subledgerTotal).toBe('444.0000');
  });

  it('@issue-125 AC5: asOf filters bills, payments, voids and credits on both sides', async () => {
    // As of day -5: b1 912 + b2 456 - payment 100 (voided only later) = 1268; b3 and later
    // payments/credits are excluded on both sides.
    expect(await recon(a.api, isoDay(-5))).toEqual({
      asOf: isoDay(-5),
      subledgerTotal: '1268.0000',
      controlBalance: '1268.0000',
      difference: '0.0000',
      ok: true,
    });
    // As of day -2: + b3 114, the voided payment still live, payment 56 counted, credits not yet.
    const dayMinus2 = await recon(a.api, isoDay(-2));
    expect([dayMinus2.subledgerTotal, dayMinus2.controlBalance, dayMinus2.ok]).toEqual([
      '1326.0000',
      '1326.0000',
      true,
    ]);
    const before = await recon(a.api, isoDay(-11));
    expect([before.subledgerTotal, before.controlBalance, before.ok]).toEqual([
      '0.0000',
      '0.0000',
      true,
    ]);
  });

  it('@issue-125 AC2: a corrupted subledger balance returns ok false with the exact difference', async () => {
    await prisma.bill.update({
      where: { id: bills.b3 },
      data: { balanceDue: { increment: '12.34' } },
    });
    try {
      expect(await recon(a.api)).toEqual({
        asOf: isoDay(0),
        subledgerTotal: '456.3400',
        controlBalance: '444.0000',
        difference: '12.3400',
        ok: false,
      });
    } finally {
      await prisma.bill.update({
        where: { id: bills.b3 },
        data: { balanceDue: { decrement: '12.34' } },
      });
    }
    expect((await recon(a.api)).ok).toBe(true);
  });

  it("@issue-125 AC4: another tenant's bills and corrupted balances never affect the result", async () => {
    const b = await setup(tenantB);
    const otherBill = await bill(b, '1000', isoDay(-10));
    await prisma.bill.update({
      where: { id: otherBill },
      data: { balanceDue: { increment: '7' } },
    });
    expect(await recon(b.api)).toMatchObject({
      subledgerTotal: '1147.0000',
      controlBalance: '1140.0000',
      difference: '7.0000',
      ok: false,
    });
    expect(await recon(a.api)).toMatchObject({
      subledgerTotal: '444.0000',
      controlBalance: '444.0000',
      ok: true,
    });
  });

  it('@issue-125 rejects an invalid asOf and anonymous callers', async () => {
    const bad = await a.api.get('/reports/reconciliation/ap').query({ asOf: '2026-02-30' });
    expect(bad.status).toBe(400);
    const anon = await ApiHelper.anonymous(app)
      .get('/reports/reconciliation/ap')
      .query({ asOf: isoDay(0) });
    expect(anon.status).toBe(401);
  });
});
