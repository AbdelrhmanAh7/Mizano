import { Injectable } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { ReadReplicaService } from '../../../prisma/read-replica.service';

@Injectable()
export class FinancialReportsService {
  constructor(private prisma: ReadReplicaService) {}

  async getProfitAndLoss(organizationId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get all revenue accounts (type: REVENUE)
    const revenueAccounts = await this.getAccountBalances(
      organizationId,
      AccountType.REVENUE,
      start,
      end,
    );
    const totalRevenue = revenueAccounts.reduce((sum, a) => sum + a.balance, 0);

    // Get cost of goods sold (typically expense accounts starting with 5xxx)
    const cogsAccounts = await this.getAccountBalances(
      organizationId,
      AccountType.EXPENSE,
      start,
      end,
      '5',
    );
    const totalCogs = cogsAccounts.reduce((sum, a) => sum + a.balance, 0);

    const grossProfit = totalRevenue - totalCogs;

    // Get operating expenses (expense accounts starting with 6xxx)
    const opexAccounts = await this.getAccountBalances(
      organizationId,
      AccountType.EXPENSE,
      start,
      end,
      '6',
    );
    const totalOpex = opexAccounts.reduce((sum, a) => sum + a.balance, 0);

    const operatingProfit = grossProfit - totalOpex;

    // Get other income/expenses
    const otherIncome = revenueAccounts
      .filter((a) => a.code.startsWith('49'))
      .reduce((sum, a) => sum + a.balance, 0);
    const otherExpenses = await this.getAccountBalances(
      organizationId,
      AccountType.EXPENSE,
      start,
      end,
      '7',
    );
    const totalOtherExpenses = otherExpenses.reduce((sum, a) => sum + a.balance, 0);

    const netProfit = operatingProfit + otherIncome - totalOtherExpenses;

    return {
      period: { startDate, endDate },
      revenue: {
        accounts: revenueAccounts,
        total: totalRevenue,
      },
      costOfGoodsSold: {
        accounts: cogsAccounts,
        total: totalCogs,
      },
      grossProfit,
      grossProfitMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
      operatingExpenses: {
        accounts: opexAccounts,
        total: totalOpex,
      },
      operatingProfit,
      otherIncome,
      otherExpenses: totalOtherExpenses,
      netProfit,
      netProfitMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
    };
  }

  async getBalanceSheet(organizationId: string, asOfDate: string) {
    const endDate = new Date(asOfDate);
    endDate.setHours(23, 59, 59, 999);

    // Assets
    const currentAssets = await this.getAccountBalances(
      organizationId,
      AccountType.ASSET,
      null,
      endDate,
      '1',
    );
    const fixedAssets = await this.getAccountBalances(
      organizationId,
      AccountType.ASSET,
      null,
      endDate,
      '15',
    );
    const totalAssets = currentAssets.reduce((sum, a) => sum + a.balance, 0);

    // Liabilities
    const currentLiabilities = await this.getAccountBalances(
      organizationId,
      AccountType.LIABILITY,
      null,
      endDate,
      '2',
    );
    const longTermLiabilities = await this.getAccountBalances(
      organizationId,
      AccountType.LIABILITY,
      null,
      endDate,
      '25',
    );
    const totalLiabilities = currentLiabilities.reduce((sum, a) => sum + a.balance, 0);

    // Equity
    const equityAccounts = await this.getAccountBalances(
      organizationId,
      AccountType.EQUITY,
      null,
      endDate,
    );
    const totalEquity = equityAccounts.reduce((sum, a) => sum + a.balance, 0);

    // Calculate retained earnings
    const currentYearStart = new Date(endDate.getFullYear(), 0, 1);
    const pnl = await this.getProfitAndLoss(
      organizationId,
      currentYearStart.toISOString(),
      asOfDate,
    );
    const retainedEarnings = pnl.netProfit;

    return {
      asOfDate,
      assets: {
        current: {
          accounts: currentAssets.filter((a) => !a.code.startsWith('15')),
          total: currentAssets
            .filter((a) => !a.code.startsWith('15'))
            .reduce((sum, a) => sum + a.balance, 0),
        },
        fixed: {
          accounts: fixedAssets,
          total: fixedAssets.reduce((sum, a) => sum + a.balance, 0),
        },
        total: totalAssets,
      },
      liabilities: {
        current: {
          accounts: currentLiabilities.filter((a) => !a.code.startsWith('25')),
          total: currentLiabilities
            .filter((a) => !a.code.startsWith('25'))
            .reduce((sum, a) => sum + a.balance, 0),
        },
        longTerm: {
          accounts: longTermLiabilities,
          total: longTermLiabilities.reduce((sum, a) => sum + a.balance, 0),
        },
        total: totalLiabilities,
      },
      equity: {
        accounts: equityAccounts,
        retainedEarnings,
        total: totalEquity + retainedEarnings,
      },
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity + retainedEarnings,
      isBalanced:
        Math.abs(totalAssets - (totalLiabilities + totalEquity + retainedEarnings)) < 0.01,
    };
  }

