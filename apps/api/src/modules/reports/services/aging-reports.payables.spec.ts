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
  const credit = (vendorId: string, amount: string, id = `vc-${vendorId}-${amount}`) => ({
    id,
    vendorId,
    amount: new Decimal(amount),
    deletedAt: null as Date | null,
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
      journal: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AgingReportsService(prisma as unknown as ReadReplicaService);

    const report = await service.getPayablesAging(ORG);

    const where = prisma.vendorCredit.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: ORG, appliedToBillId: null });
    // A credit refunded after the cutoff still debited AP on the cutoff date.
    expect(where.OR[0]).toEqual({ refundedAt: null });
    expect(where.OR[1].refundedAt.gt).toBeInstanceOf(Date);
    // Voids are dated by their reversal journal afterwards, so deletedAt is not a query filter.
    expect(where.deletedAt).toBeUndefined();
    expect(where.AND).toBeUndefined();
    // Nothing was voided, so there is no journal to look up.
    expect(prisma.journal.findMany).not.toHaveBeenCalled();
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

describe('payables aging dates a vendor credit void on its reversal journal', () => {
  const ORG = 'org-1';
  const CUTOFF = '2026-01-31';
  const credit = (id: string, amount: string, deletedAt: Date | null) => ({
    id,
    vendorId: 'v1',
    amount: new Decimal(amount),
    deletedAt,
    vendor: { id: 'v1', name: 'Vendor v1' },
  });
  const reversal = (sourceId: string, date: string) => ({ sourceId, date: new Date(date) });

  function build(credits: unknown[], voidJournals: unknown[] = []) {
    const prisma = {
      bill: { findMany: jest.fn().mockResolvedValue([]) },
      vendorCredit: { findMany: jest.fn().mockResolvedValue(credits) },
      journal: { findMany: jest.fn().mockResolvedValue(voidJournals) },
    };
    return { prisma, service: new AgingReportsService(prisma as unknown as ReadReplicaService) };
  }

  it('keeps a credit voided after the cutoff: its reversal is dated later', async () => {
    // Dated in January, voided in March. `JournalsService.reverse` dates the reversal on the
    // void day (max(today, credit date)), so on 31 January the credit still debited AP.
    const { service } = build(
      [credit('vc-1', '40', new Date('2026-03-10T10:00:00Z'))],
      [reversal('vc-1', '2026-03-10T10:00:00Z')],
    );

    const report = await service.getPayablesAging(ORG, CUTOFF);

    expect(report.summary.unappliedCredits).toBe('40.0000');
    expect(report.summary.netTotal).toBe('-40.0000');
  });

  it('follows the reversal journal, not deletedAt, in both directions', async () => {
    const { service } = build(
      [
        // deletedAt says "after the cutoff", but the reversal is already dated before it.
        credit('vc-early', '25', new Date('2026-03-10T10:00:00Z')),
        // deletedAt says "before the cutoff", but the reversal is dated after it.
        credit('vc-straddle', '15', new Date('2026-01-15T10:00:00Z')),
        credit('vc-live', '100', null),
      ],
      [
        reversal('vc-early', '2026-01-20T10:00:00Z'),
        reversal('vc-straddle', '2026-02-10T10:00:00Z'),
      ],
    );

    const report = await service.getPayablesAging(ORG, CUTOFF);

    // 100 (never voided) + 15 (voided after the cutoff); the credit reversed on 20 January is gone.
    expect(report.summary.unappliedCredits).toBe('115.0000');
    expect(report.unappliedCredits.vendors).toEqual([
      { vendorId: 'v1', vendorName: 'Vendor v1', amount: '115.0000' },
    ]);
  });

  it('falls back to deletedAt for a legacy void without a reversal journal', async () => {
    const { service } = build([
      credit('vc-legacy-live', '5', new Date('2026-02-20T10:00:00Z')),
      credit('vc-legacy-gone', '7', new Date('2026-01-10T10:00:00Z')),
    ]);

    const report = await service.getPayablesAging(ORG, CUTOFF);

    expect(report.summary.unappliedCredits).toBe('5.0000');
  });

  it('looks up reversal journals only for voided credits, scoped to the organization', async () => {
    const { prisma, service } = build([
      credit('vc-live', '100', null),
      credit('vc-voided', '40', new Date('2026-03-10T10:00:00Z')),
    ]);

    await service.getPayablesAging(ORG, CUTOFF);

    expect(prisma.journal.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.journal.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG,
        deletedAt: null,
        isPosted: true,
        sourceType: 'VENDOR_CREDIT_VOID',
        sourceId: { in: ['vc-voided'] },
      },
      select: { sourceId: true, date: true },
    });
  });
});
