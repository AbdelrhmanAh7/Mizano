import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { ApReconciliationService } from './ap-reconciliation.service';

describe('@issue-125 ApReconciliationService.reconcileApControl', () => {
  const ORG = 'org-1';
  const sum = (field: string, value: string | null) => ({
    _sum: { [field]: value === null ? null : new Decimal(value) },
  });

  function setup(v: {
    open: string | null;
    paidLater?: string;
    voidedLater?: string;
    appliedLater?: string;
    unapplied?: string;
    lines?: Array<{ accountId: string; debit: string; credit: string }>;
    defaultAp?: string | null;
    usedAp?: string[];
  }) {
    const prisma = {
      bill: { aggregate: jest.fn().mockResolvedValue(sum('balanceDue', v.open)) },
      billAllocation: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce(sum('amount', v.paidLater ?? '0'))
          .mockResolvedValueOnce(sum('amount', v.voidedLater ?? '0')),
      },
      vendorCredit: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce(sum('amount', v.appliedLater ?? '0'))
          .mockResolvedValueOnce(sum('amount', v.unapplied ?? '0')),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          defaultApAccountId: v.defaultAp === undefined ? 'ap' : v.defaultAp,
        }),
      },
      journalLine: {
        findMany: jest.fn().mockResolvedValue((v.usedAp ?? []).map((accountId) => ({ accountId }))),
        groupBy: jest.fn().mockResolvedValue(
          (v.lines ?? []).map((l) => ({
            accountId: l.accountId,
            _sum: { debit: new Decimal(l.debit), credit: new Decimal(l.credit) },
          })),
        ),
      },
    };
    return {
      prisma,
      service: new ApReconciliationService(prisma as unknown as ReadReplicaService),
    };
  }

  it('AC1: ties open balances, later settlements and unapplied credits in exact decimals', async () => {
    // 0.1 + 0.2 style sums that drift as floats must tie exactly.
    const { service } = setup({
      open: '100.1',
      paidLater: '0.2',
      voidedLater: '0.1',
      appliedLater: '0.0003',
      unapplied: '0.0001',
      lines: [
        { accountId: 'ap', debit: '50.1', credit: '100.1' },
        { accountId: 'ap-old', debit: '0', credit: '50.2002' },
      ],
      usedAp: ['ap-old'],
    });
    await expect(service.reconcileApControl(ORG, '2026-03-31')).resolves.toEqual({
      asOf: '2026-03-31',
      subledgerTotal: '100.2002',
      controlBalance: '100.2002',
      difference: '0.0000',
      ok: true,
    });
  });

  it('AC2: returns ok false with the exact signed difference when the sides disagree', async () => {
    const { service } = setup({
      open: '10.01',
      lines: [{ accountId: 'ap', debit: '0', credit: '10' }],
    });
    const result = await service.reconcileApControl(ORG, '2026-03-31');
    expect(result).toMatchObject({ difference: '0.0100', ok: false });
  });

  it('AC3/AC4/AC5: scopes every query to the tenant, posted bills and the end of the asOf day', async () => {
    const { prisma, service } = setup({ open: '0', usedAp: ['ap-old', 'ap'] });
    await service.reconcileApControl(ORG, '2026-03-31');
    const asOf = new Date('2026-03-31T23:59:59.999Z');

    const billWhere = prisma.bill.aggregate.mock.calls[0][0].where;
    expect(billWhere).toMatchObject({ organizationId: ORG, deletedAt: null, date: { lte: asOf } });
    expect(billWhere.status.in).toEqual(['OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE']);
    for (const [args] of prisma.billAllocation.aggregate.mock.calls) {
      expect(args.where.bill).toEqual(billWhere);
      expect(args.where.payment.organizationId).toBe(ORG);
    }
    for (const [args] of prisma.vendorCredit.aggregate.mock.calls) {
      expect(args.where.organizationId).toBe(ORG);
    }
    expect(prisma.journalLine.findMany.mock.calls[0][0].where.journal.organizationId).toBe(ORG);
    const ledger = prisma.journalLine.groupBy.mock.calls[0][0].where;
    expect(ledger.journal).toMatchObject({ organizationId: ORG, date: { lte: asOf } });
    expect([...ledger.accountId.in].sort()).toEqual(['ap', 'ap-old']);
  });

  it('treats empty aggregates and a tenant without AP accounts as zero on both sides', async () => {
    const { prisma, service } = setup({ open: null, defaultAp: null });
    await expect(service.reconcileApControl(ORG, '2026-03-31')).resolves.toMatchObject({
      subledgerTotal: '0.0000',
      controlBalance: '0.0000',
      ok: true,
    });
    expect(prisma.journalLine.groupBy).not.toHaveBeenCalled();
  });

  it('rejects an invalid asOf date', async () => {
    const { service } = setup({ open: '0' });
    await expect(service.reconcileApControl(ORG, '2026-02-30')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
