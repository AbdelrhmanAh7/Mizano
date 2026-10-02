import { signedMovementQuantity } from '../../inventory/utils/movement-sign';
import { Injectable } from '@nestjs/common';
import {
  AccountType,
  AttendanceStatus,
  BillStatus,
  CreditNoteType,
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
import {
  MAX_DAYS,
  POSTED_BILL_STATUSES,
  POSTED_EXPENSE_STATUSES,
  POSTED_INVOICE_STATUSES,
  endOfUtcDay,
  isIncomeType,
  lastMonths,
  money,
  monthKey,
  naturalBalance,
  parseReportDate,
  postedLineRows,
  resolveCashAccountIds,
  startOfUtcDay,
  sumDecimals,
  sumPostedLinesByAccount,
  toDecimal,
  toIsoDate,
} from '../utils/report-utils';

const ZERO = new Decimal(0);
const COGS_PREFIX = '5';

interface PlAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
}

/**
 * Dashboard figures follow the same rules as the financial reports: ledger figures (revenue,
 * expenses, cash, account balances) come only from posted, non-deleted journal lines; document
 * figures (receivables, payables, status charts) exclude DRAFT, VOID and soft-deleted records.
 * All sums are exact Decimal and money leaves as fixed 4-dp strings.
 */
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
    const periodEnd = parseReportDate(endDate, 'end', 'endDate') ?? endOfUtcDay(today);
    const periodStart =
      parseReportDate(startDate, 'start', 'startDate') ??
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

    // Compute equivalent previous period for trend comparison
    const periodMs = periodEnd.getTime() - periodStart.getTime();
    const prevPeriodEnd = new Date(periodStart.getTime() - 1);
    const prevPeriodStart = new Date(prevPeriodEnd.getTime() - periodMs);
    const startOfYear = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

    const accounts = await this.getPlAccounts(organizationId);

    const [
      totalReceivables,
      totalPayables,
      period,
      previous,
      yearly,
      cash,
      overdueInvoices,
      overdueBills,
      recentInvoices,
      recentBills,
      activeProjects,
      upcomingPayments,
    ] = await Promise.all([
      this.getTotalReceivables(organizationId),
      this.getTotalPayables(organizationId),
      this.getLedgerProfitAndLoss(organizationId, accounts, periodStart, periodEnd),
      this.getLedgerProfitAndLoss(organizationId, accounts, prevPeriodStart, prevPeriodEnd),
      this.getLedgerProfitAndLoss(organizationId, accounts, startOfYear, endOfUtcDay(today)),
      this.getCashAndBank(organizationId),
      this.getOverdueInvoicesCount(organizationId),
      this.getOverdueBillsCount(organizationId),
      this.getRecentInvoices(organizationId, 5),
      this.getRecentBills(organizationId, 5),
      this.getActiveProjectsCount(organizationId),
      this.getUpcomingPayments(organizationId, 7),
    ]);

    const periodProfit = period.revenue.sub(period.expenses);
    const prevProfit = previous.revenue.sub(previous.expenses);

    return {
      overview: {
        totalReceivables: money(totalReceivables),
        totalPayables: money(totalPayables),
        netPosition: money(totalReceivables.sub(totalPayables)),
        monthlyRevenue: money(period.revenue),
        monthlyExpenses: money(period.expenses),
        monthlyProfit: money(periodProfit),
        yearlyRevenue: money(yearly.revenue),
        cashBalance: money(cash.total),
      },
      trends: {
        revenue: this.computeTrend(period.revenue, previous.revenue),
        expenses: this.computeTrend(period.expenses, previous.expenses),
        profit: this.computeTrend(periodProfit, prevProfit),
      },
      alerts: {
        overdueInvoices,
        overdueBills,
        activeProjects,
      },
      bankBalances: cash.accounts,
      recentActivity: {
        invoices: recentInvoices,
        bills: recentBills,
      },
      upcomingPayments,
    };
  }

  /** Revenue/income and expense accounts of the tenant (the P&L universe). */
  private async getPlAccounts(organizationId: string): Promise<PlAccount[]> {
    return this.prisma.account.findMany({
      where: {
        organizationId,
        deletedAt: null,
        type: { in: [AccountType.REVENUE, AccountType.INCOME, AccountType.EXPENSE] },
      },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: 'asc' },
    });
  }

  /** Posted-ledger revenue and expenses between two instants (one grouped query). */
  private async getLedgerProfitAndLoss(
    organizationId: string,
    accounts: PlAccount[],
    start: Date,
    end: Date,
  ): Promise<{ revenue: Decimal; expenses: Decimal }> {
    const totals = await sumPostedLinesByAccount(
      this.prisma,
      organizationId,
      { gte: start, lte: end },
      accounts.map((a) => a.id),
    );
    let revenue = ZERO;
    let expenses = ZERO;
    for (const account of accounts) {
      const t = totals.get(account.id);
      if (!t) continue;
      const value = naturalBalance(account.type, t.debit, t.credit);
      if (isIncomeType(account.type)) revenue = revenue.add(value);
      else expenses = expenses.add(value);
    }
    return { revenue, expenses };
  }

  /**
   * Cash and bank from the posted ledger: the total over every cash/bank ledger account plus each
   * active bank account's ledger balance (its stored balance only when nothing is linked).
   */
  private async getCashAndBank(organizationId: string): Promise<{
    total: Decimal;
    accounts: Array<{
      id: string;
      name: string;
      currency: string;
      linkedAccountId: string;
      systemBalance: string;
      bankBalance: string;
    }>;
  }> {
    const [cashIds, bankAccounts] = await Promise.all([
      resolveCashAccountIds(this.prisma, organizationId),
      this.prisma.bankAccount.findMany({
        where: { organizationId, isActive: true, deletedAt: null },
        select: {
          id: true,
          name: true,
          systemBalance: true,
          bankBalance: true,
          currency: true,
          linkedAccountId: true,
        },
      }),
    ]);
    const linkedIds = bankAccounts.map((b) => b.linkedAccountId);
    // Current balance: nothing dated after the end of today (UTC) counts yet.
    const totals = await sumPostedLinesByAccount(
      this.prisma,
      organizationId,
      { lte: endOfUtcDay(new Date()) },
      [...new Set([...cashIds, ...linkedIds])],
    );
    const balance = (accountId: string): Decimal => {
      const t = totals.get(accountId);
      return t ? t.debit.sub(t.credit) : ZERO;
    };
    return {
      total: sumDecimals(cashIds.map(balance)),
      accounts: bankAccounts.map((b) => ({
        id: b.id,
        name: b.name,
        currency: b.currency,
        linkedAccountId: b.linkedAccountId,
        systemBalance: money(balance(b.linkedAccountId)),
        bankBalance: money(b.bankBalance),
      })),
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

  /** Posted-ledger revenue, COGS and other expenses per UTC month (one journal-line query). */
  private async monthlyLedgerPl(
    organizationId: string,
    months: number,
  ): Promise<{
    buckets: ReturnType<typeof lastMonths>;
    byMonth: Map<string, { revenue: Decimal; expenses: Decimal; cogs: Decimal }>;
  }> {
    const buckets = lastMonths(months);
    const accounts = await this.getPlAccounts(organizationId);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const rows = await postedLineRows(
      this.prisma,
      organizationId,
      accounts.map((a) => a.id),
      { gte: buckets[0].start, lte: buckets[buckets.length - 1].end },
    );
    const byMonth = new Map<string, { revenue: Decimal; expenses: Decimal; cogs: Decimal }>();
    for (const row of rows) {
      const account = byId.get(row.accountId);
      if (!account) continue;
      const key = monthKey(row.date);
      const entry = byMonth.get(key) ?? { revenue: ZERO, expenses: ZERO, cogs: ZERO };
      const value = naturalBalance(account.type, row.debit, row.credit);
      if (isIncomeType(account.type)) entry.revenue = entry.revenue.add(value);
      else {
        entry.expenses = entry.expenses.add(value);
        if (account.code.startsWith(COGS_PREFIX)) entry.cogs = entry.cogs.add(value);
      }
      byMonth.set(key, entry);
    }
    return { buckets, byMonth };
  }

  private async computeRevenueChart(organizationId: string, months: number = 12) {
    const { buckets, byMonth } = await this.monthlyLedgerPl(organizationId, months);
    return buckets.map((b) => {
      const entry = byMonth.get(b.key);
      const revenue = entry?.revenue ?? ZERO;
      const expenses = entry?.expenses ?? ZERO;
      return {
        month: b.label,
        revenue: money(revenue),
        expenses: money(expenses),
        profit: money(revenue.sub(expenses)),
      };
    });
  }

  /**
   * Daily cash movement of the cash/bank ledger accounts. Each journal contributes its net effect
   * on cash once (a transfer between two bank accounts is neither in nor out).
   */
  async getCashFlowChart(organizationId: string, requestedDays: number = 30) {
    const days = Number.isFinite(requestedDays)
      ? Math.min(MAX_DAYS, Math.max(1, Math.trunc(requestedDays)))
      : 30;
    const today = new Date();
    const start = startOfUtcDay(new Date(today.getTime() - (days - 1) * 86_400_000));
    const cashIds = await resolveCashAccountIds(this.prisma, organizationId);
    const rows = await postedLineRows(this.prisma, organizationId, cashIds, {
      gte: start,
      lte: endOfUtcDay(today),
    });

    const netByJournal = new Map<string, { day: string; net: Decimal }>();
    for (const row of rows) {
      const entry = netByJournal.get(row.journalId) ?? { day: toIsoDate(row.date), net: ZERO };
      entry.net = entry.net.add(row.debit).sub(row.credit);
      netByJournal.set(row.journalId, entry);
    }
    const cashIn = new Map<string, Decimal>();
    const cashOut = new Map<string, Decimal>();
    for (const { day, net } of netByJournal.values()) {
      if (net.greaterThan(0)) cashIn.set(day, (cashIn.get(day) ?? ZERO).add(net));
      else if (net.lessThan(0)) cashOut.set(day, (cashOut.get(day) ?? ZERO).add(net.abs()));
    }

    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = toIsoDate(new Date(today.getTime() - i * 86_400_000));
      const inflow = cashIn.get(day) ?? ZERO;
      const outflow = cashOut.get(day) ?? ZERO;
      data.push({
        date: day,
        cashIn: money(inflow),
        cashOut: money(outflow),
        net: money(inflow.sub(outflow)),
      });
    }
    return data;
  }

  async getTopCustomers(organizationId: string, limit: number = 5) {
    const groups = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: {
        organizationId,
        deletedAt: null,
        status: { in: POSTED_INVOICE_STATUSES },
      },
      _sum: { grandTotal: true },
      _count: { id: true },
    });
    const top = groups
      .map((g) => ({
        customerId: g.customerId,
        total: toDecimal(g._sum.grandTotal),
        count: g._count.id,
      }))
      .sort((a, b) => b.total.comparedTo(a.total))
      .slice(0, limit);

    const customers =
      top.length > 0
        ? await this.prisma.customer.findMany({
            where: { organizationId, id: { in: top.map((t) => t.customerId) } },
            select: { id: true, name: true },
          })
        : [];
    const names = new Map(customers.map((c) => [c.id, c.name]));

    return top.map((t) => ({
      id: t.customerId,
      name: names.get(t.customerId) ?? '',
      totalRevenue: money(t.total),
      invoiceCount: t.count,
    }));
  }

  /** Expense totals per expense account from the posted ledger. */
  async getExpensesByCategory(organizationId: string, startDate: string, endDate: string) {
    const start = parseReportDate(startDate, 'start', 'startDate');
    const end = parseReportDate(endDate, 'end', 'endDate');
    const accounts = (await this.getPlAccounts(organizationId)).filter(
      (a) => a.type === AccountType.EXPENSE,
    );
    const totals = await sumPostedLinesByAccount(
      this.prisma,
      organizationId,
      { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) },
      accounts.map((a) => a.id),
    );

    return accounts
      .map((a) => {
        const t = totals.get(a.id);
        return {
          category: a.name,
          value: t ? naturalBalance(a.type, t.debit, t.credit) : ZERO,
        };
      })
      .filter((c) => !c.value.isZero())
      .sort((a, b) => b.value.comparedTo(a.value))
      .map((c) => ({ category: c.category, amount: money(c.value) }));
  }

  async getProjectsOverview(organizationId: string) {
    const projects = await this.prisma.project.findMany({
      where: { organizationId },
      include: {
        timesheetEntries: true,
        invoices: {
          where: { deletedAt: null, status: { in: POSTED_INVOICE_STATUSES } },
        },
      },
    });

    return projects.map((p) => {
      const hoursLogged = p.timesheetEntries.reduce(
        (sum, t) => sum + parseFloat((t.hours ?? t.duration).toString()),
        0,
      );
      const revenue = sumDecimals(p.invoices.map((inv) => inv.grandTotal));
      const budget = toDecimal(p.budget);

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        hoursLogged,
        revenue: money(revenue),
        budget: money(budget),
        budgetUsedPercent: budget.greaterThan(0) ? revenue.div(budget).mul(100).toNumber() : 0,
      };
    });
  }

  private computeTrend(
    current: Decimal,
    previous: Decimal,
  ): { value: number; isPositive: boolean } {
    if (previous.isZero()) {
      return {
        value: current.greaterThan(0) ? 100 : 0,
        isPositive: current.greaterThanOrEqualTo(0),
      };
    }
    const change = current.sub(previous).div(previous.abs()).mul(100);
    return {
      value: change.abs().toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
      isPositive: change.greaterThanOrEqualTo(0),
    };
  }

  /**
   * AR total = balances of issued invoices minus live APPLY_TO_INVOICE credit notes that are not
   * yet applied (they credited AR without reducing any invoice), so it matches the AR control
   * account. DRAFT, VOID and deleted records never count.
   */
  private async getTotalReceivables(organizationId: string): Promise<Decimal> {
    const [invoices, credits] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          organizationId,
          deletedAt: null,
          balanceDue: { gt: 0 },
          status: { in: POSTED_INVOICE_STATUSES },
        },
        _sum: { balanceDue: true },
      }),
      this.prisma.creditNote.aggregate({
        where: {
          organizationId,
          deletedAt: null,
          type: CreditNoteType.APPLY_TO_INVOICE,
          appliedToInvoiceId: null,
        },
        _sum: { amount: true },
      }),
    ]);
    return toDecimal(invoices._sum.balanceDue).sub(toDecimal(credits._sum.amount));
  }

  /**
   * AP total = balances of bills posted to AP minus live, unapplied, unrefunded vendor credits
   * (they debited AP without reducing any bill), so it matches the AP control account.
   */
  private async getTotalPayables(organizationId: string): Promise<Decimal> {
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
    return toDecimal(bills._sum.balanceDue).sub(toDecimal(credits._sum.amount));
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
    const invoices = await this.prisma.invoice.findMany({
      where: { organizationId, deletedAt: null, status: { in: POSTED_INVOICE_STATUSES } },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return invoices.map((i) => ({
      ...i,
      grandTotal: money(i.grandTotal),
      balanceDue: money(i.balanceDue),
    }));
  }

  private async getRecentBills(organizationId: string, limit: number) {
    const bills = await this.prisma.bill.findMany({
      where: { organizationId, deletedAt: null, status: { in: POSTED_BILL_STATUSES } },
      include: { vendor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return bills.map((b) => ({
      ...b,
      grandTotal: money(b.grandTotal),
      balanceDue: money(b.balanceDue),
    }));
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
        status: { in: ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'] },
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
      amount: money(b.balanceDue),
    }));
  }

  /** Month-end balance of the cash/bank ledger accounts (opening from posted journals). */
  async getBankBalanceTrend(organizationId: string, months: number = 6) {
    const buckets = lastMonths(months);
    const cashIds = await resolveCashAccountIds(this.prisma, organizationId);
    const [before, rows] = await Promise.all([
      sumPostedLinesByAccount(this.prisma, organizationId, { lt: buckets[0].start }, cashIds),
      postedLineRows(this.prisma, organizationId, cashIds, {
        gte: buckets[0].start,
        lte: buckets[buckets.length - 1].end,
      }),
    ]);

    const netByMonth = new Map<string, Decimal>();
    for (const row of rows) {
      const key = monthKey(row.date);
      netByMonth.set(key, (netByMonth.get(key) ?? ZERO).add(row.debit).sub(row.credit));
    }

    let running = sumDecimals([...before.values()].map((t) => t.debit.sub(t.credit)));
    return buckets.map((b) => {
      running = running.add(netByMonth.get(b.key) ?? ZERO);
      return { month: b.label, balance: money(running) };
    });
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
      const qty = signedMovementQuantity(mv.quantity, mv.movementType);
      const cost = parseFloat((mv.costPerUnit ?? 0).toString());
      const valueDelta = qty * cost;
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
    const { buckets, byMonth } = await this.monthlyLedgerPl(organizationId, months);
    return buckets.map((b) => {
      const entry = byMonth.get(b.key);
      const revenue = entry?.revenue ?? ZERO;
      const cogs = entry?.cogs ?? ZERO;
      const margin = revenue.greaterThan(0)
        ? revenue.sub(cogs).div(revenue).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        : ZERO;
      return {
        month: b.label,
        revenue: money(revenue),
        cogs: money(cogs),
        marginPercent: margin.toNumber(),
      };
    });
  }

  async getRevenueYoY(organizationId: string) {
    const cacheKey = `dashboard:revenue-yoy`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeRevenueYoY(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  private async computeRevenueYoY(organizationId: string) {
    const currentYear = new Date().getUTCFullYear();
    const accounts = (await this.getPlAccounts(organizationId)).filter((a) => isIncomeType(a.type));
    const rows = await postedLineRows(
      this.prisma,
      organizationId,
      accounts.map((a) => a.id),
      { gte: new Date(Date.UTC(currentYear - 1, 0, 1)), lte: endOfUtcDay(new Date()) },
    );

    const currentYearData: Decimal[] = Array.from({ length: 12 }, () => ZERO);
    const previousYearData: Decimal[] = Array.from({ length: 12 }, () => ZERO);
    for (const row of rows) {
      const month = row.date.getUTCMonth();
      const value = row.credit.sub(row.debit);
      if (row.date.getUTCFullYear() === currentYear) {
        currentYearData[month] = currentYearData[month].add(value);
      } else {
        previousYearData[month] = previousYearData[month].add(value);
      }
    }

    return currentYearData.map((current, m) => ({
      month: new Date(Date.UTC(currentYear, m, 1)).toLocaleString('en-US', {
        month: 'short',
        timeZone: 'UTC',
      }),
      currentYear: money(current),
      previousYear: money(previousYearData[m]),
    }));
  }

  async getAccountBalances(organizationId: string) {
    const cacheKey = `dashboard:account-balances`;
    return this.cacheService.getOrSet(cacheKey, () => this.computeAccountBalances(organizationId), {
      ttl: 120,
      organizationId,
    });
  }

  /** Natural balance per account type, summed from posted journal lines (no stored balances). */
  private async computeAccountBalances(organizationId: string) {
    const [accounts, totals] = await Promise.all([
      this.prisma.account.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, type: true, isActive: true },
      }),
      sumPostedLinesByAccount(this.prisma, organizationId),
    ]);

    const byType = new Map<AccountType, { balance: Decimal; count: number }>();
    for (const acc of accounts) {
      const entry = byType.get(acc.type) ?? { balance: ZERO, count: 0 };
      const t = totals.get(acc.id);
      if (t) entry.balance = entry.balance.add(naturalBalance(acc.type, t.debit, t.credit));
      if (acc.isActive) entry.count++;
      byType.set(acc.type, entry);
    }

    return Object.values(AccountType).map((type) => ({
      type,
      balance: money(byType.get(type)?.balance ?? ZERO),
      count: byType.get(type)?.count ?? 0,
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

  /** Issued invoices by status; DRAFT and VOID are not receivables and are left out. */
  private async computeInvoiceStatus(organizationId: string) {
    const counts = await this.prisma.invoice.groupBy({
      by: ['status'],
      where: { organizationId, deletedAt: null, status: { in: POSTED_INVOICE_STATUSES } },
      _count: { id: true },
      _sum: { grandTotal: true },
    });

    return counts.map((c) => ({
      status: c.status,
      count: c._count.id,
      amount: money(c._sum.grandTotal),
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
    const buckets = lastMonths(months);
    const groups = await this.prisma.invoice.groupBy({
      by: ['date'],
      where: {
        organizationId,
        deletedAt: null,
        status: { in: POSTED_INVOICE_STATUSES },
        date: { gte: buckets[0].start, lte: buckets[buckets.length - 1].end },
      },
      _sum: { grandTotal: true },
      _count: { id: true },
    });

    const monthly = new Map<string, { count: number; total: Decimal }>();
    for (const g of groups) {
      const key = monthKey(g.date);
      const entry = monthly.get(key) ?? { count: 0, total: ZERO };
      entry.count += g._count.id;
      entry.total = entry.total.add(toDecimal(g._sum.grandTotal));
      monthly.set(key, entry);
    }

    return buckets.map((b) => ({
      month: b.label,
      count: monthly.get(b.key)?.count ?? 0,
      amount: money(monthly.get(b.key)?.total),
    }));
  }

  async getPaymentCollection(organizationId: string, months: number = 6) {
    const cacheKey = `dashboard:payment-collection:${months}`;
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.computePaymentCollection(organizationId, months),
      { ttl: 120, organizationId },
    );
  }

  /** Customer receipts per month; voided (soft-deleted) payments are excluded. */
  private async computePaymentCollection(organizationId: string, months: number) {
    const buckets = lastMonths(months);
    const groups = await this.prisma.paymentReceived.groupBy({
      by: ['date'],
      where: {
        organizationId,
        deletedAt: null,
        date: { gte: buckets[0].start, lte: buckets[buckets.length - 1].end },
      },
      _sum: { amount: true },
    });

    const monthly = new Map<string, Decimal>();
    for (const g of groups) {
      const key = monthKey(g.date);
      monthly.set(key, (monthly.get(key) ?? ZERO).add(toDecimal(g._sum.amount)));
    }

    return buckets.map((b) => ({ month: b.label, amount: money(monthly.get(b.key)) }));
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

  /** Posted bills by status; DRAFT/PENDING/VOID are not payables and are left out. */
  private async computeBillStatus(organizationId: string) {
    const counts = await this.prisma.bill.groupBy({
      by: ['status'],
      where: { organizationId, deletedAt: null, status: { in: POSTED_BILL_STATUSES } },
      _count: { id: true },
      _sum: { grandTotal: true },
    });

    return counts.map((c) => ({
      status: c.status,
      count: c._count.id,
      amount: money(c._sum.grandTotal),
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
    const groups = await this.prisma.bill.groupBy({
      by: ['vendorId'],
      where: { organizationId, deletedAt: null, status: { in: POSTED_BILL_STATUSES } },
      _sum: { grandTotal: true },
      _count: { id: true },
    });
    const top = groups
      .map((g) => ({
        vendorId: g.vendorId,
        total: toDecimal(g._sum.grandTotal),
        count: g._count.id,
      }))
      .sort((a, b) => b.total.comparedTo(a.total))
      .slice(0, limit);

    const vendors =
      top.length > 0
        ? await this.prisma.vendor.findMany({
            where: { organizationId, id: { in: top.map((t) => t.vendorId) } },
            select: { id: true, name: true },
          })
        : [];
    const names = new Map(vendors.map((v) => [v.id, v.name]));

    return top.map((t) => ({
      id: t.vendorId,
      name: names.get(t.vendorId) ?? '',
      totalAmount: money(t.total),
      billCount: t.count,
    }));
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
    const buckets = lastMonths(months);
    const range = { gte: buckets[0].start, lte: buckets[buckets.length - 1].end };

    const [bills, expenses] = await Promise.all([
      this.prisma.bill.groupBy({
        by: ['date'],
        where: {
          organizationId,
          deletedAt: null,
          status: { in: POSTED_BILL_STATUSES },
          date: range,
        },
        _sum: { grandTotal: true },
      }),
      this.prisma.expense.groupBy({
        by: ['date'],
        where: {
          organizationId,
          deletedAt: null,
          status: { in: POSTED_EXPENSE_STATUSES },
          date: range,
        },
        _sum: { amount: true },
      }),
    ]);

    const billsByMonth = new Map<string, Decimal>();
    const expensesByMonth = new Map<string, Decimal>();
    for (const b of bills) {
      const key = monthKey(b.date);
      billsByMonth.set(key, (billsByMonth.get(key) ?? ZERO).add(toDecimal(b._sum.grandTotal)));
    }
    for (const e of expenses) {
      const key = monthKey(e.date);
      expensesByMonth.set(key, (expensesByMonth.get(key) ?? ZERO).add(toDecimal(e._sum.amount)));
    }

    return buckets.map((b) => {
      const billTotal = billsByMonth.get(b.key) ?? ZERO;
      const expenseTotal = expensesByMonth.get(b.key) ?? ZERO;
      return {
        month: b.label,
        bills: money(billTotal),
        expenses: money(expenseTotal),
        total: money(billTotal.add(expenseTotal)),
      };
    });
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
    const buckets = lastMonths(months);
    const groups = await this.prisma.expense.groupBy({
      by: ['date', 'accountId'],
      where: {
        organizationId,
        deletedAt: null,
        status: { in: POSTED_EXPENSE_STATUSES },
        date: { gte: buckets[0].start, lte: buckets[buckets.length - 1].end },
      },
      _sum: { amount: true },
    });
    const accountIds = [...new Set(groups.map((g) => g.accountId))];
    const accounts =
      accountIds.length > 0
        ? await this.prisma.account.findMany({
            where: { organizationId, id: { in: accountIds } },
            select: { id: true, name: true },
          })
        : [];
    const names = new Map(accounts.map((a) => [a.id, a.name]));

    const monthly = new Map<string, Map<string, Decimal>>();
    for (const g of groups) {
      const key = monthKey(g.date);
      const category = names.get(g.accountId) || 'Uncategorized';
      const categories = monthly.get(key) ?? new Map<string, Decimal>();
      categories.set(category, (categories.get(category) ?? ZERO).add(toDecimal(g._sum.amount)));
      monthly.set(key, categories);
    }

    return buckets.map((b) => {
      const categories = monthly.get(b.key) ?? new Map<string, Decimal>();
      return {
        month: b.label,
        amount: money(sumDecimals([...categories.values()])),
        categories: [...categories.entries()].map(([name, amount]) => ({
          name,
          amount: money(amount),
        })),
      };
    });
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
      const qty = signedMovementQuantity(mv.quantity, mv.movementType);
      if (qty > 0) {
        inByMonth[key] = (inByMonth[key] || 0) + qty;
      } else {
        outByMonth[key] = (outByMonth[key] || 0) + Math.abs(qty);
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
