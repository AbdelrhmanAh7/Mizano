import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { InvoiceStatus, BillStatus, ProjectStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardOverview(organizationId: string) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    // Get key metrics in parallel
    const [
      totalReceivables,
      totalPayables,
      monthlyRevenue,
      monthlyExpenses,
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
      this.getMonthlyRevenue(organizationId, startOfMonth),
      this.getMonthlyExpenses(organizationId, startOfMonth),
      this.getYearlyRevenue(organizationId, startOfYear),
      this.getBankBalances(organizationId),
      this.getOverdueInvoicesCount(organizationId),
      this.getOverdueBillsCount(organizationId),
      this.getRecentInvoices(organizationId, 5),
      this.getRecentBills(organizationId, 5),
      this.getActiveProjectsCount(organizationId),
      this.getUpcomingPayments(organizationId, 7),
    ]);

    return {
      overview: {
        totalReceivables,
        totalPayables,
        netPosition: totalReceivables - totalPayables,
        monthlyRevenue,
        monthlyExpenses,
        monthlyProfit: monthlyRevenue - monthlyExpenses,
        yearlyRevenue,
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
    const data = [];
    const today = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);

      const invoices = await this.prisma.invoice.findMany({
        where: {
          organizationId,
          issueDate: { gte: start, lte: end },
          deletedAt: null,
        },
      });

      const revenue = invoices.reduce((sum, inv) => sum + parseFloat((inv.total ?? inv.grandTotal).toString()), 0);

      const expenses = await this.prisma.expense.findMany({
        where: { organizationId, date: { gte: start, lte: end } },
      });
      const bills = await this.prisma.bill.findMany({
        where: { organizationId, billDate: { gte: start, lte: end }, deletedAt: null },
      });

      const totalExpenses =
        expenses.reduce((sum, exp) => sum + parseFloat(exp.amount.toString()), 0) +
        bills.reduce((sum, bill) => sum + parseFloat((bill.total ?? bill.grandTotal).toString()), 0);

      data.push({
        month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
        revenue,
        expenses: totalExpenses,
        profit: revenue - totalExpenses,
      });
    }

    return data;
  }

  async getCashFlowChart(organizationId: string, days: number = 30) {
    const data = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      // Cash in (payments received)
      const paymentsIn = await this.prisma.paymentReceived.findMany({
        where: { organizationId, date: { gte: date, lt: nextDay } },
      });
      const cashIn = paymentsIn.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

      // Cash out (payments made + expenses)
      const paymentsOut = await this.prisma.paymentMade.findMany({
        where: { organizationId, date: { gte: date, lt: nextDay } },
      });
      const expenses = await this.prisma.expense.findMany({
        where: { organizationId, date: { gte: date, lt: nextDay } },
      });
      const cashOut =
        paymentsOut.reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0) +
        expenses.reduce((sum, e) => sum + parseFloat(e.amount.toString()), 0);

      data.push({
        date: date.toISOString().split('T')[0],
        cashIn,
        cashOut,
        net: cashIn - cashOut,
      });
    }

    return data;
  }

  async getTopCustomers(organizationId: string, limit: number = 5) {
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        invoices: {
          where: { deletedAt: null },
          select: { total: true },
        },
      },
    });

    const customerRevenue = customers.map((c) => ({
      id: c.id,
      name: c.name,
      totalRevenue: c.invoices.reduce((sum, inv) => sum + parseFloat((inv.total ?? 0).toString()), 0),
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
      const hoursLogged = p.timesheetEntries.reduce((sum, t) => sum + parseFloat((t.hours ?? t.duration).toString()), 0);
      const revenue = p.invoices.reduce((sum, inv) => sum + parseFloat((inv.total ?? inv.grandTotal).toString()), 0);
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
      where: { organizationId, deletedAt: null, issueDate: { gte: startOfMonth } },
      _sum: { total: true },
    });
    return parseFloat(invoices._sum.total?.toString() || '0');
  }

  private async getMonthlyExpenses(organizationId: string, startOfMonth: Date) {
    const expenses = await this.prisma.expense.aggregate({
      where: { organizationId, date: { gte: startOfMonth } },
      _sum: { amount: true },
    });
    const bills = await this.prisma.bill.aggregate({
      where: { organizationId, deletedAt: null, billDate: { gte: startOfMonth } },
      _sum: { total: true },
    });
    return parseFloat(expenses._sum.amount?.toString() || '0') + parseFloat(bills._sum.total?.toString() || '0');
  }

  private async getYearlyRevenue(organizationId: string, startOfYear: Date) {
    const invoices = await this.prisma.invoice.aggregate({
      where: { organizationId, deletedAt: null, issueDate: { gte: startOfYear } },
      _sum: { total: true },
    });
    return parseFloat(invoices._sum.total?.toString() || '0');
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
}
