import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { queryTemplates, getQueryTemplate } from '../templates/query-templates';
import { Decimal } from '@prisma/client/runtime/library';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  buildFinancialNarrativePrompt,
  FinancialNarrativeResponse,
} from '../prompts/forecasting.prompts';
import { PredictionMethod } from '../types/prediction-method.type';

export interface NarrativeSection {
  id: string;
  title: string;
  content: string;
  metrics?: Array<{ label: string; value: string; trend?: 'up' | 'down' | 'neutral' }>;
}

export interface NarrativeAlert {
  type: 'warning' | 'info' | 'opportunity';
  message: string;
  severity?: 'low' | 'medium' | 'high';
}

export interface GeneratedNarrative {
  title: string;
  period: string;
  generatedAt: Date;
  sections: NarrativeSection[];
  alerts: NarrativeAlert[];
  recommendations: string[];
  summary: string;
  predictionMethod?: PredictionMethod;
}

export interface QueryAnswer {
  queryId: string;
  question: string;
  answer: string;
  data: unknown;
  chartType?: 'bar' | 'line' | 'pie' | 'table' | 'metric';
}

interface MonthlyFinancials {
  revenue: number;
  prevRevenue: number;
  expenses: number;
  prevExpenses: number;
  netIncome: number;
  prevNetIncome: number;
  topRevenueDrivers: Array<{ name: string; amount: number; percent: number }>;
  topExpenseIncreases: Array<{ category: string; amount: number; percent: number }>;
  overdueAR: number;
  overdueAP: number;
  cashBalance: number;
  cashDaysRemaining: number;
  earlyPaymentDiscounts: number;
  invoiceCount: number;
  billCount: number;
}

@Injectable()
export class FinancialNarrativeService {
  private readonly logger = new Logger(FinancialNarrativeService.name);

  constructor(
    private prisma: PrismaService,
    private ollamaGateway: OllamaInferenceGateway,
  ) {}

