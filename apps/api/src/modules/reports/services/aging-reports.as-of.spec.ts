import { Decimal } from '@prisma/client/runtime/library';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { AgingReportsService } from './aging-reports.service';

/** Aging as of a cutoff rebuilds each balance from dated events, not today's balanceDue (#586). */
const ORG = 'org-1';
const CUTOFF = '2026-01-31';
const d = (iso: string): Date => new Date(iso);

interface Event {
  id: string;
  amount: string;
  date: string;
  deletedAt?: string;
}
const allocation = (e: Event) => ({
  amount: new Decimal(e.amount),
  payment: { id: e.id, date: d(e.date), deletedAt: e.deletedAt ? d(e.deletedAt) : null },
});
const applied = (e: Event) => ({
  id: e.id,
  amount: new Decimal(e.amount),
  date: d(e.date),
  deletedAt: e.deletedAt ? d(e.deletedAt) : null,
});

function journalMock(voids: Array<{ sourceId: string; date: string }>) {
  return {
    findMany: jest.fn(async (args: { where: { sourceId: { in: string[] } } }) =>
      voids
        .filter((v) => args.where.sourceId.in.includes(v.sourceId))
        .map((v) => ({ sourceId: v.sourceId, date: d(v.date) })),
    ),
  };
}

describe('payables aging as of a cutoff', () => {
  const bill = (opts: { payments?: Event[]; credits?: Event[]; balanceDue?: string }) => ({
    id: 'b1',
    billNumber: 'BILL-0001',
    vendorId: 'v1',
    date: d('2026-01-10'),
    billDate: null,
    dueDate: d('2026-02-10'),
    status: 'PAID',
    grandTotal: new Decimal('1000'),
    balanceDue: new Decimal(opts.balanceDue ?? '0'),
    billAllocations: (opts.payments ?? []).map(allocation),
    appliedCredits: (opts.credits ?? []).map(applied),
    vendor: { id: 'v1', name: 'Vendor' },
  });

  function build(
    bills: unknown[],
    credits: unknown[] = [],
    voids: Array<{ sourceId: string; date: string }> = [],
  ) {
    const prisma = {
      bill: { findMany: jest.fn().mockResolvedValue(bills) },
      vendorCredit: { findMany: jest.fn().mockResolvedValue(credits) },
      journal: journalMock(voids),
    };
    return { prisma, service: new AgingReportsService(prisma as unknown as ReadReplicaService) };
  }

  it('keeps the full balance when the payment is dated after the cutoff', async () => {
    const { prisma, service } = build([
      bill({ payments: [{ id: 'p1', amount: '1000', date: '2026-02-05' }] }),
    ]);

    const report = await service.getPayablesAging(ORG, CUTOFF);

    expect(report.summary.total).toBe('1000.0000');
    expect(report.buckets.current[0]).toMatchObject({ billId: 'b1', balanceDue: '1000.0000' });
    // Today's zero balance must not hide it: the query also fetches bills settled after the cutoff.
    const where = prisma.bill.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe(ORG);
    expect(where.OR).toContainEqual({ balanceDue: { gt: 0 } });
    expect(JSON.stringify(where.OR)).toContain('billAllocations');
  });

  it('subtracts a payment and an applied credit dated on or before the cutoff', async () => {
    const { service } = build([
      bill({
        payments: [{ id: 'p1', amount: '300.1', date: '2026-01-20' }],
        credits: [{ id: 'c1', amount: '0.2', date: '2026-01-31T23:00:00Z' }],
      }),
    ]);

    const report = await service.getPayablesAging(ORG, CUTOFF);

    expect(report.summary.total).toBe('699.7000');
  });

  it('counts a payment voided after the cutoff, by its reversal journal date', async () => {
    // Soft-deleted on Jan 30 by the clock, but the reversal is dated Feb 3: on Jan 31 it still paid.
    const { prisma, service } = build(
      [
        bill({
          balanceDue: '1000',
          payments: [{ id: 'p1', amount: '400', date: '2026-01-15', deletedAt: '2026-01-30' }],
        }),
      ],
      [],
      [{ sourceId: 'p1', date: '2026-02-03' }],
    );

    const report = await service.getPayablesAging(ORG, CUTOFF);

    expect(report.summary.total).toBe('600.0000');
    expect(prisma.journal.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      sourceType: 'PAYMENT_MADE_VOID',
      isPosted: true,
      deletedAt: null,
    });
  });

  it('ignores a payment voided on or before the cutoff', async () => {
    const { service } = build(
      [
        bill({
          balanceDue: '1000',
          payments: [{ id: 'p1', amount: '400', date: '2026-01-15', deletedAt: '2026-01-20' }],
        }),
      ],
      [],
      [{ sourceId: 'p1', date: '2026-01-20' }],
    );

    const report = await service.getPayablesAging(ORG, CUTOFF);

    expect(report.summary.total).toBe('1000.0000');
  });

  it('nets an unapplied credit dated before the cutoff and voided after it', async () => {
    const { service } = build(
      [bill({ balanceDue: '1000' })],
      [
        {
          id: 'c9',
          vendorId: 'v1',
          amount: new Decimal('150'),
          date: d('2026-01-12'),
          deletedAt: d('2026-02-02'),
          vendor: { id: 'v1', name: 'Vendor' },
        },
      ],
      [{ sourceId: 'c9', date: '2026-02-02' }],
    );

    const report = await service.getPayablesAging(ORG, CUTOFF);

    expect(report.summary.unappliedCredits).toBe('150.0000');
    expect(report.summary.netTotal).toBe('850.0000');
  });

  it('drops a bill fully settled by the cutoff', async () => {
    const { service } = build([
      bill({ payments: [{ id: 'p1', amount: '1000', date: '2026-01-11' }] }),
    ]);

    const report = await service.getPayablesAging(ORG, CUTOFF);

    expect(report.billCount).toBe(0);
    expect(report.summary.total).toBe('0.0000');
  });
});

