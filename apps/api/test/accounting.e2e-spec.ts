/**
 * Accounting postings: VAT return submission and payment, opening balances and recurring journal
 * runs each post to the ledger exactly once, with exact decimals, a balanced trial balance and
 * strict tenant isolation. Real registered users and JWTs (see helpers/tenant.helper.ts).
 */
import { INestApplication } from '@nestjs/common';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { decimalEquals, isoDay, lineSignature } from './helpers/journey.helper';
import {
  accountBalance,
  createAccount,
  dbLines,
  SeededChart,
  seedChart,
  sumLines,
} from './helpers/postings.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { PrismaService } from '../src/prisma/prisma.service';

const VAT_RETURN = 'VAT_RETURN';
const VAT_PAYMENT = 'VAT_PAYMENT';
const OPENING_BALANCE = 'OPENING_BALANCE';
const RECURRING_JOURNAL = 'RECURRING_JOURNAL';

describe('Accounting postings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantV: TestTenant;
  let tenantO: TestTenant;
  let tenantB: TestTenant;
  let v: ApiHelper;
  let o: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;
  let chartV: SeededChart;
  let chartO: SeededChart;
  let chartB: SeededChart;

  async function journalsFor(orgId: string, sourceType: string, sourceId?: string) {
    return prisma.journal.findMany({
      where: { organizationId: orgId, sourceType, ...(sourceId ? { sourceId } : {}) },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function expectBalancedTrialBalance(api: ApiHelper): Promise<void> {
    const tb = await api.get('/accounting-reports/trial-balance');
    expect(tb.status).toBe(200);
    expect(tb.body.totals.totalDebits).toBe(tb.body.totals.totalCredits);
    const report = await api.get('/reports/trial-balance').query({ asOfDate: isoDay(0) });
    expect(report.status).toBe(200);
    expect(report.body.isBalanced).toBe(true);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    anon = ApiHelper.anonymous(app);
    tenantV = await registerTenant(app, 'AccV');
    tenantO = await registerTenant(app, 'AccO');
    tenantB = await registerTenant(app, 'AccB');
    v = tenantV.api;
    o = tenantO.api;
    b = tenantB.api;
    chartV = await seedChart(v);
    chartO = await seedChart(o);
    chartB = await seedChart(b);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('VAT return submission and payment', () => {
    const periodStart = isoDay(-45);
    const periodEnd = isoDay(-30);
    let returnId = '';
    let paymentId = '';

    it('calculates the return from posted VAT activity (output 150, input 45, net 105)', async () => {
      const sale = await v.post('/journals').send({
        date: isoDay(-40),
        reference: `SALE-${uniqueSuffix()}`,
        lines: [
          { accountId: chartV.bank, debit: '1150' },
          { accountId: chartV.revenue, credit: '1000' },
          { accountId: chartV.vatPayable, credit: '150' },
        ],
      });
      expect(sale.status).toBe(201);
      const purchase = await v.post('/journals').send({
        date: isoDay(-38),
        reference: `PURCH-${uniqueSuffix()}`,
        lines: [
          { accountId: chartV.rent, debit: '300' },
          { accountId: chartV.vatInput, debit: '45' },
          { accountId: chartV.bank, credit: '345' },
        ],
      });
      expect(purchase.status).toBe(201);

      const created = await v
        .post('/vat-returns')
        .send({ startDate: periodStart, endDate: periodEnd });
      expect(created.status).toBe(201);
      expect(created.body.status).toBe('DRAFT');
      returnId = created.body.id;

      const calculated = await v.post(`/vat-returns/${returnId}/calculate`).send({});
      expect(calculated.status).toBe(201);
      expect(calculated.body.status).toBe('CALCULATED');
      expect(decimalEquals(calculated.body.outputVAT, '150')).toBe(true);
      expect(decimalEquals(calculated.body.inputVAT, '45')).toBe(true);
      expect(decimalEquals(calculated.body.netPayable, '105')).toBe(true);
    });

    it('refuses to record a payment before the return is submitted', async () => {
      const res = await v.post(`/vat-returns/${returnId}/payment`).send({
        amount: '105',
        date: isoDay(-1),
        paidFromAccountId: chartV.bank,
      });
      expect(res.status).toBe(400);
      expect(await journalsFor(tenantV.organizationId, VAT_PAYMENT)).toHaveLength(0);
    });

    it('tenant B cannot calculate, submit, pay or read the return', async () => {
      expect((await b.get(`/vat-returns/${returnId}`)).status).toBe(404);
      expect((await b.post(`/vat-returns/${returnId}/calculate`).send({})).status).toBe(404);
      expect((await b.post(`/vat-returns/${returnId}/submit`).send({})).status).toBe(404);
      expect(
        (
          await b.post(`/vat-returns/${returnId}/payment`).send({
            amount: '105',
            date: isoDay(-1),
            paidFromAccountId: chartB.bank,
          })
        ).status,
      ).toBe(404);
      const list = await b.get('/vat-returns');
      expect(list.status).toBe(200);
      expect(list.body.map((x: { id: string }) => x.id)).not.toContain(returnId);
      const own = await v.get('/vat-returns');
      expect(own.body.map((x: { id: string }) => x.id)).toContain(returnId);
      expect(await journalsFor(tenantV.organizationId, VAT_RETURN)).toHaveLength(0);
    });

    it('rejects anonymous callers', async () => {
      expect((await anon.get('/vat-returns')).status).toBe(401);
      expect((await anon.post(`/vat-returns/${returnId}/submit`).send({})).status).toBe(401);
      expect((await anon.post(`/vat-returns/${returnId}/payment`).send({})).status).toBe(401);
    });

    it('submitting posts the settlement journal dated on the period end, exactly once', async () => {
      const res = await v.post(`/vat-returns/${returnId}/submit`).send({});
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('SUBMITTED');

      const journals = await journalsFor(tenantV.organizationId, VAT_RETURN, returnId);
      expect(journals).toHaveLength(1);
      const [settlement] = journals;
      expect(settlement.isPosted).toBe(true);
      expect(settlement.date.toISOString().slice(0, 10)).toBe(periodEnd);
      const totals = sumLines(settlement.lines);
      expect(totals.debit.equals('150')).toBe(true);
      expect(totals.credit.equals('150')).toBe(true);
      expect(lineSignature(dbLines(settlement.lines))).toEqual(
        lineSignature([
          { accountId: chartV.vatPayable, debit: '150', credit: '0' },
          { accountId: chartV.vatInput, debit: '0', credit: '45' },
          { accountId: chartV.vatPayable, debit: '0', credit: '105' },
        ]),
      );
      // Input VAT is cleared; the 105 owed stays on VAT Payable until it is paid.
      expect((await accountBalance(prisma, tenantV.organizationId, chartV.vatInput)).isZero()).toBe(
        true,
      );
      expect(
        (await accountBalance(prisma, tenantV.organizationId, chartV.vatPayable)).equals('-105'),
      ).toBe(true);
    });

    it('does not post a second settlement when the return is submitted again', async () => {
      const again = await v.post(`/vat-returns/${returnId}/submit`).send({});
      expect(again.status).toBe(400);
      expect(await journalsFor(tenantV.organizationId, VAT_RETURN, returnId)).toHaveLength(1);
    });

    it('rejects partial and excess payments: the amount must equal the net payable', async () => {
      const base = { date: isoDay(-1), paidFromAccountId: chartV.bank };
      const partial = await v
        .post(`/vat-returns/${returnId}/payment`)
        .send({ ...base, amount: '50' });
      expect(partial.status).toBe(400);
      expect(partial.body.message).toMatch(/must equal the VAT payable of 105\.0000 exactly/);
      const over = await v
        .post(`/vat-returns/${returnId}/payment`)
        .send({ ...base, amount: '105.0001' });
      expect(over.status).toBe(400);
      const zero = await v.post(`/vat-returns/${returnId}/payment`).send({ ...base, amount: '0' });
      expect(zero.status).toBe(400);
      const tooPrecise = await v
        .post(`/vat-returns/${returnId}/payment`)
        .send({ ...base, amount: '105.00001' });
      expect(tooPrecise.status).toBe(400);
      expect(await journalsFor(tenantV.organizationId, VAT_PAYMENT)).toHaveLength(0);
      expect(
        await prisma.vATPayment.count({ where: { organizationId: tenantV.organizationId } }),
      ).toBe(0);
    });

    it('requires an active base-currency asset account of the same tenant to pay from', async () => {
      const send = (paidFromAccountId?: string) =>
        v.post(`/vat-returns/${returnId}/payment`).send({
          amount: '105',
          date: isoDay(-1),
          ...(paidFromAccountId ? { paidFromAccountId } : {}),
        });
      expect((await send()).status).toBe(400);
      expect((await send(chartV.vatPayable)).status).toBe(400); // liability
      expect((await send(chartV.revenue)).status).toBe(400); // income
      expect((await send(chartB.bank)).status).toBe(400); // another tenant's account
      expect((await send('does-not-exist')).status).toBe(400);

      const foreign = await createAccount(v, '1020', 'USD Bank', 'ASSET');
      await prisma.account.update({ where: { id: foreign }, data: { currency: 'JPY' } });
      expect((await send(foreign)).status).toBe(400);

      expect(await journalsFor(tenantV.organizationId, VAT_PAYMENT)).toHaveLength(0);
      const read = await v.get(`/vat-returns/${returnId}`);
      expect(read.body.status).toBe('SUBMITTED');
    });

    it('records the exact payment: Dr VAT Payable / Cr bank, return becomes FILED', async () => {
      const res = await v.post(`/vat-returns/${returnId}/payment`).send({
        amount: '105.0000',
        date: isoDay(-1),
        paidFromAccountId: chartV.bank,
        reference: 'EFT-1',
      });
      expect(res.status).toBe(201);
      paymentId = res.body.id;
      expect(decimalEquals(res.body.amount, '105')).toBe(true);
      expect(res.body.paidFromAccountId).toBe(chartV.bank);

      const journals = await journalsFor(tenantV.organizationId, VAT_PAYMENT, paymentId);
      expect(journals).toHaveLength(1);
      expect(journals[0].date.toISOString().slice(0, 10)).toBe(isoDay(-1));
      expect(lineSignature(dbLines(journals[0].lines))).toEqual(
        lineSignature([
          { accountId: chartV.vatPayable, debit: '105', credit: '0' },
          { accountId: chartV.bank, debit: '0', credit: '105' },
        ]),
      );
      expect(
        (await accountBalance(prisma, tenantV.organizationId, chartV.vatPayable)).isZero(),
      ).toBe(true);

      const read = await v.get(`/vat-returns/${returnId}`);
      expect(read.body.status).toBe('FILED');
    });

    it('rejects a second payment and posts no further journal', async () => {
      const again = await v.post(`/vat-returns/${returnId}/payment`).send({
        amount: '105',
        date: isoDay(-1),
        paidFromAccountId: chartV.bank,
      });
      expect(again.status).toBe(400);
      expect(await journalsFor(tenantV.organizationId, VAT_PAYMENT)).toHaveLength(1);
      expect(
        await prisma.vATPayment.count({ where: { organizationId: tenantV.organizationId } }),
      ).toBe(1);
    });

    it('keeps the trial balance balanced', async () => {
      await expectBalancedTrialBalance(v);
    });
  });

  describe('opening balances', () => {
    const openingDate = isoDay(-200);
    let equityId = '';

    const body = (
      balances: Array<{ accountId: string; amount: string }>,
      extra: Record<string, unknown> = {},
    ): Record<string, unknown> => ({ openingDate, balances, ...extra });

    it('rejects invalid input and unbalanced balances without an equity account', async () => {
      const path = '/organization/onboarding/opening-balances';
      const invalid = await o.post(path).send(body([{ accountId: chartO.bank, amount: '-5' }]));
      expect(invalid.status).toBe(400);
      const tooBig = await o
        .post(path)
        .send(body([{ accountId: chartO.bank, amount: '1234567890123456' }]));
      expect(tooBig.status).toBe(400);
      const noEquity = await o.post(path).send(
        body([
          { accountId: chartO.bank, amount: '5000.50' },
          { accountId: chartO.ap, amount: '1200.25' },
        ]),
      );
      expect(noEquity.status).toBe(400);
      expect(noEquity.body.message).toMatch(/Opening Balance Equity/);
      expect(await journalsFor(tenantO.organizationId, OPENING_BALANCE)).toHaveLength(0);
    });

    it('posts one balanced journal, taking the difference to Opening Balance Equity', async () => {
      equityId = await createAccount(o, '3900', 'Opening Balance Equity', 'EQUITY');
      const res = await o.post('/organization/onboarding/opening-balances').send(
        body([
          { accountId: chartO.bank, amount: '5000.50' },
          { accountId: chartO.ap, amount: '1200.25' },
        ]),
      );
      expect(res.status).toBe(201);

      const journals = await journalsFor(
        tenantO.organizationId,
        OPENING_BALANCE,
        tenantO.organizationId,
      );
      expect(journals).toHaveLength(1);
      expect(journals[0].date.toISOString().slice(0, 10)).toBe(openingDate);
      const totals = sumLines(journals[0].lines);
      expect(totals.debit.equals('5000.5')).toBe(true);
      expect(totals.credit.equals('5000.5')).toBe(true);
      expect(lineSignature(dbLines(journals[0].lines))).toEqual(
        lineSignature([
          { accountId: chartO.bank, debit: '5000.5', credit: '0' },
          { accountId: chartO.ap, debit: '0', credit: '1200.25' },
          { accountId: equityId, debit: '0', credit: '3800.25' },
        ]),
      );
      await expectBalancedTrialBalance(o);
    });

    it('does not post a second time unless replaceExisting is sent', async () => {
      const again = await o
        .post('/organization/onboarding/opening-balances')
        .send(body([{ accountId: chartO.bank, amount: '5000.50' }]));
      expect(again.status).toBe(409);
      expect(await journalsFor(tenantO.organizationId, OPENING_BALANCE)).toHaveLength(1);
    });

    it('replaceExisting reverses the posted balances and posts the new ones', async () => {
      const res = await o
        .post('/organization/onboarding/opening-balances')
        .send(body([{ accountId: chartO.bank, amount: '6000' }], { replaceExisting: true }));
      expect(res.status).toBe(201);

      const all = await journalsFor(tenantO.organizationId, OPENING_BALANCE);
      expect(all).toHaveLength(3); // original, its reversal, revision 2
      const original = all.find((j) => j.sourceId === tenantO.organizationId);
      const reversal = all.find((j) => j.reversalOfId === original?.id);
      const revision = all.find((j) => j.sourceId === `${tenantO.organizationId}:2`);
      expect(original).toBeDefined();
      expect(reversal).toBeDefined();
      expect(revision).toBeDefined();
      expect(lineSignature(dbLines(revision?.lines ?? []))).toEqual(
        lineSignature([
          { accountId: chartO.bank, debit: '6000', credit: '0' },
          { accountId: equityId, debit: '0', credit: '6000' },
        ]),
      );
      expect(
        (await accountBalance(prisma, tenantO.organizationId, chartO.bank)).equals('6000'),
      ).toBe(true);
      expect((await accountBalance(prisma, tenantO.organizationId, chartO.ap)).isZero()).toBe(true);
      expect((await accountBalance(prisma, tenantO.organizationId, equityId)).equals('-6000')).toBe(
        true,
      );
      await expectBalancedTrialBalance(o);
    });

    it('tenant B cannot post against tenant A accounts and posts nothing', async () => {
      const path = '/organization/onboarding/opening-balances';
      const foreign = await b.post(path).send(body([{ accountId: chartO.bank, amount: '10' }]));
      expect(foreign.status).toBe(400);
      const foreignEquity = await b
        .post(path)
        .send(body([{ accountId: chartB.bank, amount: '10' }], { equityAccountId: equityId }));
      expect(foreignEquity.status).toBe(400);
      expect(await journalsFor(tenantB.organizationId, OPENING_BALANCE)).toHaveLength(0);
    });

    it('rejects anonymous callers', async () => {
      const res = await anon
        .post('/organization/onboarding/opening-balances')
        .send(body([{ accountId: chartO.bank, amount: '1' }]));
      expect(res.status).toBe(401);
    });
  });

  describe('recurring journals', () => {
    let profileId = '';
    const firstRun = isoDay(-9);
    const secondRun = isoDay(-8);

    const template = (rent: string, cash: string, amount = '75.5'): Record<string, unknown> => ({
      lines: [
        { accountId: rent, debit: amount, description: 'Rent' },
        { accountId: cash, credit: amount },
      ],
    });
    const profileBody = (templateData: Record<string, unknown>): Record<string, unknown> => ({
      name: `Rent ${uniqueSuffix()}`,
      frequency: 'DAILY',
      startDate: isoDay(-10),
      autoPost: true,
      entityType: 'journal',
      templateData,
    });

    it('rejects unbalanced templates and templates using another tenant accounts', async () => {
      const unbalanced = await o.post('/recurring-profiles').send(
        profileBody({
          lines: [
            { accountId: chartO.rent, debit: '10' },
            { accountId: chartO.cash, credit: '9' },
          ],
        }),
      );
      expect(unbalanced.status).toBe(400);
      const foreign = await b
        .post('/recurring-profiles')
        .send(profileBody(template(chartO.rent, chartO.cash)));
      expect(foreign.status).toBe(400);
      expect(
        await prisma.recurringProfile.count({ where: { organizationId: tenantB.organizationId } }),
      ).toBe(0);
    });

    it('creates a profile whose first run is the day after its start date', async () => {
      const res = await o
        .post('/recurring-profiles')
        .send(profileBody(template(chartO.rent, chartO.cash)));
      expect(res.status).toBe(201);
      profileId = res.body.id;
      expect(String(res.body.nextRunDate).slice(0, 10)).toBe(firstRun);
    });

    it('posts the scheduled run exactly once even when executed concurrently', async () => {
      const results = await Promise.all([
        o.post(`/recurring-profiles/${profileId}/execute`).send({}),
        o.post(`/recurring-profiles/${profileId}/execute`).send({}),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      expect(results.filter((r) => r.body.success === true)).toHaveLength(1);
      expect(results.filter((r) => r.body.success === false)).toHaveLength(1);

      const journals = await journalsFor(
        tenantO.organizationId,
        RECURRING_JOURNAL,
        `${profileId}:${firstRun}`,
      );
      expect(journals).toHaveLength(1);
      expect(journals[0].isPosted).toBe(true);
      expect(journals[0].date.toISOString().slice(0, 10)).toBe(firstRun);
      expect(lineSignature(dbLines(journals[0].lines))).toEqual(
        lineSignature([
          { accountId: chartO.rent, debit: '75.5', credit: '0' },
          { accountId: chartO.cash, debit: '0', credit: '75.5' },
        ]),
      );
    });

    it('the next execution posts the next date, one journal per date', async () => {
      const res = await o.post(`/recurring-profiles/${profileId}/execute`).send({});
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const all = await prisma.journal.findMany({
        where: {
          organizationId: tenantO.organizationId,
          sourceType: RECURRING_JOURNAL,
          sourceId: { startsWith: `${profileId}:` },
        },
        select: { sourceId: true },
      });
      expect(all.map((j) => j.sourceId).sort()).toEqual([
        `${profileId}:${firstRun}`,
        `${profileId}:${secondRun}`,
      ]);

      const profile = await o.get(`/recurring-profiles/${profileId}`);
      expect(profile.status).toBe(200);
      expect(profile.body.executionCount).toBe(2);
    });

    it('tenant B cannot read or execute the profile', async () => {
      expect((await b.get(`/recurring-profiles/${profileId}`)).status).toBe(404);
      expect((await b.post(`/recurring-profiles/${profileId}/execute`).send({})).status).toBe(404);
      expect(await journalsFor(tenantB.organizationId, RECURRING_JOURNAL)).toHaveLength(0);
    });

    it('rejects anonymous callers', async () => {
      expect((await anon.get('/recurring-profiles')).status).toBe(401);
      expect((await anon.post(`/recurring-profiles/${profileId}/execute`).send({})).status).toBe(
        401,
      );
    });

    it('ends with a balanced trial balance', async () => {
      await expectBalancedTrialBalance(o);
    });
  });
});
