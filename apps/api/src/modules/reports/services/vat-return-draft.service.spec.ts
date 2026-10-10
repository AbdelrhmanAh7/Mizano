import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VatReturnDraftService } from './vat-return-draft.service';
import { PrismaService } from '../../../prisma/prisma.service';

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
  };
  const service = new VatReturnDraftService(prisma as unknown as PrismaService);
  const draft = (): ReturnType<VatReturnDraftService['getDraft']> =>
    service.getDraft('org_1', '2023-01-01', '2023-01-31');
  const given = (invoices: unknown[], bills: unknown[] = []): void => {
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' });
    prisma.invoice.findMany.mockResolvedValue(invoices);
    prisma.bill.findMany.mockResolvedValue(bills);
  };

  beforeEach(() => jest.resetAllMocks());

  it('@issue-114 AC2: totals are correct for mixed rates (0/5/14%)', async () => {
    given(
      [doc('1', '0.0000'), doc('2', '50.0000'), doc('3', '140.0000')],
      [doc('4', '0'), doc('5', '20')],
    );
    const result = await draft();
    expect(result).toMatchObject({
      outputTax: '190.0000',
      inputTax: '20.0000',
      netPayable: '170.0000',
    });
    expect(result.status).toBe('complete');
  });

  it('@issue-114 AC2: decimal rounding is exact (0.1 + 0.2)', async () => {
    given([doc('1', '0.1000'), doc('2', '0.2000')]);
    expect((await draft()).outputTax).toBe('0.3000');
  });

  it('@issue-114 AC4: missing tax or foreign currency lands in exceptions', async () => {
    given([doc('1', '10.0000', 'USD')], [doc('2', null)]);
    const result = await draft();
    expect(result.status).toBe('incomplete');
    expect(result.exceptions).toEqual([
      { id: '1', type: 'invoice', documentNumber: 'INV-1', reason: 'Foreign currency' },
      { id: '2', type: 'bill', documentNumber: 'BILL-2', reason: 'Missing tax amount' },
    ]);
    expect(result).toMatchObject({ outputTax: '0.0000', inputTax: '0.0000' });
  });

  it('@issue-114 AC4: a document without a currency code counts as base currency, case-insensitively', async () => {
    given([doc('1', '140', null), doc('2', '10', 'egp')], [doc('3', '70', null)]);
    const result = await draft();
    expect(result).toMatchObject({ status: 'complete', exceptions: [], etaMismatches: [] });
    expect(result).toMatchObject({
      outputTax: '150.0000',
      inputTax: '70.0000',
      netPayable: '80.0000',
    });
  });

  it('@issue-114 AC1, AC3: only reads the requesting organization, never DRAFT, VOID or deleted documents', async () => {
    given([]);
    await draft();
    for (const spy of [prisma.invoice.findMany, prisma.bill.findMany]) {
      expect(spy.mock.calls[0][0].where).toMatchObject({
        organizationId: 'org_1',
        status: { notIn: ['DRAFT', 'VOID'] },
        deletedAt: null,
      });
    }
  });

  it('@issue-114 AC6: flags an ETA mismatch when the header tax differs from the per-line taxes', async () => {
    // Lines: 100 × 14% = 14.00 and 33.33 × 5% = 1.6665 → 1.67 (rounded per line) → 15.67.
    const lines = [
      { amount: '100', taxRate: '14' },
      { amount: '33.33', taxRate: '5' },
    ];
    given(
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
    // Totals still follow the posted ledger (header tax), never the recomputed line tax.
    expect(result).toMatchObject({ outputTax: '31.3300', inputTax: '7.0000', exceptions: [] });
  });

  it('@issue-114 AC2: an empty period returns zeros as strings and the draft label', async () => {
    given([]);
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

  it('@issue-114: logs a failing query without its message or parameters', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' });
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
});
