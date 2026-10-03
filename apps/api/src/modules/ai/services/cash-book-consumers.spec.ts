import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { BankAccountsService } from '../../banking/services/bank-accounts.service';
import { AiForecastingService } from './ai-forecasting.service';
import { AiInsightsService } from './ai-insights.service';
import { CashFlowPredictionService } from './cash-flow-prediction.service';
import { FinancialNarrativeService } from './financial-narrative.service';
import { AiCacheService } from './ai-cache.service';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import { PaymentPredictionService } from './payment-prediction.service';
import { getQueryTemplate } from '../templates/query-templates';

const ORG = 'org-1';

function fixture() {
  const prisma = createMockPrisma();
  const banks = [
    { id: 'b1', name: 'Main', linkedAccountId: 'large-positive' },
    { id: 'b2', name: 'Overdraft', linkedAccountId: 'large-negative' },
    { id: 'b3', name: 'Fraction', linkedAccountId: 'fraction' },
    { id: 'b4', name: 'Duplicate register', linkedAccountId: 'fraction' },
  ];
  prisma.bankAccount.findMany.mockResolvedValue(banks as never);
  prisma.bankTransaction.count.mockResolvedValue(0);
  prisma.journalLine.groupBy.mockResolvedValue([
    {
      accountId: 'large-positive',
      _sum: { debit: new Decimal('999999999999999.0001'), credit: new Decimal(0) },
    },
    {
      accountId: 'large-negative',
      _sum: { debit: new Decimal(0), credit: new Decimal('999999999999999.0000') },
    },
    { accountId: 'fraction', _sum: { debit: new Decimal('0.4999'), credit: new Decimal(0) } },
  ] as never);
  prisma.invoice.aggregate.mockResolvedValue({
    _sum: { grandTotal: new Decimal(0) },
    _count: 0,
  } as never);
  prisma.bill.aggregate.mockResolvedValue({
    _sum: { grandTotal: new Decimal(0) },
    _count: 0,
  } as never);
  prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: new Decimal(0) } } as never);
  prisma.invoice.groupBy.mockResolvedValue([] as never);
  prisma.customer.findMany.mockResolvedValue([]);
  const db = prisma as unknown as PrismaService;
  const gateway = {
    isAvailable: jest.fn().mockResolvedValue(false),
  } as unknown as OllamaInferenceGateway;
  const cache = { getOrSet: jest.fn() } as unknown as AiCacheService;
  return {
    prisma,
    db,
    narrative: new FinancialNarrativeService(db, gateway, cache),
    prediction: new CashFlowPredictionService(db, {} as PaymentPredictionService, gateway),
  };
}

describe('cash consumers share Decimal totals over unique linked accounts', () => {
  it('the cash-position query also counts linked accounts once and sends decimal strings', async () => {
    const { db } = fixture();
    const template = getQueryTemplate('cash-position');
    expect(template).toBeDefined();
    const data = await template!.execute(db, ORG);
    expect(data).toMatchObject({
      totalCash: '0.5000',
      accountCount: 4,
      outstandingAR: '0.0000',
      outstandingAP: '0.0000',
      accounts: expect.arrayContaining([expect.objectContaining({ balance: '0.4999' })]),
    });
    expect(template!.render(data)).toContain('Current cash: $0.50 across 4 accounts');
  });

  it('banking transports the exact total as a 4-dp string and retains the register count', async () => {
    const { db } = fixture();
    expect(await new BankAccountsService(db).getDashboardStats(ORG)).toMatchObject({
      totalAccounts: 4,
      totalSystemBalance: '0.5000',
    });
  });

  it('forecasting converts the exact aggregate once at its numeric adapter boundary', async () => {
    const { db } = fixture();
    expect((await new AiForecastingService(db).forecastCashFlow(ORG, 0)).currentBalance).toBe(0.5);
  });

  it('insights get the exact days-of-cash baseline', async () => {
    const { db } = fixture();
    expect(await new AiInsightsService(db)['getTotalBankBalance'](ORG)).toBe(0.5);
  });

  it('simulation gets the exact baseline', async () => {
    const { prediction } = fixture();
    expect(await prediction['getCurrentCashBalance'](ORG)).toBe(0.5);
  });

  it('current cash narrative formats the exact aggregate and preserves every bank metric', async () => {
    const { narrative } = fixture();
    const result = await narrative.generateCashFlowNarrative(ORG);
    const cash = result.sections.find((section) => section.id === 'cash-on-hand');
    expect(cash?.content).toBe('Total cash across 4 accounts: $1.');
    expect(cash?.metrics).toHaveLength(4);
  });

  it('keeps cash and payable money in Decimal until net position is formatted', async () => {
    const { narrative, prisma } = fixture();
    prisma.journalLine.groupBy.mockResolvedValue([
      {
        accountId: 'large-positive',
        _sum: { debit: new Decimal('999999999999999.0001'), credit: new Decimal(0) },
      },
      { accountId: 'fraction', _sum: { debit: new Decimal('0.4998'), credit: new Decimal(0) } },
    ] as never);
    prisma.bill.aggregate.mockResolvedValue({
      _sum: { grandTotal: new Decimal('999999999999999.0001') },
    } as never);
    const result = await narrative.generateCashFlowNarrative(ORG);
    expect(result.summary).toContain('Net position (cash + AR - AP): $0.');
  });

  it.each([
    [2, 2024, '2024-02-29T23:59:59.999Z'],
    [12, 2025, '2025-12-31T23:59:59.999Z'],
    [2, 2025, '2025-02-28T23:59:59.999Z'],
  ])('monthly cash for %s/%s uses the inclusive UTC cutoff %s', async (month, year, cutoff) => {
    const { narrative, prisma } = fixture();
    const data = await narrative['fetchMonthData'](ORG, month, year);
    expect(data.cashBalance).toBe(0.5);
    expect(prisma.journalLine.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          journal: {
            organizationId: ORG,
            isPosted: true,
            deletedAt: null,
            date: { lte: new Date(cutoff) },
          },
        }),
      }),
    );
    expect(prisma.invoice.aggregate.mock.calls[0][0]?.where?.date).toEqual({
      gte: new Date(Date.UTC(year, month - 1, 1)),
      lte: new Date(cutoff),
    });
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: { id: { in: [] }, organizationId: ORG },
      select: { id: true, name: true },
    });
  });
});
