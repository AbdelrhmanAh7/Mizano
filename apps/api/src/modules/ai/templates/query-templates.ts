import { Decimal } from '@prisma/client/runtime/library';

interface InvoiceWithCustomer {
  invoiceNumber: string;
  grandTotal: Decimal;
  dueDate: Date;
  customer?: { name: string } | null;
}

interface BillWithVendor {
  billNumber: string;
  grandTotal: Decimal;
  dueDate: Date;
  vendor?: { name: string } | null;
}

interface ItemWithReorder {
  id: string;
  name: string;
  sku: string | null;
  currentStock: number | null;
  reorderPoint: number | null;
  reorderAnalysis?: { reorderPoint: number; status: string } | null;
}

interface BankAccountBalance {
  id: string;
  name: string;
  systemBalance: Decimal;
}

interface CustomerRecord {
  id: string;
  name: string;
}

interface AccountRecord {
  id: string;
  name: string;
  code: string | null;
}

export interface QueryParameter {
  name: string;
  type: 'date-range' | 'number' | 'currency' | 'string';
  default?: unknown;
  required?: boolean;
}

export interface QueryTemplate {
  id: string;
  question: string;
  description: string;
  category:
    | 'sales'
    | 'accounts-receivable'
    | 'accounts-payable'
    | 'expenses'
    | 'inventory'
    | 'profitability'
    | 'cash-flow';
  parameters?: QueryParameter[];
  chartType?: 'bar' | 'line' | 'pie' | 'table' | 'metric';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (prisma: any, orgId: string, params?: Record<string, unknown>) => Promise<unknown>;
  render: (data: unknown, params?: Record<string, unknown>) => string;
}