describe('receivables aging as of a cutoff', () => {
  const invoice = (opts: { status?: string; payments?: Event[]; credits?: Event[] }) => ({
    id: 'i1',
    invoiceNumber: 'INV-0001',
    customerId: 'c1',
    date: d('2026-01-05'),
    issueDate: null,
    dueDate: d('2026-01-20'),
    status: opts.status ?? 'PAID',
    grandTotal: new Decimal('500'),
    balanceDue: new Decimal('0'),
    paymentAllocations: (opts.payments ?? []).map(allocation),
    appliedCredits: (opts.credits ?? []).map(applied),
    customer: { id: 'c1', name: 'Customer' },
  });

  function build(invoices: unknown[], voids: Array<{ sourceId: string; date: string }> = []) {
    const prisma = {
      invoice: { findMany: jest.fn().mockResolvedValue(invoices) },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
      journal: journalMock(voids),
    };
    return new AgingReportsService(prisma as unknown as ReadReplicaService);
  }

  it('keeps the balance a February payment settled, overdue in its January bucket', async () => {
    const service = build([
      invoice({ payments: [{ id: 'p1', amount: '500', date: '2026-02-01' }] }),
    ]);

    const report = await service.getReceivablesAging(ORG, CUTOFF);

    expect(report.buckets.days1_30[0]).toMatchObject({
      invoiceId: 'i1',
      balanceDue: '500.0000',
      daysOverdue: 11,
    });
  });

  it('keeps an invoice voided after the cutoff and drops a voided draft', async () => {
    const posted = invoice({ status: 'VOID' });
    const draft = { ...invoice({ status: 'VOID' }), id: 'i2', invoiceNumber: 'INV-0002' };
    const service = build([posted, draft], [{ sourceId: 'i1', date: '2026-02-10' }]);

    const report = await service.getReceivablesAging(ORG, CUTOFF);

    expect(report.invoiceCount).toBe(1);
    expect(report.summary.total).toBe('500.0000');
  });

  it('drops an invoice voided on or before the cutoff', async () => {
    const service = build([invoice({ status: 'VOID' })], [{ sourceId: 'i1', date: '2026-01-31' }]);

    const report = await service.getReceivablesAging(ORG, CUTOFF);

    expect(report.invoiceCount).toBe(0);
  });

  it('subtracts a credit note applied before the cutoff even if voided later', async () => {
    const service = build(
      [
        invoice({
          credits: [{ id: 'cn1', amount: '120', date: '2026-01-25', deletedAt: '2026-02-04' }],
        }),
      ],
      [{ sourceId: 'cn1', date: '2026-02-04' }],
    );

    const report = await service.getReceivablesAging(ORG, CUTOFF);

    expect(report.summary.total).toBe('380.0000');
  });
});
