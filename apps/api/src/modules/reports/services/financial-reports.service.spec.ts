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
});
