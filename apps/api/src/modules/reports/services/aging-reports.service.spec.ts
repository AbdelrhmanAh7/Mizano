import { Decimal } from '@prisma/client/runtime/library';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { AgingReportsService } from './aging-reports.service';

type Where = { date?: { lt?: Date; gte?: Date }; deletedAt?: { lt?: Date; gte?: Date } };

describe('AgingReportsService.getVendorStatement (voided payments)', () => {
  // One bill (228, Jan 2), one payment (100, Jan 10) voided on Feb 5.
  const bill = {
    billNumber: 'BILL-0001',
    date: new Date('2026-01-02'),
    total: null,
    grandTotal: new Decimal(228),
  };
  const payment = {
    paymentNumber: 'VPMT-001',
    date: new Date('2026-01-10'),
    amount: new Decimal(100),
    deletedAt: new Date('2026-02-05'),
  };
  const within = (d: Date | null, r?: { lt?: Date; gte?: Date; lte?: Date }): boolean =>
    !!d &&
    (!r?.lt || d < r.lt) &&
    (!r?.gte || d >= r.gte) &&
    (!(r as { lte?: Date })?.lte || d <= (r as { lte: Date }).lte);

  const prisma = {
    vendor: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', name: 'V', email: null }) },
    bill: {
      findMany: jest.fn(async ({ where }: { where: Where }) =>
        within(bill.date, where.date) ? [bill] : [],
      ),
    },
    paymentMade: {
      findMany: jest.fn(async ({ where }: { where: Where }) => {
        if (where.deletedAt) return within(payment.deletedAt, where.deletedAt) ? [payment] : [];
        return within(payment.date, where.date) ? [payment] : [];
      }),
    },
  } as unknown as ReadReplicaService;
  const service = new AgingReportsService(prisma);

  it('keeps a payment voided after the period in that period', async () => {
    const jan = await service.getVendorStatement('org', 'v1', '2026-01-01', '2026-01-31');
    expect(jan?.transactions.map((t) => t.type)).toEqual(['Bill', 'Payment']);
    expect(jan?.transactions.at(-1)?.balance).toBe(128);
  });

  it('includes a void made later on the statement end date', async () => {
    payment.deletedAt = new Date('2026-02-28T10:00:00Z');
    const feb = await service.getVendorStatement('org', 'v1', '2026-02-01', '2026-02-28');
    payment.deletedAt = new Date('2026-02-05');
    expect(feb?.transactions).toEqual([
      expect.objectContaining({ type: 'Payment Void', debit: 100, balance: 228 }),
    ]);
  });

  it('shows the void as a debit on the date it happened', async () => {
    const feb = await service.getVendorStatement('org', 'v1', '2026-02-01', '2026-02-28');
    expect(feb?.openingBalance).toBe(128);
    expect(feb?.transactions).toEqual([
      expect.objectContaining({ type: 'Payment Void', debit: 100, balance: 228 }),
    ]);
  });
});
