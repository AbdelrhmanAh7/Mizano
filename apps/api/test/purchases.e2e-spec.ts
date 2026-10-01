/**
 * Seeded accountant journey for the purchases side not covered by bills and payments: expenses
 * and vendor credits. One tenant posts expenses (Dr expense / VAT, Cr bank), issues, applies,
 * refunds and voids vendor credits through the real HTTP API with a real login; a second tenant
 * probes isolation and anonymous callers are rejected. Money is asserted as exact decimals and
 * ledger effects are checked through the API and against the database (journals per source).
 */
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import {
  decimalEquals,
  eventually,
  isoDay,
  lineSignature,
  midnightIso,
} from './helpers/journey.helper';
import { accountBalance, dbLines } from './helpers/postings.helper';
import { PrismaService } from '../src/prisma/prisma.service';

const EXPENSE = 'EXPENSE';
const EXPENSE_VOID = 'EXPENSE_VOID';
const VENDOR_CREDIT = 'VENDOR_CREDIT';
const VENDOR_CREDIT_REFUND = 'VENDOR_CREDIT_REFUND';
const VENDOR_CREDIT_VOID = 'VENDOR_CREDIT_VOID';

describe('Purchases expenses and vendor credits (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;

  const acc = { cash: '', bank: '', ap: '', vatInput: '', rent: '', software: '' };
  let vendorId = '';
  let bill1Id = '';
  let bill2Id = '';
  let bill3Id = '';
  let draftBillId = '';

  let expense1Id = '';

  let credit1Id = '';
  let credit2Id = '';
  let credit3Id = '';
  let credit4Id = '';

  let vendorBId = '';
  let billBId = '';
  let rentBAccountId = '';
  let bankBAccountId = '';

  const day = isoDay(-4);
  const creditDay = isoDay(-3);
  const refundDay = isoDay(-2);
  const dueDate = isoDay(30);

  async function journalsFor(sourceType: string, sourceId: string) {
    return prisma.journal.findMany({
      where: { organizationId: tenantA.organizationId, sourceType, sourceId },
      include: { lines: true },
    });
  }

  async function bill(id: string) {
    return prisma.bill.findFirstOrThrow({ where: { id, organizationId: tenantA.organizationId } });
  }

  async function createApprovedBill(
    rate: string,
    accountId: string,
    owner: ApiHelper = a,
    vendor: string = vendorId,
  ) {
    const created = await owner.post('/bills').send({
      vendorId: vendor,
      date: day,
      dueDate,
      lines: [{ description: 'Line', accountId, quantity: '1', rate, taxRate: '14' }],
    });
    expect(created.status).toBe(201);
    const approved = await owner.post(`/bills/${created.body.id}/approve`);
    expect(approved.status).toBe(201);
    expect(approved.body.status).toBe('OPEN');
    return approved.body as { id: string; grandTotal: string; taxAmount: string };
  }

  async function createCredit(billId: string, amount: string, extra: Record<string, unknown> = {}) {
    return a.post('/vendor-credits').send({
      vendorId,
      billId,
      date: creditDay,
      reason: 'Returned goods',
      amount,
      ...extra,
    });
  }

  async function trialBalance(owner: ApiHelper = a) {
    const res = await owner.get('/accounting-reports/trial-balance');
    expect(res.status).toBe(200);
    expect(res.body.totals.totalDebits).toBe(res.body.totals.totalCredits);
    return res.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    anon = ApiHelper.anonymous(app);
    tenantA = await registerTenant(app, 'PurchA');
    tenantB = await registerTenant(app, 'PurchB');
    a = tenantA.api;
    b = tenantB.api;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('tenant A: setup', () => {
    it('seeds the chart, creates a vendor and three approved bills plus a draft', async () => {
      expect((await a.post('/accounts/seed-defaults')).status).toBe(201);
      const list = await a.get('/accounts').query({ limit: 500 });
      const byCode = new Map<string, string>(
        list.body.data.map((x: { code: string; id: string }) => [x.code, x.id]),
      );
      acc.cash = byCode.get('1000') as string;
      acc.bank = byCode.get('1010') as string;
      acc.ap = byCode.get('2000') as string;
      acc.vatInput = byCode.get('2210') as string;
      acc.rent = byCode.get('6100') as string;
      acc.software = byCode.get('6200') as string;
      for (const id of Object.values(acc)) expect(id).toEqual(expect.any(String));

      const vendor = await a.post('/vendors').send({ name: `Purch Vendor ${uniqueSuffix()}` });
      expect(vendor.status).toBe(201);
      vendorId = vendor.body.id;

      // 200 + 14% = 228 (VAT 28)
      const bill1 = await createApprovedBill('200', acc.rent);
      bill1Id = bill1.id;
      expect(decimalEquals(bill1.grandTotal, '228')).toBe(true);
      // 300 + 14% = 342 (VAT 42)
      const bill2 = await createApprovedBill('300', acc.software);
      bill2Id = bill2.id;
      expect(decimalEquals(bill2.grandTotal, '342')).toBe(true);
      // 100 + 14% = 114 (VAT 14)
      const bill3 = await createApprovedBill('100', acc.rent);
      bill3Id = bill3.id;

      const draft = await a.post('/bills').send({
        vendorId,
        date: day,
        dueDate,
        lines: [{ description: 'Draft', accountId: acc.rent, quantity: '1', rate: '10' }],
      });
      expect(draft.status).toBe(201);
      draftBillId = draft.body.id;
    });
  });

  describe('tenant A: expenses', () => {
    it('lists only eligible accounts in the role-scoped lookups', async () => {
      const expenseAccounts = await a.get('/expenses/expense-accounts');
      expect(expenseAccounts.status).toBe(200);
      const expenseIds = expenseAccounts.body.map((x: { id: string }) => x.id);
      expect(expenseIds).toContain(acc.rent);
      expect(expenseIds).not.toContain(acc.ap);
      expect(expenseIds).not.toContain(acc.bank);

      const paidThrough = await a.get('/expenses/paid-through-accounts');
      expect(paidThrough.status).toBe(200);
      const paidIds = paidThrough.body.map((x: { id: string }) => x.id);
      expect(paidIds).toEqual(expect.arrayContaining([acc.bank, acc.cash]));
      expect(paidIds).not.toContain(acc.rent);
      expect(paidIds).not.toContain(acc.ap);
    });

    it('records an expense: server-computed VAT and one balanced journal on the expense date', async () => {
      const res = await a.post('/expenses').send({
        date: day,
        accountId: acc.rent,
        vendorId,
        amount: '100.00',
        taxRate: '14',
        paidThroughAccountId: acc.bank,
        description: 'Office rent',
      });
      expect(res.status).toBe(201);
      expect(decimalEquals(res.body.amount, '100')).toBe(true);
      expect(decimalEquals(res.body.taxAmount, '14')).toBe(true);
      expect(res.body.status).toBe('POSTED');
      expense1Id = res.body.id;

      const journals = await journalsFor(EXPENSE, expense1Id);
      expect(journals).toHaveLength(1);
      expect(journals[0].date.toISOString()).toBe(midnightIso(day));
      expect(journals[0].isPosted).toBe(true);
      expect(lineSignature(dbLines(journals[0].lines))).toEqual(
        lineSignature([
          { accountId: acc.rent, debit: '100', credit: '0' },
          { accountId: acc.vatInput, debit: '14', credit: '0' },
          { accountId: acc.bank, debit: '0', credit: '114' },
        ]),
      );
    });

    it('treats a tax-inclusive amount as gross', async () => {
      const res = await a.post('/expenses').send({
        date: day,
        accountId: acc.software,
        amount: '114.00',
        taxRate: '14',
        taxInclusive: true,
        paidThroughAccountId: acc.cash,
      });
      expect(res.status).toBe(201);
      expect(decimalEquals(res.body.amount, '100')).toBe(true);
      expect(decimalEquals(res.body.taxAmount, '14')).toBe(true);
      const journals = await journalsFor(EXPENSE, res.body.id);
      expect(journals).toHaveLength(1);
      expect(lineSignature(dbLines(journals[0].lines))).toEqual(
        lineSignature([
          { accountId: acc.software, debit: '100', credit: '0' },
          { accountId: acc.vatInput, debit: '14', credit: '0' },
          { accountId: acc.cash, debit: '0', credit: '114' },
        ]),
      );
    });

    it('rejects a client-supplied VAT amount, numeric money and malformed decimals', async () => {
      const base = { date: day, accountId: acc.rent, paidThroughAccountId: acc.bank };
      const before = await prisma.expense.count({
        where: { organizationId: tenantA.organizationId },
      });
      for (const body of [
        { ...base, amount: '10', taxAmount: '1.4' },
        { ...base, amount: '10.12345' },
        { ...base, amount: '-5' },
        { ...base, amount: '10', taxRate: '1e2' },
      ]) {
        expect((await a.post('/expenses').send(body)).status).toBe(400);
      }
      expect(
        await prisma.expense.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(before);
    });

    it('rejects a non-expense account and a non bank/cash paid-through account', async () => {
      const wrongExpenseAccount = await a
        .post('/expenses')
        .send({ date: day, accountId: acc.ap, amount: '10', paidThroughAccountId: acc.bank });
      expect(wrongExpenseAccount.status).toBe(400);
      const wrongPaidThrough = await a
        .post('/expenses')
        .send({ date: day, accountId: acc.rent, amount: '10', paidThroughAccountId: acc.rent });
      expect(wrongPaidThrough.status).toBe(400);
    });

    it('voids an expense with a linked EXPENSE_VOID reversal and never rewrites history', async () => {
      const created = await a.post('/expenses').send({
        date: day,
        accountId: acc.rent,
        amount: '50.00',
        taxRate: '14',
        paidThroughAccountId: acc.bank,
      });
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      const before = await accountBalance(prisma, tenantA.organizationId, acc.bank);

      const voided = await a.delete(`/expenses/${id}`);
      expect(voided.status).toBe(200);

      const original = await journalsFor(EXPENSE, id);
      const reversal = await journalsFor(EXPENSE_VOID, id);
      expect(original).toHaveLength(1);
      expect(reversal).toHaveLength(1);
      expect(reversal[0].reversalOfId).toBe(original[0].id);
      // The reversal mirrors the original with debits and credits swapped.
      expect(lineSignature(dbLines(reversal[0].lines))).toEqual(
        lineSignature(
          dbLines(original[0].lines).map((l) => ({
            accountId: l.accountId,
            debit: l.credit,
            credit: l.debit,
          })),
        ),
      );
      // 57 went out of the bank with the expense and came back with the void.
      const after = await accountBalance(prisma, tenantA.organizationId, acc.bank);
      expect(after.sub(before).equals('57')).toBe(true);

      const row = await prisma.expense.findUniqueOrThrow({ where: { id } });
      expect(row.deletedAt).not.toBeNull();
      // A voided expense stays readable (read-only) so journal source links resolve.
      const readBack = await a.get(`/expenses/${id}`);
      expect(readBack.status).toBe(200);
      expect(readBack.body.deletedAt).toBeTruthy();
      // A second void loses the guarded transition and posts nothing more.
      expect((await a.delete(`/expenses/${id}`)).status).toBe(404);
      expect(await journalsFor(EXPENSE_VOID, id)).toHaveLength(1);
    });

    it('a recurring expense without autoPost stays PENDING with no journal until it is posted', async () => {
      const profile = await a.post('/recurring-profiles').send({
        name: `Rent ${uniqueSuffix()}`,
        entityType: 'expense',
        type: 'EXPENSE',
        frequency: 'MONTHLY',
        startDate: day,
        autoPost: false,
        templateData: {
          accountId: acc.rent,
          paidThroughAccountId: acc.bank,
          amount: '200',
          taxRate: '14',
          description: 'Recurring rent',
        },
      });
      expect(profile.status).toBe(201);
      const key = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
      const run = await a.post(`/recurring-profiles/${profile.body.id}/execute`).send({
        idempotencyKey: key,
      });
      expect(run.status).toBe(201);
      expect(run.body.success).toBe(true);
      const id = run.body.createdEntityId as string;

      const row = await prisma.expense.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('PENDING');
      expect(await journalsFor(EXPENSE, id)).toHaveLength(0);

      // Voiding a pending expense reverses nothing, so test posting on a second one.
      const second = await a.post(`/recurring-profiles/${profile.body.id}/execute`).send({
        idempotencyKey: '7a1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
      });
      const secondId = second.body.createdEntityId as string;

      const posted = await a.post(`/expenses/${id}/post`);
      expect(posted.status).toBe(201);
      expect(posted.body.status).toBe('POSTED');
      const journals = await journalsFor(EXPENSE, id);
      expect(journals).toHaveLength(1);
      expect(lineSignature(dbLines(journals[0].lines))).toEqual(
        lineSignature([
          { accountId: acc.rent, debit: '200', credit: '0' },
          { accountId: acc.vatInput, debit: '28', credit: '0' },
          { accountId: acc.bank, debit: '0', credit: '228' },
        ]),
      );
      // Posting again is rejected and posts nothing more.
      expect((await a.post(`/expenses/${id}/post`)).status).toBe(400);
      expect(await journalsFor(EXPENSE, id)).toHaveLength(1);

      // Bulk approve posts through the same command with per-record outcomes.
      const bulk = await a.post('/expenses/bulk-approve').send({ ids: [secondId, id] });
      expect(bulk.status).toBe(201);
      expect(bulk.body.processed).toBe(1);
      expect(bulk.body.failures.map((f: { id: string }) => f.id)).toEqual([id]);
      expect(await journalsFor(EXPENSE, secondId)).toHaveLength(1);

      // A voided expense stays readable, read-only.
      expect((await a.delete(`/expenses/${secondId}`)).status).toBe(200);
      const voided = await a.get(`/expenses/${secondId}`);
      expect(voided.status).toBe(200);
      expect(voided.body.deletedAt).toBeTruthy();
    });

    it('bulk void reports per-record outcomes, and bulk re-categorise is rejected per record', async () => {
      const ids: string[] = [];
      for (const amount of ['10', '20']) {
        const res = await a.post('/expenses').send({
          date: day,
          accountId: acc.software,
          amount,
          paidThroughAccountId: acc.bank,
        });
        expect(res.status).toBe(201);
        ids.push(res.body.id);
      }

      const categorize = await a
        .post('/expenses/bulk-categorize')
        .send({ ids: [ids[0]], accountId: acc.rent });
      expect(categorize.status).toBe(201);
      expect(categorize.body.processed).toBe(0);
      expect(categorize.body.failures).toHaveLength(1);
      expect((await prisma.expense.findUniqueOrThrow({ where: { id: ids[0] } })).accountId).toBe(
        acc.software,
      );

      const bulk = await a.post('/expenses/bulk-delete').send({ ids: [...ids, 'does-not-exist'] });
      expect(bulk.status).toBe(201);
      expect(bulk.body.processed).toBe(2);
      expect(bulk.body.total).toBe(3);
      expect(bulk.body.failures).toEqual([{ id: 'does-not-exist', reason: 'Expense not found' }]);
      for (const id of ids) expect(await journalsFor(EXPENSE_VOID, id)).toHaveLength(1);
    });
  });

  describe('tenant A: vendor credits', () => {
    it('creates a credit: one journal Dr AP / Cr expense / Cr VAT, bill balance untouched', async () => {
      const bill1Before = await bill(bill1Id);
      const res = await createCredit(bill1Id, '114.00');
      expect(res.status).toBe(201);
      credit1Id = res.body.id;
      expect(res.body.creditNumber).toMatch(/^VC-\d{3,}$/);
      expect(decimalEquals(res.body.amount, '114')).toBe(true);

      const journals = await journalsFor(VENDOR_CREDIT, credit1Id);
      expect(journals).toHaveLength(1);
      expect(journals[0].date.toISOString()).toBe(midnightIso(creditDay));
      // 114 of a 228 bill with 28 VAT: VAT share 14, net 100, against the rent line account.
      expect(lineSignature(dbLines(journals[0].lines))).toEqual(
        lineSignature([
          { accountId: acc.ap, debit: '114', credit: '0' },
          { accountId: acc.rent, debit: '0', credit: '100' },
          { accountId: acc.vatInput, debit: '0', credit: '14' },
        ]),
      );
      // An unapplied credit does not reduce the bill (it sits as a debit on AP).
      const bill1After = await bill(bill1Id);
      expect(bill1After.balanceDue.equals(bill1Before.balanceDue)).toBe(true);
      expect(bill1After.status).toBe('OPEN');
    });

    it('rejects credits that exceed the bill, drafts, foreign amounts and bad payloads', async () => {
      // 114 already credited on a 228 bill: 115 more would exceed the total.
      expect((await createCredit(bill1Id, '115')).status).toBe(400);
      expect((await createCredit(draftBillId, '5')).status).toBe(400);
      expect((await createCredit(bill1Id, '0')).status).toBe(400);
      expect((await createCredit(bill1Id, '1.23456')).status).toBe(400);
      expect((await createCredit(bill1Id, '1e1')).status).toBe(400);
      // A credit account must be an expense account.
      expect((await createCredit(bill1Id, '5', { accountId: acc.ap })).status).toBe(400);
      expect(
        await prisma.vendorCredit.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(1);
    });

    it('applies the credit to a bill with no journal and reduces its balance', async () => {
      const journalsBefore = await prisma.journal.count({
        where: { organizationId: tenantA.organizationId },
      });
      const res = await a
        .post(`/vendor-credits/${credit1Id}/apply-to-bill`)
        .send({ billId: bill1Id });
      expect(res.status).toBe(201);
      expect(res.body.appliedToBillId).toBe(bill1Id);

      const applied = await bill(bill1Id);
      expect(applied.balanceDue.equals('114')).toBe(true);
      expect(applied.status).toBe('PARTIALLY_PAID');
      expect(
        await prisma.journal.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(journalsBefore);
      const fromApi = await eventually(async () => {
        const got = await a.get(`/bills/${bill1Id}`);
        expect(decimalEquals(got.body.balanceDue, '114')).toBe(true);
        return got.body;
      });
      expect(fromApi.status).toBe('PARTIALLY_PAID');

      // Applying again is rejected and an applied credit can be neither refunded nor voided.
      expect(
        (await a.post(`/vendor-credits/${credit1Id}/apply-to-bill`).send({ billId: bill3Id }))
          .status,
      ).toBe(400);
      expect(
        (await a.post(`/vendor-credits/${credit1Id}/refund`).send({ bankAccountId: acc.bank }))
          .status,
      ).toBe(400);
      expect((await a.delete(`/vendor-credits/${credit1Id}`)).status).toBe(400);
      expect(await journalsFor(VENDOR_CREDIT_VOID, credit1Id)).toHaveLength(0);
    });

    it('refunds an unapplied credit: Dr bank / Cr AP once, then it is final', async () => {
      const created = await createCredit(bill2Id, '100.00');
      expect(created.status).toBe(201);
      credit2Id = created.body.id;

      // The refund account must be an eligible bank/cash account.
      expect(
        (await a.post(`/vendor-credits/${credit2Id}/refund`).send({ bankAccountId: acc.rent }))
          .status,
      ).toBe(400);
      expect(await journalsFor(VENDOR_CREDIT_REFUND, credit2Id)).toHaveLength(0);

      const res = await a
        .post(`/vendor-credits/${credit2Id}/refund`)
        .send({ bankAccountId: acc.bank, date: refundDay });
      expect(res.status).toBe(201);
      expect(res.body.refundedAt).toBeTruthy();

      const journals = await journalsFor(VENDOR_CREDIT_REFUND, credit2Id);
      expect(journals).toHaveLength(1);
      expect(journals[0].date.toISOString()).toBe(midnightIso(refundDay));
      expect(lineSignature(dbLines(journals[0].lines))).toEqual(
        lineSignature([
          { accountId: acc.bank, debit: '100', credit: '0' },
          { accountId: acc.ap, debit: '0', credit: '100' },
        ]),
      );

      expect(
        (await a.post(`/vendor-credits/${credit2Id}/refund`).send({ bankAccountId: acc.bank }))
          .status,
      ).toBe(400);
      expect(
        (await a.post(`/vendor-credits/${credit2Id}/apply-to-bill`).send({ billId: bill2Id }))
          .status,
      ).toBe(400);
      expect((await a.delete(`/vendor-credits/${credit2Id}`)).status).toBe(400);
      expect(await journalsFor(VENDOR_CREDIT_REFUND, credit2Id)).toHaveLength(1);
    });

    it('voids an unapplied credit with a linked VENDOR_CREDIT_VOID reversal', async () => {
      const created = await createCredit(bill2Id, '50.00');
      expect(created.status).toBe(201);
      credit3Id = created.body.id;
      const apBefore = await accountBalance(prisma, tenantA.organizationId, acc.ap);

      const res = await a.delete(`/vendor-credits/${credit3Id}`);
      expect(res.status).toBe(200);

      const original = await journalsFor(VENDOR_CREDIT, credit3Id);
      const reversal = await journalsFor(VENDOR_CREDIT_VOID, credit3Id);
      expect(original).toHaveLength(1);
      expect(reversal).toHaveLength(1);
      expect(reversal[0].reversalOfId).toBe(original[0].id);
      // The credit's Dr AP 50 is reversed by a Cr AP 50.
      const apAfter = await accountBalance(prisma, tenantA.organizationId, acc.ap);
      expect(apAfter.sub(apBefore).equals('-50')).toBe(true);
      expect((await a.get(`/vendor-credits/${credit3Id}`)).status).toBe(404);
      expect((await a.delete(`/vendor-credits/${credit3Id}`)).status).toBe(404);
      expect(await journalsFor(VENDOR_CREDIT_VOID, credit3Id)).toHaveLength(1);
    });

    it('rejects applying a credit beyond the bill balance (over-apply)', async () => {
      // Pay bill 2 down to 142, then try to apply a 200 credit.
      const payment = await a.post('/payments-made').send({
        vendorId,
        date: day,
        amount: '200.00',
        paymentMode: 'BANK_TRANSFER',
        paidFromAccountId: acc.bank,
        allocations: [{ billId: bill2Id, amount: '200.00' }],
      });
      expect(payment.status).toBe(201);
      expect((await bill(bill2Id)).balanceDue.equals('142')).toBe(true);

      const created = await createCredit(bill2Id, '200.00');
      expect(created.status).toBe(201);
      credit4Id = created.body.id;

      const over = await a
        .post(`/vendor-credits/${credit4Id}/apply-to-bill`)
        .send({ billId: bill2Id });
      expect(over.status).toBe(400);
      expect(over.body.message).toMatch(/exceeds the balance due/);
      expect((await bill(bill2Id)).balanceDue.equals('142')).toBe(true);
      expect(
        (await prisma.vendorCredit.findUniqueOrThrow({ where: { id: credit4Id } })).appliedToBillId,
      ).toBeNull();
    });

    it('bulk void reports per-record outcomes and leaves applied credits alone', async () => {
      const extra = await createCredit(bill3Id, '10.00');
      expect(extra.status).toBe(201);
      const bulk = await a
        .post('/vendor-credits/bulk-delete')
        .send({ ids: [extra.body.id, credit1Id, 'does-not-exist'] });
      expect(bulk.status).toBe(201);
      expect(bulk.body.processed).toBe(1);
      expect(bulk.body.total).toBe(3);
      expect(bulk.body.failures.map((f: { id: string }) => f.id).sort()).toEqual(
        [credit1Id, 'does-not-exist'].sort(),
      );
      expect(await journalsFor(VENDOR_CREDIT_VOID, extra.body.id)).toHaveLength(1);
      expect(await journalsFor(VENDOR_CREDIT_VOID, credit1Id)).toHaveLength(0);
    });

    it('keeps the trial balance balanced and AP equal to open bills minus unapplied credits', async () => {
      const tb = await trialBalance();
      const apRow = tb.accounts.find((x: { id: string }) => x.id === acc.ap);
      const apCredit = new Prisma.Decimal(apRow.credit).sub(apRow.debit);

      // Open bills carry AP (applied credits and payments are already inside their balances).
      const open = await prisma.bill.findMany({
        where: {
          organizationId: tenantA.organizationId,
          deletedAt: null,
          status: { in: ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'] },
        },
        select: { balanceDue: true },
      });
      const openTotal = open.reduce((s, x) => s.add(x.balanceDue), new Prisma.Decimal(0));
      // An unapplied, unrefunded, live credit has debited AP but not reduced any bill.
      const unapplied = await prisma.vendorCredit.findMany({
        where: {
          organizationId: tenantA.organizationId,
          deletedAt: null,
          appliedToBillId: null,
          refundedAt: null,
        },
        select: { amount: true },
      });
      const unappliedTotal = unapplied.reduce((s, x) => s.add(x.amount), new Prisma.Decimal(0));

      // bill1 114 + bill2 142 + bill3 114 = 370 open; credit 4 (200) unapplied => AP 170.
      expect(openTotal.toString()).toBe('370');
      expect(unappliedTotal.toString()).toBe('200');
      expect(apCredit.toString()).toBe(openTotal.sub(unappliedTotal).toString());
      expect(apCredit.toString()).toBe('170');

      // Every payables view reconciles to the AP control account once the open credit is netted.
      const aging = await a.get('/reports/payables-aging');
      expect(aging.status).toBe(200);
      expect(decimalEquals(aging.body.summary.unappliedCredits, '200')).toBe(true);
      expect(decimalEquals(aging.body.summary.netTotal, '170')).toBe(true);
      const dashboard = await a.get('/reports/dashboard');
      expect(dashboard.status).toBe(200);
      expect(decimalEquals(dashboard.body.overview.totalPayables, '170')).toBe(true);
      const byVendor = await a.get('/reports/purchases-by-vendor');
      expect(byVendor.status).toBe(200);
      expect(decimalEquals(byVendor.body.totalUnappliedCredits, '200')).toBe(true);
      expect(decimalEquals(byVendor.body.totalNetPayable, '170')).toBe(true);

      const report = await a.get('/reports/trial-balance').query({ asOfDate: isoDay(0) });
      expect(report.status).toBe(200);
      expect(report.body.isBalanced).toBe(true);
    });

    it('every posted purchase event has exactly one balanced journal', async () => {
      const sources = [
        [EXPENSE, expense1Id],
        [VENDOR_CREDIT, credit1Id],
        [VENDOR_CREDIT, credit4Id],
        [VENDOR_CREDIT_REFUND, credit2Id],
      ] as const;
      for (const [type, id] of sources) {
        const journals = await journalsFor(type, id);
        expect(journals).toHaveLength(1);
        const debit = journals[0].lines.reduce((s, l) => s.add(l.debit), new Prisma.Decimal(0));
        const credit = journals[0].lines.reduce((s, l) => s.add(l.credit), new Prisma.Decimal(0));
        expect(debit.equals(credit)).toBe(true);
      }
    });
  });

  describe('tenant isolation', () => {
    it("sets up tenant B's own books", async () => {
      expect((await b.post('/accounts/seed-defaults')).status).toBe(201);
      const list = await b.get('/accounts').query({ limit: 500 });
      rentBAccountId = list.body.data.find((x: { code: string }) => x.code === '6100').id;
      bankBAccountId = list.body.data.find((x: { code: string }) => x.code === '1010').id;
      const vendor = await b.post('/vendors').send({ name: `B Vendor ${uniqueSuffix()}` });
      expect(vendor.status).toBe(201);
      vendorBId = vendor.body.id;
      const created = await createApprovedBill('100', rentBAccountId, b, vendorBId);
      billBId = created.id;
    });

    it("hides tenant A's expenses and credits from tenant B", async () => {
      expect((await b.get(`/expenses/${expense1Id}`)).status).toBe(404);
      expect((await b.get(`/vendor-credits/${credit1Id}`)).status).toBe(404);
      for (const [url, id] of [
        ['/expenses', expense1Id],
        ['/vendor-credits', credit4Id],
      ] as const) {
        const list = await b.get(url).query({ limit: 100 });
        expect(list.status).toBe(200);
        expect(list.body.data.map((x: { id: string }) => x.id)).not.toContain(id);
      }
    });

    it("cannot void, apply or refund tenant A's documents", async () => {
      const journalsA = await prisma.journal.count({
        where: { organizationId: tenantA.organizationId },
      });
      expect((await b.delete(`/expenses/${expense1Id}`)).status).toBe(404);
      expect((await b.delete(`/vendor-credits/${credit4Id}`)).status).toBe(404);
      expect(
        (await b.post(`/vendor-credits/${credit4Id}/apply-to-bill`).send({ billId: billBId }))
          .status,
      ).toBe(404);
      expect(
        (
          await b
            .post(`/vendor-credits/${credit4Id}/refund`)
            .send({ bankAccountId: bankBAccountId })
        ).status,
      ).toBe(404);
      const bulk = await b.post('/expenses/bulk-delete').send({ ids: [expense1Id] });
      expect(bulk.body.processed).toBe(0);
      const bulkCredits = await b.post('/vendor-credits/bulk-delete').send({ ids: [credit4Id] });
      expect(bulkCredits.body.processed).toBe(0);
      expect(
        await prisma.journal.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(journalsA);
      expect(
        (await prisma.expense.findUniqueOrThrow({ where: { id: expense1Id } })).deletedAt,
      ).toBeNull();
    });

    it("rejects tenant A's accounts, vendors and bills in tenant B's postings", async () => {
      const expensesBefore = await prisma.expense.count({
        where: { organizationId: tenantB.organizationId },
      });
      const foreignAccount = await b.post('/expenses').send({
        date: day,
        accountId: acc.rent,
        amount: '10',
        paidThroughAccountId: bankBAccountId,
      });
      expect(foreignAccount.status).toBe(400);
      const foreignBank = await b.post('/expenses').send({
        date: day,
        accountId: rentBAccountId,
        amount: '10',
        paidThroughAccountId: acc.bank,
      });
      expect(foreignBank.status).toBe(400);
      const foreignVendor = await b.post('/expenses').send({
        date: day,
        accountId: rentBAccountId,
        vendorId,
        amount: '10',
        paidThroughAccountId: bankBAccountId,
      });
      expect(foreignVendor.status).toBe(400);
      const foreignBill = await b.post('/vendor-credits').send({
        vendorId: vendorBId,
        billId: bill1Id,
        amount: '5',
      });
      expect(foreignBill.status).toBe(400);
      expect(
        await prisma.expense.count({ where: { organizationId: tenantB.organizationId } }),
      ).toBe(expensesBefore);
      expect(
        await prisma.vendorCredit.count({ where: { organizationId: tenantB.organizationId } }),
      ).toBe(0);
    });

    it("keeps tenant B's ledger separate from tenant A's", async () => {
      const tb = await trialBalance(b);
      // Only bill B's approval: Dr rent 100 + VAT 14 = Cr AP 114.
      expect(tb.totals.totalDebits).toBe('114');
      expect(tb.totals.totalCredits).toBe('114');
    });
  });

  describe('anonymous access', () => {
    it.each([
      ['get', '/expenses'],
      ['post', '/expenses'],
      ['get', '/expenses/expense-accounts'],
      ['get', '/expenses/paid-through-accounts'],
      ['post', '/expenses/bulk-delete'],
      ['get', '/vendor-credits'],
      ['post', '/vendor-credits'],
      ['get', '/vendor-credits/refund-accounts'],
      ['post', '/vendor-credits/bulk-delete'],
    ] as const)('%s %s returns 401', async (method, url) => {
      const res = await anon[method](url).send({});
      expect(res.status).toBe(401);
    });

    it('rejects document requests without a token and with a forged token', async () => {
      expect((await anon.get(`/expenses/${expense1Id}`)).status).toBe(401);
      expect((await anon.delete(`/expenses/${expense1Id}`)).status).toBe(401);
      expect((await anon.delete(`/vendor-credits/${credit4Id}`)).status).toBe(401);
      expect((await anon.post(`/vendor-credits/${credit4Id}/refund`)).status).toBe(401);
      expect((await anon.post(`/vendor-credits/${credit4Id}/apply-to-bill`)).status).toBe(401);
      expect((await anon.withToken('not-a-jwt').get(`/vendor-credits/${credit4Id}`)).status).toBe(
        401,
      );
    });
  });
});
