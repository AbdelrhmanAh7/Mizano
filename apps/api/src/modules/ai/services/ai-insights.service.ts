import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class AiInsightsService {
  constructor(private prisma: PrismaService) {}

  async generateInsights(organizationId: string) {
    const insights: any[] = [];
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    // 1. Cash Flow Analysis
    const cashFlowInsight = await this.analyzeCashFlow(organizationId, startOfMonth);
    if (cashFlowInsight) insights.push(cashFlowInsight);

    // 2. Revenue Trend
    const revenueTrend = await this.analyzeRevenueTrend(organizationId);
    if (revenueTrend) insights.push(revenueTrend);

    // 3. Expense Anomalies
    const expenseAnomalies = await this.detectExpenseAnomalies(organizationId);
    if (expenseAnomalies) insights.push(expenseAnomalies);

    // 4. Customer Payment Patterns
    const paymentPatterns = await this.analyzePaymentPatterns(organizationId);
    if (paymentPatterns) insights.push(paymentPatterns);

    // 5. Inventory Optimization
    const inventoryInsight = await this.analyzeInventory(organizationId);
    if (inventoryInsight) insights.push(inventoryInsight);

    // 6. Project Profitability
    const projectInsight = await this.analyzeProjectProfitability(organizationId);
    if (projectInsight) insights.push(projectInsight);

    return {
      generatedAt: new Date(),
      insights: insights.sort((a, b) => b.priority - a.priority),
    };
  }

  private async analyzeCashFlow(organizationId: string, startOfMonth: Date) {
    const today = new Date();

    // Cash inflows
    const paymentsReceived = await this.prisma.paymentReceived.aggregate({
      where: { organizationId, date: { gte: startOfMonth, lte: today } },
      _sum: { amount: true },
    });
    const cashIn = parseFloat(paymentsReceived._sum.amount?.toString() || '0');

    // Cash outflows
    const paymentsMade = await this.prisma.paymentMade.aggregate({
      where: { organizationId, date: { gte: startOfMonth, lte: today } },
      _sum: { amount: true },
    });
    const expenses = await this.prisma.expense.aggregate({
      where: { organizationId, date: { gte: startOfMonth, lte: today } },
      _sum: { amount: true },
    });
    const cashOut =
      parseFloat(paymentsMade._sum.amount?.toString() || '0') + parseFloat(expenses._sum.amount?.toString() || '0');

    const netCashFlow = cashIn - cashOut;
    const burnRate = cashOut / (today.getDate()); // Daily burn rate

    // Project days until cash runs out
    const bankBalance = await this.getTotalBankBalance(organizationId);
    const daysOfCash = burnRate > 0 ? Math.floor(bankBalance / burnRate) : 999;

    if (daysOfCash < 30) {
      return {
        type: 'CASH_FLOW_WARNING',
        priority: 10,
        title: 'Cash Flow Alert',
        message: `At current burn rate, you have approximately ${daysOfCash} days of cash remaining. Consider accelerating collections or reducing expenses.`,
        data: { netCashFlow, burnRate, daysOfCash, bankBalance },
        actions: ['View upcoming payments', 'Send invoice reminders', 'Review expenses'],
      };
    } else if (netCashFlow < 0) {
      return {
        type: 'CASH_FLOW_NEGATIVE',
        priority: 7,
        title: 'Negative Cash Flow This Month',
        message: `Your cash outflows exceed inflows by $${Math.abs(netCashFlow).toFixed(2)} this month. Monitor spending closely.`,
        data: { cashIn, cashOut, netCashFlow },
        actions: ['View cash flow report', 'Review expenses'],
      };
    }
    return null;
  }

  private async analyzeRevenueTrend(organizationId: string) {
    const months: Array<{ month: string; revenue: number }> = [];
    const today = new Date();

    for (let i = 5; i >= 0; i--) {
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

      const invoices = await this.prisma.invoice.aggregate({
        where: { organizationId, deletedAt: null, date: { gte: start, lte: end } },
        _sum: { grandTotal: true },
      });
      months.push({
        month: start.toLocaleString('default', { month: 'short' }),
        revenue: parseFloat(invoices._sum.grandTotal?.toString() || '0'),
      });
    }

    // Calculate trend
    const recent3Months = months.slice(-3).reduce((sum, m) => sum + m.revenue, 0) / 3;
    const prior3Months = months.slice(0, 3).reduce((sum, m) => sum + m.revenue, 0) / 3;

    if (prior3Months > 0) {
      const change = ((recent3Months - prior3Months) / prior3Months) * 100;

      if (change > 10) {
        return {
          type: 'REVENUE_GROWTH',
          priority: 5,
          title: 'Revenue Growing',
          message: `Your revenue has increased ${change.toFixed(1)}% compared to the previous quarter. Keep up the momentum!`,
          data: { months, change },
          actions: ['View revenue report'],
        };
      } else if (change < -10) {
        return {
          type: 'REVENUE_DECLINE',
          priority: 8,
          title: 'Revenue Declining',
          message: `Your revenue has decreased ${Math.abs(change).toFixed(1)}% compared to the previous quarter. Consider reviewing your sales pipeline.`,
          data: { months, change },
          actions: ['View sales pipeline', 'Contact inactive customers'],
        };
      }
    }
    return null;
  }

  private async detectExpenseAnomalies(organizationId: string) {
    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    // Get expenses by account for current and last month
    const currentExpenses = await this.prisma.expense.groupBy({
      by: ['accountId'],
      where: { organizationId, date: { gte: currentMonth } },
      _sum: { amount: true },
    });

    const lastExpenses = await this.prisma.expense.groupBy({
      by: ['accountId'],
      where: { organizationId, date: { gte: lastMonth, lte: lastMonthEnd } },
      _sum: { amount: true },
    });

    const lastExpenseMap = new Map(lastExpenses.map((e) => [e.accountId, parseFloat(e._sum.amount?.toString() || '0')]));

    const anomalies = [];
    for (const expense of currentExpenses) {
      const current = parseFloat(expense._sum.amount?.toString() || '0');
      const last = lastExpenseMap.get(expense.accountId) || 0;

      if (last > 0 && current > last * 1.5) {
        // 50% increase
        const account = await this.prisma.account.findUnique({ where: { id: expense.accountId } });
        anomalies.push({
          accountId: expense.accountId,
          accountName: account?.name,
          current,
          previous: last,
          increase: ((current - last) / last) * 100,
        });
      }
    }

    if (anomalies.length > 0) {
      const topAnomaly = anomalies.sort((a, b) => b.increase - a.increase)[0];
      return {
        type: 'EXPENSE_ANOMALY',
        priority: 7,
        title: 'Unusual Expense Increase',
        message: `${topAnomaly.accountName} expenses increased by ${topAnomaly.increase.toFixed(0)}% compared to last month.`,
        data: { anomalies },
        actions: ['Review expenses', 'View expense details'],
      };
    }
    return null;
  }

  private async analyzePaymentPatterns(organizationId: string) {
    // Get paid invoices with their payment timing
    const paidInvoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: ['PAID', 'PARTIALLY_PAID'] },
      },
      include: { customer: { select: { id: true, name: true } } },
    });

    const payments = await this.prisma.paymentReceived.findMany({
      where: { organizationId },
      include: { allocations: true },
    });

    // Analyze average days to payment by customer
    const customerPaymentDays: Record<string, { name: string; days: number[]; avgDays: number }> = {};

    for (const invoice of paidInvoices) {
      const invoicePayments = payments.filter((p) => p.allocations.some((a) => a.invoiceId === invoice.id));

      for (const payment of invoicePayments) {
        const daysToPay = Math.floor(
          (payment.date.getTime() - invoice.date.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (!customerPaymentDays[invoice.customerId]) {
          customerPaymentDays[invoice.customerId] = { name: invoice.customer.name, days: [], avgDays: 0 };
        }
        customerPaymentDays[invoice.customerId].days.push(daysToPay);
      }
    }

    // Calculate averages
    for (const customerId in customerPaymentDays) {
      const data = customerPaymentDays[customerId];
      data.avgDays = data.days.reduce((sum, d) => sum + d, 0) / data.days.length;
    }

    // Find slow payers (> 45 days average)
    const slowPayers = Object.values(customerPaymentDays)
      .filter((c) => c.avgDays > 45)
      .sort((a, b) => b.avgDays - a.avgDays);

    if (slowPayers.length > 0) {
      return {
        type: 'SLOW_PAYERS',
        priority: 6,
        title: 'Slow Paying Customers Identified',
        message: `${slowPayers.length} customer(s) take over 45 days on average to pay. Consider adjusting payment terms.`,
        data: { slowPayers: slowPayers.slice(0, 5) },
        actions: ['View customer details', 'Update payment terms'],
      };
    }
    return null;
  }

  private async analyzeInventory(organizationId: string) {
    const items = await this.prisma.item.findMany({
      where: { organizationId, type: 'GOODS' },
    });

    const lowStockItems = [];
    for (const item of items) {
      const movements = await this.prisma.inventoryMovement.findMany({
        where: { itemId: item.id, organizationId },
      });
      const currentStock = movements.reduce((sum, m) => sum + parseFloat(m.quantity.toString()), 0);

      if (currentStock <= (item.reorderPoint ? parseFloat(item.reorderPoint.toString()) : 10)) {
        lowStockItems.push({
          id: item.id,
          name: item.name,
          sku: item.sku,
          currentStock,
          reorderPoint: item.reorderPoint ? parseFloat(item.reorderPoint.toString()) : 10,
        });
      }
    }

    if (lowStockItems.length > 0) {
      return {
        type: 'LOW_STOCK',
        priority: 8,
        title: 'Low Stock Alert',
        message: `${lowStockItems.length} item(s) are at or below reorder point. Consider placing orders.`,
        data: { items: lowStockItems.slice(0, 5) },
        actions: ['View inventory', 'Create purchase order'],
      };
    }
    return null;
  }

  private async analyzeProjectProfitability(organizationId: string) {
    const projects = await this.prisma.project.findMany({
      where: { organizationId, status: 'ACTIVE' },
      include: {
        timesheetEntries: true,
        tasks: true,
      },
    });

    const unprofitableProjects: Array<{
      id: string;
      name: string;
      hoursLogged: number;
      estimatedRevenue: number;
      budget: number;
      budgetUsed: number;
    }> = [];
    for (const project of projects) {
      const hoursLogged = project.timesheetEntries.reduce((sum: number, t: { duration: Decimal }) => sum + parseFloat(t.duration.toString()), 0);
      // Calculate average rate from tasks, or default to 0
      const avgTaskRate = project.tasks.length > 0
        ? project.tasks.reduce((sum: number, t: { ratePerHour: Decimal }) => sum + parseFloat(t.ratePerHour.toString()), 0) / project.tasks.length
        : 0;
      const estimatedRevenue = hoursLogged * avgTaskRate;
      const budget = project.budgetAmount ? parseFloat(project.budgetAmount.toString()) : 0;

      if (budget > 0 && estimatedRevenue > budget * 0.8) {
        unprofitableProjects.push({
          id: project.id,
          name: project.name,
          hoursLogged,
          estimatedRevenue,
          budget,
          budgetUsed: (estimatedRevenue / budget) * 100,
        });
      }
    }

    if (unprofitableProjects.length > 0) {
      return {
        type: 'PROJECT_OVER_BUDGET',
        priority: 7,
        title: 'Projects Approaching Budget Limit',
        message: `${unprofitableProjects.length} project(s) have used over 80% of their budget. Review project scope.`,
        data: { projects: unprofitableProjects },
        actions: ['View project details', 'Update budget'],
      };
    }
    return null;
  }

  private async getTotalBankBalance(organizationId: string) {
    const accounts = await this.prisma.bankAccount.aggregate({
      where: { organizationId, isActive: true },
      _sum: { systemBalance: true },
    });
    return parseFloat(accounts._sum.systemBalance?.toString() || '0');
  }
}
