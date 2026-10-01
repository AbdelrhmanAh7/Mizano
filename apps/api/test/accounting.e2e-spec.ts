/**
 * Accounting postings: VAT return submission and payment, opening balances and recurring journal
 * runs each post to the ledger exactly once, with exact decimals, a balanced trial balance and
 * strict tenant isolation. Real registered users and JWTs (see helpers/tenant.helper.ts).
 */
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
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
import { RecurringProfilesService } from '../src/modules/accounting/services/recurring-profiles.service';
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

    it('lists only eligible bank/cash accounts of the tenant as payment accounts', async () => {
      const res = await v.get('/vat-returns/payment-accounts');
      expect(res.status).toBe(200);
      const ids = res.body.map((x: { id: string }) => x.id);
      expect(ids).toContain(chartV.bank);
      expect(ids).toContain(chartV.cash);
      expect(ids).not.toContain(chartV.vatInput); // an asset, but not a bank/cash account
      expect(ids).not.toContain(chartV.revenue);
      const other = await b.get('/vat-returns/payment-accounts');
      expect(other.status).toBe(200);
      expect(other.body.map((x: { id: string }) => x.id)).not.toContain(chartV.bank);
      expect((await anon.get('/vat-returns/payment-accounts')).status).toBe(401);
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
      expect((await send(chartV.vatInput)).status).toBe(400); // asset, but not bank/cash
      expect((await send(chartB.bank)).status).toBe(400); // another tenant's account
      expect((await send('does-not-exist')).status).toBe(400);

      const foreign = await createAccount(v, '1020', 'USD Bank', 'ASSET');
      // Only a bank register carries a meaningful currency in a single-currency ledger.
      await prisma.bankAccount.create({
        data: {
          name: 'JPY register',
          currency: 'JPY',
          type: 'BANK',
          linkedAccountId: foreign,
          organizationId: tenantV.organizationId,
        },
      });
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

    it('files a zero return with POST /file: no journal, no payment path, guarded', async () => {
      const created = await v
        .post('/vat-returns')
        .send({ startDate: isoDay(-29), endDate: isoDay(-20) });
      expect(created.status).toBe(201);
      const zeroId = created.body.id as string;
      expect((await v.post(`/vat-returns/${zeroId}/calculate`).send({})).status).toBe(201);

      // Not submitted yet.
      expect((await v.post(`/vat-returns/${zeroId}/file`).send({})).status).toBe(400);
      expect((await v.post(`/vat-returns/${zeroId}/submit`).send({})).status).toBe(201);
      expect(await journalsFor(tenantV.organizationId, VAT_RETURN, zeroId)).toHaveLength(0);

      expect((await b.post(`/vat-returns/${zeroId}/file`).send({})).status).toBe(404);
      expect((await anon.post(`/vat-returns/${zeroId}/file`).send({})).status).toBe(401);

      const filed = await v.post(`/vat-returns/${zeroId}/file`).send({});
      expect(filed.status).toBe(201);
      expect(filed.body.status).toBe('FILED');
      expect((await v.post(`/vat-returns/${zeroId}/file`).send({})).status).toBe(400);
      expect(await journalsFor(tenantV.organizationId, VAT_RETURN, zeroId)).toHaveLength(0);
    });

    it('a return with VAT payable is filed by its payment, not by /file', async () => {
      // The first return was filed by its payment; it cannot be filed again.
      const res = await v.post(`/vat-returns/${returnId}/file`).send({});
      expect(res.status).toBe(400);
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

    it('replaceExisting with no balances clears the posted opening balances', async () => {
      const res = await o
        .post('/organization/onboarding/opening-balances')
        .send(body([], { replaceExisting: true }));
      expect(res.status).toBe(201);
      const all = await journalsFor(tenantO.organizationId, OPENING_BALANCE);
      expect(all).toHaveLength(4); // original, its reversal, revision 2, its reversal
      expect((await accountBalance(prisma, tenantO.organizationId, chartO.bank)).isZero()).toBe(
        true,
      );
      expect((await accountBalance(prisma, tenantO.organizationId, equityId)).isZero()).toBe(true);
      await expectBalancedTrialBalance(o);
    });

    it('replaces a legacy source-less opening journal (OB-001) instead of double posting', async () => {
      const legacy = await registerTenant(app, 'AccLegacy');
      const chartL = await seedChart(legacy.api);
      const equity = await createAccount(legacy.api, '3900', 'Opening Balance Equity', 'EQUITY');
      const journal = await prisma.journal.create({
        data: {
          journalNumber: 'OB-001',
          date: new Date(`${openingDate}T00:00:00.000Z`),
          reference: 'Opening Balances',
          isPosted: true,
          organizationId: legacy.organizationId,
          lines: {
            create: [
              { accountId: chartL.bank, debit: '900', credit: '0' },
              { accountId: equity, debit: '0', credit: '900' },
            ],
          },
        },
      });
      const path = '/organization/onboarding/opening-balances';
      const payload = body([{ accountId: chartL.bank, amount: '500' }]);

      expect((await legacy.api.post(path).send(payload)).status).toBe(409);

      const res = await legacy.api.post(path).send({ ...payload, replaceExisting: true });
      expect(res.status).toBe(201);
      const reversal = await prisma.journal.findFirst({
        where: { organizationId: legacy.organizationId, reversalOfId: journal.id },
      });
      expect(reversal).not.toBeNull();
      expect((await accountBalance(prisma, legacy.organizationId, chartL.bank)).equals('500')).toBe(
        true,
      );
      expect(await journalsFor(legacy.organizationId, OPENING_BALANCE)).toHaveLength(1);
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
    const today = isoDay(0);
    const days = [isoDay(-2), isoDay(-1), today];

    const template = (rent: string, cash: string, amount = '75.5'): Record<string, unknown> => ({
      lines: [
        { accountId: rent, debit: amount, description: 'Rent' },
        { accountId: cash, credit: amount },
      ],
    });
    const profileBody = (templateData: Record<string, unknown>): Record<string, unknown> => ({
      name: `Rent ${uniqueSuffix()}`,
      frequency: 'DAILY',
      startDate: isoDay(-3),
      autoPost: true,
      entityType: 'journal',
      templateData,
    });
    const profileJournals = () =>
      prisma.journal.findMany({
        where: {
          organizationId: tenantO.organizationId,
          sourceType: RECURRING_JOURNAL,
          sourceId: { startsWith: `${profileId}:` },
        },
        include: { lines: true },
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

    it('creates a profile whose first scheduled run is the day after its start date', async () => {
      const res = await o
        .post('/recurring-profiles')
        .send(profileBody(template(chartO.rent, chartO.cash)));
      expect(res.status).toBe(201);
      profileId = res.body.id;
      expect(String(res.body.nextRunDate).slice(0, 10)).toBe(days[0]);
    });

    it('rejects updates that would leave an invalid journal template', async () => {
      const bad = await o
        .patch(`/recurring-profiles/${profileId}`)
        .send({ templateData: { lines: [{ accountId: chartO.rent, debit: '1' }] } });
      expect(bad.status).toBe(400);
      const renamed = await o.patch(`/recurring-profiles/${profileId}`).send({ name: 'Renamed' });
      expect(renamed.status).toBe(200);
    });

    it('manual execution is a separate dated-today event and leaves the schedule alone', async () => {
      const key = randomUUID();
      const first = await o
        .post(`/recurring-profiles/${profileId}/execute`)
        .send({ idempotencyKey: key });
      const second = await o
        .post(`/recurring-profiles/${profileId}/execute`)
        .send({ idempotencyKey: randomUUID() });
      // A retry of the first request (same key) returns its journal and posts nothing new.
      const retry = await o
        .post(`/recurring-profiles/${profileId}/execute`)
        .send({ idempotencyKey: key });
      expect(retry.status).toBe(201);
      expect(retry.body.success).toBe(true);
      expect(retry.body.createdEntityId).toBe(first.body.createdEntityId);
      const noKey = await o.post(`/recurring-profiles/${profileId}/execute`).send({});
      expect(noKey.status).toBe(400);
      const badKey = await o
        .post(`/recurring-profiles/${profileId}/execute`)
        .send({ idempotencyKey: 'not-a-uuid' });
      expect(badKey.status).toBe(400);
      expect(first.status).toBe(201);
      expect(first.body.success).toBe(true);
      expect(second.body.success).toBe(true);

      const manual = await profileJournals();
      expect(manual).toHaveLength(2);
      for (const j of manual) {
        expect(j.sourceId).toMatch(new RegExp(`^${profileId}:manual:[0-9a-f-]{36}$`));
        expect(j.date.toISOString().slice(0, 10)).toBe(today);
      }
      const profile = await o.get(`/recurring-profiles/${profileId}`);
      expect(String(profile.body.nextRunDate).slice(0, 10)).toBe(days[0]);
      expect(profile.body.executionCount).toBe(0);
    });

    it('the schedule posts each due date exactly once, even when run concurrently', async () => {
      const cron = app.get(RecurringProfilesService);
      await Promise.all([cron.processRecurringProfiles(), cron.processRecurringProfiles()]);

      const scheduled = (await profileJournals()).filter((j) => !j.sourceId?.includes(':manual:'));
      expect(scheduled.map((j) => j.sourceId).sort()).toEqual(
        days.map((d) => `${profileId}:${d}`).sort(),
      );
      for (const j of scheduled) {
        expect(j.isPosted).toBe(true);
        expect(j.date.toISOString().slice(0, 10)).toBe((j.sourceId as string).split(':')[1]);
        expect(lineSignature(dbLines(j.lines))).toEqual(
          lineSignature([
            { accountId: chartO.rent, debit: '75.5', credit: '0' },
            { accountId: chartO.cash, debit: '0', credit: '75.5' },
          ]),
        );
      }
      const profile = await o.get(`/recurring-profiles/${profileId}`);
      expect(profile.body.executionCount).toBe(3);
      expect(String(profile.body.nextRunDate).slice(0, 10)).toBe(isoDay(1));

      // Nothing more is due: a further run posts nothing new.
      await cron.processRecurringProfiles();
      expect(await profileJournals()).toHaveLength(5);
    });

    it('tenant B cannot read or execute the profile', async () => {
      expect((await b.get(`/recurring-profiles/${profileId}`)).status).toBe(404);
      expect(
        (
          await b
            .post(`/recurring-profiles/${profileId}/execute`)
            .send({ idempotencyKey: randomUUID() })
        ).status,
      ).toBe(404);
      expect(await journalsFor(tenantB.organizationId, RECURRING_JOURNAL)).toHaveLength(0);
    });

    it('rejects anonymous callers', async () => {
      expect((await anon.get('/recurring-profiles')).status).toBe(401);
      expect(
        (
          await anon
            .post(`/recurring-profiles/${profileId}/execute`)
            .send({ idempotencyKey: randomUUID() })
        ).status,
      ).toBe(401);
    });

    it('ends with a balanced trial balance', async () => {
      await expectBalancedTrialBalance(o);
    });
  });
});
