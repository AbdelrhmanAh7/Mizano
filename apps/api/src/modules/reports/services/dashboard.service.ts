import { Injectable } from '@nestjs/common';
import {
  AccountType,
  AttendanceStatus,
  BillStatus,
  DealStage,
  InvoiceStatus,
  LeadSource,
  LeadStatus,
  ProjectStatus,
  QuoteStatus,
  ReorderStatus,
  TaskStatus,
  WorkOrderStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CacheService } from '../../../cache/cache.service';
import { ReadReplicaService } from '../../../prisma/read-replica.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: ReadReplicaService,
    private cacheService: CacheService,
  ) {}

  async getDashboardOverview(organizationId: string, startDate?: string, endDate?: string) {
    const cacheKey = `dashboard:overview:${startDate || 'default'}:${endDate || 'default'}`;

    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeDashboardOverview(organizationId, startDate, endDate),
      { ttl: 60, organizationId },
    );
  }

  private async computeDashboardOverview(
    organizationId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const today = new Date();
    const periodStart = startDate
      ? new Date(startDate)
      : new Date(today.getFullYear(), today.getMonth(), 1);
    const periodEnd = endDate ? new Date(endDate) : today;

    // Compute equivalent previous period for trend comparison
    const periodMs = periodEnd.getTime() - periodStart.getTime();
    const prevPeriodEnd = new Date(periodStart.getTime() - 1);
    const prevPeriodStart = new Date(prevPeriodEnd.getTime() - periodMs);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // Get key metrics in parallel (current + previous period for trends)
    const [
      totalReceivables,
      totalPayables,
      periodRevenue,
      periodExpenses,
      prevPeriodRevenue,
      prevPeriodExpenses,
      yearlyRevenue,
      bankBalances,
      overdueInvoices,
      overdueBills,
      recentInvoices,
      recentBills,
      activeProjects,
      upcomingPayments,
    ] = await Promise.all([
      this.getTotalReceivables(organizationId),
      this.getTotalPayables(organizationId),
      this.getRevenueInRange(organizationId, periodStart, periodEnd),
      this.getExpensesInRange(organizationId, periodStart, periodEnd),
      this.getRevenueInRange(organizationId, prevPeriodStart, prevPeriodEnd),
      this.getExpensesInRange(organizationId, prevPeriodStart, prevPeriodEnd),
      this.getYearlyRevenue(organizationId, startOfYear),
      this.getBankBalances(organizationId),
      this.getOverdueInvoicesCount(organizationId),
      this.getOverdueBillsCount(organizationId),
      this.getRecentInvoices(organizationId, 5),
      this.getRecentBills(organizationId, 5),
      this.getActiveProjectsCount(organizationId),
      this.getUpcomingPayments(organizationId, 7),
    ]);

    const periodProfit = periodRevenue - periodExpenses;
    const prevProfit = prevPeriodRevenue - prevPeriodExpenses;

    return {
      overview: {
        totalReceivables,
        totalPayables,
        netPosition: totalReceivables - totalPayables,
        monthlyRevenue: periodRevenue,
        monthlyExpenses: periodExpenses,
        monthlyProfit: periodProfit,
        yearlyRevenue,
      },
      trends: {
        revenue: this.computeTrend(periodRevenue, prevPeriodRevenue),
        expenses: this.computeTrend(periodExpenses, prevPeriodExpenses),
        profit: this.computeTrend(periodProfit, prevProfit),
      },
      alerts: {
        overdueInvoices,
        overdueBills,
        activeProjects,
      },
      bankBalances,
      recentActivity: {
        invoices: recentInvoices,
        bills: recentBills,
      },
      upcomingPayments,
    };
  }

  async getRevenueChart(organizationId: string, months: number = 12) {
    const cacheKey = `dashboard:revenue-chart:${months}`;

    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeRevenueChart(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computeRevenueChart(organizationId: string, months: number = 12) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

    // 3 aggregate queries instead of months * 3 individual queries
    const [invoicesByMonth, expensesByMonth, billsByMonth] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['date'],
        where: { organizationId, deletedAt: null, date: { gte: startDate } },
        _sum: { grandTotal: true },
      }),
      this.prisma.expense.groupBy({
        by: ['date'],
        where: { organizationId, date: { gte: startDate } },
        _sum: { amount: true },
      }),
      this.prisma.bill.groupBy({
        by: ['date'],
        where: { organizationId, deletedAt: null, date: { gte: startDate } },
        _sum: { grandTotal: true },
      }),
    ]);

    // Bucket by month
    const revenueByMonth: Record<string, number> = {};
    const expenseByMonth: Record<string, number> = {};

    for (const inv of invoicesByMonth) {
      const key = `${inv.date.getFullYear()}-${inv.date.getMonth()}`;
      revenueByMonth[key] =
        (revenueByMonth[key] || 0) + parseFloat(inv._sum.grandTotal?.toString() || '0');
    }
    for (const exp of expensesByMonth) {
      const key = `${exp.date.getFullYear()}-${exp.date.getMonth()}`;
      expenseByMonth[key] =
        (expenseByMonth[key] || 0) + parseFloat(exp._sum.amount?.toString() || '0');
    }
    for (const bill of billsByMonth) {
      const key = `${bill.date.getFullYear()}-${bill.date.getMonth()}`;
      expenseByMonth[key] =
        (expenseByMonth[key] || 0) + parseFloat(bill._sum.grandTotal?.toString() || '0');
    }

    // Build the result array
    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const revenue = revenueByMonth[key] || 0;
      const expenses = expenseByMonth[key] || 0;
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        revenue,
        expenses,
        profit: revenue - expenses,
      });
    }

    return data;
  }

  async getCashFlowChart(organizationId: string, days: number = 30) {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    // 3 range queries instead of days * 3 individual queries
    const [paymentsIn, paymentsOut, expenses] = await Promise.all([
      this.prisma.paymentReceived.findMany({
        where: { organizationId, date: { gte: startDate } },
        select: { date: true, amount: true },
      }),
      this.prisma.paymentMade.findMany({
        where: { organizationId, date: { gte: startDate } },
        select: { date: true, amount: true },
      }),
      this.prisma.expense.findMany({
        where: { organizationId, date: { gte: startDate } },
        select: { date: true, amount: true },
      }),
    ]);

    // Bucket by date
    const cashInByDate: Record<string, number> = {};
    const cashOutByDate: Record<string, number> = {};

    for (const p of paymentsIn) {
      const key = p.date.toISOString().split('T')[0];
      cashInByDate[key] = (cashInByDate[key] || 0) + parseFloat(p.amount.toString());
    }
    for (const p of paymentsOut) {
      const key = p.date.toISOString().split('T')[0];
      cashOutByDate[key] = (cashOutByDate[key] || 0) + parseFloat(p.amount.toString());
    }
    for (const e of expenses) {
      const key = e.date.toISOString().split('T')[0];
      cashOutByDate[key] = (cashOutByDate[key] || 0) + parseFloat(e.amount.toString());
    }

    // Build daily array
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const key = date.toISOString().split('T')[0];
      const cashIn = cashInByDate[key] || 0;
      const cashOut = cashOutByDate[key] || 0;
      data.push({ date: key, cashIn, cashOut, net: cashIn - cashOut });
    }

    return data;
  }

  async getTopCustomers(organizationId: string, limit: number = 5) {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        invoices: {
          where: { deletedAt: null },
          select: { grandTotal: true },
        },
      },
    });

    const customerRevenue = customers.map((c) => ({
      id: c.id,
      name: c.name,
      totalRevenue: c.invoices.reduce(
        (sum, inv) => sum + parseFloat((inv.grandTotal ?? 0).toString()),
        0,
      ),
      invoiceCount: c.invoices.length,
    }));

    return customerRevenue.sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, limit);
  }

  async getExpensesByCategory(organizationId: string, startDate: string, endDate: string) {
    const expenses = await this.prisma.expense.findMany({
      where: {
        organizationId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      include: {
        account: { select: { id: true, name: true } },
      },
    });

    const byCategory: Record<string, number> = {};
    for (const expense of expenses) {
      const category = expense.account?.name || 'Uncategorized';
      byCategory[category] = (byCategory[category] || 0) + parseFloat(expense.amount.toString());
    }

    return Object.entries(byCategory)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  async getProjectsOverview(organizationId: string) {
    const projects = await this.prisma.project.findMany({
      where: { organizationId },
      include: {
        timesheetEntries: true,
        invoices: { where: { deletedAt: null } },
      },
    });

    return projects.map((p) => {
      const hoursLogged = p.timesheetEntries.reduce(
        (sum, t) => sum + parseFloat((t.hours ?? t.duration).toString()),
        0,
      );
      const revenue = p.invoices.reduce(
        (sum, inv) => sum + parseFloat(inv.grandTotal.toString()),
        0,
      );
      const budget = p.budget ? parseFloat(p.budget.toString()) : 0;

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        hoursLogged,
        revenue,
        budget,
        budgetUsedPercent: budget > 0 ? (revenue / budget) * 100 : 0,
      };
    });
  }

  private computeTrend(current: number, previous: number): { value: number; isPositive: boolean } {
    if (previous === 0) {
      return { value: current > 0 ? 100 : 0, isPositive: current >= 0 };
    }
    const change = ((current - previous) / Math.abs(previous)) * 100;
    return { value: Math.round(Math.abs(change)), isPositive: change >= 0 };
  }

  private async getRevenueInRange(organizationId: string, start: Date, end: Date) {
    const invoices = await this.prisma.invoice.aggregate({
      where: { organizationId, deletedAt: null, date: { gte: start, lte: end } },
      _sum: { grandTotal: true },
    });
    return parseFloat(invoices._sum.grandTotal?.toString() || '0');
  }

  private async getExpensesInRange(organizationId: string, start: Date, end: Date) {
    const [expenses, bills] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { organizationId, date: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      this.prisma.bill.aggregate({
        where: { organizationId, deletedAt: null, date: { gte: start, lte: end } },
        _sum: { grandTotal: true },
      }),
    ]);
    return (
      parseFloat(expenses._sum.amount?.toString() || '0') +
      parseFloat(bills._sum.grandTotal?.toString() || '0')
    );
  }

  private async getTotalReceivables(organizationId: string) {
    const invoices = await this.prisma.invoice.aggregate({
      where: { organizationId, deletedAt: null, balanceDue: { gt: 0 } },
      _sum: { balanceDue: true },
    });
    return parseFloat(invoices._sum.balanceDue?.toString() || '0');
  }

  /**
   * AP total = balances of bills posted to AP minus live, unapplied, unrefunded vendor credits
   * (they debited AP without reducing any bill), so it matches the AP control account.
   */
  private async getTotalPayables(organizationId: string) {
    const [bills, credits] = await Promise.all([
      this.prisma.bill.aggregate({
        where: {
          organizationId,
          deletedAt: null,
          balanceDue: { gt: 0 },
          status: { in: ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'] },
        },
        _sum: { balanceDue: true },
      }),
      this.prisma.vendorCredit.aggregate({
        where: { organizationId, deletedAt: null, appliedToBillId: null, refundedAt: null },
        _sum: { amount: true },
      }),
    ]);
    const net = new Decimal(bills._sum.balanceDue ?? 0).sub(credits._sum.amount ?? 0);
    return net.toNumber();
  }

  private async getMonthlyRevenue(organizationId: string, startOfMonth: Date) {
    const invoices = await this.prisma.invoice.aggregate({
      where: { organizationId, deletedAt: null, date: { gte: startOfMonth } },
      _sum: { grandTotal: true },
    });
    return parseFloat(invoices._sum.grandTotal?.toString() || '0');
  }

  private async getMonthlyExpenses(organizationId: string, startOfMonth: Date) {
    const expenses = await this.prisma.expense.aggregate({
      where: { organizationId, date: { gte: startOfMonth } },
      _sum: { amount: true },
    });
    const bills = await this.prisma.bill.aggregate({
      where: { organizationId, deletedAt: null, date: { gte: startOfMonth } },
      _sum: { grandTotal: true },
    });
    return (
      parseFloat(expenses._sum.amount?.toString() || '0') +
      parseFloat(bills._sum.grandTotal?.toString() || '0')
    );
  }

  private async getYearlyRevenue(organizationId: string, startOfYear: Date) {
    const invoices = await this.prisma.invoice.aggregate({
      where: { organizationId, deletedAt: null, date: { gte: startOfYear } },
      _sum: { grandTotal: true },
    });
    return parseFloat(invoices._sum.grandTotal?.toString() || '0');
  }

  private async getBankBalances(organizationId: string) {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, systemBalance: true, bankBalance: true, currency: true },
    });
    return accounts.map((a) => ({
      ...a,
      systemBalance: parseFloat(a.systemBalance.toString()),
      bankBalance: parseFloat(a.bankBalance.toString()),
    }));
  }

  private async getOverdueInvoicesCount(organizationId: string) {
    return this.prisma.invoice.count({
      where: { organizationId, deletedAt: null, status: InvoiceStatus.OVERDUE },
    });
  }

  private async getOverdueBillsCount(organizationId: string) {
    return this.prisma.bill.count({
      where: { organizationId, deletedAt: null, status: BillStatus.OVERDUE },
    });
  }

  private async getRecentInvoices(organizationId: string, limit: number) {
    return this.prisma.invoice.findMany({
      where: { organizationId, deletedAt: null },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async getRecentBills(organizationId: string, limit: number) {
    return this.prisma.bill.findMany({
      where: { organizationId, deletedAt: null },
      include: { vendor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async getActiveProjectsCount(organizationId: string) {
    return this.prisma.project.count({
      where: { organizationId, status: ProjectStatus.IN_PROGRESS },
    });
  }

  private async getUpcomingPayments(organizationId: string, days: number) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        deletedAt: null,
        balanceDue: { gt: 0 },
        dueDate: { lte: futureDate },
      },
      include: { vendor: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 10,
    });

    return bills.map((b) => ({
      id: b.id,
      type: 'Bill',
      reference: b.billNumber,
      vendorName: b.vendor.name,
      dueDate: b.dueDate,
      amount: parseFloat(b.balanceDue.toString()),
    }));
  }

  async getBankBalanceTrend(organizationId: string, months: number = 6) {
    const today = new Date();

    // Fetch all active bank accounts and ALL their transactions in 2 queries
    const bankAccounts = await this.prisma.bankAccount.findMany({
      where: { organizationId, isActive: true },
      select: { id: true },
    });

    const accountIds = bankAccounts.map((a) => a.id);
    const allTransactions =
      accountIds.length > 0
        ? await this.prisma.bankTransaction.findMany({
            where: { bankAccountId: { in: accountIds } },
            select: { date: true, type: true, amount: true },
            orderBy: { date: 'asc' },
          })
        : [];

    // Compute cumulative balance up to end of each month
    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      let balance = 0;
      for (const tx of allTransactions) {
        if (tx.date <= monthEnd) {
          const amount = parseFloat(tx.amount.toString());
          balance += tx.type === 'DEPOSIT' ? amount : -amount;
        }
      }
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
      data.push({
        month: monthStart.toLocaleString('default', { month: 'short', year: 'numeric' }),
        balance,
      });
    }

    return data;
  }

  async getInventoryValueTrend(organizationId: string, months: number = 6) {
    const today = new Date();

    // Single query: fetch all tracked items with their current inventory levels
    // Note: inventory levels are current snapshots — historical values are not tracked.
    // Each month currently shows the same value. To get true trend, use inventory movements.
    const items = await this.prisma.item.findMany({
      where: {
        organizationId,
        deletedAt: null,
        type: 'GOODS',
        trackInventory: true,
      },
      include: {
        inventoryLevels: {
          where: { organizationId },
          select: { quantity: true },
        },
      },
    });

    // Compute current total value once
    let currentValue = 0;
    for (const item of items) {
      const quantity = item.inventoryLevels.reduce(
        (sum: number, il: { quantity: Decimal }) => sum + parseFloat((il.quantity ?? 0).toString()),
        0,
      );
      const costPrice = parseFloat((item.costPrice ?? 0).toString());
      currentValue += quantity * costPrice;
    }

    // Use inventory movements to estimate historical values
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { organizationId, createdAt: { gte: startDate } },
      select: { createdAt: true, quantity: true, movementType: true, costPerUnit: true },
      orderBy: { createdAt: 'desc' },
    });

    // Build monthly deltas from movements (working backwards from current value)
    const monthlyDelta: Record<string, number> = {};
    for (const mv of movements) {
      const key = `${mv.createdAt.getFullYear()}-${mv.createdAt.getMonth()}`;
      const qty = parseFloat(mv.quantity.toString());
      const cost = parseFloat((mv.costPerUnit ?? 0).toString());
      const valueDelta = qty * cost * (mv.movementType === 'IN' ? 1 : -1);
      monthlyDelta[key] = (monthlyDelta[key] || 0) + valueDelta;
    }

    // Build data from newest to oldest, then reverse
    const data = [];
    let runningValue = currentValue;
    for (let i = 0; i < months; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;

      data.unshift({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        value: runningValue,
        itemCount: items.length,
      });

      // Subtract this month's delta to get end-of-previous-month value
      runningValue -= monthlyDelta[key] || 0;
    }

    return data;
  }

  // ============ Financial (Tab 2) ============

  async getGrossMarginTrend(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:gross-margin-trend:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeGrossMarginTrend(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computeGrossMarginTrend(organizationId: string, months: number) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

    const [invoicesByMonth, billsByMonth] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['date'],
        where: { organizationId, deletedAt: null, date: { gte: startDate } },
        _sum: { grandTotal: true },
      }),
      this.prisma.bill.groupBy({
        by: ['date'],
        where: { organizationId, deletedAt: null, date: { gte: startDate } },
        _sum: { grandTotal: true },
      }),
    ]);

    const revenueByMonth: Record<string, number> = {};
    const cogsByMonth: Record<string, number> = {};

    for (const inv of invoicesByMonth) {
      const key = `${inv.date.getFullYear()}-${inv.date.getMonth()}`;
      revenueByMonth[key] =
        (revenueByMonth[key] || 0) + parseFloat(inv._sum.grandTotal?.toString() || '0');
    }
    for (const bill of billsByMonth) {
      const key = `${bill.date.getFullYear()}-${bill.date.getMonth()}`;
      cogsByMonth[key] =
        (cogsByMonth[key] || 0) + parseFloat(bill._sum.grandTotal?.toString() || '0');
    }

    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const revenue = revenueByMonth[key] || 0;
      const cogs = cogsByMonth[key] || 0;
      const margin = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0;
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        revenue,
        cogs,
        marginPercent: Math.round(margin * 100) / 100,
      });
    }

    return data;
  }

  async getRevenueYoY(organizationId: string) {
    const cacheKey = `dashboard:revenue-yoy`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeRevenueYoY(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeRevenueYoY(organizationId: string) {
    const today = new Date();
    const currentYear = today.getFullYear();
    const startDate = new Date(currentYear - 1, 0, 1);

    const invoicesByMonth = await this.prisma.invoice.groupBy({
      by: ['date'],
      where: { organizationId, deletedAt: null, date: { gte: startDate } },
      _sum: { grandTotal: true },
    });

    const currentYearData: Record<number, number> = {};
    const previousYearData: Record<number, number> = {};

    for (const inv of invoicesByMonth) {
      const year = inv.date.getFullYear();
      const month = inv.date.getMonth();
      const amount = parseFloat(inv._sum.grandTotal?.toString() || '0');
      if (year === currentYear) {
        currentYearData[month] = (currentYearData[month] || 0) + amount;
      } else {
        previousYearData[month] = (previousYearData[month] || 0) + amount;
      }
    }

    const data = [];
    for (let m = 0; m < 12; m++) {
      const d = new Date(currentYear, m, 1);
      data.push({
        month: d.toLocaleString('default', { month: 'short' }),
        currentYear: currentYearData[m] || 0,
        previousYear: previousYearData[m] || 0,
      });
    }

    return data;
  }

  async getAccountBalances(organizationId: string) {
    const cacheKey = `dashboard:account-balances`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeAccountBalances(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeAccountBalances(organizationId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { organizationId, deletedAt: null, isActive: true },
      select: { type: true, openingBalance: true },
    });

    const balancesByType: Record<string, { balance: number; count: number }> = {};
    for (const acc of accounts) {
      const balance = parseFloat((acc.openingBalance ?? 0).toString());
      if (!balancesByType[acc.type]) balancesByType[acc.type] = { balance: 0, count: 0 };
      balancesByType[acc.type].balance += balance;
      balancesByType[acc.type].count++;
    }

    return Object.values(AccountType).map((type) => ({
      type,
      balance: balancesByType[type]?.balance || 0,
      count: balancesByType[type]?.count || 0,
    }));
  }

  async getVATSummary(organizationId: string) {
    const cacheKey = `dashboard:vat-summary`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeVATSummary(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeVATSummary(organizationId: string) {
    const returns = await this.prisma.vATReturn.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { endDate: 'desc' },
      take: 4,
      select: {
        id: true,
        period: true,
        status: true,
        totalSales: true,
        outputVAT: true,
        totalPurchases: true,
        inputVAT: true,
        netPayable: true,
        periodStart: true,
        periodEnd: true,
      },
    });

    return returns.map((r) => ({
      id: r.id,
      period: r.period,
      status: r.status,
      totalSales: parseFloat(r.totalSales.toString()),
      outputVAT: parseFloat(r.outputVAT.toString()),
      totalPurchases: parseFloat(r.totalPurchases.toString()),
      inputVAT: parseFloat(r.inputVAT.toString()),
      netPayable: parseFloat(r.netPayable.toString()),
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
    }));
  }

  // ============ Sales (Tab 3) ============

  async getInvoiceStatus(organizationId: string) {
    const cacheKey = `dashboard:invoice-status`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeInvoiceStatus(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeInvoiceStatus(organizationId: string) {
    const counts = await this.prisma.invoice.groupBy({
      by: ['status'],
      where: { organizationId, deletedAt: null },
      _count: { id: true },
      _sum: { grandTotal: true },
    });

    return counts.map((c) => ({
      status: c.status,
      count: c._count.id,
      amount: parseFloat(c._sum.grandTotal?.toString() || '0'),
    }));
  }

  async getQuoteConversion(organizationId: string) {
    const cacheKey = `dashboard:quote-conversion`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeQuoteConversion(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeQuoteConversion(organizationId: string) {
    const counts = await this.prisma.quote.groupBy({
      by: ['status'],
      where: { organizationId, deletedAt: null },
      _count: { id: true },
    });

    const funnel = [
      QuoteStatus.DRAFT,
      QuoteStatus.SENT,
      QuoteStatus.ACCEPTED,
      QuoteStatus.INVOICED,
      QuoteStatus.DECLINED,
      QuoteStatus.EXPIRED,
    ];

    const countMap: Record<string, number> = {};
    for (const c of counts) {
      countMap[c.status] = c._count.id;
    }

    return funnel.map((status) => ({
      status,
      count: countMap[status] || 0,
    }));
  }

  async getInvoiceVolume(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:invoice-volume:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeInvoiceVolume(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computeInvoiceVolume(organizationId: string, months: number) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId, deletedAt: null, date: { gte: startDate } },
      select: { date: true, grandTotal: true },
    });

    const monthlyData: Record<string, { count: number; total: number }> = {};
    for (const inv of invoices) {
      const key = `${inv.date.getFullYear()}-${inv.date.getMonth()}`;
      if (!monthlyData[key]) monthlyData[key] = { count: 0, total: 0 };
      monthlyData[key].count++;
      monthlyData[key].total += parseFloat(inv.grandTotal.toString());
    }

    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        count: monthlyData[key]?.count || 0,
        amount: monthlyData[key]?.total || 0,
      });
    }

    return data;
  }

  async getPaymentCollection(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:payment-collection:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computePaymentCollection(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computePaymentCollection(organizationId: string, months: number) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

    const payments = await this.prisma.paymentReceived.findMany({
      where: { organizationId, date: { gte: startDate } },
      select: { date: true, amount: true },
    });

    const monthlyData: Record<string, number> = {};
    for (const p of payments) {
      const key = `${p.date.getFullYear()}-${p.date.getMonth()}`;
      monthlyData[key] = (monthlyData[key] || 0) + parseFloat(p.amount.toString());
    }

    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        amount: monthlyData[key] || 0,
      });
    }

    return data;
  }

  async getChurnRisk(organizationId: string) {
    const cacheKey = `dashboard:churn-risk`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeChurnRisk(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeChurnRisk(organizationId: string) {
    const profiles = await this.prisma.customerAiProfile.findMany({
      where: { organizationId },
      select: { churnRisk: true },
    });

    let low = 0;
    let medium = 0;
    let high = 0;

    for (const p of profiles) {
      const risk = parseFloat(p.churnRisk.toString());
      if (risk < 0.3) low++;
      else if (risk <= 0.6) medium++;
      else high++;
    }

    return [
      { segment: 'Low', count: low },
      { segment: 'Medium', count: medium },
      { segment: 'High', count: high },
    ];
  }

  async getCLVSegments(organizationId: string) {
    const cacheKey = `dashboard:clv-segments`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeCLVSegments(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeCLVSegments(organizationId: string) {
    const profiles = await this.prisma.customerAiProfile.findMany({
      where: { organizationId },
      select: { clvSegment: true, lifetimeValue: true },
    });

    const segments: Record<string, { count: number; totalValue: number }> = {};
    for (const p of profiles) {
      const segment = p.clvSegment || 'Unclassified';
      if (!segments[segment]) segments[segment] = { count: 0, totalValue: 0 };
      segments[segment].count++;
      segments[segment].totalValue += parseFloat(p.lifetimeValue.toString());
    }

    return Object.entries(segments).map(([segment, data]) => ({
      segment,
      count: data.count,
      totalValue: data.totalValue,
      avgValue: data.count > 0 ? Math.round((data.totalValue / data.count) * 100) / 100 : 0,
    }));
  }

  // ============ Purchases (Tab 4) ============

  async getBillStatus(organizationId: string) {
    const cacheKey = `dashboard:bill-status`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeBillStatus(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeBillStatus(organizationId: string) {
    const counts = await this.prisma.bill.groupBy({
      by: ['status'],
      where: { organizationId, deletedAt: null },
      _count: { id: true },
      _sum: { grandTotal: true },
    });

    return counts.map((c) => ({
      status: c.status,
      count: c._count.id,
      amount: parseFloat(c._sum.grandTotal?.toString() || '0'),
    }));
  }

  async getTopVendors(organizationId: string, limit: number = 5) {
    const cacheKey = `dashboard:top-vendors:${limit}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeTopVendors(organizationId, limit),
      { ttl: 120, organizationId },
    );
  }

  private async computeTopVendors(organizationId: string, limit: number) {
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        bills: {
          where: { deletedAt: null },
          select: { grandTotal: true },
        },
      },
    });

    const vendorSpend = vendors.map((v) => ({
      id: v.id,
      name: v.name,
      totalAmount: v.bills.reduce(
        (sum, bill) => sum + parseFloat((bill.grandTotal ?? 0).toString()),
        0,
      ),
      billCount: v.bills.length,
    }));

    return vendorSpend.sort((a, b) => b.totalAmount - a.totalAmount).slice(0, limit);
  }

  async getPurchaseTrend(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:purchase-trend:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computePurchaseTrend(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computePurchaseTrend(organizationId: string, months: number) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

    const [bills, expenses] = await Promise.all([
      this.prisma.bill.findMany({
        where: { organizationId, deletedAt: null, date: { gte: startDate } },
        select: { date: true, grandTotal: true },
      }),
      this.prisma.expense.findMany({
        where: { organizationId, date: { gte: startDate } },
        select: { date: true, amount: true },
      }),
    ]);

    const billsByMonth: Record<string, number> = {};
    const expensesByMonth: Record<string, number> = {};

    for (const b of bills) {
      const key = `${b.date.getFullYear()}-${b.date.getMonth()}`;
      billsByMonth[key] = (billsByMonth[key] || 0) + parseFloat(b.grandTotal.toString());
    }
    for (const e of expenses) {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}`;
      expensesByMonth[key] = (expensesByMonth[key] || 0) + parseFloat(e.amount.toString());
    }

    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        bills: billsByMonth[key] || 0,
        expenses: expensesByMonth[key] || 0,
        total: (billsByMonth[key] || 0) + (expensesByMonth[key] || 0),
      });
    }

    return data;
  }

  async getExpenseTrend(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:expense-trend:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeExpenseTrend(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computeExpenseTrend(organizationId: string, months: number) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

    const expenses = await this.prisma.expense.findMany({
      where: { organizationId, date: { gte: startDate } },
      include: { account: { select: { name: true } } },
    });

    const monthlyCategories: Record<string, Record<string, number>> = {};

    for (const e of expenses) {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}`;
      const category = e.account?.name || 'Uncategorized';
      if (!monthlyCategories[key]) monthlyCategories[key] = {};
      monthlyCategories[key][category] =
        (monthlyCategories[key][category] || 0) + parseFloat(e.amount.toString());
    }

    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const catObj = monthlyCategories[key] || {};
      const amount = Object.values(catObj).reduce((sum, v) => sum + v, 0);
      const categories = Object.entries(catObj).map(([name, amt]) => ({ name, amount: amt }));
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        amount,
        categories,
      });
    }

    return data;
  }

  async getVendorPaymentTime(organizationId: string, limit: number = 10) {
    const cacheKey = `dashboard:vendor-payment-time:${limit}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeVendorPaymentTime(organizationId, limit),
      { ttl: 120, organizationId },
    );
  }

  private async computeVendorPaymentTime(organizationId: string, limit: number) {
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        bills: {
          where: { deletedAt: null, status: BillStatus.PAID },
          select: { date: true, id: true },
        },
        paymentsMade: {
          select: { date: true, amount: true },
        },
      },
    });

    const vendorPaymentTimes = vendors
      .filter((v) => v.bills.length > 0 && v.paymentsMade.length > 0)
      .map((v) => {
        const totalDays = v.bills.reduce((sum, bill) => {
          const matchingPayment = v.paymentsMade.find((p) => p.date >= bill.date);
          if (matchingPayment) {
            const diffMs = matchingPayment.date.getTime() - bill.date.getTime();
            return sum + Math.floor(diffMs / (1000 * 60 * 60 * 24));
          }
          return sum;
        }, 0);

        return {
          id: v.id,
          vendorName: v.name,
          avgDays: v.bills.length > 0 ? Math.round(totalDays / v.bills.length) : 0,
          billCount: v.bills.length,
        };
      })
      .sort((a, b) => b.billCount - a.billCount);

    return vendorPaymentTimes.slice(0, limit);
  }

  // ============ HR (Tab 5) ============

  async getPayrollTrend(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:payroll-trend:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computePayrollTrend(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computePayrollTrend(organizationId: string, months: number) {
    const today = new Date();
    const startYear = new Date(today.getFullYear(), today.getMonth() - months + 1, 1).getFullYear();

    const payrollRuns = await this.prisma.payrollRun.findMany({
      where: {
        organizationId,
        deletedAt: null,
        year: { gte: startYear },
      },
      select: { month: true, year: true, totalGross: true, totalDeductions: true, totalNet: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const m = d.getMonth() + 1; // PayrollRun uses 1-based months
      const y = d.getFullYear();
      const run = payrollRuns.find((r) => r.month === m && r.year === y);
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        grossPay: run ? parseFloat(run.totalGross.toString()) : 0,
        deductions: run ? parseFloat(run.totalDeductions.toString()) : 0,
        netPay: run ? parseFloat(run.totalNet.toString()) : 0,
      });
    }

    return data;
  }

  async getDepartmentHeadcount(organizationId: string) {
    const cacheKey = `dashboard:department-headcount`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeDepartmentHeadcount(organizationId),
      { ttl: 120, organizationId },
    );
  }

  private async computeDepartmentHeadcount(organizationId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { organizationId, deletedAt: null, isActive: true },
      select: { department: true },
    });

    const counts: Record<string, number> = {};
    for (const e of employees) {
      const dept = e.department || 'Unassigned';
      counts[dept] = (counts[dept] || 0) + 1;
    }

    return Object.entries(counts)
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getAttendanceOverview(organizationId: string, days: number = 30) {
    const cacheKey = `dashboard:attendance-overview:${days}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeAttendanceOverview(organizationId, days),
      { ttl: 120, organizationId },
    );
  }

  private async computeAttendanceOverview(organizationId: string, days: number) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const records = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { organizationId, date: { gte: startDate } },
      _count: { id: true },
    });

    const statusCounts: Record<string, number> = {};
    for (const status of Object.values(AttendanceStatus)) {
      statusCounts[status] = 0;
    }
    for (const r of records) {
      statusCounts[r.status] = r._count.id;
    }

    return Object.entries(statusCounts).map(([status, count]) => ({ status, count }));
  }

  async getSalaryDistribution(organizationId: string) {
    const cacheKey = `dashboard:salary-distribution`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeSalaryDistribution(organizationId),
      { ttl: 120, organizationId },
    );
  }

  private async computeSalaryDistribution(organizationId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { organizationId, deletedAt: null, isActive: true },
      select: { basicSalary: true },
    });

    const ranges = [
      { label: '0-3K', min: 0, max: 3000 },
      { label: '3K-5K', min: 3000, max: 5000 },
      { label: '5K-10K', min: 5000, max: 10000 },
      { label: '10K-20K', min: 10000, max: 20000 },
      { label: '20K-50K', min: 20000, max: 50000 },
      { label: '50K+', min: 50000, max: Infinity },
    ];

    const distribution = ranges.map((range) => ({
      range: range.label,
      count: employees.filter((e) => {
        const salary = parseFloat(e.basicSalary.toString());
        return salary >= range.min && salary < range.max;
      }).length,
    }));

    return distribution;
  }

  async getAttritionRisk(organizationId: string) {
    const cacheKey = `dashboard:attrition-risk`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeAttritionRisk(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeAttritionRisk(organizationId: string) {
    const profiles = await this.prisma.employeeAiProfile.findMany({
      where: { organizationId },
      select: { attritionRisk: true },
    });

    let low = 0;
    let medium = 0;
    let high = 0;

    for (const p of profiles) {
      const risk = parseFloat(p.attritionRisk.toString());
      if (risk < 0.3) low++;
      else if (risk <= 0.6) medium++;
      else high++;
    }

    const total = low + medium + high;
    return [
      { level: 'Low', count: low, percentage: total > 0 ? Math.round((low / total) * 100) : 0 },
      {
        level: 'Medium',
        count: medium,
        percentage: total > 0 ? Math.round((medium / total) * 100) : 0,
      },
      { level: 'High', count: high, percentage: total > 0 ? Math.round((high / total) * 100) : 0 },
    ];
  }

  // ============ Inventory (Tab 6) ============

  async getStockLevels(organizationId: string, limit: number = 15) {
    const cacheKey = `dashboard:stock-levels:${limit}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeStockLevels(organizationId, limit),
      { ttl: 120, organizationId },
    );
  }

  private async computeStockLevels(organizationId: string, limit: number) {
    const items = await this.prisma.item.findMany({
      where: {
        organizationId,
        deletedAt: null,
        trackInventory: true,
      },
      include: {
        inventoryLevels: {
          where: { organizationId },
          select: { quantity: true },
        },
      },
      take: limit,
    });

    return items.map((item) => {
      const totalQuantity = item.inventoryLevels.reduce(
        (sum: number, il: { quantity: Decimal }) => sum + parseFloat((il.quantity ?? 0).toString()),
        0,
      );
      return {
        itemName: item.name,
        currentStock: totalQuantity,
        reorderLevel: item.reorderLevel ?? 0,
      };
    });
  }

  async getInventoryMovements(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:inventory-movements:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeInventoryMovements(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computeInventoryMovements(organizationId: string, months: number) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

    const movements = await this.prisma.inventoryMovement.findMany({
      where: { organizationId, createdAt: { gte: startDate } },
      select: { createdAt: true, quantity: true, movementType: true },
    });

    const inByMonth: Record<string, number> = {};
    const outByMonth: Record<string, number> = {};

    for (const mv of movements) {
      const key = `${mv.createdAt.getFullYear()}-${mv.createdAt.getMonth()}`;
      const qty = parseFloat(mv.quantity.toString());
      if (mv.movementType === 'IN') {
        inByMonth[key] = (inByMonth[key] || 0) + qty;
      } else {
        outByMonth[key] = (outByMonth[key] || 0) + qty;
      }
    }

    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        inQty: inByMonth[key] || 0,
        outQty: outByMonth[key] || 0,
      });
    }

    return data;
  }

  async getReorderAlerts(organizationId: string) {
    const cacheKey = `dashboard:reorder-alerts`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeReorderAlerts(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeReorderAlerts(organizationId: string) {
    const alerts = await this.prisma.itemReorderAnalysis.findMany({
      where: {
        organizationId,
        status: { in: [ReorderStatus.LOW_STOCK, ReorderStatus.CRITICAL] },
      },
      include: {
        item: {
          select: {
            name: true,
            inventoryLevels: {
              where: { organizationId },
              select: { quantity: true },
            },
          },
        },
      },
      orderBy: { calculatedAt: 'desc' },
    });

    return alerts.map((a) => {
      const currentStock = a.item.inventoryLevels.reduce(
        (sum: number, il: { quantity: Decimal }) => sum + parseFloat((il.quantity ?? 0).toString()),
        0,
      );
      return {
        itemName: a.item.name,
        currentStock,
        reorderPoint: a.reorderPoint,
        status: a.status,
      };
    });
  }

  async getWorkOrderStatus(organizationId: string) {
    const cacheKey = `dashboard:work-order-status`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeWorkOrderStatus(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeWorkOrderStatus(organizationId: string) {
    const counts = await this.prisma.workOrder.groupBy({
      by: ['status'],
      where: { organizationId, deletedAt: null },
      _count: { id: true },
    });

    const statusCounts: Record<string, number> = {};
    for (const status of Object.values(WorkOrderStatus)) {
      statusCounts[status] = 0;
    }
    for (const c of counts) {
      statusCounts[c.status] = c._count.id;
    }

    return Object.entries(statusCounts).map(([status, count]) => ({ status, count }));
  }

  async getProductionEfficiency(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:production-efficiency:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeProductionEfficiency(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computeProductionEfficiency(organizationId: string, months: number) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

    const workOrders = await this.prisma.workOrder.findMany({
      where: { organizationId, deletedAt: null, createdAt: { gte: startDate } },
      select: { status: true, createdAt: true, completedDate: true, plannedStartDate: true },
    });

    const plannedByMonth: Record<string, number> = {};
    const completedByMonth: Record<string, number> = {};

    for (const wo of workOrders) {
      const key = `${wo.createdAt.getFullYear()}-${wo.createdAt.getMonth()}`;
      plannedByMonth[key] = (plannedByMonth[key] || 0) + 1;
      if (wo.status === WorkOrderStatus.COMPLETED) {
        const compKey = wo.completedDate
          ? `${wo.completedDate.getFullYear()}-${wo.completedDate.getMonth()}`
          : key;
        completedByMonth[compKey] = (completedByMonth[compKey] || 0) + 1;
      }
    }

    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const planned = plannedByMonth[key] || 0;
      const completed = completedByMonth[key] || 0;
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        planned,
        completed,
        efficiency: planned > 0 ? Math.round((completed / planned) * 100) : 0,
      });
    }

    return data;
  }

  // ============ Projects (Tab 7) ============

  async getProjectBudgets(organizationId: string) {
    const cacheKey = `dashboard:project-budgets`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeProjectBudgets(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeProjectBudgets(organizationId: string) {
    const projects = await this.prisma.project.findMany({
      where: {
        organizationId,
        status: { in: [ProjectStatus.ACTIVE, ProjectStatus.IN_PROGRESS] },
      },
      include: {
        expenses: { select: { amount: true } },
        bills: { where: { deletedAt: null }, select: { grandTotal: true } },
        timesheetEntries: { select: { duration: true, hours: true } },
      },
    });

    return projects.map((p) => {
      const budget = parseFloat((p.budgetAmount ?? p.budget ?? 0).toString());
      const expenseSpend = p.expenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
      const billSpend = p.bills.reduce((sum, b) => sum + parseFloat(b.grandTotal.toString()), 0);
      const actualSpend = expenseSpend + billSpend;
      return {
        name: p.name,
        budget,
        spent: actualSpend,
        remaining: Math.max(budget - actualSpend, 0),
      };
    });
  }

  async getBillableHours(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:billable-hours:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeBillableHours(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computeBillableHours(organizationId: string, months: number) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

    const entries = await this.prisma.timesheetEntry.findMany({
      where: { organizationId, date: { gte: startDate } },
      select: { date: true, duration: true, hours: true, isBillable: true },
    });

    const billableByMonth: Record<string, number> = {};
    const nonBillableByMonth: Record<string, number> = {};

    for (const e of entries) {
      const key = `${e.date.getFullYear()}-${e.date.getMonth()}`;
      const hrs = parseFloat((e.hours ?? e.duration).toString());
      if (e.isBillable) {
        billableByMonth[key] = (billableByMonth[key] || 0) + hrs;
      } else {
        nonBillableByMonth[key] = (nonBillableByMonth[key] || 0) + hrs;
      }
    }

    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        billable: Math.round((billableByMonth[key] || 0) * 100) / 100,
        nonBillable: Math.round((nonBillableByMonth[key] || 0) * 100) / 100,
      });
    }

    return data;
  }

  async getTaskStatus(organizationId: string) {
    const cacheKey = `dashboard:task-status`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeTaskStatus(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeTaskStatus(organizationId: string) {
    const counts = await this.prisma.task.groupBy({
      by: ['status'],
      where: {
        organizationId,
        deletedAt: null,
        project: {
          status: { in: [ProjectStatus.ACTIVE, ProjectStatus.IN_PROGRESS] },
        },
      },
      _count: { id: true },
    });

    const statusCounts: Record<string, number> = {};
    for (const status of Object.values(TaskStatus)) {
      statusCounts[status] = 0;
    }
    for (const c of counts) {
      statusCounts[c.status] = c._count.id;
    }

    return Object.entries(statusCounts).map(([status, count]) => ({ status, count }));
  }

  async getProjectProfitability(organizationId: string) {
    const cacheKey = `dashboard:project-profitability`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeProjectProfitability(organizationId),
      { ttl: 120, organizationId },
    );
  }

  private async computeProjectProfitability(organizationId: string) {
    const projects = await this.prisma.project.findMany({
      where: { organizationId },
      include: {
        invoices: {
          where: { deletedAt: null },
          select: { grandTotal: true },
        },
        expenses: { select: { amount: true } },
        bills: {
          where: { deletedAt: null },
          select: { grandTotal: true },
        },
      },
    });

    return projects.map((p) => {
      const revenue = p.invoices.reduce(
        (sum, inv) => sum + parseFloat(inv.grandTotal.toString()),
        0,
      );
      const expenseCost = p.expenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);
      const billCost = p.bills.reduce((sum, b) => sum + parseFloat(b.grandTotal.toString()), 0);
      const totalCost = expenseCost + billCost;
      const profit = revenue - totalCost;

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        revenue,
        cost: totalCost,
        profit,
        margin: revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0,
      };
    });
  }

  // ============ CRM (Tab 8) ============

  async getDealPipeline(organizationId: string) {
    const cacheKey = `dashboard:deal-pipeline`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeDealPipeline(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeDealPipeline(organizationId: string) {
    const deals = await this.prisma.deal.groupBy({
      by: ['stage'],
      where: { organizationId, deletedAt: null },
      _count: { id: true },
      _sum: { expectedAmount: true },
    });

    return Object.values(DealStage).map((stage) => {
      const match = deals.find((d) => d.stage === stage);
      return {
        stage,
        count: match?._count.id || 0,
        value: match?._sum.expectedAmount ? parseFloat(match._sum.expectedAmount.toString()) : 0,
      };
    });
  }

  async getLeadsBySource(organizationId: string) {
    const cacheKey = `dashboard:leads-by-source`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeLeadsBySource(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeLeadsBySource(organizationId: string) {
    const counts = await this.prisma.lead.groupBy({
      by: ['source'],
      where: { organizationId, deletedAt: null },
      _count: { id: true },
    });

    return Object.values(LeadSource).map((source) => {
      const match = counts.find((c) => c.source === source);
      return {
        source,
        count: match?._count.id || 0,
      };
    });
  }

  async getLeadConversionTrend(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:lead-conversion-trend:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeLeadConversionTrend(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computeLeadConversionTrend(organizationId: string, months: number) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

    const [wonLeads, allLeads] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          organizationId,
          deletedAt: null,
          status: LeadStatus.WON,
          convertedAt: { gte: startDate },
        },
        select: { convertedAt: true },
      }),
      this.prisma.lead.findMany({
        where: {
          organizationId,
          deletedAt: null,
          createdAt: { gte: startDate },
        },
        select: { createdAt: true },
      }),
    ]);

    const convertedByMonth: Record<string, number> = {};
    for (const lead of wonLeads) {
      if (lead.convertedAt) {
        const key = `${lead.convertedAt.getFullYear()}-${lead.convertedAt.getMonth()}`;
        convertedByMonth[key] = (convertedByMonth[key] || 0) + 1;
      }
    }

    const totalByMonth: Record<string, number> = {};
    for (const lead of allLeads) {
      const key = `${lead.createdAt.getFullYear()}-${lead.createdAt.getMonth()}`;
      totalByMonth[key] = (totalByMonth[key] || 0) + 1;
    }

    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const converted = convertedByMonth[key] || 0;
      const total = totalByMonth[key] || 0;
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        converted,
        total,
        rate: total > 0 ? Math.round((converted / total) * 10000) / 100 : 0,
      });
    }

    return data;
  }

  async getDealWinRate(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:deal-win-rate:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeDealWinRate(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  private async computeDealWinRate(organizationId: string, months: number) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

    const deals = await this.prisma.deal.findMany({
      where: {
        organizationId,
        deletedAt: null,
        stage: { in: [DealStage.WON, DealStage.LOST] },
        actualCloseDate: { gte: startDate },
      },
      select: { stage: true, actualCloseDate: true },
    });

    const wonByMonth: Record<string, number> = {};
    const lostByMonth: Record<string, number> = {};

    for (const deal of deals) {
      if (deal.actualCloseDate) {
        const key = `${deal.actualCloseDate.getFullYear()}-${deal.actualCloseDate.getMonth()}`;
        if (deal.stage === DealStage.WON) {
          wonByMonth[key] = (wonByMonth[key] || 0) + 1;
        } else {
          lostByMonth[key] = (lostByMonth[key] || 0) + 1;
        }
      }
    }

    const data = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const won = wonByMonth[key] || 0;
      const lost = lostByMonth[key] || 0;
      const total = won + lost;
      data.push({
        month: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
        won,
        lost,
        rate: total > 0 ? Math.round((won / total) * 10000) / 100 : 0,
      });
    }

    return data;
  }

  // ============ AI (Tab 9) ============

  async getAnomalyTimeline(organizationId: string, days: number = 90) {
    const cacheKey = `dashboard:anomaly-timeline:${days}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computeAnomalyTimeline(organizationId, days),
      { ttl: 120, organizationId },
    );
  }

  private async computeAnomalyTimeline(organizationId: string, days: number) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const anomalies = await this.prisma.aiAnomaly.findMany({
      where: { organizationId, createdAt: { gte: startDate } },
      select: {
        id: true,
        type: true,
        severity: true,
        entityType: true,
        value: true,
        expectedValue: true,
        description: true,
        isResolved: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return anomalies.map((a) => ({
      id: a.id,
      date: a.createdAt,
      type: a.type,
      severity: a.severity,
      entityType: a.entityType,
      value: parseFloat(a.value.toString()),
      expectedValue: parseFloat(a.expectedValue.toString()),
      description: a.description,
      isResolved: a.isResolved,
    }));
  }
}
