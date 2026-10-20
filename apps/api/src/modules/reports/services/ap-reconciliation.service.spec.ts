import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { ApReconciliationService } from './ap-reconciliation.service';

describe('@issue-125 ApReconciliationService.reconcileApControl', () => {
  const ORG = 'org-1';
  const ASOF = new Date('2026-03-31T23:59:59.999Z');
  const sum = (field: string, value: string | null) => ({
    _sum: { [field]: value === null ? null : new Decimal(value) },
  });

  interface Fixture {
    open: string | null;
    paidLater?: string;
    voidedLater?: string;
    prepaid?: string;
    appliedLater?: string;
    unapplied?: string;
    /** Bills voided after asOf: gross, payments in effect, applied credits. */
    voidedAfter?: { gross: string; paid?: string; credited?: string };
    lines?: Array<{ accountId: string; debit: string; credit: string }>;
    defaultAp?: string | null;
    usedAp?: string[];
    org?: { baseCurrency?: string | null; currency?: string | null };
  }

  function setup(v: Fixture) {
    const tx = {
      bill: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce(sum('balanceDue', v.open))
          .mockResolvedValue(sum('grandTotal', v.voidedAfter?.gross ?? '0')),
      },
      // Call order: paidLater, voidedLater, prepaid, then the voided-after payments.
      billAllocation: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce(sum('amount', v.paidLater ?? '0'))
          .mockResolvedValueOnce(sum('amount', v.voidedLater ?? '0'))
          .mockResolvedValueOnce(sum('amount', v.prepaid ?? '0'))
          .mockResolvedValue(sum('amount', v.voidedAfter?.paid ?? '0')),
      },
      // Call order: appliedLater, unapplied, then the voided-after applied credits.
      vendorCredit: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce(sum('amount', v.appliedLater ?? '0'))
          .mockResolvedValueOnce(sum('amount', v.unapplied ?? '0'))
          .mockResolvedValue(sum('amount', v.voidedAfter?.credited ?? '0')),
      },
      journal: {
        findMany: jest.fn().mockResolvedValue(v.voidedAfter ? [{ sourceId: 'bill-gone' }] : []),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          defaultApAccountId: v.defaultAp === undefined ? 'ap' : v.defaultAp,
          baseCurrency: v.org && 'baseCurrency' in v.org ? v.org.baseCurrency : 'EGP',
          currency: v.org?.currency ?? 'USD',
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
    // The service must read only through the transaction client.
    const prisma = { $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    return {
      prisma,
      tx,
      service: new ApReconciliationService(prisma as unknown as ReadReplicaService),
    };
  }

  it('AC1: ties open balances, later settlements and unapplied credits in exact decimals', async () => {
    // 0.1 + 0.2 style sums that drift as floats must tie exactly.
    const { service } = setup({
      open: '100.1',
      paidLater: '0.2',
      voidedLater: '0.1',
      prepaid: '0.0004',
      appliedLater: '0.0003',
      unapplied: '0.0001',
      lines: [
        { accountId: 'ap', debit: '50.1', credit: '100.1' },
        { accountId: 'ap-old', debit: '0', credit: '50.1998' },
      ],
      usedAp: ['ap-old'],
    });
    await expect(service.reconcileApControl(ORG, '2026-03-31')).resolves.toEqual({
      asOf: '2026-03-31',
      currencyCode: 'EGP',
      subledgerTotal: '100.1998',
      controlBalance: '100.1998',
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
    const { tx, service } = setup({ open: '0', usedAp: ['ap-old', 'ap'] });
    await service.reconcileApControl(ORG, '2026-03-31');

    const billWhere = tx.bill.aggregate.mock.calls[0][0].where;
    expect(billWhere).toMatchObject({ organizationId: ORG, deletedAt: null, date: { lte: ASOF } });
    expect(billWhere.status.in).toEqual(['OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE']);
    const [paidLater, voidedLater, prepaid] = tx.billAllocation.aggregate.mock.calls.map(
      ([args]) => args.where,
    );
    expect(paidLater.bill).toEqual(billWhere);
    expect(voidedLater.bill).toEqual(billWhere);
    expect(paidLater.payment).toMatchObject({ organizationId: ORG, date: { gt: ASOF } });
    expect(voidedLater.payment).toMatchObject({ organizationId: ORG, deletedAt: { gt: ASOF } });
    for (const [args] of tx.vendorCredit.aggregate.mock.calls) {
      expect(args.where.organizationId).toBe(ORG);
    }
    expect(tx.journal.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      date: { lte: ASOF },
      reversedBy: { is: { organizationId: ORG, date: { gt: ASOF } } },
    });
    expect(tx.journalLine.findMany.mock.calls[0][0].where.journal.organizationId).toBe(ORG);
    const ledger = tx.journalLine.groupBy.mock.calls[0][0].where;
    expect(ledger.journal).toMatchObject({ organizationId: ORG, date: { lte: ASOF } });
    expect([...ledger.accountId.in].sort()).toEqual(['ap', 'ap-old']);
    expect(prepaid).toBeDefined();
  });

  it('reads both sides in one repeatable-read transaction', async () => {
    const { prisma, service } = setup({ open: '0' });
    await service.reconcileApControl(ORG, '2026-03-31');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const options = (prisma.$transaction as jest.Mock).mock.calls[0][1];
    expect(options.isolationLevel).toBe(Prisma.TransactionIsolationLevel.RepeatableRead);
  });

  it('T3: a payment dated before its future-dated bill reduces the subledger like the ledger', async () => {
    const { tx, service } = setup({
      open: '0',
      prepaid: '40',
      lines: [{ accountId: 'ap', debit: '40', credit: '0' }],
    });
    const result = await service.reconcileApControl(ORG, '2026-03-31');
    expect(result).toMatchObject({ subledgerTotal: '-40.0000', difference: '0.0000', ok: true });
    const prepaidWhere = tx.billAllocation.aggregate.mock.calls[2][0].where;
    expect(prepaidWhere.bill).toMatchObject({ organizationId: ORG, date: { gt: ASOF } });
    expect(prepaidWhere.payment).toMatchObject({ organizationId: ORG, date: { lte: ASOF } });
    expect(prepaidWhere.payment.OR).toEqual([{ deletedAt: null }, { deletedAt: { gt: ASOF } }]);
  });

  it('T2: the default AP account changed after posting: old and legacy accounts still count', async () => {
    const { tx, service } = setup({
      open: '75',
      defaultAp: 'ap-new',
      usedAp: ['ap-legacy'],
      lines: [
        { accountId: 'ap-legacy', debit: '0', credit: '75' },
        { accountId: 'ap-new', debit: '0', credit: '0' },
      ],
    });
    await expect(service.reconcileApControl(ORG, '2026-03-31')).resolves.toMatchObject({
      controlBalance: '75.0000',
      ok: true,
    });
    const accountIds = tx.journalLine.groupBy.mock.calls[0][0].where.accountId.in;
    expect([...accountIds].sort()).toEqual(['ap-legacy', 'ap-new']);

    // Source-less legacy journals are found by document reference, on liability accounts only.
    const branches = tx.journalLine.findMany.mock.calls[0][0].where.OR;
    expect(branches).toHaveLength(4);
    expect(branches[2]).toMatchObject({
      credit: { gt: 0 },
      account: { type: 'LIABILITY' },
      journal: { sourceType: null, OR: [{ reference: { startsWith: 'Bill ' } }] },
    });
    expect(branches[3].journal.OR).toEqual([
      { reference: { startsWith: 'Payment ' } },
      { reference: { startsWith: 'Vendor Credit ' } },
    ]);
  });

  it('T4: returns the organization base currency, falling back to the registration currency', async () => {
    const { service } = setup({ open: '0', org: { baseCurrency: 'aed' } });
    await expect(service.reconcileApControl(ORG, '2026-03-31')).resolves.toMatchObject({
      currencyCode: 'AED',
    });
    const { service: fallback } = setup({
      open: '0',
      org: { baseCurrency: null, currency: 'sar' },
    });
    await expect(fallback.reconcileApControl(ORG, '2026-03-31')).resolves.toMatchObject({
      currencyCode: 'SAR',
    });
  });

  it('includes a bill voided after asOf from its gross total less settlements in effect', async () => {
    const { tx, service } = setup({
      open: '0',
      voidedAfter: { gross: '115', paid: '15', credited: '5' },
      lines: [{ accountId: 'ap', debit: '0', credit: '95' }],
    });
    await expect(service.reconcileApControl(ORG, '2026-03-31')).resolves.toMatchObject({
      subledgerTotal: '95.0000',
      difference: '0.0000',
      ok: true,
    });
    const gone = tx.bill.aggregate.mock.calls[1][0].where;
    expect(gone).toMatchObject({ organizationId: ORG, id: { in: ['bill-gone'] } });
    expect(gone.OR).toEqual([
      { deletedAt: { not: null } },
      { status: { notIn: ['OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] } },
    ]);
  });

  it('adds no voided-after bills when no approval journal was reversed later', async () => {
    const { tx, service } = setup({
      open: '5',
      lines: [{ accountId: 'ap', debit: '0', credit: '5' }],
    });
    await expect(service.reconcileApControl(ORG, '2026-03-31')).resolves.toMatchObject({
      ok: true,
    });
    expect(tx.bill.aggregate).toHaveBeenCalledTimes(1);
  });

  it('keeps full precision when the control credits pass 20 significant digits', async () => {
    // Eleven near-maximum Decimal(19,4) bills, ten of them fully paid: one open bill remains.
    const { service } = setup({
      open: '999999999999999.9999',
      lines: [
        { accountId: 'ap', debit: '9999999999999999.9990', credit: '10999999999999999.9989' },
      ],
    });
    await expect(service.reconcileApControl(ORG, '2026-03-31')).resolves.toMatchObject({
      subledgerTotal: '999999999999999.9999',
      controlBalance: '999999999999999.9999',
      difference: '0.0000',
      ok: true,
    });
  });

  it('treats empty aggregates and a tenant without AP accounts as zero on both sides', async () => {
    const { tx, service } = setup({ open: null, defaultAp: null });
    await expect(service.reconcileApControl(ORG, '2026-03-31')).resolves.toMatchObject({
      subledgerTotal: '0.0000',
      controlBalance: '0.0000',
      ok: true,
    });
    expect(tx.journalLine.groupBy).not.toHaveBeenCalled();
  });

  it('rejects an invalid asOf date', async () => {
    const { service } = setup({ open: '0' });
    await expect(service.reconcileApControl(ORG, '2026-02-30')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('AP control account discovery filtering (CTO P2)', () => {
    it('(a) a bill with a discount or negative line crediting an expense account leaves controlBalance unchanged', async () => {
      const { tx, service } = setup({
        open: '100',
        defaultAp: 'ap-control',
        usedAp: [],
        lines: [{ accountId: 'ap-control', debit: '0', credit: '100' }],
      });
      const result = await service.reconcileApControl(ORG, '2026-03-31');
      expect(result).toMatchObject({
        subledgerTotal: '100.0000',
        controlBalance: '100.0000',
        difference: '0.0000',
        ok: true,
      });

      // Branch 0 (BILL_APPROVAL) must restrict discovery to liability accounts
      const billApprovalBranch = tx.journalLine.findMany.mock.calls[0][0].where.OR[0];
      expect(billApprovalBranch).toMatchObject({
        credit: { gt: 0 },
        journal: { sourceType: 'BILL_APPROVAL' },
        account: { type: 'LIABILITY' },
      });
    });

    it('(b) a withholding-tax line crediting a tax liability is excluded', async () => {
      const { tx, service } = setup({
        open: '100',
        defaultAp: 'ap-control',
        usedAp: [],
        lines: [{ accountId: 'ap-control', debit: '0', credit: '100' }],
      });
      const result = await service.reconcileApControl(ORG, '2026-03-31');
      expect(result.ok).toBe(true);

      // Discovery query excludes tax/VAT accounts (code 22xx, Tax, VAT)
      const billApprovalBranch = tx.journalLine.findMany.mock.calls[0][0].where.OR[0];
      expect(billApprovalBranch.account.NOT).toEqual(
        expect.arrayContaining([{ code: { startsWith: '22' } }]),
      );
    });

    it('(c) a payment with a bank-fee or FX-loss line debiting an expense account is excluded', async () => {
      const { tx, service } = setup({
        open: '0',
        defaultAp: 'ap-control',
        usedAp: [],
        lines: [{ accountId: 'ap-control', debit: '100', credit: '100' }],
      });
      const result = await service.reconcileApControl(ORG, '2026-03-31');
      expect(result.ok).toBe(true);

      // Branch 1 (PAYMENT_MADE / VENDOR_CREDIT) must restrict discovery to liability accounts
      const paymentBranch = tx.journalLine.findMany.mock.calls[0][0].where.OR[1];
      expect(paymentBranch).toMatchObject({
        debit: { gt: 0 },
        account: { type: 'LIABILITY' },
      });
    });

    it('(d) all three return ok:true, difference 0 on a consistent ledger', async () => {
      // Consistent ledger: open bill balance = 0, AP control balance = 0
      const { service } = setup({
        open: '0',
        defaultAp: 'ap-control',
        usedAp: [],
        lines: [{ accountId: 'ap-control', debit: '85', credit: '85' }],
      });
      const result = await service.reconcileApControl(ORG, '2026-03-31');
      expect(result).toEqual({
        asOf: '2026-03-31',
        currencyCode: 'EGP',
        subledgerTotal: '0.0000',
        controlBalance: '0.0000',
        difference: '0.0000',
        ok: true,
      });
    });
  });
});
