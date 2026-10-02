import { CreditNoteType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { AgingReportsService } from './aging-reports.service';

const ORG = 'org-1';
const ISSUED = { in: ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] };

describe('receivables aging', () => {
  const invoice = (id: string, customerId: string, balance: string, due: string) => ({
    id,
    invoiceNumber: id,
    customerId,
    date: new Date('2026-01-03'),
    issueDate: new Date('2026-01-01'),
    dueDate: new Date(due),
    balanceDue: new Decimal(balance),
    customer: { id: customerId, name: `Customer ${customerId}` },
  });
  const credit = (customerId: string, amount: string) => ({
    customerId,
    amount: new Decimal(amount),
    customer: { id: customerId, name: `Customer ${customerId}` },
  });

  function build(invoices: unknown[], credits: unknown[]) {
    const prisma = {
      invoice: { findMany: jest.fn().mockResolvedValue(invoices) },
      creditNote: { findMany: jest.fn().mockResolvedValue(credits) },
    };
    return { prisma, service: new AgingReportsService(prisma as unknown as ReadReplicaService) };
  }

  it('queries only issued, non-deleted invoices and unapplied APPLY credit notes of the org', async () => {
    const { prisma, service } = build([], []);

    await service.getReceivablesAging(ORG, '2026-03-31');

    const invoiceWhere = prisma.invoice.findMany.mock.calls[0][0].where;
    expect(invoiceWhere).toMatchObject({
      organizationId: ORG,
      deletedAt: null,
      balanceDue: { gt: 0 },
      status: ISSUED,
    });
    expect(invoiceWhere.date.lte.toISOString()).toBe('2026-03-31T23:59:59.999Z');
    expect(prisma.creditNote.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      deletedAt: null,
      type: CreditNoteType.APPLY_TO_INVOICE,
      appliedToInvoiceId: null,
    });
  });

  it('buckets by days past due and keeps every sum an exact 4-dp string', async () => {
    const { service } = build(
      [
        invoice('i1', 'c1', '0.1', '2026-03-31'), // due today: current
        invoice('i2', 'c1', '0.2', '2026-03-01'), // 30 days: 1-30
        invoice('i3', 'c2', '100', '2025-12-01'), // >90
      ],
      [],
    );

    const report = await service.getReceivablesAging(ORG, '2026-03-31');

    expect(report.summary.current).toBe('0.1000');
    expect(report.summary.days1_30).toBe('0.2000');
    expect(report.summary.over90).toBe('100.0000');
    expect(report.summary.total).toBe('100.3000');
    expect(report.buckets.days1_30[0]).toMatchObject({ balanceDue: '0.2000', daysOverdue: 30 });
    // Rows carry the accounting date (the cut-off field), not the issue date.
    expect(report.buckets.days1_30[0].date).toEqual(new Date('2026-01-03'));
    expect(report.invoiceCount).toBe(3);
    expect(report.customerCount).toBe(2);
  });

  it('nets unapplied credit notes per customer so the total reconciles to the AR control account', async () => {
    const { service } = build(
      [invoice('i1', 'c1', '114', '2026-04-30'), invoice('i2', 'c2', '142', '2026-04-30')],
      [credit('c1', '10.5'), credit('c1', '0.5')],
    );

    const report = await service.getReceivablesAging(ORG, '2026-03-31');

    expect(report.summary.total).toBe('256.0000');
    expect(report.summary.unappliedCredits).toBe('11.0000');
    expect(report.summary.netTotal).toBe('245.0000');
    expect(report.unappliedCredits.customers).toEqual([
      { customerId: 'c1', customerName: 'Customer c1', amount: '11.0000' },
    ]);
  });
});

