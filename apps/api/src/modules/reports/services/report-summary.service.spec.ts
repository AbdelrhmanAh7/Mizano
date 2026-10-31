import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiGatewayService } from '../../ai/account/ai-gateway.service';
import { AiSettingsService } from '../../ai/account/ai-settings.service';
import { FinancialReportsService } from './financial-reports.service';
import { previousMonth, ReportSummaryService } from './report-summary.service';

function build(organizationsWithSummary: string[]) {
  const prisma = {
    aIInsight: {
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockReturnValue('delete'),
      create: jest.fn().mockReturnValue('create'),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const reports = {
    getProfitAndLoss: jest.fn().mockResolvedValue({
      currencyCode: 'EGP',
      totalIncome: '1000.0000',
      totalExpenses: '400.0000',
      grossProfit: '600.0000',
      netProfit: '600.0000',
      netProfitMargin: 60,
      income: [{ name: 'Sales', balance: '1000.0000' }],
      expenses: [{ name: 'Rent', balance: '400.0000' }],
    }),
  };
  const gateway = {
    run: jest.fn().mockResolvedValue({
      data: { en: 'Income was 1,000 EGP.', ar: 'بلغ الدخل ١٬٠٠٠ جنيه.' },
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
    }),
  };
  const settings = { organizationsUsing: jest.fn().mockResolvedValue(organizationsWithSummary) };
  const service = new ReportSummaryService(
    prisma as unknown as PrismaService,
    reports as unknown as FinancialReportsService,
    gateway as unknown as AiGatewayService,
    settings as unknown as AiSettingsService,
  );
  return { service, prisma, reports, gateway, settings };
}

describe('ReportSummaryService monthly job', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('does no per-organization work when no organization turned the summary on', async () => {
    const { service, settings, reports, gateway, prisma } = build([]);
    await expect(service.prepareLastMonth()).resolves.toEqual({
      prepared: 0,
      skipped: 0,
      failed: 0,
    });
    expect(settings.organizationsUsing).toHaveBeenCalledWith('summary');
    expect(reports.getProfitAndLoss).not.toHaveBeenCalled();
    expect(gateway.run).not.toHaveBeenCalled();
    expect(prisma.aIInsight.findFirst).not.toHaveBeenCalled();
  });

  it('writes last month once for an opted-in organization, sending report totals only', async () => {
    const { service, reports, gateway } = build(['org-1']);
    await expect(service.prepareLastMonth()).resolves.toEqual({
      prepared: 1,
      skipped: 0,
      failed: 0,
    });
    const month = previousMonth();
    expect(reports.getProfitAndLoss).toHaveBeenCalledWith(
      'org-1',
      `${month}-01`,
      expect.any(String),
    );
    const call = gateway.run.mock.calls[0][0];
    expect(call).toMatchObject({ organizationId: 'org-1', feature: 'summary' });
    const sent = JSON.stringify(call.parts({ images: true, pdf: true }));
    expect(sent).toContain('totalIncome');
    expect(sent).toContain('Rent');
  });

  it('previousMonth crosses the year boundary', () => {
    expect(previousMonth(new Date(Date.UTC(2027, 0, 15)))).toBe('2026-12');
    expect(previousMonth(new Date(Date.UTC(2026, 9, 31)))).toBe('2026-09');
  });
});