  /**
   * Generate monthly financial narrative
   */
  async generateMonthlyNarrative(
    organizationId: string,
    month: number,
    year: number,
  ): Promise<GeneratedNarrative> {
    // Fetch data for current and previous month
    const currentData = await this.fetchMonthData(organizationId, month, year);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevData = await this.fetchMonthData(organizationId, prevMonth, prevYear);

    // Combine data
    const data: MonthlyFinancials = {
      ...currentData,
      prevRevenue: prevData.revenue,
      prevExpenses: prevData.expenses,
      prevNetIncome: prevData.netIncome,
    };

    const monthName = new Date(year, month - 1).toLocaleString('default', {
      month: 'long',
    });

    // Try Ollama FIRST for rich narrative generation
    try {
      const margin = data.revenue > 0 ? data.netIncome / data.revenue : 0;
      const revenueGrowth =
        data.prevRevenue > 0 ? (data.revenue - data.prevRevenue) / data.prevRevenue : 0;
      const expenseGrowth =
        data.prevExpenses > 0 ? (data.expenses - data.prevExpenses) / data.prevExpenses : 0;

      const promptData = buildFinancialNarrativePrompt({
        period: `${monthName} ${year}`,
        currency: 'USD',
        revenue: data.revenue,
        expenses: data.expenses,
        net_income: data.netIncome,
        operating_margin: margin,
        cash_balance: data.cashBalance,
        accounts_receivable: data.overdueAR,
        accounts_payable: data.overdueAP,
        revenue_growth: revenueGrowth,
        expense_growth: expenseGrowth,
        top_customers: data.topRevenueDrivers.map((d) => ({
          name: d.name,
          revenue: d.amount,
        })),
        prior_period: {
          revenue: data.prevRevenue,
          expenses: data.prevExpenses,
          net_income: data.prevNetIncome,
          cash_balance: undefined,
        },
      });

      const ollamaResult = await this.ollamaGateway.infer<FinancialNarrativeResponse>(
        promptData.user,
        { systemPrompt: promptData.system },
      );

      if (ollamaResult?.data) {
        const ollamaData = ollamaResult.data;

        // Map Ollama sections to NarrativeSection format
        const sections: NarrativeSection[] = (ollamaData.sections || []).map((s, index) => ({
          id: `ollama-section-${index}`,
          title: s.title || '',
          content: s.content || '',
          metrics: s.metrics
            ? Object.entries(s.metrics).map(([label, value]) => ({
                label,
                value: String(value),
              }))
            : undefined,
        }));

        // Map Ollama alerts
        const alerts: NarrativeAlert[] = (ollamaData.alerts || []).map((a) => ({
          type: (a.type === 'critical' || a.type === 'warning'
            ? a.type
            : a.type === 'positive'
              ? 'info'
              : 'info') as 'warning' | 'info' | 'opportunity',
          message: a.message || '',
          severity: (a.severity as 'low' | 'medium' | 'high') || 'medium',
        }));

        // Build recommendations from KPIs and alerts
        const recommendations: string[] = [];
        for (const alert of ollamaData.alerts || []) {
          if (alert.type === 'warning' || alert.type === 'critical') {
            recommendations.push(alert.message);
          }
        }

        const result: GeneratedNarrative = {
          title: `Financial Summary - ${monthName} ${year}`,
          period: `${monthName} ${year}`,
          generatedAt: new Date(),
          sections,
          alerts,
          recommendations,
          summary: ollamaData.executive_summary || this.generateSummary(data),
          predictionMethod: 'OLLAMA',
        };

        return result;
      }
    } catch (error) {
      this.logger.debug(
        `Ollama narrative generation unavailable, falling back to templates: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Fallback: existing template-based generation
    const sections: NarrativeSection[] = [];
    const alerts: NarrativeAlert[] = [];
    const recommendations: string[] = [];

    // Revenue section
    sections.push(this.generateRevenueSection(data));

    // Expense section
    sections.push(this.generateExpenseSection(data));

    // Margin section
    if (data.revenue > 0) {
      sections.push(this.generateMarginSection(data));
    }

    // Cash flow section
    sections.push(this.generateCashSection(data));

    // Generate alerts
    this.generateAlerts(data, alerts);

    // Generate recommendations
    this.generateRecommendations(data, recommendations);

    // Generate summary
    const summary = this.generateSummary(data);

    return {
      title: `Financial Summary - ${monthName} ${year}`,
      period: `${monthName} ${year}`,
      generatedAt: new Date(),
      sections,
      alerts,
      recommendations,
      summary,
      predictionMethod: 'RULE_BASED',
    };
  }

  /**
   * Generate weekly snapshot
   */
  async generateWeeklySnapshot(
    organizationId: string,
    weekStartDate?: Date,
  ): Promise<GeneratedNarrative> {
    const startDate = weekStartDate || this.getWeekStart(new Date());
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59);

    // Fetch week data
    const [invoices, payments, expenses, bills] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
          status: { not: 'DRAFT' },
        },
        _sum: { grandTotal: true },
        _count: true,
      }),
      this.prisma.paymentReceived.aggregate({
        where: {
          organizationId,
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({
        where: {
          organizationId,
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.bill.aggregate({
        where: {
          organizationId,
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
        _sum: { grandTotal: true },
        _count: true,
      }),
    ]);

    const invoicesTotal = Number(invoices._sum.grandTotal) || 0;
    const paymentsTotal = Number(payments._sum.amount) || 0;
    const expensesTotal = Number(expenses._sum.amount) || 0;
    const billsTotal = Number(bills._sum.grandTotal) || 0;
    const netCashFlow = paymentsTotal - expensesTotal - billsTotal;

    const sections: NarrativeSection[] = [
      {
        id: 'invoices',
        title: 'Invoices Sent',
        content: `Sent ${invoices._count} invoice${invoices._count !== 1 ? 's' : ''} totaling ${this.formatCurrency(invoicesTotal)}.`,
        metrics: [
          { label: 'Count', value: invoices._count.toString() },
          { label: 'Total', value: this.formatCurrency(invoicesTotal) },
        ],
      },
      {
        id: 'payments',
        title: 'Payments Received',
        content: `Received ${payments._count} payment${payments._count !== 1 ? 's' : ''} totaling ${this.formatCurrency(paymentsTotal)}.`,
        metrics: [
          { label: 'Count', value: payments._count.toString() },
          { label: 'Total', value: this.formatCurrency(paymentsTotal) },
        ],
      },
      {
        id: 'expenses',
        title: 'Expenses',
        content: `Recorded ${expenses._count + bills._count} expense${expenses._count + bills._count !== 1 ? 's' : ''} totaling ${this.formatCurrency(expensesTotal + billsTotal)}.`,
        metrics: [
          { label: 'Count', value: (expenses._count + bills._count).toString() },
          { label: 'Total', value: this.formatCurrency(expensesTotal + billsTotal) },
        ],
      },
      {
        id: 'cash-flow',
        title: 'Net Cash Flow',
        content: `Net cash flow for the week: ${this.formatCurrency(netCashFlow)} (${netCashFlow >= 0 ? 'positive' : 'negative'}).`,
        metrics: [
          {
            label: 'Net',
            value: this.formatCurrency(netCashFlow),
            trend: netCashFlow >= 0 ? 'up' : 'down',
          },
        ],
      },
    ];

    const weekEnd = endDate.toLocaleDateString('default', {
      month: 'short',
      day: 'numeric',
    });
    const weekStart = startDate.toLocaleDateString('default', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return {
      title: `Weekly Snapshot`,
      period: `${weekStart} - ${weekEnd}`,
      generatedAt: new Date(),
      sections,
      alerts: [],
      recommendations: [],
      summary: `This week: ${invoices._count} invoices (${this.formatCurrency(invoicesTotal)}), ${payments._count} payments (${this.formatCurrency(paymentsTotal)}), net cash flow ${this.formatCurrency(netCashFlow)}.`,
    };
  }

  /**
   * Generate customer-specific narrative
   */
  async generateCustomerNarrative(
    organizationId: string,
    customerId: string,
  ): Promise<GeneratedNarrative> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Get customer metrics
    const [totalRevenue, openInvoices, paidInvoices] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { organizationId, customerId, deletedAt: null },
        _sum: { grandTotal: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          customerId,
          deletedAt: null,
          status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
        },
        _sum: { grandTotal: true },
        _count: true,
      }),
      this.prisma.invoice.count({
        where: { organizationId, customerId, deletedAt: null, status: 'PAID' },
      }),
    ]);

    const lifetimeValue = Number(totalRevenue._sum.grandTotal) || 0;
    const openAR = Number(openInvoices._sum.grandTotal) || 0;
    const invoiceCount = openInvoices._count + paidInvoices;

    // Check overdue
    const overdueCount = await this.prisma.invoice.count({
      where: {
        organizationId,
        customerId,
        deletedAt: null,
        status: 'OVERDUE',
      },
    });

    const sections: NarrativeSection[] = [
      {
        id: 'overview',
        title: 'Customer Overview',
        content: `${customer.name} has a lifetime value of ${this.formatCurrency(lifetimeValue)} across ${invoiceCount} invoice${invoiceCount !== 1 ? 's' : ''}.`,
        metrics: [
          { label: 'Lifetime Value', value: this.formatCurrency(lifetimeValue) },
          { label: 'Total Invoices', value: invoiceCount.toString() },
        ],
      },
      {
        id: 'receivables',
        title: 'Open Receivables',
        content:
          openAR > 0
            ? `Currently has ${this.formatCurrency(openAR)} in open receivables${overdueCount > 0 ? ` (${overdueCount} overdue)` : ''}.`
            : 'No outstanding balance.',
        metrics: [
          { label: 'Open AR', value: this.formatCurrency(openAR) },
          { label: 'Overdue', value: overdueCount.toString() },
        ],
      },
    ];

    const alerts: NarrativeAlert[] = [];
    if (overdueCount > 0) {
      alerts.push({
        type: 'warning',
        message: `${overdueCount} invoice${overdueCount > 1 ? 's are' : ' is'} overdue. Consider following up.`,
        severity: 'medium',
      });
    }

    return {
      title: `Customer Report: ${customer.name}`,
      period: 'All Time',
      generatedAt: new Date(),
      sections,
      alerts,
      recommendations: [],
      summary: `${customer.name}: ${this.formatCurrency(lifetimeValue)} lifetime value, ${this.formatCurrency(openAR)} open AR.`,
    };
  }

  /**
   * Generate item/product narrative
   */
  async generateItemNarrative(organizationId: string, itemId: string): Promise<GeneratedNarrative> {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, organizationId, deletedAt: null },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Get sales data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const salesLines = await this.prisma.invoiceLine.findMany({
      where: {
        itemId,
        invoice: {
          organizationId,
          deletedAt: null,
          date: { gte: thirtyDaysAgo },
        },
      },
      include: {
        invoice: { select: { date: true } },
      },
    });

    const totalSold = salesLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const totalRevenue = salesLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
    const avgPrice = totalSold > 0 ? totalRevenue / totalSold : Number(item.sellingPrice);

    const sections: NarrativeSection[] = [
      {
        id: 'overview',
        title: 'Item Overview',
        content: `${item.name} (SKU: ${item.sku}): ${totalSold} units sold in the last 30 days.`,
        metrics: [
          { label: 'Current Stock', value: (item.currentStock || 0).toString() },
          { label: 'Selling Price', value: this.formatCurrency(Number(item.sellingPrice)) },
        ],
      },
      {
        id: 'sales',
        title: 'Sales Performance',
        content: `Generated ${this.formatCurrency(totalRevenue)} in revenue from ${totalSold} units sold.`,
        metrics: [
          { label: 'Units Sold (30d)', value: totalSold.toString() },
          { label: 'Revenue (30d)', value: this.formatCurrency(totalRevenue) },
          { label: 'Avg Price', value: this.formatCurrency(avgPrice) },
        ],
      },
    ];

    const alerts: NarrativeAlert[] = [];
    const reorderPoint = item.reorderPoint || 10;
    if ((item.currentStock || 0) <= reorderPoint) {
      alerts.push({
        type: 'warning',
        message: `Stock level (${item.currentStock || 0}) is at or below reorder point (${reorderPoint}).`,
      });
    }

    return {
      title: `Item Report: ${item.name}`,
      period: 'Last 30 Days',
      generatedAt: new Date(),
      sections,
      alerts,
      recommendations: [],
      summary: `${item.name}: ${totalSold} units sold, ${this.formatCurrency(totalRevenue)} revenue, ${item.currentStock || 0} in stock.`,
    };
  }

  /**
   * Generate cash flow narrative
   */
  async generateCashFlowNarrative(organizationId: string): Promise<GeneratedNarrative> {
    // Get bank balances
    const bankAccounts = await this.prisma.bankAccount.findMany({
      where: { organizationId, isActive: true },
      select: { name: true, systemBalance: true },
    });

    const totalCash = bankAccounts.reduce((sum, acc) => sum + Number(acc.systemBalance || 0), 0);

    // Get AR and AP
    const [ar, ap] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.bill.aggregate({
        where: {
          organizationId,
          deletedAt: null,
          status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] },
        },
        _sum: { grandTotal: true },
      }),
    ]);

    const totalAR = Number(ar._sum.grandTotal) || 0;
    const totalAP = Number(ap._sum.grandTotal) || 0;
    const netPosition = totalCash + totalAR - totalAP;

    // Estimate burn rate from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentExpenses = await this.prisma.expense.aggregate({
      where: {
        organizationId,
        date: { gte: thirtyDaysAgo },
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    const monthlyBurn = Number(recentExpenses._sum.amount) || 0;
    const dailyBurn = monthlyBurn / 30;
    const daysRemaining = dailyBurn > 0 ? Math.floor(totalCash / dailyBurn) : 999;

    const sections: NarrativeSection[] = [
      {
        id: 'cash-on-hand',
        title: 'Cash on Hand',
        content: `Total cash across ${bankAccounts.length} account${bankAccounts.length !== 1 ? 's' : ''}: ${this.formatCurrency(totalCash)}.`,
        metrics: bankAccounts.map((acc) => ({
          label: acc.name,
          value: this.formatCurrency(Number(acc.systemBalance) || 0),
        })),
      },
      {
        id: 'receivables',
        title: 'Accounts Receivable',
        content: `Outstanding receivables: ${this.formatCurrency(totalAR)}.`,
        metrics: [{ label: 'Total AR', value: this.formatCurrency(totalAR) }],
      },
      {
        id: 'payables',
        title: 'Accounts Payable',
        content: `Outstanding payables: ${this.formatCurrency(totalAP)}.`,
        metrics: [{ label: 'Total AP', value: this.formatCurrency(totalAP) }],
      },
      {
        id: 'runway',
        title: 'Cash Runway',
        content: `At current burn rate (${this.formatCurrency(dailyBurn)}/day), cash runway is approximately ${daysRemaining} days.`,
        metrics: [
          { label: 'Daily Burn', value: this.formatCurrency(dailyBurn) },
          { label: 'Days Remaining', value: daysRemaining.toString() },
        ],
      },
    ];

    const alerts: NarrativeAlert[] = [];
    if (daysRemaining < 30) {
      alerts.push({
        type: 'warning',
        message: `Low cash runway warning: ${daysRemaining} days remaining.`,
        severity: 'high',
      });
    }

    return {
      title: 'Cash Flow Analysis',
      period: 'Current',
      generatedAt: new Date(),
      sections,
      alerts,
      recommendations:
        daysRemaining < 60
          ? [
              'Review upcoming receivables and accelerate collections',
              'Consider delaying non-essential expenses',
            ]
          : [],
      summary: `Cash position: ${this.formatCurrency(totalCash)}. Net position (cash + AR - AP): ${this.formatCurrency(netPosition)}. Runway: ${daysRemaining} days.`,
    };
  }

  /**
   * Answer a structured query
   */
  async answerQuery(
    organizationId: string,
    queryId: string,
    params?: Record<string, unknown>,
  ): Promise<QueryAnswer> {
    const template = getQueryTemplate(queryId);

    if (!template) {
      throw new NotFoundException(`Query template '${queryId}' not found`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await template.execute(
      this.prisma as unknown as Record<string, unknown>,
      organizationId,
      params,
    );
    const answer = template.render(data, params);

    return {
      queryId: template.id,
      question: template.question,
      answer,
      data,
      chartType: template.chartType,
    };
  }

  /**
   * Get available query templates
   */
  getAvailableQueries(): Array<{
    id: string;
    question: string;
    description: string;
    category: string;
    parameters?: { name: string; type: string; required?: boolean }[];
    chartType?: string;
  }> {
    return queryTemplates.map((t) => ({
      id: t.id,
      question: t.question,
      description: t.description,
      category: t.category,
      parameters: t.parameters,
      chartType: t.chartType,
    }));
  }

  // ============ PRIVATE METHODS ============

  private async fetchMonthData(
    organizationId: string,
    month: number,
    year: number,
  ): Promise<Omit<MonthlyFinancials, 'prevRevenue' | 'prevExpenses' | 'prevNetIncome'>> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Revenue from invoices
    const revenueResult = await this.prisma.invoice.aggregate({
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        deletedAt: null,
        status: { not: 'DRAFT' },
      },
      _sum: { grandTotal: true },
      _count: true,
    });

    // Expenses
    const expenseResult = await this.prisma.expense.aggregate({
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    // Bills
    const billResult = await this.prisma.bill.aggregate({
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      _sum: { grandTotal: true },
      _count: true,
    });

    const revenue = Number(revenueResult._sum.grandTotal) || 0;
    const expenses =
      (Number(expenseResult._sum.amount) || 0) + (Number(billResult._sum.grandTotal) || 0);
    const netIncome = revenue - expenses;

    // Top revenue drivers (customers)
    const topCustomers = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: {
        organizationId,
        date: { gte: startDate, lte: endDate },
        deletedAt: null,
        status: { not: 'DRAFT' },
      },
      _sum: { grandTotal: true },
      orderBy: { _sum: { grandTotal: 'desc' } },
      take: 3,
    });

    const customerIds = topCustomers.map((c) => c.customerId);
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c.name]));

    const topRevenueDrivers = topCustomers.map((c) => ({
      name: customerMap.get(c.customerId) || 'Unknown',
      amount: Number(c._sum.grandTotal) || 0,
      percent: revenue > 0 ? ((Number(c._sum.grandTotal) || 0) / revenue) * 100 : 0,
    }));

    // Overdue AR
    const overdueAR = await this.prisma.invoice.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        status: 'OVERDUE',
      },
      _sum: { grandTotal: true },
    });

    // Overdue AP
    const overdueAP = await this.prisma.bill.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        status: 'OVERDUE',
      },
      _sum: { grandTotal: true },
    });

    // Cash balance
    const bankAccounts = await this.prisma.bankAccount.aggregate({
      where: { organizationId, isActive: true },
      _sum: { systemBalance: true },
    });

    const cashBalance = Number(bankAccounts._sum?.systemBalance) || 0;

    // Estimate cash days remaining
    const dailyBurn = expenses / 30;
    const cashDaysRemaining = dailyBurn > 0 ? Math.floor(cashBalance / dailyBurn) : 999;

    return {
      revenue,
      expenses,
      netIncome,
      topRevenueDrivers,
      topExpenseIncreases: [], // Would require previous month comparison
      overdueAR: Number(overdueAR._sum.grandTotal) || 0,
      overdueAP: Number(overdueAP._sum.grandTotal) || 0,
      cashBalance,
      cashDaysRemaining,
      earlyPaymentDiscounts: 0, // Would need discount tracking
      invoiceCount: revenueResult._count,
      billCount: billResult._count,
    };
  }

  private generateRevenueSection(data: MonthlyFinancials): NarrativeSection {
    const changePercent =
      data.prevRevenue > 0 ? ((data.revenue - data.prevRevenue) / data.prevRevenue) * 100 : 0;

    let content: string;
    let trend: 'up' | 'down' | 'neutral' = 'neutral';

    if (changePercent > 5) {
      content = `Revenue grew ${changePercent.toFixed(1)}% to ${this.formatCurrency(data.revenue)}${data.topRevenueDrivers.length > 0 ? `, primarily driven by ${data.topRevenueDrivers[0].name}` : ''}.`;
      trend = 'up';
    } else if (changePercent < -5) {
      content = `Revenue declined ${Math.abs(changePercent).toFixed(1)}% to ${this.formatCurrency(data.revenue)}. Review sales pipeline for recovery opportunities.`;
      trend = 'down';
    } else {
      content = `Revenue remained stable at ${this.formatCurrency(data.revenue)}.`;
    }

    return {
      id: 'revenue',
      title: 'Revenue Performance',
      content,
      metrics: [
        { label: 'Revenue', value: this.formatCurrency(data.revenue), trend },
        { label: 'Change', value: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%` },
        { label: 'Invoices', value: data.invoiceCount.toString() },
      ],
    };
  }

  private generateExpenseSection(data: MonthlyFinancials): NarrativeSection {
    const changePercent =
      data.prevExpenses > 0 ? ((data.expenses - data.prevExpenses) / data.prevExpenses) * 100 : 0;

    let content: string;
    let trend: 'up' | 'down' | 'neutral' = 'neutral';

    if (changePercent > 10) {
      content = `Total expenses increased ${changePercent.toFixed(1)}% to ${this.formatCurrency(data.expenses)}. Review spending for optimization opportunities.`;
      trend = 'up';
    } else if (changePercent < -10) {
      content = `Total expenses decreased ${Math.abs(changePercent).toFixed(1)}% to ${this.formatCurrency(data.expenses)}, showing improved cost control.`;
      trend = 'down';
    } else {
      content = `Expenses remained controlled at ${this.formatCurrency(data.expenses)}.`;
    }

    return {
      id: 'expenses',
      title: 'Expense Analysis',
      content,
      metrics: [
        { label: 'Expenses', value: this.formatCurrency(data.expenses), trend },
        { label: 'Change', value: `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%` },
      ],
    };
  }

  private generateMarginSection(data: MonthlyFinancials): NarrativeSection {
    const margin = (data.netIncome / data.revenue) * 100;
    const prevMargin = data.prevRevenue > 0 ? (data.prevNetIncome / data.prevRevenue) * 100 : 0;
    const marginChange = margin - prevMargin;

    let content: string;
    let trend: 'up' | 'down' | 'neutral' = 'neutral';

    if (marginChange > 2) {
      content = `Net margin improved to ${margin.toFixed(1)}% from ${prevMargin.toFixed(1)}%.`;
      trend = 'up';
    } else if (marginChange < -2) {
      content = `Net margin declined to ${margin.toFixed(1)}% from ${prevMargin.toFixed(1)}%. Review cost structure recommended.`;
      trend = 'down';
    } else {
      content = `Net margin stable at ${margin.toFixed(1)}%.`;
    }

    return {
      id: 'margin',
      title: 'Profitability',
      content,
      metrics: [
        { label: 'Net Income', value: this.formatCurrency(data.netIncome), trend },
        { label: 'Margin', value: `${margin.toFixed(1)}%` },
      ],
    };
  }

  private generateCashSection(data: MonthlyFinancials): NarrativeSection {
    return {
      id: 'cash',
      title: 'Cash Position',
      content: `Cash balance: ${this.formatCurrency(data.cashBalance)}. Estimated runway: ${data.cashDaysRemaining} days.`,
      metrics: [
        { label: 'Cash', value: this.formatCurrency(data.cashBalance) },
        { label: 'Runway', value: `${data.cashDaysRemaining} days` },
      ],
    };
  }

  private generateAlerts(data: MonthlyFinancials, alerts: NarrativeAlert[]): void {
    // Cash alert
    if (data.cashDaysRemaining < 30) {
      alerts.push({
        type: 'warning',
        message: `⚠️ Cash alert: Balance may reach critical levels in ${data.cashDaysRemaining} days.`,
        severity: 'high',
      });
    }

    // AR alert
    if (data.overdueAR > data.revenue * 0.3 && data.revenue > 0) {
      const percent = ((data.overdueAR / data.revenue) * 100).toFixed(0);
      alerts.push({
        type: 'warning',
        message: `⚠️ Receivables alert: ${this.formatCurrency(data.overdueAR)} overdue, representing ${percent}% of monthly revenue.`,
        severity: 'medium',
      });
    }

    // Early payment opportunity
    if (data.earlyPaymentDiscounts > 0) {
      alerts.push({
        type: 'opportunity',
        message: `💡 Opportunity: ${this.formatCurrency(data.earlyPaymentDiscounts)} in early payment discounts available.`,
      });
    }
  }

  private generateRecommendations(data: MonthlyFinancials, recommendations: string[]): void {
    if (data.overdueAR > 0) {
      recommendations.push('Follow up on overdue invoices to improve cash collection.');
    }

    if (data.cashDaysRemaining < 60) {
      recommendations.push(
        'Review upcoming expenses and consider deferring non-essential spending.',
      );
    }

    const margin = data.revenue > 0 ? (data.netIncome / data.revenue) * 100 : 0;
    if (margin < 10 && data.revenue > 0) {
      recommendations.push('Review pricing strategy and cost structure to improve margins.');
    }
  }

  private generateSummary(data: MonthlyFinancials): string {
    const margin = data.revenue > 0 ? (data.netIncome / data.revenue) * 100 : 0;
    const profitStatus = data.netIncome >= 0 ? 'profit' : 'loss';

    return `Revenue: ${this.formatCurrency(data.revenue)}. Expenses: ${this.formatCurrency(data.expenses)}. Net ${profitStatus}: ${this.formatCurrency(Math.abs(data.netIncome))} (${margin.toFixed(1)}% margin). Cash: ${this.formatCurrency(data.cashBalance)}.`;
  }

  private formatCurrency(amount: number | Decimal): string {
    const num = typeof amount === 'number' ? amount : Number(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
