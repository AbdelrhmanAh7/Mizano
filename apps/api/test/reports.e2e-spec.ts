/**
 * Reports and dashboard reconciliation. One tenant builds a small receivables, payables and cash
 * scenario through the real HTTP API (real login): an opening balance, issued invoices, a draft
 * and a voided invoice, payments (one voided), applied and unapplied credit notes, approved bills,
 * a draft and a deleted bill, an unapplied vendor credit and expenses (one voided). Every report
 * and dashboard figure is then asserted against the posted ledger and the live documents in
 * exact decimals. A second tenant proves isolation and anonymous callers are rejected.
 */
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TEST_PASSWORD, TestTenant } from './helpers/tenant.helper';
import { isoDay } from './helpers/journey.helper';
import { createAccount } from './helpers/postings.helper';
import { cashAccountIds, ledgerNetByAccount, natural } from './helpers/reports.helper';
import { PrismaService } from '../src/prisma/prisma.service';

const D = (v: unknown): Prisma.Decimal => new Prisma.Decimal(String(v));
const FOUR_DP = /^-?\d+\.\d{4}$/;

describe('Reports and dashboard reconcile with the ledger (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;

  const acc = { ar: '', ap: '', bank: '', cash: '', revenue: '', returns: '', rent: '' };
  let customer1 = '';
  let customer2 = '';
  let customer3 = '';
  let vendorId = '';
  let inv1 = '';
  let inv2 = '';
  let invVoided = '';
  let savingsRegister = '';
  let billId = '';
  let billDraftId = '';

  const today = isoDay(0);
  const wide = { startDate: isoDay(-400), endDate: today };

  async function createInvoice(
    customerId: string,
    lines: Array<{ quantity: string; rate: string; taxRate?: string }>,
    date: string,
    due: string,
  ): Promise<{ id: string; grandTotal: string }> {
    const res = await a.post('/invoices').send({
      customerId,
      date,
      dueDate: due,
      lines: lines.map((l, i) => ({ description: `Line ${i + 1}`, ...l })),
    });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function sendInvoice(id: string): Promise<void> {
    const res = await a.patch(`/invoices/${id}/send`);
    expect(res.status).toBe(200);
  }

  async function createBill(
    rate: string,
    approve: boolean,
  ): Promise<{ id: string; grandTotal: string }> {
    const created = await a.post('/bills').send({
      vendorId,
      date: isoDay(-5),
      dueDate: isoDay(30),
      lines: [{ description: 'Line', accountId: acc.rent, quantity: '1', rate, taxRate: '14' }],
    });
    expect(created.status).toBe(201);
    if (approve) expect((await a.post(`/bills/${created.body.id}/approve`)).status).toBe(201);
    return created.body;
  }

  /** Natural ledger balance per account from the database (ground truth). */
  async function groundTruth(): Promise<Map<string, Prisma.Decimal>> {
    const net = await ledgerNetByAccount(prisma, tenantA.organizationId);
    return new Map([...net.entries()].map(([id, v]) => [id, natural(v.type, v.net)]));
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    anon = ApiHelper.anonymous(app);
    tenantA = await registerTenant(app, 'RepA');
    tenantB = await registerTenant(app, 'RepB');
    a = tenantA.api;
    b = tenantB.api;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('tenant A: scenario', () => {
    it('seeds the chart, configures accounts and posts an opening balance', async () => {
      expect((await a.post('/accounts/seed-defaults')).status).toBe(201);
      const returns = await createAccount(a, '4150', 'Sales Returns', 'INCOME');
      const equity = await createAccount(a, '3900', 'Opening Balance Equity', 'EQUITY');
      expect(equity).toEqual(expect.any(String));
      expect(
        (
          await a
            .patch('/organization/account-settings')
            .send({ defaultSalesReturnsAccountId: returns })
        ).status,
      ).toBe(200);
      const settings = (await a.get('/organization/account-settings')).body;
      acc.ar = settings.defaultArAccountId;
      acc.ap = settings.defaultApAccountId;
      acc.bank = settings.defaultBankAccountId;
      acc.cash = settings.defaultCashAccountId;
      acc.revenue = settings.defaultRevenueAccountId;
      acc.returns = returns;
      const list = await a.get('/accounts').query({ limit: 500 });
      acc.rent = list.body.data.find((x: { code: string }) => x.code === '6100').id;
      for (const id of Object.values(acc)) expect(id).toEqual(expect.any(String));

      // Bank accounts cannot carry an opening balance themselves: it is rejected and recorded
      // through Opening Balances instead (below), so the ledger stays the single source.
      const savings = await createAccount(a, '1050', 'Savings Bank', 'ASSET');
      const rejected = await a.post('/bank-accounts').send({
        name: 'Savings',
        type: 'BANK',
        linkedAccountId: savings,
        openingBalance: '250.25',
      });
      expect(rejected.status).toBe(400);
      expect(rejected.body.message).toMatch(/Opening Balances/);
      const bankAccount = await a
        .post('/bank-accounts')
        .send({ name: 'Savings', type: 'BANK', linkedAccountId: savings });
      expect(bankAccount.status).toBe(201);

      const opening = await a.post('/organization/onboarding/opening-balances').send({
        openingDate: isoDay(-200),
        balances: [
          { accountId: acc.bank, amount: '5000.50' },
          { accountId: savings, amount: '250.25' },
        ],
      });
      expect(opening.status).toBe(201);
      const savingsBalance = await a.get(`/accounts/${savings}/balance`);
      expect(savingsBalance.body.balance).toBe('250.2500');

      // The bank register's book balance is the linked ledger account (the stored
      // systemBalance stays 0): the opening posted through Opening Balances shows up on it.
      savingsRegister = bankAccount.body.id;
      const register = await a.get(`/bank-accounts/${savingsRegister}`);
      expect(register.status).toBe(200);
      expect(D(register.body.systemBalance).equals('250.25')).toBe(true);
      const stats = await a.get('/bank-accounts/stats');
      expect(stats.status).toBe(200);
      expect(D(stats.body.totalSystemBalance).equals('250.25')).toBe(true);

      const c1 = await a.post('/customers').send({ name: 'Nile Trading', currency: 'EGP' });
      const c2 = await a.post('/customers').send({ name: 'Delta Retail', currency: 'EGP' });
      const c3 = await a.post('/customers').send({ name: 'Tiny Amounts', currency: 'EGP' });
      expect([c1.status, c2.status, c3.status]).toEqual([201, 201, 201]);
      customer1 = c1.body.id;
      customer2 = c2.body.id;
      customer3 = c3.body.id;
      const vendor = await a.post('/vendors').send({ name: `Rep Vendor ${uniqueSuffix()}` });
      expect(vendor.status).toBe(201);
      vendorId = vendor.body.id;
    });

    it('issues invoices, leaves a draft and voids one', async () => {
      // 1000 + 14% VAT = 1140, and 500.10 x 3 = 1500.30 (past due)
      const i1 = await createInvoice(
        customer1,
        [{ quantity: '1', rate: '1000', taxRate: '14' }],
        isoDay(-5),
        isoDay(30),
      );
      const i2 = await createInvoice(
        customer2,
        [{ quantity: '3', rate: '500.10' }],
        isoDay(-60),
        isoDay(-40),
      );
      // 0.10 + 0.20 must be exactly 0.30, never 0.30000000000000004
      const t1 = await createInvoice(
        customer3,
        [{ quantity: '1', rate: '0.10' }],
        isoDay(-3),
        isoDay(30),
      );
      const t2 = await createInvoice(
        customer3,
        [{ quantity: '1', rate: '0.20' }],
        isoDay(-3),
        isoDay(30),
      );
      inv1 = i1.id;
      inv2 = i2.id;
      for (const id of [inv1, inv2, t1.id, t2.id]) await sendInvoice(id);
      expect(D(i2.grandTotal).equals('1500.3')).toBe(true);

      // A draft (never posted) and a sent-then-voided invoice must not count anywhere.
      await createInvoice(customer1, [{ quantity: '1', rate: '777' }], isoDay(-5), isoDay(30));
      const toVoid = await createInvoice(
        customer1,
        [{ quantity: '1', rate: '333' }],
        isoDay(-5),
        isoDay(30),
      );
      await sendInvoice(toVoid.id);
      expect((await a.patch(`/invoices/${toVoid.id}/void`)).status).toBe(200);
      invVoided = toVoid.id;

      // A draft that was deleted (soft-deleted) is excluded as well.
      const deleted = await createInvoice(
        customer1,
        [{ quantity: '1', rate: '555' }],
        isoDay(-5),
        isoDay(30),
      );
      expect((await a.delete(`/invoices/${deleted.id}`)).status).toBe(200);
    });

    it('records a payment, voids another, and applies and detaches credit notes', async () => {
      const pay = await a.post('/payments-received').send({
        customerId: customer1,
        date: isoDay(-1),
        amount: '100',
        paymentMode: 'BANK_TRANSFER',
        depositToAccountId: acc.bank,
        allocations: [{ invoiceId: inv1, amount: '100' }],
      });
      expect(pay.status).toBe(201);

      const voidedPay = await a.post('/payments-received').send({
        customerId: customer2,
        date: isoDay(-2),
        amount: '50',
        paymentMode: 'BANK_TRANSFER',
        depositToAccountId: acc.bank,
        allocations: [{ invoiceId: inv2, amount: '50' }],
      });
      expect(voidedPay.status).toBe(201);
      expect((await a.post(`/payments-received/${voidedPay.body.id}/void`)).status).toBe(201);

      // 57 applied to invoice 1 (reduces its balance, credits AR).
      const applied = await a.post('/credit-notes').send({
        customerId: customer1,
        invoiceId: inv1,
        date: isoDay(-1),
        amount: '57',
        type: 'APPLY_TO_INVOICE',
        reason: 'Returned goods',
      });
      expect(applied.status).toBe(201);

      // 20 against invoice 2, then detached the way legacy data is: the note credited AR but no
      // invoice balance was reduced, so the receivable must be reduced by the unapplied credit.
      const open = await a.post('/credit-notes').send({
        customerId: customer2,
        invoiceId: inv2,
        date: isoDay(-1),
        amount: '20',
        type: 'APPLY_TO_INVOICE',
        reason: 'Price adjustment',
      });
      expect(open.status).toBe(201);
      await prisma.creditNote.update({
        where: { id: open.body.id },
        data: { appliedToInvoiceId: null },
      });
      await prisma.invoice.update({
        where: { id: inv2 },
        data: { balanceDue: { increment: '20' }, status: 'SENT' },
      });
      const restored = await prisma.invoice.findFirstOrThrow({ where: { id: inv2 } });
      expect(D(restored.balanceDue).equals('1500.3')).toBe(true);
    });

    it('approves bills, leaves a draft and a deleted draft, adds a vendor credit and expenses', async () => {
      const bill = await createBill('800', true);
      billId = bill.id;
      await createBill('400', true);
      billDraftId = (await createBill('999', false)).id;
      const deleted = await createBill('888', false);
      expect((await a.delete(`/bills/${deleted.id}`)).status).toBe(200);

      const credit = await a.post('/vendor-credits').send({
        vendorId,
        billId,
        date: isoDay(-3),
        reason: 'Returned goods',
        amount: '50',
      });
      expect(credit.status).toBe(201);

      const pay = await a.post('/payments-made').send({
        vendorId,
        date: isoDay(-1),
        amount: '100',
        paymentMode: 'BANK_TRANSFER',
        paidFromAccountId: acc.bank,
        allocations: [{ billId, amount: '100' }],
      });
      expect(pay.status).toBe(201);

      const expense = await a.post('/expenses').send({
        date: isoDay(-4),
        accountId: acc.rent,
        amount: '100.00',
        taxRate: '14',
        paidThroughAccountId: acc.bank,
        description: 'Rent',
      });
      expect(expense.status).toBe(201);
      const voidedExpense = await a.post('/expenses').send({
        date: isoDay(-4),
        accountId: acc.rent,
        amount: '321.00',
        paidThroughAccountId: acc.cash,
        description: 'Voided',
      });
      expect(voidedExpense.status).toBe(201);
      expect((await a.delete(`/expenses/${voidedExpense.body.id}`)).status).toBe(200);
      expect(billDraftId).toEqual(expect.any(String));
    });
  });

  describe('tenant A: reconciliation', () => {
    it('trial balance is balanced and equals the posted ledger', async () => {
      const res = await a.get('/accounting-reports/trial-balance');
      expect(res.status).toBe(200);
      expect(res.body.isBalanced).toBe(true);
      expect(D(res.body.totals.totalDebits).greaterThan(5000)).toBe(true);
      expect(res.body.totals.totalDebits).toBe(res.body.totals.totalCredits);

      const truth = await groundTruth();
      const byId = new Map<string, { debit: string; credit: string; type: string }>(
        res.body.accounts.map((r: { id: string; debit: string; credit: string; type: string }) => [
          r.id,
          r,
        ]),
      );
      for (const [id, value] of truth) {
        const row = byId.get(id);
        if (value.isZero()) {
          expect(row).toBeUndefined();
          continue;
        }
        expect(row).toBeDefined();
        const debitNormal = row?.type === 'ASSET' || row?.type === 'EXPENSE';
        const net = D(row?.debit).sub(row?.credit ?? 0);
        expect((debitNormal ? net : net.neg()).equals(value)).toBe(true);
      }

      const report = await a.get('/reports/trial-balance').query({ asOfDate: today });
      expect(report.body.isBalanced).toBe(true);
    });

    it('balance sheet balances including current-period earnings', async () => {
      const res = await a.get('/reports/balance-sheet').query({ asOfDate: today });
      expect(res.status).toBe(200);
      expect(res.body.isBalanced).toBe(true);
      expect(D(res.body.totalAssets).equals(res.body.totalLiabilitiesAndEquity)).toBe(true);
      expect(D(res.body.difference).isZero()).toBe(true);
      expect(res.body.totalAssets).toMatch(FOUR_DP);
    });

    it('profit and loss, dashboard revenue/expenses and the ledger agree', async () => {
      const pl = (await a.get('/reports/profit-and-loss').query(wide)).body;
      const dash = (await a.get('/reports/dashboard').query(wide)).body;
      expect(D(dash.overview.monthlyRevenue).equals(pl.totalIncome)).toBe(true);
      expect(D(dash.overview.monthlyExpenses).equals(pl.totalExpenses)).toBe(true);
      expect(D(dash.overview.monthlyProfit).equals(pl.netProfit)).toBe(true);
      expect(dash.overview.monthlyRevenue).toMatch(FOUR_DP);

      const truth = await groundTruth();
      const accounts = await prisma.account.findMany({
        where: { organizationId: tenantA.organizationId },
        select: { id: true, type: true },
      });
      let income = D(0);
      let expenses = D(0);
      for (const x of accounts) {
        const v = truth.get(x.id) ?? D(0);
        if (x.type === 'INCOME' || x.type === 'REVENUE') income = income.add(v);
        if (x.type === 'EXPENSE') expenses = expenses.add(v);
      }
      expect(income.equals(pl.totalIncome)).toBe(true);
      expect(expenses.equals(pl.totalExpenses)).toBe(true);
      // Draft, voided and deleted documents are not in the ledger: net sales 1000 + 1500.30 + 0.30
      // less the credit notes' net amounts (50 and 20).
      expect(income.equals('2430.6')).toBe(true);
    });

    it('cash flow ends at the cash balance the dashboard reports', async () => {
      const cf = (await a.get('/reports/cash-flow').query(wide)).body;
      const dash = (await a.get('/reports/dashboard').query(wide)).body;
      expect(D(cf.reconciliation.variance).isZero()).toBe(true);

      const truth = await groundTruth();
      const ids = await cashAccountIds(prisma, tenantA.organizationId);
      const expected = ids.reduce((sum, id) => sum.add(truth.get(id) ?? 0), D(0));
      expect(expected.greaterThan(0)).toBe(true);
      expect(D(dash.overview.cashBalance).equals(expected)).toBe(true);
      expect(D(cf.closingCashBalance).equals(expected)).toBe(true);
    });

    it('dashboard AR equals the AR control account and the receivables aging total', async () => {
      const dash = (await a.get('/reports/dashboard')).body;
      const aging = (await a.get('/reports/receivables-aging')).body;
      const truth = await groundTruth();
      const control = truth.get(acc.ar) as Prisma.Decimal;

      // Open balances: 1140 - 100 - 57 + 1500.30 + 0.30; minus 20 of unapplied credit.
      expect(control.equals('2463.6')).toBe(true);
      expect(D(dash.overview.totalReceivables).equals(control)).toBe(true);
      expect(D(aging.summary.netTotal).equals(control)).toBe(true);
      expect(D(aging.summary.total).equals('2483.6')).toBe(true);
      expect(D(aging.summary.unappliedCredits).equals('20')).toBe(true);
      expect(aging.summary.netTotal).toMatch(FOUR_DP);

      // Only issued invoices appear: no draft, void or deleted invoice.
      const items = Object.values(aging.buckets as Record<string, unknown[]>).flat() as Array<{
        invoiceId: string;
        balanceDue: string;
      }>;
      expect(items).toHaveLength(4);
      const live = await prisma.invoice.findMany({
        where: {
          organizationId: tenantA.organizationId,
          id: { in: items.map((i) => i.invoiceId) },
        },
      });
      expect(live.every((i) => !['DRAFT', 'VOID'].includes(i.status) && !i.deletedAt)).toBe(true);
      const sum = items.reduce((s, i) => s.add(i.balanceDue), D(0));
      expect(sum.equals(aging.summary.total)).toBe(true);
      expect(aging.buckets.days31_60).toHaveLength(1);
    });

    it('receivables aging as of a past date keeps the later-voided invoice and equals AR as of then', async () => {
      // Yesterday: the invoice voided today and the payment voided today were both still live
      // (their reversal journals are dated today), so the historical snapshot keeps them.
      const asOf = isoDay(-1);
      const aging = (await a.get('/reports/receivables-aging').query({ asOfDate: asOf })).body;
      const net = await ledgerNetByAccount(
        prisma,
        tenantA.organizationId,
        new Date(`${asOf}T23:59:59.999Z`),
      );
      const arAsOf = net.get(acc.ar) as { type: string; net: Prisma.Decimal };
      const control = natural(arAsOf.type, arAsOf.net);
      // 1140 + 1500.30 + 0.30 + 333 (voided later) - 100 - 50 (voided later) - 57 - 20.
      expect(control.equals('2746.6')).toBe(true);
      expect(D(aging.summary.netTotal).equals(control)).toBe(true);
      expect(D(aging.summary.unappliedCredits).equals('20')).toBe(true);

      const items = Object.values(aging.buckets as Record<string, unknown[]>).flat() as Array<{
        invoiceId: string;
        balanceDue: string;
      }>;
      expect(items).toHaveLength(5);
      expect(items.find((i) => i.invoiceId === invVoided)?.balanceDue).toBe('333.0000');
      // Invoice 2's balance as of yesterday still carries the payment that was voided today.
      expect(items.find((i) => i.invoiceId === inv2)?.balanceDue).toBe('1450.3000');
      expect(items.find((i) => i.invoiceId === inv1)?.balanceDue).toBe('983.0000');
      expect(aging.invoiceCount).toBe(5);

      // Before any invoice existed nothing is open, whatever today's balances say.
      const empty = (await a.get('/reports/receivables-aging').query({ asOfDate: isoDay(-100) }))
        .body;
      expect(empty.invoiceCount).toBe(0);
      expect(empty.summary.netTotal).toBe('0.0000');
    });

    it('dashboard AP equals the AP control account and the payables aging net total', async () => {
      const dash = (await a.get('/reports/dashboard')).body;
      const aging = (await a.get('/reports/payables-aging')).body;
      const truth = await groundTruth();
      const control = truth.get(acc.ap) as Prisma.Decimal;
      // Bills 912 + 456, less the 100 payment and the 50 unapplied vendor credit.
      expect(control.equals('1218')).toBe(true);
      expect(D(dash.overview.totalPayables).equals(control)).toBe(true);
      expect(D(aging.summary.netTotal).equals(control)).toBe(true);
      expect(dash.overview.totalPayables).toMatch(FOUR_DP);
      expect(
        D(dash.overview.netPosition).equals(D(dash.overview.totalReceivables).sub(control)),
      ).toBe(true);
    });

    it('customer statements are exact, show credit notes and net voided payments', async () => {
      const stmt = async (customerId: string) =>
        (
          await a
            .get(`/reports/customer-statement/${customerId}`)
            .query({ startDate: wide.startDate, endDate: today })
        ).body;

      const s3 = await stmt(customer3);
      expect(s3.closingBalance).toBe('0.3000');
      expect(s3.totalDebits).toBe('0.3000');
      expect(s3.transactions).toHaveLength(2);

      // The sales-authorized route serves the same reconciling statement.
      const viaCustomers = await a.get(`/customers/${customer3}/statement`);
      expect(viaCustomers.status).toBe(200);
      expect(viaCustomers.body.closingBalance).toBe('0.3000');
      expect(viaCustomers.body.totalInvoiced).toBe('0.3000');
      expect(viaCustomers.body.transactions[0]).toMatchObject({ sourceType: 'invoice' });
      expect((await b.get(`/customers/${customer3}/statement`)).status).toBe(404);

      const s1 = await stmt(customer1);
      expect(s1.closingBalance).toBe('983.0000');
      expect(s1.transactions.map((t: { type: string }) => t.type)).toEqual(
        expect.arrayContaining(['Invoice', 'Payment', 'Credit Note']),
      );
      // The posted-then-voided invoice stays on its date with a separate reversal; the draft and
      // the deleted draft never appear.
      const rows = s1.transactions as Array<{ type: string; debit: string; credit: string }>;
      expect(rows.filter((t) => t.type === 'Invoice').map((t) => t.debit)).toEqual(
        expect.arrayContaining(['1140.0000', '333.0000']),
      );
      expect(rows.filter((t) => t.type === 'Invoice')).toHaveLength(2);
      expect(rows.filter((t) => t.type === 'Invoice Void').map((t) => t.credit)).toEqual([
        '333.0000',
      ]);
      expect(rows.some((t) => ['777.0000', '555.0000'].includes(t.debit))).toBe(false);
      expect(s1.totalInvoiced).toBe('1473.0000');

      const s2 = await stmt(customer2);
      const types = s2.transactions.map((t: { type: string }) => t.type);
      expect(types).toEqual(expect.arrayContaining(['Payment', 'Payment Void', 'Credit Note']));
      // 1500.30 invoiced, 50 paid and voided back, 20 credit note.
      expect(s2.closingBalance).toBe('1480.3000');
      expect(s2.totalDebits).toMatch(FOUR_DP);
    });

    it('account balances come from the posted ledger, not Account.openingBalance', async () => {
      // A stored opening balance on a chart account must be ignored (journals carry it now).
      await prisma.account.update({ where: { id: acc.cash }, data: { openingBalance: '999.99' } });

      const truth = await groundTruth();
      const list = await a.get('/accounts/balances');
      expect(list.status).toBe(200);
      expect(list.body.length).toBeGreaterThan(10);
      for (const row of list.body as Array<{ accountId: string; balance: string }>) {
        expect(row.balance).toMatch(FOUR_DP);
        expect(D(row.balance).equals(truth.get(row.accountId) ?? 0)).toBe(true);
      }

      const bank = await a.get(`/accounts/${acc.bank}/balance`);
      expect(bank.status).toBe(200);
      expect(D(bank.body.balance).equals(truth.get(acc.bank) as Prisma.Decimal)).toBe(true);
      // Opening 5000.50 (posted journal) + 100 received - 100 paid to the vendor - 114 expense;
      // the voided payment and voided expense net to zero.
      expect(D(bank.body.balance).equals('4886.5')).toBe(true);

      const cash = await a.get(`/accounts/${acc.cash}/balance`);
      expect(D(cash.body.balance).equals(truth.get(acc.cash) as Prisma.Decimal)).toBe(true);

      // Bank registers report the linked ledger balance, never the stored systemBalance.
      const registers = (await a.get('/bank-accounts')).body.data as Array<{
        id: string;
        linkedAccountId: string;
        systemBalance: string;
      }>;
      expect(registers.map((r) => r.id)).toContain(savingsRegister);
      for (const r of registers) {
        expect(D(r.systemBalance).equals(truth.get(r.linkedAccountId) as Prisma.Decimal)).toBe(
          true,
        );
      }

      const dash = (await a.get('/reports/dashboard/account-balances')).body as Array<{
        type: string;
        balance: string;
      }>;
      expect(dash.every((t) => FOUR_DP.test(t.balance))).toBe(true);
      const assets = [...truth.entries()];
      const accounts = await prisma.account.findMany({
        where: { organizationId: tenantA.organizationId, type: 'ASSET' },
        select: { id: true },
      });
      const expectedAssets = accounts.reduce((s, x) => s.add(truth.get(x.id) ?? 0), D(0));
      expect(assets.length).toBeGreaterThan(0);
      expect(D(dash.find((t) => t.type === 'ASSET')?.balance).equals(expectedAssets)).toBe(true);
    });

    it('dashboard charts exclude draft, void and deleted documents and use decimal strings', async () => {
      const status = (await a.get('/reports/dashboard/invoice-status')).body as Array<{
        status: string;
        count: number;
        amount: string;
      }>;
      expect(status.some((s) => s.status === 'DRAFT' || s.status === 'VOID')).toBe(false);
      expect(status.reduce((n, s) => n + s.count, 0)).toBe(4);
      expect(status.reduce((s, x) => s.add(x.amount), D(0)).equals('2640.6')).toBe(true);

      const bills = (await a.get('/reports/dashboard/bill-status')).body as Array<{
        status: string;
        count: number;
        amount: string;
      }>;
      expect(bills.reduce((n, s) => n + s.count, 0)).toBe(2);
      expect(bills.reduce((s, x) => s.add(x.amount), D(0)).equals('1368')).toBe(true);

      const customers = (await a.get('/reports/dashboard/top-customers')).body as Array<{
        name: string;
        totalRevenue: string;
        invoiceCount: number;
      }>;
      expect(customers[0].name).toBe('Delta Retail');
      expect(customers[0].totalRevenue).toBe('1500.3000');
      expect(customers.find((c) => c.name === 'Nile Trading')?.invoiceCount).toBe(1);

      const revenue = (await a.get('/reports/dashboard/revenue-chart')).body as Array<{
        revenue: string;
        expenses: string;
        profit: string;
      }>;
      expect(revenue.every((m) => FOUR_DP.test(m.revenue) && FOUR_DP.test(m.profit))).toBe(true);

      const cashFlow = (await a.get('/reports/dashboard/cash-flow-chart').query({ days: 30 }))
        .body as Array<{ cashIn: string; cashOut: string; net: string }>;
      expect(cashFlow).toHaveLength(30);
      expect(cashFlow.every((d) => FOUR_DP.test(d.cashIn) && FOUR_DP.test(d.net))).toBe(true);
    });
  });

  describe('isolation and authentication', () => {
    it("tenant B sees none of tenant A's figures", async () => {
      expect((await b.get(`/accounts/${acc.bank}/balance`)).status).toBe(404);
      expect((await b.get(`/accounting-reports/general-ledger/${acc.bank}`)).status).toBe(404);
      const foreignStatement = await b.get(`/reports/customer-statement/${customer1}`).query(wide);
      expect(Object.keys(foreignStatement.body)).toHaveLength(0);

      const dash = (await b.get('/reports/dashboard')).body;
      expect(D(dash.overview.totalReceivables).isZero()).toBe(true);
      expect(D(dash.overview.totalPayables).isZero()).toBe(true);
      expect(D(dash.overview.cashBalance).isZero()).toBe(true);
      const aging = (await b.get('/reports/receivables-aging')).body;
      expect(D(aging.summary.netTotal).isZero()).toBe(true);
      expect(aging.invoiceCount).toBe(0);
      const trial = (await b.get('/accounting-reports/trial-balance')).body;
      expect(trial.accounts).toHaveLength(0);
      const balances = (await b.get('/accounts/balances')).body as Array<{ accountId: string }>;
      expect(balances.some((x) => x.accountId === acc.bank)).toBe(false);
    });

    it('rejects anonymous callers with 401', async () => {
      for (const path of [
        '/reports/dashboard',
        '/reports/dashboard/account-balances',
        '/reports/receivables-aging',
        '/reports/payables-aging',
        '/reports/balance-sheet',
        '/reports/profit-and-loss',
        '/reports/trial-balance',
        '/accounting-reports/trial-balance',
        '/accounts/balances',
        `/accounts/${acc.bank}/balance`,
        `/reports/customer-statement/${customer1}`,
      ]) {
        expect((await anon.get(path)).status).toBe(401);
      }
    });
  });

  // Runs after the isolation checks: it is the first posting in tenant B.
  describe('tenant B: default Accountant role', () => {
    it('posts opening balances without settings access and the bank book balance follows the ledger', async () => {
      expect((await b.post('/accounts/seed-defaults')).status).toBe(201);
      await createAccount(b, '3900', 'Opening Balance Equity', 'EQUITY');
      const bankLedger = await createAccount(b, '1050', 'Main Bank', 'ASSET');
      const register = await b
        .post('/bank-accounts')
        .send({ name: 'Main', type: 'BANK', linkedAccountId: bankLedger });
      expect(register.status).toBe(201);

      // The default Accountant role (seeded, not Admin) through the real user and login routes.
      expect((await b.post('/roles/seed-defaults')).status).toBe(201);
      const roles = (await b.get('/roles').query({ limit: 50 })).body.data as Array<{
        id: string;
        name: string;
      }>;
      const accountantRole = roles.find((r) => r.name === 'Accountant');
      expect(accountantRole).toBeDefined();
      const email = `e2e-accountant-${uniqueSuffix()}@mizano.test`;
      const created = await b.post('/users').send({
        email,
        password: TEST_PASSWORD,
        name: 'E2E Accountant',
        roleId: accountantRole?.id,
      });
      expect(created.status).toBe(201);
      const login = await anon.post('/auth/login').send({ email, password: TEST_PASSWORD });
      expect(login.status).toBe(200);
      const accountant = anon.withToken(login.body.tokens.accessToken as string);

      // No settings permission: organization settings stay closed to this role...
      expect((await accountant.get('/organization')).status).toBe(403);
      // ...but posting opening balances needs only accounting.create.
      const opening = await accountant.post('/organization/onboarding/opening-balances').send({
        openingDate: isoDay(-30),
        balances: [{ accountId: bankLedger, amount: '1200.75' }],
      });
      expect(opening.status).toBe(201);

      const ledger = await accountant.get(`/accounts/${bankLedger}/balance`);
      expect(ledger.status).toBe(200);
      expect(ledger.body.balance).toBe('1200.7500');
      const book = await accountant.get(`/bank-accounts/${register.body.id}`);
      expect(book.status).toBe(200);
      expect(D(book.body.systemBalance).equals(ledger.body.balance)).toBe(true);
      const stats = await accountant.get('/bank-accounts/stats');
      expect(D(stats.body.totalSystemBalance).equals('1200.75')).toBe(true);
      const dash = (await accountant.get('/reports/dashboard')).body;
      expect(D(dash.overview.cashBalance).equals('1200.75')).toBe(true);
    });
  });
});
