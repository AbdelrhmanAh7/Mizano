import { AccountType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { FinancialReportsService } from './financial-reports.service';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG_ID = 'org-test-001';

interface TestAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
}

const ACCOUNTS: TestAccount[] = [
  { id: 'acc-cash', code: '1000', name: 'Cash', type: AccountType.ASSET },
  { id: 'acc-ap', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY },
  { id: 'acc-vat', code: '2200', name: 'VAT Payable', type: AccountType.LIABILITY },
  { id: 'acc-stl', code: '2500', name: 'Short-term Loans', type: AccountType.LIABILITY },
  { id: 'acc-loc', code: '2510', name: 'Line of Credit', type: AccountType.LIABILITY },
  { id: 'acc-ltl', code: '2600', name: 'Long-term Loans', type: AccountType.LIABILITY },
];

type Movement = { accountId: string; debit: number; credit: number };

describe('FinancialReportsService', () => {
  let prisma: MockPrismaClient;
  let service: FinancialReportsService;

  function arrange(movements: Movement[]): void {
    prisma.organization.findUnique.mockResolvedValue({
      baseCurrency: 'USD',
      currency: 'USD',
      defaultBankAccountId: null,
      defaultCashAccountId: 'acc-cash',
      defaultArAccountId: null,
      defaultApAccountId: 'acc-ap',
      fiscalYearStartMonth: 1,
    } as never);
    prisma.bankAccount.findMany.mockResolvedValue([] as never);
    prisma.account.findMany.mockImplementation((async (args: {
      where?: { subType?: unknown; id?: unknown };
    }) => {
      if (args?.where?.subType) return [{ id: 'acc-cash' }];
      if (args?.where?.id) return [{ id: 'acc-cash' }];
      return ACCOUNTS;
    }) as never);
    prisma.journalLine.groupBy.mockImplementation((async (args: {
      where: { journal: { date?: { lt?: Date } } };
    }) => {
      // Opening-balance query uses `date: { lt }`; the period query uses `gte/lte`.
      if (args.where.journal.date?.lt) return [];
      return movements.map((m) => ({
        accountId: m.accountId,
        _sum: { debit: new Decimal(m.debit), credit: new Decimal(m.credit) },
      }));
    }) as never);
  }

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new FinancialReportsService(prisma as unknown as ReadReplicaService);
  });

  describe('getCashFlowStatement', () => {
    it('classifies short-term loans (2500) and line of credit (2510) as financing debt, not operating', async () => {
      arrange([
        { accountId: 'acc-cash', debit: 1800, credit: 0 },
        { accountId: 'acc-stl', debit: 0, credit: 1000 },
        { accountId: 'acc-loc', debit: 0, credit: 300 },
        { accountId: 'acc-ltl', debit: 0, credit: 500 },
      ]);

      const report = await service.getCashFlowStatement(ORG_ID, '2026-01-01', '2026-12-31');

      expect(report.financing.debtChanges).toBe('1800.0000');
      expect(report.financing.netCashFromFinancing).toBe('1800.0000');
      expect(report.operating.adjustments.otherOperatingChanges).toBe('0.0000');
      expect(report.operating.netCashFromOperating).toBe('0.0000');
      expect(report.netCashChange).toBe('1800.0000');
      expect(report.reconciliation.variance).toBe('0.0000');
    });

    it('repaying a 2500 short-term loan is a negative financing movement', async () => {
      arrange([
        { accountId: 'acc-cash', debit: 0, credit: 400 },
        { accountId: 'acc-stl', debit: 400, credit: 0 },
      ]);

      const report = await service.getCashFlowStatement(ORG_ID, '2026-01-01', '2026-12-31');

      expect(report.financing.debtChanges).toBe('-400.0000');
      expect(report.operating.adjustments.otherOperatingChanges).toBe('0.0000');
      expect(report.reconciliation.variance).toBe('0.0000');
    });

    it('keeps non-debt current liabilities such as VAT payable in other operating changes', async () => {
      arrange([
        { accountId: 'acc-cash', debit: 150, credit: 0 },
        { accountId: 'acc-vat', debit: 0, credit: 150 },
      ]);

      const report = await service.getCashFlowStatement(ORG_ID, '2026-01-01', '2026-12-31');

      expect(report.financing.debtChanges).toBe('0.0000');
      expect(report.operating.adjustments.otherOperatingChanges).toBe('150.0000');
      expect(report.reconciliation.variance).toBe('0.0000');
    });
  });

  describe('getBalanceSheet', () => {
    it('keeps 2500 short-term loans current while 2600 long-term loans is non-current', async () => {
      arrange([
        { accountId: 'acc-cash', debit: 1500, credit: 0 },
        { accountId: 'acc-stl', debit: 0, credit: 1000 },
        { accountId: 'acc-ltl', debit: 0, credit: 500 },
      ]);

      const report = await service.getBalanceSheet(ORG_ID, '2026-06-30');

      expect(report.liabilities.current.accounts.map((a) => a.code)).toEqual(['2500']);
      expect(report.liabilities.longTerm.accounts.map((a) => a.code)).toEqual(['2600']);
      expect(report.liabilities.current.total).toBe('1000.0000');
      expect(report.liabilities.longTerm.total).toBe('500.0000');
      expect(report.isBalanced).toBe(true);
    });
  });
  describe('getSalesByCustomer (#666)', () => {
    // Golden scenario C03 + C09: INV-0001 2 x 100 + 14% VAT = 228.00 paid 100 + 128; INV-0002
    // 500 + 14% VAT = 570.00 with CN-001 114.00 (100 + 14 VAT) applied to it.
    beforeEach(() => {
      prisma.organization.findUnique.mockResolvedValue({
        baseCurrency: 'EGP',
        currency: 'EGP',
        defaultVatPayableAccountId: 'acc-vat',
      } as never);
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          customerId: 'cust-nile',
          grandTotal: new Decimal('228'),
          taxAmount: new Decimal('28'),
          balanceDue: new Decimal('0'),
          currencyCode: 'EGP',
          customer: { id: 'cust-nile', name: 'Nile Dental Clinic' },
        },
        {
          id: 'inv-2',
          customerId: 'cust-nile',
          grandTotal: new Decimal('570'),
          taxAmount: new Decimal('70'),
          balanceDue: new Decimal('456'),
          currencyCode: 'EGP',
          customer: { id: 'cust-nile', name: 'Nile Dental Clinic' },
        },
      ] as never);
      prisma.creditNote.findMany.mockResolvedValue([
        {
          id: 'cn-1',
          customerId: 'cust-nile',
          amount: new Decimal('114'),
          customer: { id: 'cust-nile', name: 'Nile Dental Clinic' },
          invoice: { currencyCode: 'EGP' },
        },
      ] as never);
      prisma.paymentAllocation.findMany.mockResolvedValue([
        { invoiceId: 'inv-1', amount: new Decimal('100') },
        { invoiceId: 'inv-1', amount: new Decimal('128') },
      ] as never);
      prisma.journalLine.findMany.mockResolvedValue([
        { debit: new Decimal('14'), journal: { sourceId: 'cn-1' } },
      ] as never);
    });

    it('reports net sales without VAT less credit notes, and cash received as paid', async () => {
      const report = await service.getSalesByCustomer(ORG_ID, '2026-01-01', '2026-11-30');

      expect(report.entries).toEqual([
        {
          customerId: 'cust-nile',
          customerName: 'Nile Dental Clinic',
          invoiceCount: 2,
          totalAmount: '600.0000',
          paidAmount: '228.0000',
          balanceDue: '456.0000',
          currencyCode: 'EGP',
        },
      ]);
      expect(report.totalAmount).toBe('600.0000');
      expect(report.totalPaid).toBe('228.0000');
      expect(report.totalBalance).toBe('456.0000');
    });

    it('reads only this organization and the credit notes posted VAT', async () => {
      await service.getSalesByCustomer(ORG_ID, '2026-01-01', '2026-11-30');

      expect(prisma.creditNote.findMany.mock.calls[0][0]?.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
        invoice: { organizationId: ORG_ID },
      });
      expect(prisma.paymentAllocation.findMany.mock.calls[0][0]?.where).toMatchObject({
        invoiceId: { in: ['inv-1', 'inv-2'] },
        invoice: { organizationId: ORG_ID },
        payment: { organizationId: ORG_ID, deletedAt: null },
      });
      expect(prisma.journalLine.findMany.mock.calls[0][0]?.where).toMatchObject({
        accountId: 'acc-vat',
        journal: { organizationId: ORG_ID, sourceType: 'CREDIT_NOTE', sourceId: { in: ['cn-1'] } },
      });
    });
  });
});