describe('customer statement', () => {
  type Row = Record<string, unknown>;
  const D = (v: string): Decimal => new Decimal(v);

  const invoice: Row = {
    id: 'inv-1',
    invoiceNumber: 'INV-1',
    date: new Date('2026-01-02'),
    total: null,
    grandTotal: D('0.1'),
  };
  const invoice2: Row = {
    id: 'inv-2',
    invoiceNumber: 'INV-2',
    date: new Date('2026-01-03'),
    total: null,
    grandTotal: D('0.2'),
  };
  const payment: Row = {
    id: 'pay-1',
    paymentNumber: 'PMT-1',
    date: new Date('2026-01-10'),
    amount: D('0.05'),
    deletedAt: new Date('2026-02-05'),
  };
  const applyNote: Row = {
    id: 'cn-1',
    creditNoteNumber: 'CN-1',
    date: new Date('2026-01-15'),
    total: null,
    amount: D('0.01'),
    type: CreditNoteType.APPLY_TO_INVOICE,
  };
  const refundNote: Row = {
    id: 'cn-2',
    creditNoteNumber: 'CN-2',
    date: new Date('2026-01-16'),
    total: null,
    amount: D('0.02'),
    type: CreditNoteType.REFUND,
  };

  type DateFilter = { lt?: Date; gte?: Date; lte?: Date };
  const within = (d: Date | null, r?: DateFilter): boolean =>
    !!d && (!r?.lt || d < r.lt) && (!r?.gte || d >= r.gte) && (!r?.lte || d <= r.lte);

  const invoiceWheres: unknown[] = [];
  // Voided invoices of the customer and the INVOICE_VOID reversal journals that exist for them.
  let voidedInvoices: Row[] = [];
  let voidJournals: Array<{ sourceId: string; date: Date }> = [];
  const prisma = {
    customer: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', name: 'C', email: null }) },
    invoice: {
      findMany: jest.fn(async ({ where }: { where: { date?: DateFilter; status?: unknown } }) => {
        if (where.status === 'VOID') return voidedInvoices;
        invoiceWheres.push(where);
        const or = (where as unknown as { OR: Array<{ id?: { in: string[] } }> }).OR;
        const ids = or?.[1]?.id?.in ?? [];
        const rows = [
          invoice,
          invoice2,
          ...voidedInvoices.filter((v) => ids.includes(v.id as string)),
        ];
        return rows.filter((i) => within(i.date as Date, where.date));
      }),
    },
    journal: {
      findMany: jest.fn(async () => voidJournals),
    },
    paymentReceived: {
      findMany: jest.fn(
        async ({ where }: { where: { date?: DateFilter; deletedAt?: DateFilter } }) => {
          if (where.deletedAt)
            return within(payment.deletedAt as Date, where.deletedAt) ? [payment] : [];
          return within(payment.date as Date, where.date) ? [payment] : [];
        },
      ),
    },
    creditNote: {
      findMany: jest.fn(async ({ where }: { where: { date: DateFilter } }) =>
        [applyNote, refundNote].filter((n) => within(n.date as Date, where.date)),
      ),
    },
  } as unknown as ReadReplicaService;
  const service = new AgingReportsService(prisma);

  it('is exact Decimal: 0.1 + 0.2 = 0.3000 and every figure is a 4-dp string', async () => {
    const report = await service.getCustomerStatement(ORG, 'c1', '2026-01-01', '2026-01-02');
    const both = await service.getCustomerStatement(ORG, 'c1', '2026-01-01', '2026-01-03');

    expect(report?.closingBalance).toBe('0.1000');
    expect(both?.totalDebits).toBe('0.3000');
    expect(both?.closingBalance).toBe('0.3000');
    expect(both?.transactions[0].debit).toBe('0.1000');
    expect(typeof both?.openingBalance).toBe('string');
  });

  it('queries only issued, non-deleted invoices for the customer and organization', async () => {
    invoiceWheres.length = 0;
    await service.getCustomerStatement(ORG, 'c1', '2026-01-01', '2026-01-31');
    expect(invoiceWheres[0]).toMatchObject({
      customerId: 'c1',
      organizationId: ORG,
      deletedAt: null,
    });
    // Issued invoices, plus voided ones only when they were posted (never DRAFT).
    expect((invoiceWheres[0] as { OR: unknown[] }).OR[0]).toEqual({ status: ISSUED });
  });

  it('shows credit notes (a refund note nets to zero) and the payment', async () => {
    const jan = await service.getCustomerStatement(ORG, 'c1', '2026-01-01', '2026-01-31');

    expect(jan?.transactions.map((t) => t.type)).toEqual([
      'Invoice',
      'Invoice',
      'Payment',
      'Credit Note',
      'Credit Note',
      'Credit Note Refund',
    ]);
    // 0.1 + 0.2 - 0.05 (payment) - 0.01 (apply note) - 0.02 + 0.02 (refund note, paid out)
    expect(jan?.closingBalance).toBe('0.2400');
  });

  it('shows a voided payment as a separate debit on its void date, never rewriting January', async () => {
    const jan = await service.getCustomerStatement(ORG, 'c1', '2026-01-01', '2026-01-31');
    const feb = await service.getCustomerStatement(ORG, 'c1', '2026-02-01', '2026-02-28');

    expect(jan?.transactions.some((t) => t.type === 'Payment')).toBe(true);
    expect(feb?.openingBalance).toBe('0.2400');
    expect(feb?.transactions).toEqual([
      expect.objectContaining({ type: 'Payment Void', debit: '0.0500', balance: '0.2900' }),
    ]);
  });

  it('includes a void made later on the statement end date (end-of-day bound)', async () => {
    payment.deletedAt = new Date('2026-02-28T10:00:00Z');
    const feb = await service.getCustomerStatement(ORG, 'c1', '2026-02-01', '2026-02-28');
    payment.deletedAt = new Date('2026-02-05');
    expect(feb?.transactions.map((t) => t.type)).toEqual(['Payment Void']);
  });

  describe('invoices voided after the period', () => {
    const voided: Row = {
      id: 'inv-v',
      invoiceNumber: 'INV-V',
      date: new Date('2026-01-05'),
      total: null,
      grandTotal: D('1.0'),
    };
    const draftVoided: Row = {
      id: 'inv-d',
      invoiceNumber: 'INV-D',
      date: new Date('2026-01-06'),
      total: null,
      grandTotal: D('9'),
    };

    beforeEach(() => {
      voidedInvoices = [voided, draftVoided];
      // Only the posted invoice has a reversal journal (Feb 10); the voided draft never posted.
      voidJournals = [{ sourceId: 'inv-v', date: new Date('2026-02-10') }];
    });
    afterEach(() => {
      voidedInvoices = [];
      voidJournals = [];
    });

    it('keeps the invoice in January, unchanged by a February void, and excludes the draft', async () => {
      const jan = await service.getCustomerStatement(ORG, 'c1', '2026-01-01', '2026-01-31');

      expect(jan?.transactions.map((t) => t.reference)).toContain('INV-V');
      expect(jan?.transactions.some((t) => t.reference === 'INV-D')).toBe(false);
      expect(jan?.transactions.some((t) => t.type === 'Invoice Void')).toBe(false);
      // 0.1 + 0.2 + 1.0 - 0.05 - 0.01 - 0.02 + 0.02
      expect(jan?.closingBalance).toBe('1.2400');
      expect(jan?.totalInvoiced).toBe('1.3000');
    });

    it('shows the reversal on the void date and carries both into later openings', async () => {
      const feb = await service.getCustomerStatement(ORG, 'c1', '2026-02-01', '2026-02-28');

      expect(feb?.openingBalance).toBe('1.2400');
      expect(feb?.transactions).toEqual([
        expect.objectContaining({ type: 'Payment Void', sourceType: 'payment', sourceId: 'pay-1' }),
        expect.objectContaining({
          type: 'Invoice Void',
          reference: 'INV-V',
          sourceType: 'invoice',
          sourceId: 'inv-v',
          credit: '1.0000',
          balance: '0.2900',
        }),
      ]);
      expect(feb?.totalInvoiced).toBe('0.0000');

      const mar = await service.getCustomerStatement(ORG, 'c1', '2026-03-01', '2026-03-31');
      // The invoice and its reversal both precede March.
      expect(mar?.openingBalance).toBe('0.2900');
    });
  });

  it('links each row to its source document and reports invoice-only totalInvoiced', async () => {
    const jan = await service.getCustomerStatement(ORG, 'c1', '2026-01-01', '2026-01-31');

    expect(jan?.transactions.map((t) => [t.type, t.sourceType, t.sourceId])).toEqual([
      ['Invoice', 'invoice', 'inv-1'],
      ['Invoice', 'invoice', 'inv-2'],
      ['Payment', 'payment', 'pay-1'],
      ['Credit Note', 'creditNote', 'cn-1'],
      ['Credit Note', 'creditNote', 'cn-2'],
      ['Credit Note Refund', 'creditNote', 'cn-2'],
    ]);
    expect(jan?.totalInvoiced).toBe('0.3000');
    // totalDebits also contains the refund debit
    expect(jan?.totalDebits).toBe('0.3200');
  });

  it('returns null for a soft-deleted customer (the lookup requires deletedAt: null)', async () => {
    (prisma.customer.findFirst as jest.Mock).mockImplementationOnce(
      async ({ where }: { where: { deletedAt?: null } }) =>
        where.deletedAt === null ? null : { id: 'c1' },
    );
    expect(await service.getCustomerStatement(ORG, 'c1', '2026-01-01', '2026-01-31')).toBeNull();
  });

  it('returns null for a customer of another organization', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValueOnce(null);
    expect(
      await service.getCustomerStatement('other', 'c1', '2026-01-01', '2026-01-31'),
    ).toBeNull();
    const where = (prisma.customer.findFirst as jest.Mock).mock.calls.at(-1)[0].where;
    expect(where).toEqual({ id: 'c1', organizationId: 'other', deletedAt: null });
  });
});
