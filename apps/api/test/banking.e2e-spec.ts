/**
 * Banking through the real HTTP API: a tenant creates a bank account linked to a seeded ledger
 * account and records transactions; a second tenant cannot see or use them; anonymous is 401.
 */
import { INestApplication } from '@nestjs/common';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { seedChart, SeededChart } from './helpers/postings.helper';

describe('Banking (e2e)', () => {
  let app: INestApplication;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;
  let chartA: SeededChart;
  let chartB: SeededChart;

  let bankAccountId = '';
  let transactionId = '';
  let bankAccountBId = '';

  const ids = (body: { data: Array<{ id: string }> }): string[] => body.data.map((x) => x.id);
  const today = (): string => new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    app = await createTestApp();
    tenantA = await registerTenant(app, 'BankA');
    tenantB = await registerTenant(app, 'BankB');
    a = tenantA.api;
    b = tenantB.api;
    anon = ApiHelper.anonymous(app);
    chartA = await seedChart(a);
    chartB = await seedChart(b);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('bank accounts', () => {
    it('starts empty for a new tenant', async () => {
      const res = await a.get('/bank-accounts');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('creates a bank account linked to a ledger account', async () => {
      const res = await a.post('/bank-accounts').send({
        name: 'E2E Test Bank',
        accountNumber: '5678',
        currency: 'EGP',
        type: 'BANK',
        linkedAccountId: chartA.bank,
      });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('E2E Test Bank');
      expect(res.body.linkedAccountId).toBe(chartA.bank);
      bankAccountId = res.body.id;
    });

    it('rejects a non-zero opening balance (routed to Opening Balances)', async () => {
      const res = await a.post('/bank-accounts').send({
        name: 'Funded Bank',
        currency: 'EGP',
        type: 'BANK',
        openingBalance: '1000.00',
        linkedAccountId: chartA.cash,
      });
      expect(res.status).toBe(400);
    });

    it('rejects an invalid account type', async () => {
      const res = await a.post('/bank-accounts').send({
        name: 'Bad Type',
        type: 'CHECKING',
        linkedAccountId: chartA.bank,
      });
      expect(res.status).toBe(400);
    });

    it('rejects a linked ledger account from another tenant', async () => {
      const res = await a.post('/bank-accounts').send({
        name: 'Foreign Link',
        currency: 'EGP',
        type: 'BANK',
        linkedAccountId: chartB.bank,
      });
      expect(res.status).toBe(400);
    });

    it('lists and fetches the created account', async () => {
      const list = await a.get('/bank-accounts');
      expect(list.status).toBe(200);
      expect(ids(list.body)).toEqual([bankAccountId]);
      const one = await a.get(`/bank-accounts/${bankAccountId}`);
      expect(one.status).toBe(200);
      expect(one.body.id).toBe(bankAccountId);
    });
  });

  describe('bank transactions', () => {
    it('starts empty', async () => {
      const res = await a.get('/bank-transactions');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('records a deposit and lists it', async () => {
      const res = await a.post('/bank-transactions').send({
        bankAccountId,
        date: today(),
        type: 'DEPOSIT',
        amount: '250.50',
        description: 'E2E deposit',
      });
      expect(res.status).toBe(201);
      expect(String(res.body.amount)).toMatch(/^250\.5/);
      transactionId = res.body.id;

      const list = await a.get('/bank-transactions');
      expect(list.status).toBe(200);
      expect(ids(list.body)).toEqual([transactionId]);
      expect((await a.get(`/bank-transactions/${transactionId}`)).status).toBe(200);
    });

    it('rejects a transaction against an unknown bank account', async () => {
      const res = await a.post('/bank-transactions').send({
        bankAccountId: 'does-not-exist',
        date: today(),
        type: 'DEPOSIT',
        amount: '1.00',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('tenant isolation', () => {
    beforeAll(async () => {
      const res = await b.post('/bank-accounts').send({
        name: 'Other Tenant Bank',
        currency: 'EGP',
        type: 'BANK',
        linkedAccountId: chartB.bank,
      });
      expect(res.status).toBe(201);
      bankAccountBId = res.body.id;
    });

    it('hides tenant A banking records from tenant B by id', async () => {
      expect((await b.get(`/bank-accounts/${bankAccountId}`)).status).toBe(404);
      expect((await b.get(`/bank-transactions/${transactionId}`)).status).toBe(404);
      expect((await b.patch(`/bank-accounts/${bankAccountId}`).send({ name: 'x' })).status).toBe(
        404,
      );
      expect((await b.delete(`/bank-accounts/${bankAccountId}`)).status).toBe(404);
    });

    it('keeps lists disjoint', async () => {
      const [ra, rb] = await Promise.all([a.get('/bank-accounts'), b.get('/bank-accounts')]);
      expect(ids(ra.body)).toEqual([bankAccountId]);
      expect(ids(rb.body)).toEqual([bankAccountBId]);
      const tb = await b.get('/bank-transactions');
      expect(tb.status).toBe(200);
      expect(tb.body.data).toEqual([]);
    });

    it("rejects a transaction against another tenant's bank account", async () => {
      const res = await b.post('/bank-transactions').send({
        bankAccountId,
        date: today(),
        type: 'DEPOSIT',
        amount: '1.00',
      });
      expect(res.status).toBe(400);
    });

    it("rejects bulk import against another tenant's bank account and creates nothing", async () => {
      const res = await b.post('/bank-transactions/import').send({
        bankAccountId,
        transactions: [
          { date: today(), type: 'DEPOSIT', amount: '1.00', description: 'Foreign import deposit' },
          {
            date: today(),
            type: 'WITHDRAWAL',
            amount: '2.00',
            description: 'Foreign import withdrawal',
          },
        ],
      });
      expect(res.status).toBe(400);

      const [ra, rb] = await Promise.all([
        a.get('/bank-transactions'),
        b.get('/bank-transactions'),
      ]);
      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);
      expect(ids(ra.body)).toEqual([transactionId]);
      expect(rb.body.data).toEqual([]);
    });
  });

  describe('authentication', () => {
    it('returns 401 for anonymous callers', async () => {
      expect((await anon.get('/bank-accounts')).status).toBe(401);
      expect((await anon.get('/bank-transactions')).status).toBe(401);
      expect((await anon.post('/bank-accounts').send({})).status).toBe(401);
    });
  });
});
