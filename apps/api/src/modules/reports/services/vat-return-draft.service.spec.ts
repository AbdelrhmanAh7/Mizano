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
    { getVatSummary } as unknown as VatReturnsService,
  );
  const draft = (from = '2023-01-01', to = '2023-01-31') => service.getDraft('org_1', from, to);

  const given = (
    ledger: { output: string; input: string; sales?: string; purchases?: string } = {
      output: '0.0000',
      input: '0.0000',
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

  describe('handling invalid and valid VAT rates (@issue-347)', () => {
    it.each(['-1', '-14', '100.01', '250'])(
      '@issue-347 AC1: invoice with tax rate %s is flagged with Invalid tax rate exception',
      async (rate) => {
        given(undefined, [doc('1', '14', 'EGP', [{ amount: '100', taxRate: rate }])]);
        const result = await draft();
        expect(result.status).toBe('incomplete');
        expect(result.exceptions).toEqual([
          { id: '1', type: 'invoice', documentNumber: 'INV-1', reason: 'Invalid tax rate' },
        ]);
      },
    );

    it('@issue-347 AC2: bill with invalid tax rate is flagged with Invalid tax rate exception', async () => {
      given(undefined, [], [doc('2', '14', 'EGP', [{ amount: '100', taxRate: '150' }])]);
      const result = await draft();
      expect(result.status).toBe('incomplete');
      expect(result.exceptions).toEqual([
        { id: '2', type: 'bill', documentNumber: 'BILL-2', reason: 'Invalid tax rate' },
      ]);
    });

    it('@issue-347 AC2: bill with negative tax rate is flagged with Invalid tax rate exception', async () => {
      given(undefined, [], [doc('3', '14', 'EGP', [{ amount: '100', taxRate: '-5' }])]);
      const result = await draft();
      expect(result.status).toBe('incomplete');
      expect(result.exceptions).toEqual([
        { id: '3', type: 'bill', documentNumber: 'BILL-3', reason: 'Invalid tax rate' },
      ]);
    });

    it('@issue-347 AC3: boundary tax rates of exactly 0% and 100% are valid', async () => {
      given(undefined, [
        doc('1', '0', 'EGP', [{ amount: '100', taxRate: '0' }]),
        doc('2', '100', 'EGP', [{ amount: '100', taxRate: '100' }]),
      ]);
      const result = await draft();
      expect(result.status).toBe('complete');
      expect(result.exceptions).toEqual([]);
    });

    it('@issue-347 AC4: documents with invalid rates preserve id, type, documentNumber in exception', async () => {
      given(
        undefined,
        [doc('inv-99', '14', 'EGP', [{ amount: '100', taxRate: '-0.5' }])],
        [doc('bill-42', '14', 'EGP', [{ amount: '100', taxRate: '105' }])],
      );
      const result = await draft();
      expect(result.exceptions).toEqual([
        { id: 'inv-99', type: 'invoice', documentNumber: 'INV-inv-99', reason: 'Invalid tax rate' },
        { id: 'bill-42', type: 'bill', documentNumber: 'BILL-bill-42', reason: 'Invalid tax rate' },
      ]);
    });
  });

  describe('exceptions and basic draft figures', () => {
    it('@issue-347: missing tax or foreign currency lands in exceptions', async () => {
      given(undefined, [doc('1', '10.0000', 'USD')], [doc('2', null)]);
      const result = await draft();
      expect(result.status).toBe('incomplete');
      expect(result.exceptions).toEqual([
        { id: '1', type: 'invoice', documentNumber: 'INV-1', reason: 'Foreign currency' },
        { id: '2', type: 'bill', documentNumber: 'BILL-2', reason: 'Missing tax amount' },
      ]);
    });

    it('@issue-347: a negative tax amount is an exception, not a mismatch', async () => {
      given(undefined, [doc('1', '-14', 'EGP', [{ amount: '100', taxRate: '14' }])]);
      expect((await draft()).exceptions).toEqual([
        { id: '1', type: 'invoice', documentNumber: 'INV-1', reason: 'Negative tax amount' },
      ]);
    });

    it('@issue-347: totals follow the posted VAT ledger and return draft label', async () => {
      given(
        { output: '170.0000', input: '35.0000' },
        [doc('1', '190.0000')],
        [doc('2', '20.0000')],
      );
      expect(await draft()).toMatchObject({
        label: 'DRAFT, not for filing',
        outputVat: '170.0000',
        inputVat: '35.0000',
        netVat: '135.0000',
        status: 'complete',
      });
      expect(getVatSummary).toHaveBeenCalledWith('org_1', '2023-01-01', '2023-01-31');
    });

    it('@issue-347: checks only this organization’s non-deleted documents with explicit posted status', async () => {
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
    });

    it('@issue-347: logs database errors without sensitive query details', async () => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      given();
      prisma.invoice.findMany.mockRejectedValue(
        Object.assign(new Error('org_secret'), {
          name: 'PrismaClientKnownRequestError',
          code: 'P2010',
        }),
      );
      await expect(draft()).rejects.toThrow();
      expect(log).toHaveBeenCalledWith('PrismaClientKnownRequestError(P2010)');
      log.mockRestore();
    });

    it('@issue-347: passes through BadRequestException unlogged', async () => {
      const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      given();
      getVatSummary.mockRejectedValue(new BadRequestException('VAT accounts not configured'));
      await expect(draft()).rejects.toBeInstanceOf(BadRequestException);
      expect(log).not.toHaveBeenCalled();
      log.mockRestore();
    });
  });
});
