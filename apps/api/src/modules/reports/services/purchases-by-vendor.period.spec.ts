import { Decimal } from '@prisma/client/runtime/library';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { FinancialReportsService } from './financial-reports.service';

describe('purchases-by-vendor scopes unapplied credits to the requested period', () => {
  it('filters credits by credit date with the same window as the bills', async () => {
    const prisma = {
      organization: { findUnique: jest.fn().mockResolvedValue({ baseCurrency: 'EGP' }) },
      bill: { findMany: jest.fn().mockResolvedValue([]) },
      vendorCredit: {
        findMany: jest.fn().mockResolvedValue([{ vendorId: 'v1', amount: new Decimal('6') }]),
      },
      vendor: { findMany: jest.fn().mockResolvedValue([{ id: 'v1', name: 'One' }]) },
    };
    const service = new FinancialReportsService(prisma as unknown as ReadReplicaService);

    const report = await service.getPurchasesByVendor('org-1', '2026-01-01', '2026-01-31');

    const billWindow = prisma.bill.findMany.mock.calls[0][0].where.date;
    const creditWhere = prisma.vendorCredit.findMany.mock.calls[0][0].where;
    expect(creditWhere).toMatchObject({
      organizationId: 'org-1',
      deletedAt: null,
      appliedToBillId: null,
      refundedAt: null,
    });
    expect(creditWhere.date).toEqual(billWindow);
    expect(report.totalUnappliedCredits).toBe('6.0000');
  });
});
