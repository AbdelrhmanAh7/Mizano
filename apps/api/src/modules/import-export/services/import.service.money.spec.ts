import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { ImportEntityType } from '../dto/import-export.dto';
import { ImportService } from './import.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('ImportService money-bearing imports', () => {
  const ORG = 'org-1';
  let prisma: any;
  let invoices: { create: jest.Mock };
  let creditNotes: { create: jest.Mock };
  let paymentsReceived: { create: jest.Mock };
  let bills: { create: jest.Mock };
  let expenses: { create: jest.Mock };
  let vendorCredits: { create: jest.Mock };
  let paymentsMade: { create: jest.Mock };
  let service: ImportService;

  const importRowKeyed = (
    type: keyof typeof ImportEntityType,
    row: Record<string, unknown>,
    key: string,
  ): Promise<string> =>
    (service as any).importSingleRow(ORG, ImportEntityType[type], row, false, undefined, key);

  const importRow = (
    type: keyof typeof ImportEntityType,
    row: Record<string, unknown>,
  ): Promise<string> => (service as any).importSingleRow(ORG, ImportEntityType[type], row);

  beforeEach(() => {
    prisma = createMockPrisma();
    invoices = { create: jest.fn().mockResolvedValue({ id: 'i1' }) };
    creditNotes = { create: jest.fn().mockResolvedValue({ id: 'cn1' }) };
    paymentsReceived = { create: jest.fn().mockResolvedValue({ id: 'pr1' }) };
    bills = { create: jest.fn().mockResolvedValue({ id: 'b1' }) };
    expenses = { create: jest.fn().mockResolvedValue({ id: 'e1' }) };
    vendorCredits = { create: jest.fn().mockResolvedValue({ id: 'vc1' }) };
    paymentsMade = { create: jest.fn().mockResolvedValue({ id: 'pm1' }) };
    service = new ImportService(
      prisma as unknown as PrismaService,
      invoices as never,
      creditNotes as never,
      paymentsReceived as never,
      bills as never,
      expenses as never,
      vendorCredits as never,
      paymentsMade as never,
    );
    prisma.customer.findFirst.mockResolvedValue({ id: 'c1' });
    prisma.vendor.findFirst.mockResolvedValue({ id: 'v1' });
    prisma.item.findFirst.mockResolvedValue({ id: 'it1', name: 'Widget' });
    prisma.account.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve({ id: `acc-${where.code}` }),
    );
    prisma.invoice.findFirst.mockResolvedValue({ id: 'inv1', customerId: 'c1' });
    prisma.bill.findFirst.mockResolvedValue({ id: 'bill1', vendorId: 'v1' });
    prisma.organization.findUnique.mockResolvedValue({
      defaultBankAccountId: 'bank-default',
      defaultCashAccountId: null,
    });
  });

  describe('accounts', () => {
    const account = { name: 'Cash', code: '1000', type: 'asset' };

    it('rejects a non-zero openingBalance instead of writing it without a journal', async () => {
      await expect(importRow('ACCOUNTS', { ...account, openingBalance: '500' })).rejects.toThrow(
        /Opening Balances/,
      );
      expect(prisma.account.create).not.toHaveBeenCalled();
    });

    it('accepts a zero or blank openingBalance and never stores one', async () => {
      prisma.account.create.mockResolvedValue({});
      await importRow('ACCOUNTS', { ...account, openingBalance: '0.00' });
      await importRow('ACCOUNTS', { ...account, openingBalance: '' });
      expect(prisma.account.create).toHaveBeenCalledTimes(2);
      expect(prisma.account.create.mock.calls[0][0].data).not.toHaveProperty('openingBalance');
    });
  });

  describe('expenses', () => {
    const row = { date: '2026-03-05', accountCode: '6000', amount: '100.50', taxRate: '14' };

    it('creates the expense through ExpensesService (posting) with decimal strings', async () => {
      await importRow('EXPENSES', { ...row, paidThroughAccountCode: '1000' });
      expect(expenses.create).toHaveBeenCalledWith(
        ORG,
        {
          date: new Date('2026-03-05').toISOString(),
          accountId: 'acc-6000',
          vendorId: undefined,
          amount: '100.50',
          taxRate: '14',
          paidThroughAccountId: 'acc-1000',
          description: undefined,
          reference: expect.stringMatching(/^\[import [0-9a-f]{32}\]$/),
        },
        { tx: prisma },
      );
      expect(prisma.expense.create).not.toHaveBeenCalled();
    });

    it('falls back to the organization default bank account', async () => {
      await importRow('EXPENSES', row);
      expect(expenses.create.mock.calls[0][1].paidThroughAccountId).toBe('bank-default');
    });

    it('rejects a VAT amount column (the VAT is computed from taxRate)', async () => {
      await expect(importRow('EXPENSES', { ...row, taxAmount: '14' })).rejects.toThrow(/taxRate/);
      expect(expenses.create).not.toHaveBeenCalled();
    });

    it.each(['abc', '-5', '1e3'])(
      'rejects the malformed amount %s before posting',
      async (amount) => {
        await expect(importRow('EXPENSES', { ...row, amount })).rejects.toThrow(
          BadRequestException,
        );
        expect(expenses.create).not.toHaveBeenCalled();
      },
    );

    it('scopes account and vendor lookups to the organization', async () => {
      await importRow('EXPENSES', { ...row, vendorEmail: 'v@x.com' });
      expect(prisma.account.findFirst.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG,
        code: '6000',
      });
      expect(prisma.vendor.findFirst.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG,
        email: 'v@x.com',
      });
    });
  });

  describe('documents and settlements', () => {
    it('creates invoices as DRAFTs through InvoicesService (server-side totals)', async () => {
      await importRow('INVOICES', {
        customerEmail: 'c@x.com',
        itemSku: 'W',
        date: '2026-03-05',
        quantity: '2',
        rate: '10.10',
      });
      const [org, dto] = invoices.create.mock.calls[0];
      expect(org).toBe(ORG);
      expect(dto.lines).toEqual([
        { itemId: 'it1', description: 'Widget', quantity: '2', rate: '10.10' },
      ]);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('creates bills as DRAFTs through BillsService', async () => {
      await importRow('BILLS', {
        vendorEmail: 'v@x.com',
        itemSku: 'W',
        date: '2026-03-05',
        quantity: '1',
        rate: '5',
      });
      expect(bills.create).toHaveBeenCalledTimes(1);
      expect(prisma.bill.create).not.toHaveBeenCalled();
    });

    it('creates vendor credits through VendorCreditsService against the posted bill', async () => {
      await importRow('VENDOR_CREDITS', {
        vendorEmail: 'v@x.com',
        billNumber: 'BILL-1',
        amount: '25',
      });
      expect(vendorCredits.create.mock.calls[0][1]).toMatchObject({
        vendorId: 'v1',
        billId: 'bill1',
        amount: '25',
      });
      expect(prisma.vendorCredit.create).not.toHaveBeenCalled();
    });

    it('creates vendor payments through PaymentsMadeService, allocated to the bill', async () => {
      await importRow('PAYMENTS_MADE', {
        vendorEmail: 'v@x.com',
        date: '2026-03-05',
        amount: '40',
        paymentMode: 'cash',
        paidFromAccountCode: '1000',
        billNumber: 'BILL-1',
      });
      expect(paymentsMade.create.mock.calls[0][1]).toMatchObject({
        vendorId: 'v1',
        amount: '40',
        paymentMode: 'CASH',
        paidFromAccountId: 'acc-1000',
        allocations: [{ billId: 'bill1', amount: '40' }],
      });
      expect(prisma.paymentMade.create).not.toHaveBeenCalled();
    });

    it('requires a bill / invoice allocation for payments', async () => {
      await expect(
        importRow('PAYMENTS_MADE', {
          vendorEmail: 'v@x.com',
          date: '2026-03-05',
          amount: '40',
          paymentMode: 'CASH',
          paidFromAccountCode: '1000',
        }),
      ).rejects.toThrow(/billNumber is required/);
      await expect(
        importRow('PAYMENTS_RECEIVED', {
          customerEmail: 'c@x.com',
          date: '2026-03-05',
          amount: '40',
          paymentMode: 'CASH',
          depositAccountCode: '1000',
        }),
      ).rejects.toThrow(/invoiceNumber is required/);
      expect(paymentsMade.create).not.toHaveBeenCalled();
      expect(paymentsReceived.create).not.toHaveBeenCalled();
    });

    it('creates customer payments and credit notes through their commands', async () => {
      await importRow('PAYMENTS_RECEIVED', {
        customerEmail: 'c@x.com',
        date: '2026-03-05',
        amount: '40',
        paymentMode: 'BANK_TRANSFER',
        depositAccountCode: '1000',
        invoiceNumber: 'INV-1',
      });
      expect(paymentsReceived.create.mock.calls[0][1]).toMatchObject({
        allocations: [{ invoiceId: 'inv1', amount: '40' }],
        depositToAccountId: 'acc-1000',
      });

      await importRow('CREDIT_NOTES', {
        customerEmail: 'c@x.com',
        invoiceNumber: 'INV-1',
        date: '2026-03-05',
        amount: '10',
        type: 'refund',
        refundAccountCode: '1000',
      });
      expect(creditNotes.create.mock.calls[0][1]).toMatchObject({
        type: 'REFUND',
        refundAccountId: 'acc-1000',
        amount: '10',
      });
      expect(prisma.creditNote.create).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    const row = {
      date: '2026-03-05',
      accountCode: '6000',
      amount: '10',
      paidThroughAccountCode: '1000',
    };

    it('skips a row whose marker already exists in the organization and creates nothing', async () => {
      prisma.expense.count.mockResolvedValue(1);
      const result = await importRowKeyed('EXPENSES', row, 'k1');
      expect(result).toBe('skipped');
      expect(expenses.create).not.toHaveBeenCalled();
      expect(prisma.expense.count.mock.calls[0][0].where).toEqual({
        organizationId: ORG,
        reference: { contains: '[import k1]' },
      });
      expect(prisma.$executeRaw).toHaveBeenCalled(); // advisory lock on the row key
    });

    it('creates the row once with the marker in the document reference', async () => {
      prisma.expense.count.mockResolvedValue(0);
      expect(await importRowKeyed('EXPENSES', row, 'k2')).toBe('created');
      expect(expenses.create.mock.calls[0][1].reference).toBe('[import k2]');
    });

    it('a re-run of the same file imports zero new rows', async () => {
      const buffer = Buffer.from(
        ['date,accountCode,amount,paidThroughAccountCode', '2026-03-05,6000,10,1000', ''].join(
          '\n',
        ),
      );
      const config = {
        entityType: ImportEntityType.EXPENSES,
        columnMappings: [
          { sourceColumn: 'date', targetField: 'date' },
          { sourceColumn: 'accountCode', targetField: 'accountCode' },
          { sourceColumn: 'amount', targetField: 'amount' },
          { sourceColumn: 'paidThroughAccountCode', targetField: 'paidThroughAccountCode' },
        ],
        skipRows: 0,
        updateExisting: false,
        stopOnError: false,
      } as never;
      jest.spyOn(service as any, 'validateImport').mockResolvedValue({ valid: true, errors: [] });
      const markers: string[] = [];
      expenses.create.mockImplementation(async (_org: string, dto: { reference: string }) => {
        markers.push(dto.reference);
        return { id: 'e1' };
      });
      prisma.expense.count.mockImplementation(async ({ where }: any) =>
        markers.some((m) => m === where.reference.contains) ? 1 : 0,
      );

      const first = await service.importData(ORG, buffer, 'e.csv', config);
      const second = await service.importData(ORG, buffer, 'e.csv', config);

      expect(first.created).toBe(1);
      expect(second.created).toBe(0);
      expect(second.skipped).toBe(1);
      expect(expenses.create).toHaveBeenCalledTimes(1);
    });
  });
});