// Helper to format currency
const formatCurrency = (amount: number | Decimal | null | undefined): string => {
  if (amount === null || amount === undefined) return '$0.00';
  const num = typeof amount === 'number' ? amount : Number(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(num);
};

// Helper to get date range
const getDateRange = (period: string): { startDate: Date; endDate: Date } => {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let startDate: Date;

  switch (period) {
    case 'this-week':
      const dayOfWeek = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'this-month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last-month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate.setDate(0); // Last day of previous month
      break;
    case 'this-quarter':
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      break;
    case 'this-year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return { startDate, endDate };
};

export const queryTemplates: QueryTemplate[] = [
  // Sales queries
  {
    id: 'top-customers-revenue',
    question: 'Who are my top customers by revenue?',
    description: 'Shows top customers ranked by total revenue',
    category: 'sales',
    parameters: [
      { name: 'period', type: 'date-range', default: 'this-month' },
      { name: 'limit', type: 'number', default: 5 },
    ],
    chartType: 'bar',
    execute: async (prisma, orgId, params) => {
      const { startDate, endDate } = getDateRange((params?.period as string) || 'this-month');
      const limit = params?.limit || 5;

      const results = await prisma.invoice.groupBy({
        by: ['customerId'],
        where: {
          organizationId: orgId,
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
          status: { not: 'DRAFT' },
        },
        _sum: { grandTotal: true },
        orderBy: { _sum: { grandTotal: 'desc' } },
        take: limit,
      });

      // Get customer names
      const customerIds = results.map((r: { customerId: string }) => r.customerId);
      const customers = await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true },
      });
      const customerMap = new Map(customers.map((c: CustomerRecord) => [c.id, c.name]));

      return results.map((r: { customerId: string; _sum: { grandTotal?: Decimal | null } }) => ({
        customerId: r.customerId,
        customerName: customerMap.get(r.customerId) || 'Unknown',
        revenue: Number(r._sum.grandTotal) || 0,
      }));
    },
    render: (data) => {
      const rows = data as Array<{ customerName: string; revenue: number }>;
      if (rows.length === 0) {
        return 'No sales data found for this period.';
      }
      const list = rows
        .map((d, i) => `${i + 1}. ${d.customerName} (${formatCurrency(d.revenue)})`)
        .join(', ');
      return `Your top ${rows.length} customers by revenue are: ${list}.`;
    },
  },

  // Accounts Receivable queries
  {
    id: 'overdue-invoices',
    question: 'Which invoices are overdue?',
    description: 'Lists all overdue invoices with amounts',
    category: 'accounts-receivable',
    parameters: [{ name: 'minAmount', type: 'currency', default: 0 }],
    chartType: 'table',
    execute: async (prisma, orgId, params) => {
      const minAmount = params?.minAmount || 0;
      const today = new Date();

      const invoices = await prisma.invoice.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
          dueDate: { lt: today },
          grandTotal: { gte: minAmount },
        },
        include: {
          customer: { select: { name: true } },
        },
        orderBy: { dueDate: 'asc' },
      });

      return invoices.map((inv: InvoiceWithCustomer) => ({
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer?.name || 'Unknown',
        amount: Number(inv.grandTotal),
        dueDate: inv.dueDate,
        daysOverdue: Math.floor(
          (today.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24),
        ),
      }));
    },
    render: (data) => {
      const rows = data as Array<{ amount: number; daysOverdue: number }>;
      if (rows.length === 0) {
        return 'Great news! You have no overdue invoices.';
      }
      const total = rows.reduce((sum, d) => sum + d.amount, 0);
      return `You have ${rows.length} overdue invoice${rows.length > 1 ? 's' : ''} totaling ${formatCurrency(total)}. The oldest is ${rows[0]?.daysOverdue || 0} days overdue.`;
    },
  },

  // Expenses queries
  {
    id: 'spending-by-category',
    question: 'What are my expenses by category?',
    description: 'Breaks down expenses by account category',
    category: 'expenses',
    parameters: [{ name: 'period', type: 'date-range', default: 'this-month' }],
    chartType: 'pie',
    execute: async (prisma, orgId, params) => {
      const { startDate, endDate } = getDateRange((params?.period as string) || 'this-month');

      const expenses = await prisma.expense.groupBy({
        by: ['accountId'],
        where: {
          organizationId: orgId,
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      });

      // Get account names
      const accountIds = expenses.map((e: { accountId: string }) => e.accountId);
      const accounts = await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, name: true, code: true },
      });
      const accountMap = new Map(accounts.map((a: AccountRecord) => [a.id, a]));

      const total = expenses.reduce(
        (sum: number, e: { _sum: { amount?: Decimal | null } }) => sum + Number(e._sum.amount || 0),
        0,
      );

      return expenses.map((e: { accountId: string; _sum: { amount?: Decimal | null } }) => {
        const account = accountMap.get(e.accountId) as AccountRecord | undefined;
        const amount = Number(e._sum.amount) || 0;
        return {
          accountId: e.accountId,
          accountName: account?.name || 'Unknown',
          accountCode: account?.code || '',
          amount,
          percentage: total > 0 ? ((amount / total) * 100).toFixed(1) : '0',
        };
      });
    },
    render: (data) => {
      const rows = data as Array<{ amount: number; accountName: string; percentage: string }>;
      if (rows.length === 0) {
        return 'No expenses recorded for this period.';
      }
      const total = rows.reduce((sum, d) => sum + d.amount, 0);
      const top3 = rows
        .slice(0, 3)
        .map((d) => `${d.accountName} (${d.percentage}%)`)
        .join(', ');
      return `Total expenses this period: ${formatCurrency(total)}. Top categories: ${top3}.`;
    },
  },

  // Profitability queries
  {
    id: 'profit-this-month',
    question: 'What is my profit this month?',
    description: 'Shows net profit for the current month',
    category: 'profitability',
    chartType: 'metric',
    execute: async (prisma, orgId) => {
      const { startDate, endDate } = getDateRange('this-month');

      // Get revenue (from paid invoices)
      const revenueResult = await prisma.invoice.aggregate({
        where: {
          organizationId: orgId,
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
          status: { in: ['PAID', 'PARTIALLY_PAID'] },
        },
        _sum: { grandTotal: true },
      });

      // Get expenses
      const expenseResult = await prisma.expense.aggregate({
        where: {
          organizationId: orgId,
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
        _sum: { amount: true },
      });

      // Get bills
      const billResult = await prisma.bill.aggregate({
        where: {
          organizationId: orgId,
          date: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
        _sum: { grandTotal: true },
      });

      const revenue = Number(revenueResult._sum.grandTotal) || 0;
      const expenses = Number(expenseResult._sum.amount) || 0;
      const bills = Number(billResult._sum.grandTotal) || 0;
      const totalExpenses = expenses + bills;
      const profit = revenue - totalExpenses;
      const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0';

      return {
        revenue,
        expenses: totalExpenses,
        profit,
        margin,
      };
    },
    render: (data) => {
      const d = data as { profit: number; revenue: number; expenses: number; margin: string };
      const status = d.profit >= 0 ? 'profit' : 'loss';
      return `This month: Revenue ${formatCurrency(d.revenue)}, Expenses ${formatCurrency(d.expenses)}, Net ${status} ${formatCurrency(Math.abs(d.profit))} (${d.margin}% margin).`;
    },
  },

  // Inventory queries
  {
    id: 'items-low-stock',
    question: 'Which items are running low on stock?',
    description: 'Shows items below reorder point',
    category: 'inventory',
    chartType: 'table',
    execute: async (prisma, orgId) => {
      const items = await prisma.item.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          type: 'GOODS',
        },
        include: {
          reorderAnalysis: true,
        },
      });

      const lowStockItems = items.filter((item: ItemWithReorder) => {
        const reorderPoint = item.reorderAnalysis?.reorderPoint || item.reorderPoint || 0;
        return (item.currentStock || 0) <= reorderPoint && reorderPoint > 0;
      });

      return lowStockItems
        .map((item: ItemWithReorder) => ({
          itemId: item.id,
          itemName: item.name,
          sku: item.sku,
          currentStock: item.currentStock || 0,
          reorderPoint: item.reorderAnalysis?.reorderPoint || item.reorderPoint || 0,
          status: item.reorderAnalysis?.status || 'LOW_STOCK',
        }))
        .sort(
          (
            a: { currentStock: number; reorderPoint: number },
            b: { currentStock: number; reorderPoint: number },
          ) => a.currentStock - a.reorderPoint - (b.currentStock - b.reorderPoint),
        );
    },
    render: (data) => {
      const rows = data as Array<{ status: string; itemName: string; currentStock: number }>;
      if (rows.length === 0) {
        return 'All inventory items are well-stocked.';
      }
      const critical = rows.filter((d) => d.status === 'CRITICAL').length;
      return `${rows.length} item${rows.length > 1 ? 's' : ''} below reorder point${critical > 0 ? ` (${critical} critical)` : ''}. Top concern: ${rows[0]?.itemName || 'N/A'} with ${rows[0]?.currentStock || 0} units.`;
    },
  },

  // Cash Flow queries
  {
    id: 'cash-position',
    question: 'What is my current cash position?',
    description: 'Shows current cash and bank balances',
    category: 'cash-flow',
    chartType: 'metric',
    execute: async (prisma, orgId) => {
      // Get bank accounts
      const bankAccounts = await prisma.bankAccount.findMany({
        where: {
          organizationId: orgId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          systemBalance: true,
        },
      });

      const totalBalance = bankAccounts.reduce(
        (sum: number, acc: BankAccountBalance) => sum + Number(acc.systemBalance || 0),
        0,
      );

      // Get outstanding receivables
      const arResult = await prisma.invoice.aggregate({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
        },
        _sum: { grandTotal: true },
      });

      // Get outstanding payables
      const apResult = await prisma.bill.aggregate({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] },
        },
        _sum: { grandTotal: true },
      });

      return {
        totalCash: totalBalance,
        accountCount: bankAccounts.length,
        accounts: bankAccounts.map((a: BankAccountBalance) => ({
          name: a.name,
          balance: Number(a.systemBalance) || 0,
        })),
        outstandingAR: Number(arResult._sum.grandTotal) || 0,
        outstandingAP: Number(apResult._sum.grandTotal) || 0,
      };
    },
    render: (data) => {
      const d = data as {
        totalCash: number;
        accountCount: number;
        outstandingAR: number;
        outstandingAP: number;
      };
      const netPosition = d.totalCash + d.outstandingAR - d.outstandingAP;
      return `Current cash: ${formatCurrency(d.totalCash)} across ${d.accountCount} account${d.accountCount > 1 ? 's' : ''}. Receivables: ${formatCurrency(d.outstandingAR)}, Payables: ${formatCurrency(d.outstandingAP)}. Net position: ${formatCurrency(netPosition)}.`;
    },
  },

  // Accounts Payable queries
  {
    id: 'upcoming-bills',
    question: 'What bills are due soon?',
    description: 'Shows bills due in the next 7 days',
    category: 'accounts-payable',
    parameters: [{ name: 'days', type: 'number', default: 7 }],
    chartType: 'table',
    execute: async (prisma, orgId, params) => {
      const days = (params?.days as number) || 7;
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + days);

      const bills = await prisma.bill.findMany({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: { in: ['OPEN', 'PARTIALLY_PAID'] },
          dueDate: { gte: today, lte: futureDate },
        },
        include: {
          vendor: { select: { name: true } },
        },
        orderBy: { dueDate: 'asc' },
      });

      return bills.map((bill: BillWithVendor) => ({
        billNumber: bill.billNumber,
        vendorName: bill.vendor?.name || 'Unknown',
        amount: Number(bill.grandTotal),
        dueDate: bill.dueDate,
        daysUntilDue: Math.ceil(
          (new Date(bill.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        ),
      }));
    },
    render: (data, params) => {
      const rows = data as Array<{ amount: number }>;
      const days = (params?.days as number) || 7;
      if (rows.length === 0) {
        return `No bills due in the next ${days} days.`;
      }
      const total = rows.reduce((sum, d) => sum + d.amount, 0);
      return `${rows.length} bill${rows.length > 1 ? 's' : ''} due in the next ${days} days, totaling ${formatCurrency(total)}.`;
    },
  },

  // Sales trend
  {
    id: 'sales-trend',
    question: 'How are my sales trending?',
    description: 'Compares current vs previous period sales',
    category: 'sales',
    chartType: 'line',
    execute: async (prisma, orgId) => {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const [thisMonth, lastMonth] = await Promise.all([
        prisma.invoice.aggregate({
          where: {
            organizationId: orgId,
            date: { gte: thisMonthStart },
            deletedAt: null,
            status: { not: 'DRAFT' },
          },
          _sum: { grandTotal: true },
          _count: true,
        }),
        prisma.invoice.aggregate({
          where: {
            organizationId: orgId,
            date: { gte: lastMonthStart, lte: lastMonthEnd },
            deletedAt: null,
            status: { not: 'DRAFT' },
          },
          _sum: { grandTotal: true },
          _count: true,
        }),
      ]);

      const currentSales = Number(thisMonth._sum.grandTotal) || 0;
      const previousSales = Number(lastMonth._sum.grandTotal) || 0;
      const change = previousSales > 0 ? ((currentSales - previousSales) / previousSales) * 100 : 0;

      return {
        currentPeriod: currentSales,
        previousPeriod: previousSales,
        changePercent: change,
        currentCount: thisMonth._count,
        previousCount: lastMonth._count,
      };
    },
    render: (data) => {
      const d = data as {
        changePercent: number;
        currentPeriod: number;
        currentCount: number;
        previousPeriod: number;
      };
      const direction = d.changePercent > 0 ? 'up' : d.changePercent < 0 ? 'down' : 'flat';
      const changeText =
        direction === 'flat'
          ? 'unchanged'
          : `${direction} ${Math.abs(d.changePercent).toFixed(1)}%`;

      return `Sales this month: ${formatCurrency(d.currentPeriod)} (${d.currentCount} invoices), ${changeText} compared to last month (${formatCurrency(d.previousPeriod)}).`;
    },
  },
];

export function getQueryTemplate(id: string): QueryTemplate | undefined {
  return queryTemplates.find((t) => t.id === id);
}

export function getQueryTemplatesByCategory(category: string): QueryTemplate[] {
  return queryTemplates.filter((t) => t.category === category);
}
