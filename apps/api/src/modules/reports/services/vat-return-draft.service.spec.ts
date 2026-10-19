import { BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VatReturnDraftService } from './vat-return-draft.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TAXABLE_BILL_STATUSES,
  TAXABLE_INVOICE_STATUSES,
  VatReturnsService,
} from '../../tax/services/vat-returns.service';

type Line = { amount: string; taxRate: string };
/** A posted document as the service selects it; `lines` default to one line that matches `tax` at 14%. */
const doc = (
  id: string,
  tax: string | null,
  currencyCode: string | null = 'EGP',
  lines: Line[] = tax === null
    ? []
    : [{ amount: new Prisma.Decimal(tax).div('0.14').toFixed(2), taxRate: '14' }],
) => ({
  id,
  invoiceNumber: `INV-${id}`,
  billNumber: `BILL-${id}`,
  taxAmount: tax === null ? null : new Prisma.Decimal(tax),
  currencyCode,
  lines: lines.map((l) => ({
    amount: new Prisma.Decimal(l.amount),
    taxRate: new Prisma.Decimal(l.taxRate),
  })),
});

describe('VatReturnDraftService', () => {
  const prisma = {
    organization: { findUnique: jest.fn() },
    invoice: { findMany: jest.fn() },
    bill: { findMany: jest.fn() },
    vATReturn: { findFirst: jest.fn() },
  };
  const getVatSummary = jest.fn();
  const service = new VatReturnDraftService(
    prisma as unknown as PrismaService,
    {
      getVatSummary,
    } as unknown as VatReturnsService,
  );
  const draft = (from = '2023-01-01', to = '2023-01-31') => service.getDraft('org_1', from, to);
  /** Ledger VAT as `getVatSummary` returns it, plus the posted documents the checks read. */
  const given = (
    ledger: { output: string; input: string; sales?: string; purchases?: string } = {
      output: '0.0000',
      input: '0.0000',
      sales: '0.0000',
      purchases: '0.0000',
    },
    invoices: unknown[] = [],
    bills: unknown[] = [],
    storedReturn: unknown = null,
  ): void => {
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' });
    getVatSummary.mockResolvedValue({
      sales: { vatCollected: ledger.output, total: ledger.sales ?? '0.0000' },
      purchases: { vatPaid: ledger.input, totalPurchases: ledger.purchases ?? '0.0000' },
    });
    prisma.invoice.findMany.mockResolvedValue(invoices);
    prisma.bill.findMany.mockResolvedValue(bills);
    prisma.vATReturn.findFirst.mockResolvedValue(storedReturn);
  };

  beforeEach(() => jest.resetAllMocks());

  it('@issue-114 AC2: totals are the posted VAT ledger, not the sum of invoice and bill headers', async () => {
    // The ledger also holds VAT from an expense (input) and a credit note (reduces output) that
    // no invoice or bill row shows: 190 - 20 credited = 170 output; 20 + 15 expense = 35 input.
    given({ output: '170.0000', input: '35.0000' }, [doc('1', '190.0000')], [doc('2', '20.0000')]);
    const result = await draft();
    expect(result).toMatchObject({
      outputTax: '170.0000',
      inputTax: '35.0000',
      netPayable: '135.0000',
      status: 'complete',
    });
    expect(getVatSummary).toHaveBeenCalledWith('org_1', '2023-01-01', '2023-01-31');
  });

  it('@issue-114 AC2: a ledger refund position is a negative net payable', async () => {
    given({ output: '10.0000', input: '35.5000' });
    expect((await draft()).netPayable).toBe('-25.5000');
  });

  it('@issue-114 AC2: keeps four decimals when the totals have 17 integer digits', async () => {
    given({ output: '12345678901234567.1234', input: '0.0001' });
    expect(await draft()).toMatchObject({
      outputTax: '12345678901234567.1234',
      inputTax: '0.0001',
      netPayable: '12345678901234567.1233',
    });
  });

  it("@issue-114 AC2: labels the draft with the organization's base currency", async () => {
    given();
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: ' sar ' });
    expect(await draft()).toMatchObject({ currency: 'SAR' });
  });

  it('@issue-114 AC2: an empty period returns zeros as strings and the draft label', async () => {
    given();
    expect(await draft()).toMatchObject({
      label: 'DRAFT, not for filing',
      status: 'complete',
      outputTax: '0.0000',
      inputTax: '0.0000',
      netPayable: '0.0000',
      exceptions: [],
      etaMismatches: [],
    });
  });

  it('@issue-114 AC1, AC3: checks only this organization’s non-deleted documents with an explicit posted status', async () => {
    given();
    await draft();
    expect(prisma.invoice.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_1',
      deletedAt: null,
      status: { in: TAXABLE_INVOICE_STATUSES },
    });
    expect(prisma.bill.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'org_1',
      deletedAt: null,
      status: { in: TAXABLE_BILL_STATUSES },
    });
    // A legacy PENDING bill has no approval journal, so it is not a posted status.
    expect(TAXABLE_BILL_STATUSES).not.toContain('PENDING');
    expect(TAXABLE_BILL_STATUSES).not.toContain('DRAFT');
    expect(TAXABLE_INVOICE_STATUSES).not.toContain('DRAFT');
    expect(TAXABLE_INVOICE_STATUSES).not.toContain('VOID');
  });

  describe('period', () => {
    it('@issue-114 AC3: a date-only end date covers the whole day, a timestamp counts as its day', async () => {
      given();
      const result = await draft('2026-01-01', '2026-01-31T12:00:00.000Z');
      expect(prisma.invoice.findMany.mock.calls[0][0].where.date).toEqual({
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lt: new Date('2026-02-01T00:00:00.000Z'),
      });
      expect(getVatSummary).toHaveBeenCalledWith('org_1', '2026-01-01', '2026-01-31');
      expect(result).toMatchObject({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T00:00:00.000Z',
      });
    });

    it('@issue-114 AC5: from after to is a 400 and nothing is read', async () => {
      await expect(draft('2023-02-01', '2023-01-31')).rejects.toThrow(
        'from date must be before or equal to to date',
      );
      expect(getVatSummary).not.toHaveBeenCalled();
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });

    it('@issue-114 AC5: an unparseable date is a 400', async () => {
      await expect(draft('2023-13-45', '2023-01-31')).rejects.toBeInstanceOf(BadRequestException);
      expect(getVatSummary).not.toHaveBeenCalled();
    });

    it('@issue-114 AC7: allows 366 days and rejects 367 with a 400 before reading anything', async () => {
      given();
      await expect(draft('2024-01-01', '2024-12-31')).resolves.toBeDefined();
      jest.clearAllMocks();
      await expect(draft('2024-01-01', '2025-01-01')).rejects.toThrow(
        'The period must not be longer than 366 days',
      );
      expect(getVatSummary).not.toHaveBeenCalled();
      expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    });

    it('@issue-114 AC5: does not log an expected 400', async () => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      await expect(draft('2023-02-01', '2023-01-31')).rejects.toBeInstanceOf(BadRequestException);
      expect(log).not.toHaveBeenCalled();
      log.mockRestore();
    });
  });

  describe('document scan', () => {
    it('@issue-114 AC7: reads documents in id-ordered pages with a cursor, never all at once', async () => {
      const full = Array.from({ length: 500 }, (_, i) =>
        doc(`a${String(i).padStart(3, '0')}`, '14'),
      );
      given();
      prisma.invoice.findMany
        .mockResolvedValueOnce(full)
        .mockResolvedValueOnce([doc('b001', '14')]);
      await draft();
      const [first, second] = prisma.invoice.findMany.mock.calls.map((c) => c[0]);
      expect(first).toMatchObject({ take: 500, orderBy: { id: 'asc' } });
      expect(first.cursor).toBeUndefined();
      expect(second).toMatchObject({ take: 500, cursor: { id: 'a499' }, skip: 1 });
      expect(prisma.invoice.findMany).toHaveBeenCalledTimes(2);
    });

    it('@issue-114 AC7: selects only the fields it checks', async () => {
      given();
      await draft();
      expect(prisma.invoice.findMany.mock.calls[0][0].select).toEqual({
        id: true,
        invoiceNumber: true,
        taxAmount: true,
        currencyCode: true,
        lines: { select: { amount: true, taxRate: true } },
      });
    });
  });

  describe('exceptions', () => {
    it('@issue-114 AC4: missing tax or foreign currency lands in exceptions', async () => {
      given(undefined, [doc('1', '10.0000', 'USD')], [doc('2', null)]);
      const result = await draft();
      expect(result.status).toBe('incomplete');
      expect(result.exceptions).toEqual([
        { id: '1', type: 'invoice', documentNumber: 'INV-1', reason: 'Foreign currency' },
        { id: '2', type: 'bill', documentNumber: 'BILL-2', reason: 'Missing tax amount' },
      ]);
    });

    it('@issue-114 AC4: a document without a currency code counts as base currency, case-insensitively', async () => {
      given(undefined, [doc('1', '140', null), doc('2', '10', 'egp')], [doc('3', '70', null)]);
      expect(await draft()).toMatchObject({
        status: 'complete',
        exceptions: [],
        etaMismatches: [],
      });
    });

    it('@issue-114 AC4: a negative tax amount is an exception, not a mismatch', async () => {
      given(undefined, [doc('1', '-14', 'EGP', [{ amount: '100', taxRate: '14' }])]);
      const result = await draft();
      expect(result.exceptions).toEqual([
        { id: '1', type: 'invoice', documentNumber: 'INV-1', reason: 'Negative tax amount' },
      ]);
      expect(result.etaMismatches).toEqual([]);
    });

    it.each(['-1', '100.01', '250'])(
      '@issue-114 AC4: tax rate %s is an invalid rate',
      async (rate) => {
        given(undefined, [doc('1', '14', 'EGP', [{ amount: '100', taxRate: rate }])]);
        expect((await draft()).exceptions).toEqual([
          { id: '1', type: 'invoice', documentNumber: 'INV-1', reason: 'Invalid tax rate' },
        ]);
      },
    );

    it('@issue-114 AC4: tax rates of exactly 0 and 100 are valid', async () => {
      given(undefined, [
        doc('1', '0', 'EGP', [{ amount: '100', taxRate: '0' }]),
        doc('2', '100', 'EGP', [{ amount: '100', taxRate: '100' }]),
      ]);
      expect(await draft()).toMatchObject({
        status: 'complete',
        exceptions: [],
        etaMismatches: [],
      });
    });
  });

  describe('ETA mismatches', () => {
    it('@issue-114 AC6: flags a header tax that differs from the per-line taxes', async () => {
      // Lines: 100 × 14% = 14.00 and 33.33 × 5% = 1.6665 → 1.67 (rounded per line) → 15.67.
      const lines = [
        { amount: '100', taxRate: '14' },
        { amount: '33.33', taxRate: '5' },
      ];
      given(
        { output: '31.3300', input: '7.0000' },
        [doc('1', '15.6700', 'EGP', lines), doc('2', '15.6600', 'EGP', lines)],
        [doc('3', '7', 'EGP', [])],
      );
      const result = await draft();
      expect(result.etaMismatches).toEqual([
        {
          id: '2',
          type: 'invoice',
          documentNumber: 'INV-2',
          headerTax: '15.6600',
          lineTax: '15.6700',
        },
        { id: '3', type: 'bill', documentNumber: 'BILL-3', headerTax: '7.0000', lineTax: '0.0000' },
      ]);
      expect(result.status).toBe('incomplete');
      // Totals still follow the posted ledger, never the recomputed line tax.
      expect(result).toMatchObject({ outputTax: '31.3300', inputTax: '7.0000', exceptions: [] });
    });

    it('@issue-114 AC6: zero-amount documents and zero-rated lines match a zero header', async () => {
      given(undefined, [
        doc('1', '0.0000', 'EGP', [{ amount: '0', taxRate: '14' }]),
        doc('2', '0.0000', 'EGP', [{ amount: '300', taxRate: '0' }]),
      ]);
      expect(await draft()).toMatchObject({ status: 'complete', etaMismatches: [] });
    });

    it('@issue-114 AC6: a document with no lines and a zero header is consistent; a null header is an exception', async () => {
      given(undefined, [doc('1', '0', 'EGP', [])], [doc('2', null, 'EGP', [])]);
      const result = await draft();
      expect(result.etaMismatches).toEqual([]);
      expect(result.exceptions).toEqual([
        { id: '2', type: 'bill', documentNumber: 'BILL-2', reason: 'Missing tax amount' },
      ]);
    });

    it('@issue-114 AC6: a large line is not falsely flagged by 20-digit rounding', async () => {
      // 999999999000000.0050 × 99.90% = 998999999001000.004995 → 998999999001000.00 exactly.
      given(undefined, [
        doc('1', '998999999001000.00', 'EGP', [
          { amount: '999999999000000.0050', taxRate: '99.90' },
        ]),
      ]);
      expect(await draft()).toMatchObject({ status: 'complete', etaMismatches: [] });
    });
  });

  describe('stored return mismatches', () => {
    it('@issue-114 AC3: when no stored VAT return exists for the period, mismatches is an empty array', async () => {
      given({ output: '100.0000', input: '30.0000', sales: '1000.0000', purchases: '300.0000' });
      const result = await draft();
      expect(result.mismatches).toEqual([]);
      expect(result.totalSales).toBe('1000.0000');
      expect(result.totalPurchases).toBe('300.0000');
      expect(result.outputVat).toBe('100.0000');
      expect(result.inputVat).toBe('30.0000');
      expect(result.netVat).toBe('70.0000');
    });

    it('@issue-114 AC4: reports a mismatch when a stored VAT return has different netVat', async () => {
      given(
        { output: '140.0000', input: '70.0000', sales: '1000.0000', purchases: '500.0000' },
        [],
        [],
        {
          totalVat: new Prisma.Decimal('50.0000'),
          outputVAT: new Prisma.Decimal('140.0000'),
          inputVAT: new Prisma.Decimal('70.0000'),
          totalSales: new Prisma.Decimal('1000.0000'),
          totalPurchases: new Prisma.Decimal('500.0000'),
        },
      );
      const result = await draft();
      expect(result.mismatches).toContainEqual({
        field: 'netVat',
        computed: '70.0000',
        recorded: '50.0000',
      });
      expect(result.status).toBe('incomplete');
    });
  });

  it('@issue-114: logs a failing query without its message or parameters', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    given();
    prisma.invoice.findMany.mockRejectedValue(
      Object.assign(
        new Error('Invalid `prisma.invoice.findMany()` organizationId = "org_secret"'),
        {
          name: 'PrismaClientKnownRequestError',
          code: 'P2010',
        },
      ),
    );
    await expect(draft()).rejects.toThrow();
    expect(log).toHaveBeenCalledWith('PrismaClientKnownRequestError(P2010)');
    log.mockRestore();
  });

  it('@issue-114: passes the ledger service’s 400 (VAT accounts not configured) through unlogged', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    given();
    getVatSummary.mockRejectedValue(new BadRequestException('Please configure the default VAT'));
    await expect(draft()).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
