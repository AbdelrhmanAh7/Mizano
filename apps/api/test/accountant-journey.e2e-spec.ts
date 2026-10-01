/**
 * Seeded accountant journey (issue #23): one tenant runs the purchases-to-ledger flow through the
 * real HTTP API with a real login, a second tenant probes isolation, and anonymous callers are
 * rejected. Money is asserted as exact decimal strings; ledger effects are checked both through
 * the API and against the database (journals per source event).
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
  JournalLineView,
  lineSignature,
  midnightIso,
} from './helpers/journey.helper';
import { PrismaService } from '../src/prisma/prisma.service';

const BILL_APPROVAL = 'BILL_APPROVAL';
const PAYMENT_MADE = 'PAYMENT_MADE';
const PAYMENT_MADE_VOID = 'PAYMENT_MADE_VOID';

describe('Accountant journey (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;

  // Tenant A chart of accounts (resolved after seeding)
  const acc = { ap: '', vat: '', bank: '', cash: '', rent: '', software: '', supplies: '' };
  let vendorId = '';

  // Documents created along the way
  let bill1Id = '';
  let bill1Number = '';
  let bill1JournalId = '';
  let bill2Id = '';
  let bill3Id = '';
  let lockedBillId = '';
  let okBillId = '';
  let payment1Id = '';
  let payment1JournalId = '';
  let manualJournalId = '';
  let bulkPaymentIds: string[] = [];

  const bill1Date = isoDay(-10);
  const lockedBillDate = isoDay(-400);
  const lockDate = midnightIso(isoDay(-365));
  const dueDate = isoDay(30);

  async function journalsFor(sourceType: string, sourceId: string) {
    return prisma.journal.findMany({
      where: { organizationId: tenantA.organizationId, sourceType, sourceId },
      include: { lines: true },
    });
  }

  async function getBill(id: string) {
    const res = await a.get(`/bills/${id}`);
    expect(res.status).toBe(200);
    return res.body;
  }

  async function createDraftBill(
    lines: Array<{ accountId: string; quantity: string; rate: string; taxRate?: string }>,
    date = bill1Date,
  ) {
    const res = await a.post('/bills').send({
      vendorId,
      date,
      dueDate,
      lines: lines.map((l, i) => ({ description: `Line ${i + 1}`, ...l })),
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    return res.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    anon = ApiHelper.anonymous(app);
    tenantA = await registerTenant(app, 'JourneyA');
    tenantB = await registerTenant(app, 'JourneyB');
    a = tenantA.api;
    b = tenantB.api;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('tenant A: purchases to ledger', () => {
    it('logs in as a real user of a real organization', async () => {
      expect(tenantA.organizationId).not.toBe(tenantB.organizationId);
      const org = await a.get('/organization');
      expect(org.status).toBe(200);
      expect(org.body.id).toBe(tenantA.organizationId);
      expect(org.body.name).toBe(tenantA.organizationName);
    });

    it('seeds the chart of accounts and links the organization default accounts', async () => {
      const seeded = await a.post('/accounts/seed-defaults');
      expect(seeded.status).toBe(201);
      expect(seeded.body.accounts.length).toBeGreaterThan(20);

      const list = await a.get('/accounts').query({ limit: 500 });
      expect(list.status).toBe(200);
      const byCode = new Map<string, string>(
        list.body.data.map((x: { code: string; id: string }) => [x.code, x.id]),
      );
      acc.cash = byCode.get('1000') as string;
      acc.bank = byCode.get('1010') as string;
      acc.ap = byCode.get('2000') as string;
      acc.vat = byCode.get('2210') as string;
      acc.rent = byCode.get('6100') as string;
      acc.software = byCode.get('6200') as string;
      acc.supplies = byCode.get('6600') as string;
      for (const id of Object.values(acc)) expect(id).toEqual(expect.any(String));

      const settings = await a.get('/organization/account-settings');
      expect(settings.status).toBe(200);
      expect(settings.body.defaultApAccountId).toBe(acc.ap);
      expect(settings.body.defaultVatReceivableAccountId).toBe(acc.vat);
      expect(settings.body.defaultBankAccountId).toBe(acc.bank);
      expect(settings.body.defaultCashAccountId).toBe(acc.cash);

      // Seeding again is idempotent and never overwrites the linked defaults.
      const again = await a.post('/accounts/seed-defaults');
      expect(again.status).toBe(201);
      const settingsAgain = await a.get('/organization/account-settings');
      expect(settingsAgain.body.defaultApAccountId).toBe(acc.ap);
    });

    it('creates a vendor and an auto-numbered bill with exact decimal totals', async () => {
      const vendor = await a.post('/vendors').send({ name: `Journey Vendor ${uniqueSuffix()}` });
      expect(vendor.status).toBe(201);
      vendorId = vendor.body.id;

      const bill = await createDraftBill([
        { accountId: acc.rent, quantity: '2', rate: '100', taxRate: '14' },
      ]);
      bill1Id = bill.id;
      bill1Number = bill.billNumber;
      expect(bill.billNumber).toMatch(/^BILL-\d{4}$/);
      expect(bill.subtotal).toBe('200');
      expect(bill.taxAmount).toBe('28');
      expect(bill.grandTotal).toBe('228');
      expect(bill.balanceDue).toBe('228');
      expect(bill.lines).toHaveLength(1);
      expect(bill.lines[0].amount).toBe('200');
      expect(bill.lines[0].taxRate).toBe('14');

      // The next bill without a number gets the next number.
      const next = await createDraftBill([
        { accountId: acc.software, quantity: '1', rate: '300', taxRate: '14' },
      ]);
      bill2Id = next.id;
      const n1 = Number(bill.billNumber.slice(5));
      expect(next.billNumber).toBe(`BILL-${String(n1 + 1).padStart(4, '0')}`);
      expect(next.grandTotal).toBe('342');
    });

    it('approves a bill: OPEN, one balanced journal dated on the bill date', async () => {
      const res = await a.post(`/bills/${bill1Id}/approve`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('OPEN');
      expect(res.body.balanceDue).toBe('228');

      const journals = await journalsFor(BILL_APPROVAL, bill1Id);
      expect(journals).toHaveLength(1);
      bill1JournalId = journals[0].id;

      const journal = await a.get(`/journals/${bill1JournalId}`);
      expect(journal.status).toBe(200);
      expect(journal.body.date).toBe(midnightIso(bill1Date));
      expect(journal.body.isPosted).toBe(true);
      expect(journal.body.sourceType).toBe(BILL_APPROVAL);
      expect(journal.body.sourceId).toBe(bill1Id);
      expect(journal.body.reference).toBe(`Bill ${bill1Number}`);
      expect(journal.body.totalDebit).toBe('228.0000');
      expect(journal.body.totalCredit).toBe('228.0000');
      expect(lineSignature(journal.body.lines as JournalLineView[])).toEqual(
        lineSignature([
          { accountId: acc.rent, debit: '200', credit: '0' },
          { accountId: acc.vat, debit: '28', credit: '0' },
          { accountId: acc.ap, debit: '0', credit: '228' },
        ]),
      );
    });

    it('rejects a second approval and still has exactly one journal', async () => {
      const res = await a.post(`/bills/${bill1Id}/approve`);
      expect([400, 409]).toContain(res.status);
      expect(await journalsFor(BILL_APPROVAL, bill1Id)).toHaveLength(1);
      expect((await getBill(bill1Id)).status).toBe('OPEN');
    });

    it('posts exactly once under concurrent approvals', async () => {
      const results = await Promise.all([
        a.post(`/bills/${bill2Id}/approve`),
        a.post(`/bills/${bill2Id}/approve`),
        a.post(`/bills/${bill2Id}/approve`),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      for (const s of statuses.filter((x) => x !== 201)) expect([400, 409]).toContain(s);

      const journals = await journalsFor(BILL_APPROVAL, bill2Id);
      expect(journals).toHaveLength(1);
      expect((await getBill(bill2Id)).status).toBe('OPEN');
    });

    it('approves a bill whose two lines share one expense account', async () => {
      const bill = await createDraftBill([
        { accountId: acc.rent, quantity: '1', rate: '50', taxRate: '14' },
        { accountId: acc.rent, quantity: '1', rate: '25', taxRate: '14' },
      ]);
      bill3Id = bill.id;
      expect(bill.subtotal).toBe('75');
      expect(bill.taxAmount).toBe('10.5');
      expect(bill.grandTotal).toBe('85.5');

      const res = await a.post(`/bills/${bill3Id}/approve`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('OPEN');

      const [journal] = await journalsFor(BILL_APPROVAL, bill3Id);
      expect(
        lineSignature(
          journal.lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit.toString(),
            credit: l.credit.toString(),
          })),
        ),
      ).toEqual(
        lineSignature([
          { accountId: acc.rent, debit: '50', credit: '0' },
          { accountId: acc.rent, debit: '25', credit: '0' },
          { accountId: acc.vat, debit: '10.5', credit: '0' },
          { accountId: acc.ap, debit: '0', credit: '85.5' },
        ]),
      );
    });

    it('records a partial payment from the bank account', async () => {
      // A draft that must stay out of payables (approved later, in a locked period).
      const locked = await createDraftBill(
        [{ accountId: acc.rent, quantity: '1', rate: '60', taxRate: '14' }],
        lockedBillDate,
      );
      lockedBillId = locked.id;

      const res = await a.post('/payments-made').send({
        vendorId,
        date: isoDay(-1),
        amount: '100',
        paymentMode: 'BANK_TRANSFER',
        paidFromAccountId: acc.bank,
        allocations: [{ billId: bill1Id, amount: '100' }],
      });
      expect(res.status).toBe(201);
      payment1Id = res.body.id;
      expect(res.body.paymentNumber).toMatch(/^VPMT-\d{3,}$/);
      expect(res.body.amount).toBe('100');

      const bill = await getBill(bill1Id);
      expect(bill.status).toBe('PARTIALLY_PAID');
      expect(bill.balanceDue).toBe('128');

      const journals = await journalsFor(PAYMENT_MADE, payment1Id);
      expect(journals).toHaveLength(1);
      payment1JournalId = journals[0].id;
      expect(
        lineSignature(
          journals[0].lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit.toString(),
            credit: l.credit.toString(),
          })),
        ),
      ).toEqual(
        lineSignature([
          { accountId: acc.ap, debit: '100', credit: '0' },
          { accountId: acc.bank, debit: '0', credit: '100' },
        ]),
      );
    });

    it('rejects an overpayment without creating a payment or touching the bill', async () => {
      const before = await prisma.paymentMade.count({
        where: { organizationId: tenantA.organizationId },
      });
      const res = await a.post('/payments-made').send({
        vendorId,
        date: isoDay(-1),
        amount: '200',
        paymentMode: 'BANK_TRANSFER',
        paidFromAccountId: acc.bank,
        allocations: [{ billId: bill1Id, amount: '200' }],
      });
      expect(res.status).toBe(400);
      expect(
        await prisma.paymentMade.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(before);
      const bill = await getBill(bill1Id);
      expect(bill.balanceDue).toBe('128');
      expect(bill.status).toBe('PARTIALLY_PAID');
    });

    it('keeps the trial balance balanced and the AP control account equal to open bills', async () => {
      const res = await a.get('/accounting-reports/trial-balance');
      expect(res.status).toBe(200);
      // Dr rent 275 + software 300 + VAT 80.5 = Cr AP 555.5 + bank 100
      expect(res.body.totals.totalDebits).toBe('655.5');
      expect(res.body.totals.totalCredits).toBe('655.5');
      const ap = res.body.accounts.find((x: { id: string }) => x.id === acc.ap);
      expect(ap.credit).toBe('555.5');
      const bank = res.body.accounts.find((x: { id: string }) => x.id === acc.bank);
      expect(bank.credit).toBe('100');

      const report = await a.get('/reports/trial-balance').query({ asOfDate: isoDay(0) });
      expect(report.status).toBe(200);
      expect(report.body.isBalanced).toBe(true);
      expect(decimalEquals(report.body.totals.debit, '655.5')).toBe(true);
      expect(decimalEquals(report.body.totals.credit, '655.5')).toBe(true);
    });

    it('shows the open balances, and not drafts, in payables aging', async () => {
      const res = await a.get('/reports/payables-aging');
      expect(res.status).toBe(200);
      const items: Array<{ billId: string; vendorId: string; balanceDue: unknown }> = [
        ...res.body.buckets.current,
        ...res.body.buckets.days1_30,
        ...res.body.buckets.days31_60,
        ...res.body.buckets.days61_90,
        ...res.body.buckets.over90,
      ];
      const bill1 = items.find((i) => i.billId === bill1Id);
      expect(bill1).toBeDefined();
      expect(decimalEquals(bill1?.balanceDue, '128')).toBe(true);
      expect(items.find((i) => i.billId === lockedBillId)).toBeUndefined();
      const vendorTotal = items
        .filter((i) => i.vendorId === vendorId)
        .reduce((s, i) => s + Number(i.balanceDue), 0);
      expect(decimalEquals(vendorTotal, '555.5')).toBe(true);
      expect(decimalEquals(res.body.summary.total, '555.5')).toBe(true);
    });

    it('voids the payment with a linked reversal and restores the bill', async () => {
      const res = await a.delete(`/payments-made/${payment1Id}`);
      expect(res.status).toBe(200);

      const bill = await getBill(bill1Id);
      expect(bill.status).toBe('OPEN');
      expect(bill.balanceDue).toBe('228');

      const reversals = await journalsFor(PAYMENT_MADE_VOID, payment1Id);
      expect(reversals).toHaveLength(1);
      expect(reversals[0].reversalOfId).toBe(payment1JournalId);
      expect(
        lineSignature(
          reversals[0].lines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit.toString(),
            credit: l.credit.toString(),
          })),
        ),
      ).toEqual(
        lineSignature([
          { accountId: acc.ap, debit: '0', credit: '100' },
          { accountId: acc.bank, debit: '100', credit: '0' },
        ]),
      );

      // The original payment journal is untouched.
      const original = await a.get(`/journals/${payment1JournalId}`);
      expect(original.status).toBe(200);
      expect(original.body.isPosted).toBe(true);
      expect(original.body.reversalOfId).toBeNull();
      expect(lineSignature(original.body.lines as JournalLineView[])).toEqual(
        lineSignature([
          { accountId: acc.ap, debit: '100', credit: '0' },
          { accountId: acc.bank, debit: '0', credit: '100' },
        ]),
      );

      const again = await a.delete(`/payments-made/${payment1Id}`);
      expect(again.status).toBe(404);
      expect(await journalsFor(PAYMENT_MADE_VOID, payment1Id)).toHaveLength(1);
    });

    it('keeps posted journals immutable and reverses a manual journal exactly once', async () => {
      // System journal from the bill approval.
      expect((await a.patch(`/journals/${bill1JournalId}`).send({ notes: 'edit' })).status).toBe(
        400,
      );
      expect((await a.delete(`/journals/${bill1JournalId}`)).status).toBe(400);

      // Unbalanced manual journal is rejected.
      const unbalanced = await a.post('/journals').send({
        date: isoDay(-2),
        lines: [
          { accountId: acc.supplies, debit: '10' },
          { accountId: acc.cash, credit: '9.99' },
        ],
      });
      expect(unbalanced.status).toBe(400);

      const created = await a.post('/journals').send({
        date: isoDay(-2),
        reference: `MANUAL-${uniqueSuffix()}`,
        lines: [
          { accountId: acc.supplies, debit: '10.25', description: 'Pens' },
          { accountId: acc.cash, credit: '10.25' },
        ],
      });
      expect(created.status).toBe(201);
      manualJournalId = created.body.id;
      expect(created.body.isPosted).toBe(true);
      expect(created.body.totalDebit).toBe('10.2500');
      expect(created.body.journalNumber).toMatch(/^JRN-\d{3,}$/);

      expect(
        (await a.patch(`/journals/${manualJournalId}`).send({ notes: 'edit' })).status,
      ).toBe(400);
      expect((await a.delete(`/journals/${manualJournalId}`)).status).toBe(400);

      const reversed = await a.post(`/journals/${manualJournalId}/reverse`).send({});
      expect(reversed.status).toBe(201);
      expect(reversed.body.reversalOfId).toBe(manualJournalId);
      expect(lineSignature(reversed.body.lines as JournalLineView[])).toEqual(
        lineSignature([
          { accountId: acc.supplies, debit: '0', credit: '10.25' },
          { accountId: acc.cash, debit: '10.25', credit: '0' },
        ]),
      );

      expect((await a.post(`/journals/${manualJournalId}/reverse`).send({})).status).toBe(400);
      expect((await a.post(`/journals/${reversed.body.id}/reverse`).send({})).status).toBe(400);
      expect(
        await prisma.journal.count({
          where: { organizationId: tenantA.organizationId, reversalOfId: manualJournalId },
        }),
      ).toBe(1);
    });

    it('does not reverse a system journal behind its source document', async () => {
      const res = await a.post(`/journals/${bill1JournalId}/reverse`).send({});
      expect(res.status).toBe(400);
      expect(
        await prisma.journal.count({
          where: { organizationId: tenantA.organizationId, reversalOfId: bill1JournalId },
        }),
      ).toBe(0);
      expect((await getBill(bill1Id)).balanceDue).toBe('228');
    });

    it('enforces the lock date on approval, manual journals and payments', async () => {
      const set = await a.patch('/organization/lock-date').send({ lockDate });
      expect(set.status).toBe(200);
      expect(set.body.lockDate).toBe(lockDate);

      const approve = await a.post(`/bills/${lockedBillId}/approve`);
      expect(approve.status).toBe(400);
      expect(approve.body.message).toMatch(/locked/i);
      expect((await getBill(lockedBillId)).status).toBe('DRAFT');
      expect(await journalsFor(BILL_APPROVAL, lockedBillId)).toHaveLength(0);

      const journal = await a.post('/journals').send({
        date: lockedBillDate,
        lines: [
          { accountId: acc.supplies, debit: '1' },
          { accountId: acc.cash, credit: '1' },
        ],
      });
      expect(journal.status).toBe(400);

      // A payment dated inside the locked period rolls back completely.
      const paymentsBefore = await prisma.paymentMade.count({
        where: { organizationId: tenantA.organizationId },
      });
      const payment = await a.post('/payments-made').send({
        vendorId,
        date: lockedBillDate,
        amount: '1',
        paymentMode: 'BANK_TRANSFER',
        paidFromAccountId: acc.bank,
        allocations: [{ billId: bill1Id, amount: '1' }],
      });
      expect(payment.status).toBe(400);
      expect(
        await prisma.paymentMade.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(paymentsBefore);
      expect((await getBill(bill1Id)).balanceDue).toBe('228');
    });

    it('bulk-approves per record: the locked bill fails, the other posts', async () => {
      const ok = await createDraftBill(
        [{ accountId: acc.rent, quantity: '4', rate: '10', taxRate: '0' }],
        isoDay(-5),
      );
      okBillId = ok.id;
      expect(ok.taxAmount).toBe('0');
      expect(ok.grandTotal).toBe('40');

      const res = await a.post('/bills/bulk-approve').send({ ids: [lockedBillId, okBillId] });
      expect(res.status).toBe(201);
      expect(res.body.processed).toBe(1);
      expect(res.body.total).toBe(2);
      expect(res.body.failures).toHaveLength(1);
      expect(res.body.failures[0].id).toBe(lockedBillId);
      expect(res.body.failures[0].reason).toMatch(/locked/i);

      expect((await getBill(lockedBillId)).status).toBe('DRAFT');
      expect(await journalsFor(BILL_APPROVAL, lockedBillId)).toHaveLength(0);
      expect((await getBill(okBillId)).status).toBe('OPEN');
      const [journal] = await journalsFor(BILL_APPROVAL, okBillId);
      expect(journal.lines).toHaveLength(2); // no VAT line on a zero-tax bill
    });

    it('bulk-pays full balances by recording real payments', async () => {
      const listBefore = await a.get('/payments-made').query({ limit: 100 });
      expect(listBefore.status).toBe(200);
      const totalBefore = listBefore.body.meta.total;

      const res = await a
        .post('/bills/bulk-pay')
        .send({ ids: [bill1Id, bill2Id, lockedBillId], paymentMode: 'BANK_TRANSFER' });
      expect(res.status).toBe(201);
      expect(res.body.processed).toBe(2);
      expect(res.body.total).toBe(3);
      expect(res.body.failures).toHaveLength(1);
      expect(res.body.failures[0].id).toBe(lockedBillId);

      for (const [id, amount] of [
        [bill1Id, '228'],
        [bill2Id, '342'],
      ]) {
        const bill = await getBill(id);
        expect(bill.status).toBe('PAID');
        expect(bill.balanceDue).toBe('0');
        expect(bill.billAllocations).toHaveLength(id === bill1Id ? 2 : 1);

        const allocation = await prisma.billAllocation.findFirst({
          where: { billId: id, payment: { deletedAt: null } },
          include: { payment: true },
        });
        expect(allocation?.payment.amount.toString()).toBe(amount);
        expect(allocation?.payment.paidFromAccountId).toBe(acc.bank); // org default bank
        bulkPaymentIds.push(allocation?.paymentId as string);

        const journals = await journalsFor(PAYMENT_MADE, allocation?.paymentId as string);
        expect(journals).toHaveLength(1);
        expect(
          lineSignature(
            journals[0].lines.map((l) => ({
              accountId: l.accountId,
              debit: l.debit.toString(),
              credit: l.credit.toString(),
            })),
          ),
        ).toEqual(
          lineSignature([
            { accountId: acc.ap, debit: amount, credit: '0' },
            { accountId: acc.bank, debit: '0', credit: amount },
          ]),
        );
      }

      // The payments list reflects the new payments (not a cached pre-payment page).
      await eventually(async () => {
        const listAfter = await a.get('/payments-made').query({ limit: 100 });
        expect(listAfter.status).toBe(200);
        expect(listAfter.body.meta.total).toBe(totalBefore + 2);
        const ids = listAfter.body.data.map((p: { id: string }) => p.id);
        for (const id of bulkPaymentIds) expect(ids).toContain(id);
      });
    });

    it('approves the old bill once the lock is lifted, dated on its own bill date', async () => {
      const cleared = await a.patch('/organization/lock-date').send({ lockDate: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.lockDate).toBeNull();

      const res = await a.post(`/bills/${lockedBillId}/approve`);
      expect(res.status).toBe(201);
      const [journal] = await journalsFor(BILL_APPROVAL, lockedBillId);
      expect(journal.date.toISOString()).toBe(midnightIso(lockedBillDate));
    });

    it('ends with a balanced ledger whose AP equals the open bill balances', async () => {
      const res = await a.get('/accounting-reports/trial-balance');
      expect(res.status).toBe(200);
      expect(res.body.totals.totalDebits).toBe(res.body.totals.totalCredits);
      // Open: bill3 85.5 + okBill 40 + lockedBill 68.4
      const ap = res.body.accounts.find((x: { id: string }) => x.id === acc.ap);
      expect(ap.credit).toBe('193.9');

      const open = await prisma.bill.findMany({
        where: { organizationId: tenantA.organizationId, deletedAt: null, status: { not: 'DRAFT' } },
        select: { balanceDue: true },
      });
      const openTotal = open.reduce((s, x) => s.add(x.balanceDue), new Prisma.Decimal(0));
      expect(openTotal.toString()).toBe('193.9');
    });
  });

  describe('tenant isolation', () => {
    it("hides tenant A's documents from tenant B by id", async () => {
      const [paymentA] = bulkPaymentIds;
      expect((await b.get(`/bills/${bill1Id}`)).status).toBe(404);
      expect((await b.get(`/journals/${bill1JournalId}`)).status).toBe(404);
      expect((await b.get(`/payments-made/${paymentA}`)).status).toBe(404);
      expect((await b.get(`/vendors/${vendorId}`)).status).toBe(404);
      expect((await b.get(`/accounts/${acc.ap}`)).status).toBe(404);
      expect((await b.get(`/accounting-reports/general-ledger/${acc.ap}`)).status).toBe(404);
    });

    it("leaves tenant A's documents out of tenant B's lists", async () => {
      await b.post('/accounts/seed-defaults').expect(201);
      const lists: Array<[string, string[]]> = [
        ['/bills', [bill1Id, bill2Id, bill3Id, okBillId, lockedBillId]],
        ['/journals', [bill1JournalId, payment1JournalId, manualJournalId]],
        ['/payments-made', bulkPaymentIds],
        ['/vendors', [vendorId]],
        ['/accounts', Object.values(acc)],
      ];
      for (const [url, foreignIds] of lists) {
        const res = await b.get(url).query({ limit: 500 });
        expect(res.status).toBe(200);
        const ids = res.body.data.map((x: { id: string }) => x.id);
        for (const id of foreignIds) expect(ids).not.toContain(id);
      }
      const settings = await b.get('/organization/account-settings');
      expect(settings.body.defaultApAccountId).not.toBe(acc.ap);
    });

    it("cannot mutate tenant A's documents", async () => {
      const bBank = (await b.get('/organization/account-settings')).body.defaultBankAccountId;
      const bVendor = await b.post('/vendors').send({ name: `B Vendor ${uniqueSuffix()}` });
      expect(bVendor.status).toBe(201);
      const okBillBefore = await getBill(okBillId);

      // Pay A's bill with B's own vendor and bank account.
      const pay = await b.post('/payments-made').send({
        vendorId: bVendor.body.id,
        date: isoDay(0),
        amount: '1',
        paymentMode: 'BANK_TRANSFER',
        paidFromAccountId: bBank,
        allocations: [{ billId: okBillId, amount: '1' }],
      });
      expect([400, 404]).toContain(pay.status);

      // ...or with A's vendor and bank account.
      const pay2 = await b.post('/payments-made').send({
        vendorId,
        date: isoDay(0),
        amount: '1',
        paymentMode: 'BANK_TRANSFER',
        paidFromAccountId: acc.bank,
        allocations: [{ billId: okBillId, amount: '1' }],
      });
      expect([400, 404]).toContain(pay2.status);

      const bulkPay = await b.post('/bills/bulk-pay').send({ ids: [okBillId] });
      expect(bulkPay.status).toBe(201);
      expect(bulkPay.body.processed).toBe(0);

      expect((await b.post(`/bills/${okBillId}/approve`)).status).toBe(404);
      expect((await b.patch(`/bills/${okBillId}`).send({ notes: 'x' })).status).toBe(404);
      expect((await b.delete(`/bills/${okBillId}`)).status).toBe(404);
      expect((await b.delete(`/payments-made/${bulkPaymentIds[0]}`)).status).toBe(404);
      expect((await b.post(`/journals/${manualJournalId}/reverse`).send({})).status).toBe(404);

      const okBillAfter = await getBill(okBillId);
      expect(okBillAfter.balanceDue).toBe(okBillBefore.balanceDue);
      expect(okBillAfter.status).toBe(okBillBefore.status);
      expect((await a.get(`/payments-made/${bulkPaymentIds[0]}`)).status).toBe(200);
      expect(
        await prisma.paymentMade.count({ where: { organizationId: tenantB.organizationId } }),
      ).toBe(0);
    });

    it("rejects tenant A's accounts and vendors in tenant B's postings", async () => {
      const bAccounts = await b.get('/accounts').query({ limit: 500 });
      const bCash = bAccounts.body.data.find((x: { code: string }) => x.code === '1000').id;

      const journal = await b.post('/journals').send({
        date: isoDay(0),
        lines: [
          { accountId: acc.supplies, debit: '5' },
          { accountId: bCash, credit: '5' },
        ],
      });
      expect(journal.status).toBe(400);

      const bill = await b.post('/bills').send({
        vendorId,
        date: isoDay(0),
        dueDate,
        lines: [{ accountId: bCash, quantity: '1', rate: '1' }],
      });
      expect(bill.status).toBe(400);

      expect(
        await prisma.journal.count({ where: { organizationId: tenantB.organizationId } }),
      ).toBe(0);
    });
  });

  describe('anonymous access', () => {
    it.each([
      ['get', '/bills'],
      ['post', '/bills'],
      ['get', '/journals'],
      ['post', '/journals'],
      ['get', '/payments-made'],
      ['post', '/payments-made'],
      ['post', '/bills/bulk-pay'],
      ['get', '/accounting-reports/trial-balance'],
      ['get', '/reports/payables-aging'],
      ['get', '/organization/account-settings'],
      ['patch', '/organization/lock-date'],
      ['post', '/accounts/seed-defaults'],
    ] as const)('%s %s returns 401', async (method, url) => {
      const res = await anon[method](url).send({});
      expect(res.status).toBe(401);
    });

    it('rejects a document id request without a token and with a forged token', async () => {
      expect((await anon.get(`/bills/${bill1Id}`)).status).toBe(401);
      expect((await anon.withToken('not-a-jwt').get(`/bills/${bill1Id}`)).status).toBe(401);
    });
  });
});
