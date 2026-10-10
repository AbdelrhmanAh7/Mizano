import { Decimal } from '@prisma/client/runtime/library';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { AgingReportsService } from './aging-reports.service';
import { FinancialReportsService } from './financial-reports.service';

describe('payables reports net unapplied vendor credits', () => {
  const ORG = 'org-1';
  const bill = (id: string, vendorId: string, balance: string) => ({
    id,
    billNumber: id,
    vendorId,
    date: new Date('2029-12-01'),
    billDate: null,
    dueDate: new Date('2030-01-01'),
    total: new Decimal(balance),
    grandTotal: new Decimal(balance),
    balanceDue: new Decimal(balance),
    vendor: { id: vendorId, name: `Vendor ${vendorId}` },
  });
  const credit = (vendorId: string, amount: string) => ({
    id: `credit-${vendorId}-${amount}`,
    vendorId,
    amount: new Decimal(amount),
    appliedToBillId: null,
    deletedAt: null,
    vendor: { id: vendorId, name: `Vendor ${vendorId}` },
  });

  it('AP aging: summary.netTotal = open bill balances - unapplied credits, per vendor and in total', async () => {
    const prisma = {
      bill: {
        findMany: jest.fn().mockResolvedValue([bill('b1', 'v1', '114'), bill('b2', 'v1', '142')]),
      },
      billAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      vendorCredit: {
        findMany: jest.fn().mockResolvedValue([credit('v1', '150.5'), credit('v1', '49.5')]),
      },
    };
    const service = new AgingReportsService(prisma as unknown as ReadReplicaService);

    const report = await service.getPayablesAging(ORG);

    expect(prisma.vendorCredit.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      OR: expect.arrayContaining([{ refundedAt: null }, { refundedAt: { gt: expect.any(Date) } }]),
    });
    expect(report.summary.total).toBe('256.0000');
    expect(report.summary.unappliedCredits).toBe('200.0000');
    expect(report.summary.netTotal).toBe('56.0000');
    expect(report.unappliedCredits.vendors).toEqual([
      { vendorId: 'v1', vendorName: 'Vendor v1', amount: '200.0000' },
    ]);
  });

  it('rebuilds each bill balance at the cutoff and dates voids by their reversal journals', async () => {
    const prisma = {
      bill: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...bill('b1', 'v1', '100'),
            status: 'PAID',
            balanceDue: new Decimal(0),
            dueDate: new Date('2026-01-30'),
          },
          {
            ...bill('b2', 'v1', '200'),
            status: 'OPEN',
            balanceDue: new Decimal(0),
            dueDate: new Date('2026-01-01'),
          },
        ]),
      },
      billAllocation: {
        findMany: jest.fn().mockResolvedValue([
          {
            billId: 'b1',
            amount: new Decimal('20'),
            payment: { id: 'p-after', deletedAt: new Date('2026-03-01') },
          },
          {
            billId: 'b1',
            amount: new Decimal('15'),
            payment: { id: 'p-before', deletedAt: new Date('2026-03-02') },
          },
        ]),
      },
      vendorCredit: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c-applied',
            vendorId: 'v1',
            amount: new Decimal('5'),
            appliedToBillId: 'b1',
            deletedAt: null,
            vendor: { id: 'v1', name: 'Vendor v1' },
          },
          {
            id: 'c-after',
            vendorId: 'v1',
            amount: new Decimal('6'),
            appliedToBillId: null,
            deletedAt: new Date('2026-03-03'),
            vendor: { id: 'v1', name: 'Vendor v1' },
          },
          {
            id: 'c-before',
            vendorId: 'v1',
            amount: new Decimal('7'),
            appliedToBillId: null,
            deletedAt: new Date('2026-03-04'),
            vendor: { id: 'v1', name: 'Vendor v1' },
          },
        ]),
      },
      journal: {
        findMany: jest.fn().mockImplementation((args: { where: { sourceType: string } }) => {
          if (args.where.sourceType === 'PAYMENT_MADE_VOID') {
            return Promise.resolve([
              { sourceId: 'p-after', date: new Date('2026-02-01') },
              { sourceId: 'p-before', date: new Date('2026-01-20') },
            ]);
          }
          return Promise.resolve([
            { sourceId: 'c-after', date: new Date('2026-02-02') },
            { sourceId: 'c-before', date: new Date('2026-01-20') },
          ]);
        }),
      },
    };
    const service = new AgingReportsService(prisma as unknown as ReadReplicaService);

    const report = await service.getPayablesAging(ORG, '2026-01-31');

    expect(report.asOfDate).toBe('2026-01-31');
    expect(report.summary).toEqual({
      current: '0.0000',
      days1_30: '275.0000',
      days31_60: '0.0000',
      days61_90: '0.0000',
      over90: '0.0000',
      total: '275.0000',
      unappliedCredits: '6.0000',
      netTotal: '269.0000',
    });
    expect(report.buckets.days1_30.map((item) => item.balanceDue)).toEqual(['75.0000', '200.0000']);
    for (const model of [prisma.bill, prisma.billAllocation, prisma.vendorCredit, prisma.journal]) {
      for (const [args] of model.findMany.mock.calls) {
        if (model === prisma.billAllocation) {
          expect(args.where.payment.organizationId).toBe(ORG);
        } else {
          expect(args.where.organizationId).toBe(ORG);
        }
      }
    }
    expect(prisma.journal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          sourceType: 'PAYMENT_MADE_VOID',
          sourceId: { in: ['p-after', 'p-before'] },
        }),
      }),
    );
  });

  it('purchases by vendor: credits reduce netPayable and a credit-only vendor still appears', async () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ baseCurrency: 'EGP' }) },
      bill: {
        findMany: jest.fn().mockResolvedValue([
          {
            vendorId: 'v1',
            grandTotal: new Decimal('228'),
            balanceDue: new Decimal('114'),
            currencyCode: null,
            vendor: { id: 'v1', name: 'One' },
          },
        ]),
      },
      vendorCredit: {
        findMany: jest.fn().mockResolvedValue([
          { vendorId: 'v1', amount: new Decimal('14') },
          { vendorId: 'v2', amount: new Decimal('6') },
        ]),
      },
      vendor: { findMany: jest.fn().mockResolvedValue([{ id: 'v2', name: 'Two' }]) },
    };
    const service = new FinancialReportsService(prisma as unknown as ReadReplicaService);

    const report = await service.getPurchasesByVendor(ORG);

    const byId = Object.fromEntries(report.entries.map((e) => [e.vendorId, e]));
    expect(byId.v1.netPayable).toBe('100.0000');
    expect(byId.v2).toMatchObject({
      billCount: 0,
      unappliedCredits: '6.0000',
      netPayable: '-6.0000',
    });
    expect(report.totalBalance).toBe('114.0000');
    expect(report.totalUnappliedCredits).toBe('20.0000');
    expect(report.totalNetPayable).toBe('94.0000');
    expect(prisma.vendor.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      id: { in: ['v2'] },
    });
  });
});