  async getCashFlowStatement(organizationId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get opening and closing cash balances
    const cashAccounts = await this.prisma.account.findMany({
      where: { organizationId, code: { in: ['1000', '1010'] } },
    });
    const cashAccountIds = cashAccounts.map((a) => a.id);

    // Opening cash balance
    const openingJournals = await this.prisma.journalLine.findMany({
      where: {
        journal: { organizationId, date: { lt: start }, isPosted: true },
        accountId: { in: cashAccountIds },
      },
    });
    const openingCash = openingJournals.reduce(
      (sum, l) => sum + parseFloat(l.debit.toString()) - parseFloat(l.credit.toString()),
      0,
    );

    // Closing cash balance
    const closingJournals = await this.prisma.journalLine.findMany({
      where: {
        journal: { organizationId, date: { lte: end }, isPosted: true },
        accountId: { in: cashAccountIds },
      },
    });
    const closingCash = closingJournals.reduce(
      (sum, l) => sum + parseFloat(l.debit.toString()) - parseFloat(l.credit.toString()),
      0,
    );

    // Operating activities
    const pnl = await this.getProfitAndLoss(organizationId, startDate, endDate);
    const netIncome = pnl.netProfit;

    // Get AR changes
    const arChanges = await this.getAccountChange(organizationId, '1200', start, end);
    // Get AP changes
    const apChanges = await this.getAccountChange(organizationId, '2000', start, end);
    // Get inventory changes
    const inventoryChanges = await this.getAccountChange(organizationId, '1100', start, end);

    const operatingCashFlow = netIncome - arChanges + apChanges - inventoryChanges;

    // Investing activities (simplified)
    const fixedAssetChanges = await this.getAccountChange(organizationId, '15', start, end);
    const investingCashFlow = -fixedAssetChanges;

    // Financing activities (simplified)
    const equityChanges = await this.getAccountChange(organizationId, '3', start, end);
    const debtChanges = await this.getAccountChange(organizationId, '25', start, end);
    const financingCashFlow = equityChanges + debtChanges;

    const netCashChange = operatingCashFlow + investingCashFlow + financingCashFlow;

    return {
      period: { startDate, endDate },
      openingCashBalance: openingCash,
      operating: {
        netIncome,
        adjustments: {
          accountsReceivableChange: -arChanges,
          accountsPayableChange: apChanges,
          inventoryChange: -inventoryChanges,
        },
        netCashFromOperating: operatingCashFlow,
      },
      investing: {
        fixedAssetPurchases: -fixedAssetChanges,
        netCashFromInvesting: investingCashFlow,
      },
      financing: {
        equityChanges,
        debtChanges,
        netCashFromFinancing: financingCashFlow,
      },
      netCashChange,
      closingCashBalance: closingCash,
      reconciliation: {
        calculated: openingCash + netCashChange,
        actual: closingCash,
        variance: closingCash - (openingCash + netCashChange),
      },
    };
  }

