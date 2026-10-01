import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { ImportEntityType } from '../dto/import-export.dto';
import { ImportService } from './import.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('ImportService hardening', () => {
  const ORG = 'org-1';
  let prisma: any;
  let expenses: { create: jest.Mock };
  let paymentsMade: { create: jest.Mock };
  let paymentsReceived: { create: jest.Mock };
  let service: ImportService;

  const importRowKeyed = (
    type: keyof typeof ImportEntityType,
    row: Record<string, unknown>,
    key: string,
  ): Promise<string> =>
    (service as any).importSingleRow(
      ORG,
      ImportEntityType[type],
      row,
      false,
      undefined,
      key,
      'user-1',
    );

  beforeEach(() => {
    prisma = createMockPrisma();
    expenses = { create: jest.fn().mockResolvedValue({ id: 'e1' }) };
    paymentsMade = { create: jest.fn().mockResolvedValue({ id: 'pm1' }) };
    paymentsReceived = { create: jest.fn().mockResolvedValue({ id: 'pr1' }) };
    service = new ImportService(
      prisma as unknown as PrismaService,
      { create: jest.fn() } as never,
      { create: jest.fn() } as never,
      paymentsReceived as never,
      { create: jest.fn() } as never,
      expenses as never,
      { create: jest.fn() } as never,
      paymentsMade as never,
    );
    prisma.account.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve({ id: `acc-${where.code ?? where.id}` }),
    );
    prisma.vendor.findFirst.mockResolvedValue({ id: 'v1' });
    prisma.customer.findFirst.mockResolvedValue({ id: 'c1' });
    prisma.bill.findFirst.mockResolvedValue({ id: 'bill1', vendorId: 'v1' });
    prisma.invoice.findFirst.mockResolvedValue({ id: 'inv1', customerId: 'c1' });
    prisma.organization.findUnique.mockResolvedValue({
      defaultBankAccountId: 'bank-default',
      defaultCashAccountId: null,
      baseCurrency: 'EGP',
    });
  });

  describe('idempotency record', () => {
    const row = {
      date: '2026-03-05',
      accountCode: '6000',
      amount: '10',
      paidThroughAccountCode: '1000',
    };

    it('skips a row whose key is already recorded in the audit log and creates nothing', async () => {
      prisma.auditLog.count.mockResolvedValue(1);
      expect(await importRowKeyed('EXPENSES', row, 'k1')).toBe('skipped');
      expect(expenses.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.count.mock.calls[0][0].where).toEqual({
        organizationId: ORG,
        entityType: 'IMPORT_ROW',
        entityId: 'k1',
      });
      expect(prisma.$executeRaw).toHaveBeenCalled(); // advisory lock on the row key
    });

    it('creates the row once and records its key without touching user-editable text', async () => {
      prisma.auditLog.count.mockResolvedValue(0);
      expect(await importRowKeyed('EXPENSES', row, 'k2')).toBe('created');
      expect(expenses.create.mock.calls[0][1].reference).toBeUndefined();
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        organizationId: ORG,
        userId: 'user-1',
        entityType: 'IMPORT_ROW',
        entityId: 'k2',
      });
    });

    it('a re-run of the same file imports zero new rows even after the document text was edited', async () => {
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
      const recorded = new Set<string>();
      prisma.auditLog.create.mockImplementation(async ({ data }: any) => {
        recorded.add(data.entityId);
        return {};
      });
      prisma.auditLog.count.mockImplementation(async ({ where }: any) =>
        recorded.has(where.entityId) ? 1 : 0,
      );
      // A user edits the created document text afterwards: the record is elsewhere.
      expenses.create.mockResolvedValue({ id: 'e1', reference: 'edited by a user' });

      const first = await service.importData(ORG, buffer, 'e.csv', config, 'user-1');
      const second = await service.importData(ORG, buffer, 'e.csv', config, 'user-1');

      expect(first.created).toBe(1);
      expect(second.created).toBe(0);
      expect(second.skipped).toBe(1);
      expect(expenses.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('payment accounts must be bank/cash', () => {
    it('rejects a payment whose account fails the shared bank/cash rule before posting', async () => {
      prisma.account.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.AND ? null : { id: `acc-${where.code}` }),
      );
      await expect(
        importRowKeyed(
          'PAYMENTS_MADE',
          {
            vendorEmail: 'v@x.com',
            date: '2026-03-05',
            amount: '40',
            paymentMode: 'CASH',
            paidFromAccountCode: '6000',
            billNumber: 'BILL-1',
          },
          'k',
        ),
      ).rejects.toThrow(/bank or cash/);
      await expect(
        importRowKeyed(
          'PAYMENTS_RECEIVED',
          {
            customerEmail: 'c@x.com',
            date: '2026-03-05',
            amount: '40',
            paymentMode: 'CASH',
            depositAccountCode: '4000',
            invoiceNumber: 'INV-1',
          },
          'k',
        ),
      ).rejects.toThrow(/bank or cash/);
      expect(paymentsMade.create).not.toHaveBeenCalled();
      expect(paymentsReceived.create).not.toHaveBeenCalled();
    });
  });

  describe('validateImport requirements', () => {
    const csv = (header: string[], row: string[]): Buffer =>
      Buffer.from([header.join(','), row.join(','), ''].join('\n'));
    const mappings = (cols: string[]): never =>
      cols.map((c) => ({ sourceColumn: c, targetField: c })) as never;

    it('requires the allocation column of payments up-front', async () => {
      const cols = ['vendorEmail', 'date', 'amount', 'paymentMode', 'paidFromAccountCode'];
      const result = await service.validateImport(
        ORG,
        csv(cols, ['v@x.com', '2026-03-05', '40', 'CASH', '1000']),
        'p.csv',
        {
          entityType: ImportEntityType.PAYMENTS_MADE,
          columnMappings: mappings(cols),
          skipRows: 0,
        } as never,
      );
      expect(result.valid).toBe(false);
      expect(result.errors.map((e) => e.field)).toContain('billNumber');
    });

    it('requires invoiceNumber for payments received', async () => {
      const cols = ['customerEmail', 'date', 'amount', 'paymentMode', 'depositAccountCode'];
      const result = await service.validateImport(
        ORG,
        csv(cols, ['c@x.com', '2026-03-05', '40', 'CASH', '1000']),
        'p.csv',
        {
          entityType: ImportEntityType.PAYMENTS_RECEIVED,
          columnMappings: mappings(cols),
          skipRows: 0,
        } as never,
      );
      expect(result.errors.map((e) => e.field)).toContain('invoiceNumber');
    });

    it('requires refundAccountCode for REFUND credit notes only', async () => {
      const cols = ['customerEmail', 'invoiceNumber', 'date', 'amount', 'type'];
      const run = (type: string) =>
        service.validateImport(
          ORG,
          csv(cols, ['c@x.com', 'INV-1', '2026-03-05', '10', type]),
          'c.csv',
          {
            entityType: ImportEntityType.CREDIT_NOTES,
            columnMappings: mappings(cols),
            skipRows: 0,
          } as never,
        );
      const refund = await run('REFUND');
      expect(refund.errors.map((e) => e.field)).toContain('refundAccountCode');
      const apply = await run('APPLY_TO_INVOICE');
      expect(apply.errors.map((e) => e.field)).not.toContain('refundAccountCode');
    });
  });

  describe('assertCanImport', () => {
    const role = (name: string, permissions: Array<{ module: string; actions: string[] }>) =>
      prisma.role.findUnique.mockResolvedValue({ id: 'r1', name, permissions });

    it('requires the single-record create permission as well as settings.manage', async () => {
      role('Accountant', [{ module: 'settings', actions: ['manage'] }]);
      await expect(service.assertCanImport('r1', ImportEntityType.EXPENSES)).rejects.toThrow(
        /Missing permission: purchases\.create/,
      );
      role('Accountant', [{ module: 'purchases', actions: ['create'] }]);
      await expect(service.assertCanImport('r1', ImportEntityType.BILLS)).rejects.toThrow(
        /settings\.manage/,
      );
      role('Clerk', []);
      await expect(service.assertCanImport('r1', ImportEntityType.INVOICES)).rejects.toThrow(
        /sales\.create, settings\.manage/,
      );
    });

    it('passes with both permissions and for admins, and rejects an unknown role', async () => {
      role('Accountant', [
        { module: 'sales', actions: ['create', 'view'] },
        { module: 'settings', actions: ['manage'] },
      ]);
      await expect(
        service.assertCanImport('r1', ImportEntityType.CREDIT_NOTES),
      ).resolves.toBeUndefined();
      role('Admin', []);
      await expect(
        service.assertCanImport('r1', ImportEntityType.VENDOR_CREDITS),
      ).resolves.toBeUndefined();
      prisma.role.findUnique.mockResolvedValue(null);
      await expect(service.assertCanImport('r1', ImportEntityType.EXPENSES)).rejects.toThrow(
        /Access denied/,
      );
    });
  });
});
