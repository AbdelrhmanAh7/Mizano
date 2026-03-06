import { Injectable } from '@nestjs/common';
import { BillStatus, InvoiceStatus, ProjectStatus } from '@prisma/client';
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

  private async getTotalPayables(organizationId: string) {
    const bills = await this.prisma.bill.aggregate({
      where: { organizationId, deletedAt: null, balanceDue: { gt: 0 } },
      _sum: { balanceDue: true },
    });
    return parseFloat(bills._sum.balanceDue?.toString() || '0');
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
}