  async getTrialBalance(organizationId: string, asOfDate: string) {
    const endDate = new Date(asOfDate);

    const accounts = await this.prisma.account.findMany({
      where: { organizationId, isActive: true },
      orderBy: { code: 'asc' },
    });

    // Fix N+1: single groupBy query instead of per-account loop
    const lineAggregates = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journal: { organizationId, date: { lte: endDate }, isPosted: true },
      },
      _sum: { debit: true, credit: true },
    });

    // Build a lookup map
    const aggregateMap = new Map(lineAggregates.map((agg) => [agg.accountId, agg]));

    const balances = [];
    let totalDebits = 0;
    let totalCredits = 0;

    for (const account of accounts) {
      const agg = aggregateMap.get(account.id);
      const debitTotal = parseFloat(agg?._sum?.debit?.toString() || '0');
      const creditTotal = parseFloat(agg?._sum?.credit?.toString() || '0');
      const balance = debitTotal - creditTotal;

      if (balance !== 0) {
        balances.push({
          accountId: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          debit: balance > 0 ? balance : 0,
          credit: balance < 0 ? Math.abs(balance) : 0,
        });

        if (balance > 0) totalDebits += balance;
        else totalCredits += Math.abs(balance);
      }
    }

    return {
      asOfDate,
      accounts: balances,
      totals: {
        debit: totalDebits,
        credit: totalCredits,
      },
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
    };
  }

  async getGeneralLedger(
    organizationId: string,
    accountId: string,
    startDate: string,
    endDate: string,
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, organizationId },
    });
    if (!account) return null;

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Get opening balance
    const openingLines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        journal: { organizationId, date: { lt: start }, isPosted: true },
      },
    });
    const openingBalance = openingLines.reduce(
      (sum, l) => sum + parseFloat(l.debit.toString()) - parseFloat(l.credit.toString()),
      0,
    );

    // Get transactions in period
    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        journal: { organizationId, date: { gte: start, lte: end }, isPosted: true },
      },
      include: {
        journal: { select: { journalNumber: true, date: true, reference: true } },
      },
      orderBy: { journal: { date: 'asc' } },
    });

    let runningBalance = openingBalance;
    const entries = lines.map((line) => {
      const debit = parseFloat(line.debit.toString());
      const credit = parseFloat(line.credit.toString());
      runningBalance += debit - credit;
      return {
        date: line.journal.date,
        journalNumber: line.journal.journalNumber,
        reference: line.journal.reference,
        description: line.description,
        debit,
        credit,
        balance: runningBalance,
      };
    });

    return {
      account: { id: account.id, code: account.code, name: account.name, type: account.type },
      period: { startDate, endDate },
      openingBalance,
      entries,
      closingBalance: runningBalance,
      totalDebits: entries.reduce((sum, e) => sum + e.debit, 0),
      totalCredits: entries.reduce((sum, e) => sum + e.credit, 0),
    };
  }

  private async getAccountBalances(
    organizationId: string,
    type: AccountType,
    startDate: Date | null,
    endDate: Date,
    codePrefix?: string,
  ) {
    const where: Record<string, unknown> = { organizationId, type, isActive: true };
    if (codePrefix) where.code = { startsWith: codePrefix };

    const accounts = await this.prisma.account.findMany({ where, orderBy: { code: 'asc' } });
    if (accounts.length === 0) return [];

    const accountIds = accounts.map((a) => a.id);

    // Fix N+1: single groupBy query instead of per-account loop
    const journalDateFilter: Record<string, unknown> = { lte: endDate };
    if (startDate) journalDateFilter.gte = startDate;

    const lineAggregates = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        journal: { organizationId, isPosted: true, date: journalDateFilter },
      },
      _sum: { debit: true, credit: true },
    });

    const aggregateMap = new Map(lineAggregates.map((agg) => [agg.accountId, agg]));

    const balances = [];

    for (const account of accounts) {
      const agg = aggregateMap.get(account.id);
      const debitTotal = parseFloat(agg?._sum?.debit?.toString() || '0');
      const creditTotal = parseFloat(agg?._sum?.credit?.toString() || '0');

      // For revenue/liability/equity: credit is positive
      // For assets/expenses: debit is positive
      let balance = 0;
      if (
        type === AccountType.REVENUE ||
        type === AccountType.LIABILITY ||
        type === AccountType.EQUITY
      ) {
        balance = creditTotal - debitTotal;
      } else {
        balance = debitTotal - creditTotal;
      }

      if (balance !== 0) {
        balances.push({
          id: account.id,
          code: account.code,
          name: account.name,
          balance,
        });
      }
    }

    return balances;
  }

  private async getAccountChange(
    organizationId: string,
    codePrefix: string,
    startDate: Date,
    endDate: Date,
  ) {
    const accounts = await this.prisma.account.findMany({
      where: { organizationId, code: { startsWith: codePrefix } },
    });
    const accountIds = accounts.map((a) => a.id);

    const openingLines = await this.prisma.journalLine.findMany({
      where: {
        accountId: { in: accountIds },
        journal: { organizationId, date: { lt: startDate }, isPosted: true },
      },
    });
    const openingBalance = openingLines.reduce(
      (sum, l) => sum + parseFloat(l.debit.toString()) - parseFloat(l.credit.toString()),
      0,
    );

    const closingLines = await this.prisma.journalLine.findMany({
      where: {
        accountId: { in: accountIds },
        journal: { organizationId, date: { lte: endDate }, isPosted: true },
      },
    });
    const closingBalance = closingLines.reduce(
      (sum, l) => sum + parseFloat(l.debit.toString()) - parseFloat(l.credit.toString()),
      0,
    );

    return closingBalance - openingBalance;
  }

  // === Sales & Purchases Reports ===

  async getSalesByCustomer(organizationId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        date: { gte: start, lte: end },
        status: { not: 'DRAFT' },
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });

    // Group by customer
    const customerMap = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        invoiceCount: number;
        totalAmount: number;
        paidAmount: number;
        balanceDue: number;
      }
    >();

    for (const inv of invoices) {
      const existing = customerMap.get(inv.customerId) || {
        customerId: inv.customerId,
        customerName: inv.customer.name,
        invoiceCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        balanceDue: 0,
      };
      existing.invoiceCount += 1;
      const grandTotal = parseFloat(inv.grandTotal.toString());
      const balanceDue = parseFloat(inv.balanceDue.toString());
      existing.totalAmount += grandTotal;
      existing.balanceDue += balanceDue;
      existing.paidAmount += grandTotal - balanceDue;
      customerMap.set(inv.customerId, existing);
    }

    const entries = Array.from(customerMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    const totalAmount = entries.reduce((s, e) => s + e.totalAmount, 0);
    const totalPaid = entries.reduce((s, e) => s + e.paidAmount, 0);
    const totalBalance = entries.reduce((s, e) => s + e.balanceDue, 0);

    return {
      entries,
      totalAmount,
      totalPaid,
      totalBalance,
      period: { startDate, endDate },
    };
  }

  async getSalesByItem(organizationId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const invoiceLines = await this.prisma.invoiceLine.findMany({
      where: {
        invoice: {
          organizationId,
          deletedAt: null,
          date: { gte: start, lte: end },
          status: { not: 'DRAFT' },
        },
        itemId: { not: null },
      },
      include: {
        item: { select: { id: true, name: true, sku: true } },
      },
    });

    // Group by item
    const itemMap = new Map<
      string,
      {
        itemId: string;
        itemName: string;
        sku: string;
        quantitySold: number;
        totalAmount: number;
      }
    >();

    for (const line of invoiceLines) {
      if (!line.item) continue;
      const existing = itemMap.get(line.item.id) || {
        itemId: line.item.id,
        itemName: line.item.name,
        sku: line.item.sku || '',
        quantitySold: 0,
        totalAmount: 0,
      };
      existing.quantitySold += parseFloat(line.quantity.toString());
      existing.totalAmount += parseFloat(line.amount.toString());
      itemMap.set(line.item.id, existing);
    }

    const entries = Array.from(itemMap.values())
      .map((e) => ({
        ...e,
        averagePrice: e.quantitySold > 0 ? e.totalAmount / e.quantitySold : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const totalAmount = entries.reduce((s, e) => s + e.totalAmount, 0);
    const totalQuantity = entries.reduce((s, e) => s + e.quantitySold, 0);

    return {
      entries,
      totalAmount,
      totalQuantity,
      period: { startDate, endDate },
    };
  }

  async getPurchasesByVendor(organizationId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        deletedAt: null,
        date: { gte: start, lte: end },
        status: { not: 'DRAFT' },
      },
      include: {
        vendor: { select: { id: true, name: true } },
      },
    });

    // Group by vendor
    const vendorMap = new Map<
      string,
      {
        vendorId: string;
        vendorName: string;
        billCount: number;
        totalAmount: number;
        paidAmount: number;
        balanceDue: number;
      }
    >();

    for (const bill of bills) {
      const existing = vendorMap.get(bill.vendorId) || {
        vendorId: bill.vendorId,
        vendorName: bill.vendor.name,
        billCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        balanceDue: 0,
      };
      existing.billCount += 1;
      const grandTotal = parseFloat(bill.grandTotal.toString());
      const balanceDue = parseFloat(bill.balanceDue.toString());
      existing.totalAmount += grandTotal;
      existing.balanceDue += balanceDue;
      existing.paidAmount += grandTotal - balanceDue;
      vendorMap.set(bill.vendorId, existing);
    }

    const entries = Array.from(vendorMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    const totalAmount = entries.reduce((s, e) => s + e.totalAmount, 0);
    const totalPaid = entries.reduce((s, e) => s + e.paidAmount, 0);
    const totalBalance = entries.reduce((s, e) => s + e.balanceDue, 0);

    return {
      entries,
      totalAmount,
      totalPaid,
      totalBalance,
      period: { startDate, endDate },
    };
  }
}
