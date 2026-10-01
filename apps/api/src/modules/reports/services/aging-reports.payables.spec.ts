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
    billDate: null,
    dueDate: new Date('2030-01-01'),
    balanceDue: new Decimal(balance),
    vendor: { id: vendorId, name: `Vendor ${vendorId}` },
  });
  const credit = (vendorId: string, amount: string) => ({
    vendorId,
    amount: new Decimal(amount),
    vendor: { id: vendorId, name: `Vendor ${vendorId}` },
  });

  it('AP aging: summary.netTotal = open bill balances - unapplied credits, per vendor and in total', async () => {
    const prisma = {
      bill: {
        findMany: jest.fn().mockResolvedValue([bill('b1', 'v1', '114'), bill('b2', 'v1', '142')]),
      },
      vendorCredit: {
        findMany: jest.fn().mockResolvedValue([credit('v1', '150.5'), credit('v1', '49.5')]),
      },
    };
    const service = new AgingReportsService(prisma as unknown as ReadReplicaService);

    const report = await service.getPayablesAging(ORG);

    expect(prisma.vendorCredit.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      deletedAt: null,
      appliedToBillId: null,
      refundedAt: null,
    });
    expect(report.summary.total).toBe(256);
    expect(report.summary.unappliedCredits).toBe('200.0000');
    expect(report.summary.netTotal).toBe('56.0000');
    expect(report.unappliedCredits.vendors).toEqual([
      { vendorId: 'v1', vendorName: 'Vendor v1', amount: '200.0000' },
    ]);
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
