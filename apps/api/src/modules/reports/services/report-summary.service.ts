import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { describeError } from '../../../common/utils/redact';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiGatewayService } from '../../ai/account/ai-gateway.service';
import { AiSettingsService } from '../../ai/account/ai-settings.service';
import { FinancialReportsService, StatementAccountLine } from './financial-reports.service';

const INSIGHT_TYPE = 'MONTHLY_SUMMARY';
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const TOP_LINES = 8;

const SUMMARY_SCHEMA = z.object({
  en: z.string().trim().min(1).max(2500),
  ar: z.string().trim().min(1).max(2500),
});

const SYSTEM = `You explain a small business's monthly profit and loss to its owner in plain language.
Use only the figures given; never invent numbers, causes or advice that the figures do not support.
Write 3 to 5 short sentences: income, expenses, the result, and the largest items. Mention the currency.
Answer with one JSON object: {"en": "<English text>", "ar": "<the same summary in Arabic>"}.`;

export interface MonthlySummary {
  month: string;
  en: string;
  ar: string;
  provider: string;
  model: string;
  generatedAt: string;
}

function monthRange(month: string): { start: string; end: string } {
  const match = MONTH.exec(month);
  if (!match) throw new BadRequestException('month must be YYYY-MM');
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** The previous calendar month (UTC) as YYYY-MM. */
export function previousMonth(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const top = (lines: StatementAccountLine[]) =>
  [...lines]
    .sort((a, b) => new Decimal(b.balance).abs().comparedTo(new Decimal(a.balance).abs()))
    .slice(0, TOP_LINES)
    .map((l) => ({ account: l.name, amount: l.balance }));

/**
 * The opt-in `summary` AI feature: a plain-language paragraph about one month's P&L, written by
 * the organization's own provider. Only report totals and account names are sent, never
 * customers, vendors or documents. Stored as an AI insight so it is written once per month.
 */
@Injectable()
export class ReportSummaryService {
  private readonly logger = new Logger(ReportSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: FinancialReportsService,
    private readonly gateway: AiGatewayService,
    private readonly aiSettings: AiSettingsService,
  ) {}

  async get(organizationId: string, month: string): Promise<MonthlySummary | null> {
    monthRange(month);
    const row = await this.prisma.aIInsight.findFirst({
      where: { organizationId, type: INSIGHT_TYPE, title: month },
      orderBy: { createdAt: 'desc' },
      select: { data: true },
    });
    const parsed = z
      .object({
        month: z.string(),
        en: z.string(),
        ar: z.string(),
        provider: z.string(),
        model: z.string(),
        generatedAt: z.string(),
      })
      .safeParse(row?.data);
    return parsed.success ? parsed.data : null;
  }

  async generate(organizationId: string, month: string, userId?: string): Promise<MonthlySummary> {
    const { start, end } = monthRange(month);
    const pnl = await this.reports.getProfitAndLoss(organizationId, start, end);
    const facts = {
      month,
      currency: pnl.currencyCode,
      totalIncome: pnl.totalIncome,
      totalExpenses: pnl.totalExpenses,
      grossProfit: pnl.grossProfit,
      netProfit: pnl.netProfit,
      netProfitMarginPercent: pnl.netProfitMargin,
      largestIncome: top(pnl.income),
      largestExpenses: top(pnl.expenses),
    };
    const result = await this.gateway.run({
      organizationId,
      userId,
      feature: 'summary',
      system: SYSTEM,
      parts: () => [{ type: 'text', text: JSON.stringify(facts) }],
      maxOutputTokens: 1200,
      schema: SUMMARY_SCHEMA,
    });
    const summary: MonthlySummary = {
      month,
      en: result.data.en,
      ar: result.data.ar,
      provider: result.provider,
      model: result.model,
      generatedAt: new Date().toISOString(),
    };
    await this.prisma.$transaction([
      this.prisma.aIInsight.deleteMany({
        where: { organizationId, type: INSIGHT_TYPE, title: month },
      }),
      this.prisma.aIInsight.create({
        data: {
          organizationId,
          type: INSIGHT_TYPE,
          title: month,
          description: summary.en,
          severity: 'info',
          data: summary as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    return summary;
  }

  /**
   * On the 2nd of each month, last month's summary for the organizations that turned the
   * feature on. Organizations without AI are never touched: the list comes from one query on
   * the AI settings. One organization at a time, so the Pi stays responsive.
   */
  @Cron('17 6 2 * *', { name: 'ai-monthly-summary' })
  async prepareLastMonth(): Promise<{ prepared: number; skipped: number; failed: number }> {
    const month = previousMonth();
    const organizationIds = await this.aiSettings.organizationsUsing('summary');
    const outcome = { prepared: 0, skipped: 0, failed: 0 };
    for (const organizationId of organizationIds) {
      try {
        if (await this.get(organizationId, month)) {
          outcome.skipped++;
          continue;
        }
        await this.generate(organizationId, month);
        outcome.prepared++;
      } catch (error) {
        outcome.failed++;
        this.logger.warn(
          `Monthly AI summary failed for org ${organizationId}: ${describeError(error, { includeMessage: false })}`,
        );
      }
    }
    this.logger.log(
      `Monthly AI summary ${month}: organizations=${organizationIds.length} prepared=${outcome.prepared} skipped=${outcome.skipped} failed=${outcome.failed}`,
    );
    return outcome;
  }
}
