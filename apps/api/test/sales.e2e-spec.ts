/**
 * Seeded accountant journey for the sales (AR) cycle: one tenant runs customer -> invoice ->
 * send -> payments -> credit notes -> voids -> bulk pay through the real HTTP API with a real
 * login, a second tenant probes isolation and anonymous callers are rejected. Money is asserted
 * as exact decimals and ledger effects are checked through the API and against the database.
 */
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { decimalEquals, isoDay, lineSignature, midnightIso } from './helpers/journey.helper';
import { PrismaService } from '../src/prisma/prisma.service';

const INVOICE_SEND = 'INVOICE_SEND';
const PAYMENT_RECEIVED = 'PAYMENT_RECEIVED';
const PAYMENT_RECEIVED_VOID = 'PAYMENT_RECEIVED_VOID';
const CREDIT_NOTE = 'CREDIT_NOTE';
const CREDIT_NOTE_VOID = 'CREDIT_NOTE_VOID';

interface TenantAccounts {
  ar: string;
  revenue: string;
  vat: string;
  bank: string;
  returns: string;
}

describe('Sales AR cycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;

  const accA: TenantAccounts = { ar: '', revenue: '', vat: '', bank: '', returns: '' };
  const accB: TenantAccounts = { ar: '', revenue: '', vat: '', bank: '', returns: '' };

  let customerId = '';
  let inv1Id = '';
  let inv1Number = '';
  let inv1JournalId = '';
  let inv2Id = '';
  let inv3Id = '';
  let draftInvId = '';
  let payment1Id = '';
  let payment1JournalId = '';
  let creditNoteId = '';
  let creditNoteJournalId = '';
  const bulkPaymentIds: string[] = [];

  let customerBId = '';
  let invBId = '';

  const invoiceDate = isoDay(-5);
  const dueDate = isoDay(30);

  async function journalsFor(sourceType: string, sourceId: string) {
    return prisma.journal.findMany({
      where: { organizationId: tenantA.organizationId, sourceType, sourceId },
      include: { lines: true },
    });
  }

  function signature(lines: Array<{ accountId: string; debit: unknown; credit: unknown }>) {
    return lineSignature(
      lines.map((l) => ({
        accountId: l.accountId,
        debit: String(l.debit),
        credit: String(l.credit),
      })),
    );
  }

  async function getInvoice(id: string) {
    const res = await a.get(`/invoices/${id}`);
    expect(res.status).toBe(200);
    return res.body;
  }

  async function createInvoice(
    lines: Array<{ quantity: string; rate: string; discount?: string; taxRate?: string }>,
    owner: ApiHelper = a,
    customer: string = customerId,
  ) {
    const res = await owner.post('/invoices').send({
      customerId: customer,
      date: invoiceDate,
      dueDate,
      lines: lines.map((l, i) => ({ description: `Line ${i + 1}`, ...l })),
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DRAFT');
    return res.body;
  }

  async function setupTenant(api: ApiHelper, acc: TenantAccounts): Promise<void> {
    const seeded = await api.post('/accounts/seed-defaults');
    expect(seeded.status).toBe(201);

    // seed-defaults does not link a sales returns account: create one and configure it.
    const returns = await api.post('/accounts').send({
      code: '4150',
      name: 'Sales Returns and Allowances',
      type: 'INCOME',
    });
    expect(returns.status).toBe(201);
    acc.returns = returns.body.id;
    const patch = await api
      .patch('/organization/account-settings')
      .send({ defaultSalesReturnsAccountId: acc.returns });
    expect(patch.status).toBe(200);

    const settings = await api.get('/organization/account-settings');
    expect(settings.status).toBe(200);
    expect(settings.body.defaultSalesReturnsAccountId).toBe(acc.returns);
    acc.ar = settings.body.defaultArAccountId;
    acc.revenue = settings.body.defaultRevenueAccountId;
    acc.vat = settings.body.defaultVatPayableAccountId;
    acc.bank = settings.body.defaultBankAccountId;
    for (const id of [acc.ar, acc.revenue, acc.vat, acc.bank]) {
      expect(id).toEqual(expect.any(String));
    }
  }

  async function trialBalanceNet(accountId: string): Promise<Prisma.Decimal> {
    const res = await a.get('/accounting-reports/trial-balance');
    expect(res.status).toBe(200);
    expect(res.body.totals.totalDebits).toBe(res.body.totals.totalCredits);
    const row = res.body.accounts.find((x: { id: string }) => x.id === accountId);
    // The report omits accounts whose balance nets to zero.
    if (!row) return new Prisma.Decimal(0);
    return new Prisma.Decimal(row.debit).sub(row.credit);
  }

  async function openInvoiceTotal(): Promise<Prisma.Decimal> {
    const open = await prisma.invoice.findMany({
      where: {
        organizationId: tenantA.organizationId,
        deletedAt: null,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      select: { balanceDue: true },
    });
    return open.reduce((s, x) => s.add(x.balanceDue), new Prisma.Decimal(0));
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    anon = ApiHelper.anonymous(app);
    tenantA = await registerTenant(app, 'SalesA');
    tenantB = await registerTenant(app, 'SalesB');
    a = tenantA.api;
    b = tenantB.api;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('tenant A: sales to ledger', () => {
    it('seeds the chart of accounts, links a sales returns account and creates a customer', async () => {
      await setupTenant(a, accA);

      const customer = await a.post('/customers').send({ name: 'Nile Trading', currency: 'EGP' });
      expect(customer.status).toBe(201);
      customerId = customer.body.id;
    });

    it('creates draft invoices with exact decimal totals and gapless numbers', async () => {
      // 2 x 100 + 14% VAT = 200 + 28 = 228
      const inv1 = await createInvoice([{ quantity: '2', rate: '100', taxRate: '14' }]);
      inv1Id = inv1.id;
      inv1Number = inv1.invoiceNumber;
      expect(inv1Number).toMatch(/^INV-\d{4,}$/);
      expect(decimalEquals(inv1.subtotal, '200')).toBe(true);
      expect(decimalEquals(inv1.taxAmount, '28')).toBe(true);
      expect(decimalEquals(inv1.grandTotal, '228')).toBe(true);
      expect(decimalEquals(inv1.balanceDue, '228')).toBe(true);

      // 3 x 50 less 10% = 135, no VAT
      const inv2 = await createInvoice([{ quantity: '3', rate: '50', discount: '10' }]);
      inv2Id = inv2.id;
      expect(decimalEquals(inv2.grandTotal, '135')).toBe(true);
      expect(decimalEquals(inv2.taxAmount, '0')).toBe(true);

      const inv3 = await createInvoice([{ quantity: '1', rate: '100' }]);
      inv3Id = inv3.id;
      expect(decimalEquals(inv3.grandTotal, '100')).toBe(true);

      const draft = await createInvoice([{ quantity: '1', rate: '10' }]);
      draftInvId = draft.id;

      const numbers = [inv1Number, inv2.invoiceNumber, inv3.invoiceNumber, draft.invoiceNumber].map(
        (n: string) => Number(n.replace(/\D/g, '')),
      );
      expect(numbers).toEqual([numbers[0], numbers[0] + 1, numbers[0] + 2, numbers[0] + 3]);

      // Drafts post nothing.
      expect(
        await prisma.journal.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(0);
    });

    it('rejects payload fields the invoice DTO does not accept', async () => {
      const res = await a.post('/invoices').send({
        customerId,
        date: invoiceDate,
        dueDate,
        grandTotal: '1',
        lines: [{ description: 'x', quantity: '1', rate: '1' }],
      });
      expect(res.status).toBe(400);
    });

    it('sends an invoice: one balanced journal dated on the invoice date', async () => {
      const res = await a.patch(`/invoices/${inv1Id}/send`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('SENT');

      const journals = await journalsFor(INVOICE_SEND, inv1Id);
      expect(journals).toHaveLength(1);
      inv1JournalId = journals[0].id;
      expect(journals[0].date.toISOString()).toBe(midnightIso(invoiceDate));
      expect(journals[0].reversalOfId).toBeNull();
      expect(signature(journals[0].lines)).toEqual(
        lineSignature([
          { accountId: accA.ar, debit: '228', credit: '0' },
          { accountId: accA.revenue, debit: '0', credit: '200' },
          { accountId: accA.vat, debit: '0', credit: '28' },
        ]),
      );
      const debits = journals[0].lines.reduce((s, l) => s.add(l.debit), new Prisma.Decimal(0));
      const credits = journals[0].lines.reduce((s, l) => s.add(l.credit), new Prisma.Decimal(0));
      expect(debits.equals(credits)).toBe(true);

      for (const id of [inv2Id, inv3Id]) {
        const sent = await a.patch(`/invoices/${id}/send`);
        expect(sent.status).toBe(200);
        expect(await journalsFor(INVOICE_SEND, id)).toHaveLength(1);
      }
    });

    it('rejects a second send without a second journal', async () => {
      const before = await prisma.journal.count({
        where: { organizationId: tenantA.organizationId },
      });
      const res = await a.patch(`/invoices/${inv1Id}/send`);
      expect([400, 409]).toContain(res.status);
      expect(await journalsFor(INVOICE_SEND, inv1Id)).toHaveLength(1);
      expect(
        await prisma.journal.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(before);
    });

    it('keeps a sent invoice immutable', async () => {
      const edit = await a.patch(`/invoices/${inv1Id}`).send({ notes: 'tamper' });
      expect(edit.status).toBe(400);
      const del = await a.delete(`/invoices/${inv1Id}`);
      expect(del.status).toBe(400);
    });

    it('records a partial payment against the invoice with a Dr bank / Cr AR journal', async () => {
      const res = await a.post('/payments-received').send({
        customerId,
        date: isoDay(-1),
        amount: '100',
        paymentMode: 'BANK_TRANSFER',
        depositToAccountId: accA.bank,
        allocations: [{ invoiceId: inv1Id, amount: '100' }],
      });
      expect(res.status).toBe(201);
      payment1Id = res.body.id;
      expect(res.body.paymentNumber).toMatch(/^PMT-\d{3,}$/);
      expect(decimalEquals(res.body.amount, '100')).toBe(true);

      const invoice = await getInvoice(inv1Id);
      expect(invoice.status).toBe('PARTIALLY_PAID');
      expect(decimalEquals(invoice.balanceDue, '128')).toBe(true);

      const journals = await journalsFor(PAYMENT_RECEIVED, payment1Id);
      expect(journals).toHaveLength(1);
      payment1JournalId = journals[0].id;
      expect(journals[0].date.toISOString()).toBe(midnightIso(isoDay(-1)));
      expect(signature(journals[0].lines)).toEqual(
        lineSignature([
          { accountId: accA.bank, debit: '100', credit: '0' },
          { accountId: accA.ar, debit: '0', credit: '100' },
        ]),
      );
    });

    it('rejects an overpayment and writes nothing', async () => {
      const payments = await prisma.paymentReceived.count({
        where: { organizationId: tenantA.organizationId },
      });
      const journals = await prisma.journal.count({
        where: { organizationId: tenantA.organizationId },
      });

      const res = await a.post('/payments-received').send({
        customerId,
        date: isoDay(0),
        amount: '128.0001',
        paymentMode: 'BANK_TRANSFER',
        depositToAccountId: accA.bank,
        allocations: [{ invoiceId: inv1Id, amount: '128.0001' }],
      });
      expect(res.status).toBe(400);

      const record = await a.post(`/invoices/${inv1Id}/record-payment`).send({
        amount: '128.0001',
        date: isoDay(0),
        depositToAccountId: accA.bank,
      });
      expect(record.status).toBe(400);

      expect(
        await prisma.paymentReceived.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(payments);
      expect(
        await prisma.journal.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(journals);
      const invoice = await getInvoice(inv1Id);
      expect(decimalEquals(invoice.balanceDue, '128')).toBe(true);
      expect(invoice.status).toBe('PARTIALLY_PAID');
    });

    it('applies a credit note with the VAT split posted to the right accounts', async () => {
      // 57 is 25% of 228, so its VAT share is exactly 7 and the net 50.
      const res = await a.post('/credit-notes').send({
        customerId,
        invoiceId: inv1Id,
        date: isoDay(-1),
        amount: '57',
        type: 'APPLY_TO_INVOICE',
        reason: 'Returned goods',
      });
      expect(res.status).toBe(201);
      creditNoteId = res.body.id;
      expect(res.body.creditNoteNumber).toMatch(/^CN-\d{3,}$/);

      const invoice = await getInvoice(inv1Id);
      expect(decimalEquals(invoice.balanceDue, '71')).toBe(true);
      expect(invoice.status).toBe('PARTIALLY_PAID');

      const journals = await journalsFor(CREDIT_NOTE, creditNoteId);
      expect(journals).toHaveLength(1);
      creditNoteJournalId = journals[0].id;
      expect(signature(journals[0].lines)).toEqual(
        lineSignature([
          { accountId: accA.returns, debit: '50', credit: '0' },
          { accountId: accA.vat, debit: '7', credit: '0' },
          { accountId: accA.ar, debit: '0', credit: '57' },
        ]),
      );
    });

    it('rejects a credit note that would exceed the invoice total', async () => {
      const count = await prisma.creditNote.count({
        where: { organizationId: tenantA.organizationId },
      });
      const res = await a.post('/credit-notes').send({
        customerId,
        invoiceId: inv1Id,
        date: isoDay(0),
        amount: '171.0001',
        type: 'APPLY_TO_INVOICE',
        reason: 'Too much',
      });
      expect(res.status).toBe(400);
      expect(
        await prisma.creditNote.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(count);
    });

    it('voids the payment with a linked reversal and restores the balance', async () => {
      const res = await a.post(`/payments-received/${payment1Id}/void`);
      expect(res.status).toBe(201);

      const invoice = await getInvoice(inv1Id);
      expect(decimalEquals(invoice.balanceDue, '171')).toBe(true);
      expect(invoice.status).toBe('PARTIALLY_PAID');

      const reversals = await journalsFor(PAYMENT_RECEIVED_VOID, payment1Id);
      expect(reversals).toHaveLength(1);
      expect(reversals[0].reversalOfId).toBe(payment1JournalId);
      expect(signature(reversals[0].lines)).toEqual(
        lineSignature([
          { accountId: accA.ar, debit: '100', credit: '0' },
          { accountId: accA.bank, debit: '0', credit: '100' },
        ]),
      );

      // The original payment journal is untouched.
      const original = await a.get(`/journals/${payment1JournalId}`);
      expect(original.status).toBe(200);
      expect(original.body.isPosted).toBe(true);
      expect(original.body.reversalOfId).toBeNull();

      // Voiding twice is rejected and posts nothing more.
      const again = await a.post(`/payments-received/${payment1Id}/void`);
      expect(again.status).toBe(404);
      expect(await journalsFor(PAYMENT_RECEIVED_VOID, payment1Id)).toHaveLength(1);
    });

    it('voids the credit note with a linked reversal and restores the full balance', async () => {
      const res = await a.delete(`/credit-notes/${creditNoteId}`);
      expect(res.status).toBe(200);

      const invoice = await getInvoice(inv1Id);
      expect(decimalEquals(invoice.balanceDue, '228')).toBe(true);
      expect(invoice.status).toBe('SENT');

      const reversals = await journalsFor(CREDIT_NOTE_VOID, creditNoteId);
      expect(reversals).toHaveLength(1);
      expect(reversals[0].reversalOfId).toBe(creditNoteJournalId);
      expect(signature(reversals[0].lines)).toEqual(
        lineSignature([
          { accountId: accA.returns, debit: '0', credit: '50' },
          { accountId: accA.vat, debit: '0', credit: '7' },
          { accountId: accA.ar, debit: '57', credit: '0' },
        ]),
      );

      const again = await a.delete(`/credit-notes/${creditNoteId}`);
      expect(again.status).toBe(404);
      expect(await journalsFor(CREDIT_NOTE_VOID, creditNoteId)).toHaveLength(1);
    });

    it('keeps the trial balance balanced and AR equal to the open invoice balances', async () => {
      // Open: inv1 228 + inv2 135 + inv3 100
      expect((await openInvoiceTotal()).toString()).toBe('463');
      expect((await trialBalanceNet(accA.ar)).toString()).toBe('463');

      const report = await a.get('/reports/trial-balance').query({ asOfDate: isoDay(0) });
      expect(report.status).toBe(200);
      expect(report.body.isBalanced).toBe(true);
    });

    it('bulk pay records real payments and reports per-invoice failures', async () => {
      const paymentsBefore = await prisma.paymentReceived.count({
        where: { organizationId: tenantA.organizationId },
      });

      const res = await a.post('/invoices/bulk-pay').send({
        ids: [inv2Id, inv3Id, draftInvId],
        depositToAccountId: accA.bank,
        date: isoDay(0),
        paymentMode: 'CASH',
      });
      expect(res.status).toBe(201);
      expect(res.body.processed).toBe(2);
      expect(res.body.total).toBe(3);
      expect(res.body.failures).toHaveLength(1);
      expect(res.body.failures[0].id).toBe(draftInvId);

      expect(
        await prisma.paymentReceived.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(paymentsBefore + 2);

      for (const [id, amount] of [
        [inv2Id, '135'],
        [inv3Id, '100'],
      ] as const) {
        const invoice = await getInvoice(id);
        expect(invoice.status).toBe('PAID');
        expect(decimalEquals(invoice.balanceDue, '0')).toBe(true);

        const payment = await prisma.paymentReceived.findFirst({
          where: {
            organizationId: tenantA.organizationId,
            deletedAt: null,
            allocations: { some: { invoiceId: id } },
          },
          include: { allocations: true },
        });
        expect(payment).not.toBeNull();
        const paymentId = (payment as { id: string }).id;
        bulkPaymentIds.push(paymentId);
        expect(payment?.paymentMode).toBe('CASH');
        expect(payment?.amount.toString()).toBe(amount);
        expect(payment?.depositToAccountId).toBe(accA.bank);

        const journals = await journalsFor(PAYMENT_RECEIVED, paymentId);
        expect(journals).toHaveLength(1);
        expect(signature(journals[0].lines)).toEqual(
          lineSignature([
            { accountId: accA.bank, debit: amount, credit: '0' },
            { accountId: accA.ar, debit: '0', credit: amount },
          ]),
        );
      }

      // The draft invoice was not paid and posted nothing.
      const draft = await getInvoice(draftInvId);
      expect(draft.status).toBe('DRAFT');
    });

    it('ends with a balanced ledger whose AR equals the open invoice balances', async () => {
      // Only inv1 (228) remains open; bank holds the two bulk payments (235).
      expect((await openInvoiceTotal()).toString()).toBe('228');
      expect((await trialBalanceNet(accA.ar)).toString()).toBe('228');
      expect((await trialBalanceNet(accA.bank)).toString()).toBe('235');
      expect((await trialBalanceNet(accA.revenue)).toString()).toBe('-435');
      expect((await trialBalanceNet(accA.vat)).toString()).toBe('-28');
      // Credit note and voided payment netted to zero on the returns account.
      expect((await trialBalanceNet(accA.returns)).toString()).toBe('0');
    });

    it('lists only live documents', async () => {
      const payments = await a.get('/payments-received').query({ limit: 100 });
      expect(payments.status).toBe(200);
      const ids = payments.body.data.map((p: { id: string }) => p.id);
      expect(ids).not.toContain(payment1Id);
      for (const id of bulkPaymentIds) expect(ids).toContain(id);

      const notes = await a.get('/credit-notes').query({ limit: 100 });
      expect(notes.status).toBe(200);
      expect(notes.body.data.map((n: { id: string }) => n.id)).not.toContain(creditNoteId);
    });
  });

  describe('tenant isolation', () => {
    beforeAll(async () => {
      await setupTenant(b, accB);
      const customer = await b.post('/customers').send({ name: 'Delta Supplies', currency: 'EGP' });
      expect(customer.status).toBe(201);
      customerBId = customer.body.id;
      invBId = (await createInvoice([{ quantity: '1', rate: '10' }], b, customerBId)).id;
    });

    it("hides tenant A's documents from tenant B by id", async () => {
      const [bulkPaymentId] = bulkPaymentIds;
      expect((await b.get(`/invoices/${inv1Id}`)).status).toBe(404);
      expect((await b.get(`/customers/${customerId}`)).status).toBe(404);
      expect((await b.get(`/payments-received/${bulkPaymentId}`)).status).toBe(404);
      expect((await b.get(`/credit-notes/${creditNoteId}`)).status).toBe(404);
      expect((await b.get(`/journals/${inv1JournalId}`)).status).toBe(404);

      for (const [path, id] of [
        ['/invoices', inv1Id],
        ['/payments-received', bulkPaymentId],
        ['/credit-notes', creditNoteId],
        ['/customers', customerId],
      ] as const) {
        const list = await b.get(path).query({ limit: 100 });
        expect(list.status).toBe(200);
        expect(list.body.data.map((x: { id: string }) => x.id)).not.toContain(id);
      }
    });

    it("cannot mutate tenant A's documents", async () => {
      const [bulkPaymentId] = bulkPaymentIds;
      expect((await b.patch(`/invoices/${inv1Id}`).send({ notes: 'x' })).status).toBe(404);
      expect((await b.patch(`/invoices/${inv1Id}/send`)).status).toBe(404);
      expect((await b.patch(`/invoices/${inv1Id}/void`)).status).toBe(404);
      expect((await b.delete(`/invoices/${inv1Id}`)).status).toBe(404);
      expect(
        (
          await b.post(`/invoices/${inv1Id}/record-payment`).send({
            amount: '1',
            date: isoDay(0),
            depositToAccountId: accB.bank,
          })
        ).status,
      ).toBe(404);
      expect((await b.post(`/payments-received/${bulkPaymentId}/void`)).status).toBe(404);
      expect((await b.delete(`/credit-notes/${creditNoteId}`)).status).toBe(404);
      expect(
        (await b.post(`/credit-notes/${creditNoteId}/apply`).send({ invoiceId: invBId })).status,
      ).toBe(404);
      expect((await b.delete(`/customers/${customerId}`)).status).toBe(404);

      // Nothing changed for tenant A.
      const invoice = await getInvoice(inv1Id);
      expect(invoice.status).toBe('SENT');
      expect(decimalEquals(invoice.balanceDue, '228')).toBe(true);
      const payment = await prisma.paymentReceived.findUnique({ where: { id: bulkPaymentId } });
      expect(payment?.deletedAt).toBeNull();
    });

    it("cannot use tenant A's customers, invoices or accounts", async () => {
      const invoicesBefore = await prisma.invoice.count({
        where: { organizationId: tenantB.organizationId },
      });
      const paymentsBefore = await prisma.paymentReceived.count({
        where: { organizationId: tenantB.organizationId },
      });
      const creditNotesBefore = await prisma.creditNote.count({
        where: { organizationId: tenantB.organizationId },
      });

      // References in a request body are validated as "not found" (400), never used.
      const foreignCustomer = await b.post('/invoices').send({
        customerId,
        date: invoiceDate,
        dueDate,
        lines: [{ description: 'x', quantity: '1', rate: '1' }],
      });
      expect(foreignCustomer.status).toBe(400);
      expect(foreignCustomer.body.message).toMatch(/customer not found/i);

      const foreignAccount = await b.post('/payments-received').send({
        customerId: customerBId,
        date: isoDay(0),
        amount: '1',
        paymentMode: 'BANK_TRANSFER',
        depositToAccountId: accA.bank,
        allocations: [{ invoiceId: invBId, amount: '1' }],
      });
      expect(foreignAccount.status).toBe(400);

      const foreignInvoice = await b.post('/payments-received').send({
        customerId: customerBId,
        date: isoDay(0),
        amount: '1',
        paymentMode: 'BANK_TRANSFER',
        depositToAccountId: accB.bank,
        allocations: [{ invoiceId: inv1Id, amount: '1' }],
      });
      expect(foreignInvoice.status).toBe(400);

      const foreignRefund = await b.post('/credit-notes').send({
        customerId: customerBId,
        invoiceId: invBId,
        date: isoDay(0),
        amount: '1',
        type: 'REFUND',
        refundAccountId: accA.bank,
        reason: 'x',
      });
      expect(foreignRefund.status).toBe(400);

      // Bulk pay with tenant A's invoice reports a failure and records nothing for either tenant.
      const paymentsA = await prisma.paymentReceived.count({
        where: { organizationId: tenantA.organizationId },
      });
      const bulk = await b.post('/invoices/bulk-pay').send({ ids: [inv1Id] });
      expect(bulk.status).toBe(201);
      expect(bulk.body.processed).toBe(0);
      expect(bulk.body.failures).toHaveLength(1);
      expect(
        await prisma.paymentReceived.count({ where: { organizationId: tenantA.organizationId } }),
      ).toBe(paymentsA);

      expect(
        await prisma.invoice.count({ where: { organizationId: tenantB.organizationId } }),
      ).toBe(invoicesBefore);
      expect(
        await prisma.paymentReceived.count({ where: { organizationId: tenantB.organizationId } }),
      ).toBe(paymentsBefore);
      expect(
        await prisma.creditNote.count({ where: { organizationId: tenantB.organizationId } }),
      ).toBe(creditNotesBefore);
    });

    it("keeps tenant B's ledger separate from tenant A's", async () => {
      const tb = await b.get('/accounting-reports/trial-balance');
      expect(tb.status).toBe(200);
      expect(tb.body.totals.totalDebits).toBe('0');
      expect(tb.body.totals.totalCredits).toBe('0');
      expect((await b.get(`/accounting-reports/general-ledger/${accA.ar}`)).status).toBe(404);
    });
  });

  describe('anonymous access', () => {
    it.each([
      ['get', '/customers'],
      ['post', '/customers'],
      ['get', '/invoices'],
      ['post', '/invoices'],
      ['post', '/invoices/bulk-pay'],
      ['get', '/payments-received'],
      ['post', '/payments-received'],
      ['get', '/credit-notes'],
      ['post', '/credit-notes'],
      ['get', '/quotes'],
      ['post', '/quotes'],
    ] as const)('%s %s returns 401', async (method, url) => {
      const res = await anon[method](url).send({});
      expect(res.status).toBe(401);
    });

    it('rejects a document id request without a token and with a forged token', async () => {
      expect((await anon.get(`/invoices/${inv1Id}`)).status).toBe(401);
      expect((await anon.withToken('not-a-jwt').get(`/invoices/${inv1Id}`)).status).toBe(401);
      expect((await anon.post(`/payments-received/${bulkPaymentIds[0]}/void`)).status).toBe(401);
    });
  });
});
