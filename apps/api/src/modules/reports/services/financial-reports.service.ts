import { Injectable, NotFoundException } from '@nestjs/common';
import { Account, AccountType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import {
  documentCurrency,
  getBaseCurrency,
  INCOME_ACCOUNT_TYPES,
  isIncomeType,
  LineTotals,
  money,
  naturalBalance,
  normalizeCurrencyParam,
  normalSide,
  POSTED_BILL_STATUSES,
  POSTED_INVOICE_STATUSES,
  postedJournalWhere,
  resolveAsOf,
  resolveCashAccountIds,
  resolvePeriod,
  splitByCurrency,
  sumPostedLinesByAccount,
  toDecimal,
} from '../utils/report-utils';

type AccountRow = Pick<Account, 'id' | 'code' | 'name' | 'type'>;

/** One account line in a statement. `balance` is on the account's normal side. */
export interface StatementAccountLine {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  balance: string;
}

export interface StatementSection {
  accounts: StatementAccountLine[];
  total: string;
}

export interface ProfitAndLossReport {
  period: { startDate: string; endDate: string };
  basis: 'POSTED_LEDGER';
  currencyCode: string;
  revenue: StatementSection;
  costOfGoodsSold: StatementSection;
  grossProfit: string;
  grossProfitMargin: number;
  operatingExpenses: StatementSection;
  operatingProfit: string;
  otherIncome: string;
  otherExpenses: string;
  /** Every income (REVENUE + INCOME) account, including other income. */
  income: StatementAccountLine[];
  /** Every EXPENSE account, including COGS and other expenses. */
  expenses: StatementAccountLine[];
  totalIncome: string;
  totalExpenses: string;
  netProfit: string;
  netProfitMargin: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  basis: 'POSTED_LEDGER';
  currencyCode: string;
  assets: { current: StatementSection; fixed: StatementSection; total: string };
  liabilities: { current: StatementSection; longTerm: StatementSection; total: string };
  equity: {
    accounts: StatementAccountLine[];
    /** All unclosed earnings (income − expenses) from inception to the as-of date. */
    retainedEarnings: string;
    /** Portion of `retainedEarnings` earned since 1 January of the as-of year. */
    currentYearEarnings: string;
    total: string;
  };
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  totalLiabilitiesAndEquity: string;
  difference: string;
  isBalanced: boolean;
}

export interface CashFlowReport {
  period: { startDate: string; endDate: string };
  basis: 'POSTED_LEDGER_INDIRECT';
  currencyCode: string;
  cashAccountIds: string[];
  openingCashBalance: string;
  operating: {
    netIncome: string;
    adjustments: {
      accountsReceivableChange: string;
      accountsPayableChange: string;
      inventoryChange: string;
      otherOperatingChanges: string;
    };
    netCashFromOperating: string;
  };
  investing: { fixedAssetPurchases: string; netCashFromInvesting: string };
  financing: { equityChanges: string; debtChanges: string; netCashFromFinancing: string };
  netCashChange: string;
  closingCashBalance: string;
  reconciliation: { calculated: string; actual: string; variance: string };
}

export interface TrialBalanceLine {
  id: string;
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: string;
  credit: string;
}

export interface TrialBalanceReport {
  asOfDate: string;
  basis: 'POSTED_LEDGER';
  currencyCode: string;
  accounts: TrialBalanceLine[];
  totals: { debit: string; credit: string };
  totalDebits: string;
  totalCredits: string;
  difference: string;
  isBalanced: boolean;
}

export interface GeneralLedgerEntry {
  date: Date;
  journalId: string;
  journalNumber: string;
  reference: string | null;
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reversalOfId: string | null;
  debit: string;
  credit: string;
  /** Running balance on the account's normal side. */
  balance: string;
  runningBalance: string;
}

export interface GeneralLedgerReport {
  account: { id: string; code: string; name: string; type: AccountType };
  normalBalance: 'DEBIT' | 'CREDIT';
  period: { startDate: string; endDate: string };
  currencyCode: string;
  openingBalance: string;
  entries: GeneralLedgerEntry[];
  closingBalance: string;
  totalDebits: string;
  totalCredits: string;
}

export interface PurchasesByVendorEntry {
  vendorId: string;
  vendorName: string;
  billCount: number;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  currencyCode: string;
}

export interface PurchasesByVendorReport {
  entries: PurchasesByVendorEntry[];
  totalAmount: string;
  totalPaid: string;
  totalBalance: string;
  currencyCode: string;
  otherCurrencies: string[];
  period: { startDate: string; endDate: string };
}

export interface SalesByCustomerEntry {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  currencyCode: string;
}

export interface SalesByCustomerReport {
  entries: SalesByCustomerEntry[];
  totalAmount: string;
  totalPaid: string;
  totalBalance: string;
  currencyCode: string;
  otherCurrencies: string[];
  period: { startDate: string; endDate: string };
}

export interface SalesByItemEntry {
  itemId: string;
  itemName: string;
  sku: string;
  quantitySold: string;
  totalAmount: string;
  averagePrice: string;
  currencyCode: string;
}

export interface SalesByItemReport {
  entries: SalesByItemEntry[];
  totalAmount: string;
  totalQuantity: string;
  currencyCode: string;
  otherCurrencies: string[];
  period: { startDate: string; endDate: string };
}

const ZERO = new Decimal(0);

function startsWithAny(code: string, prefixes: string[]): boolean {
  return prefixes.some((p) => code.startsWith(p));
}

/** Non-current assets by default chart convention (15xx–17xx; incl. accumulated depreciation). */
const FIXED_ASSET_PREFIXES = ['15', '16', '17'];
const LONG_TERM_LIABILITY_PREFIXES = ['25'];
const COGS_PREFIXES = ['5'];
const OTHER_EXPENSE_PREFIXES = ['7', '8', '9'];
const OTHER_INCOME_PREFIXES = ['49'];

function percentOf(part: Decimal, whole: Decimal): number {
  if (whole.lessThanOrEqualTo(0)) return 0;
  return part.div(whole).mul(100).toDecimalPlaces(2).toNumber();
}

function section(lines: Array<{ line: StatementAccountLine; value: Decimal }>): {
  section: StatementSection;
  total: Decimal;
} {
  const total = lines.reduce((s, l) => s.add(l.value), ZERO);
  return { section: { accounts: lines.map((l) => l.line), total: money(total) }, total };
}

/**
 * Ledger statements (P&L, balance sheet, cash flow, trial balance, general ledger) built only from
 * posted, non-deleted journals, plus document-based purchase/sales summaries that exclude draft,
 * pending and void documents. See `report-utils.ts` for the shared rules.
 */
@Injectable()
export class FinancialReportsService {
  constructor(private prisma: ReadReplicaService) {}

  async getProfitAndLoss(
    organizationId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<ProfitAndLossReport> {
    const period = resolvePeriod(startDate, endDate);
    const [currencyCode, accounts] = await Promise.all([
      getBaseCurrency(this.prisma, organizationId),
      this.prisma.account.findMany({
        where: {
          organizationId,
          type: { in: [...INCOME_ACCOUNT_TYPES, AccountType.EXPENSE] },
        },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { code: 'asc' },
      }),
    ]);
    const totals = await sumPostedLinesByAccount(
      this.prisma,
      organizationId,
      { gte: period.start, lte: period.end },
      accounts.map((a) => a.id),
    );

    const revenue: Array<{ line: StatementAccountLine; value: Decimal }> = [];
    const otherIncome: Array<{ line: StatementAccountLine; value: Decimal }> = [];
    const cogs: Array<{ line: StatementAccountLine; value: Decimal }> = [];
    const opex: Array<{ line: StatementAccountLine; value: Decimal }> = [];
    const otherExpenses: Array<{ line: StatementAccountLine; value: Decimal }> = [];

    for (const account of accounts) {
      const entry = this.naturalLine(account, totals.get(account.id));
      if (!entry) continue;
      if (isIncomeType(account.type)) {
        (startsWithAny(account.code, OTHER_INCOME_PREFIXES) ? otherIncome : revenue).push(entry);
      } else if (startsWithAny(account.code, COGS_PREFIXES)) {
        cogs.push(entry);
      } else if (startsWithAny(account.code, OTHER_EXPENSE_PREFIXES)) {
        otherExpenses.push(entry);
      } else {
        opex.push(entry);
      }
    }

    const rev = section(revenue);
    const cogsSection = section(cogs);
    const opexSection = section(opex);
    const otherIncomeSection = section(otherIncome);
    const otherExpenseSection = section(otherExpenses);

    const grossProfit = rev.total.sub(cogsSection.total);
    const operatingProfit = grossProfit.sub(opexSection.total);
    const netProfit = operatingProfit.add(otherIncomeSection.total).sub(otherExpenseSection.total);
    const totalIncome = rev.total.add(otherIncomeSection.total);
    const totalExpenses = cogsSection.total.add(opexSection.total).add(otherExpenseSection.total);

    return {
      period: { startDate: period.startDate, endDate: period.endDate },
      basis: 'POSTED_LEDGER',
      currencyCode,
      revenue: rev.section,
      costOfGoodsSold: cogsSection.section,
      grossProfit: money(grossProfit),
      grossProfitMargin: percentOf(grossProfit, rev.total),
      operatingExpenses: opexSection.section,
      operatingProfit: money(operatingProfit),
      otherIncome: money(otherIncomeSection.total),
      otherExpenses: money(otherExpenseSection.total),
      income: [...revenue, ...otherIncome].map((l) => l.line),
      expenses: [...cogs, ...opex, ...otherExpenses].map((l) => l.line),
      totalIncome: money(totalIncome),
      totalExpenses: money(totalExpenses),
      netProfit: money(netProfit),
      netProfitMargin: percentOf(netProfit, totalIncome),
    };
  }

  async getBalanceSheet(organizationId: string, asOfDate?: string): Promise<BalanceSheetReport> {
    const { asOf, asOfDate: asOfIso } = resolveAsOf(asOfDate);
    const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1));

    const [currencyCode, accounts] = await Promise.all([
      getBaseCurrency(this.prisma, organizationId),
      this.prisma.account.findMany({
        where: { organizationId },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { code: 'asc' },
      }),
    ]);
    const plAccountIds = accounts
      .filter((a) => isIncomeType(a.type) || a.type === AccountType.EXPENSE)
      .map((a) => a.id);
    const [cumulative, yearToDate] = await Promise.all([
      sumPostedLinesByAccount(this.prisma, organizationId, { lte: asOf }),
      sumPostedLinesByAccount(
        this.prisma,
        organizationId,
        { gte: yearStart, lte: asOf },
        plAccountIds,
      ),
    ]);

    const currentAssets: Array<{ line: StatementAccountLine; value: Decimal }> = [];
    const fixedAssets: Array<{ line: StatementAccountLine; value: Decimal }> = [];
    const currentLiabilities: Array<{ line: StatementAccountLine; value: Decimal }> = [];
    const longTermLiabilities: Array<{ line: StatementAccountLine; value: Decimal }> = [];
    const equityLines: Array<{ line: StatementAccountLine; value: Decimal }> = [];
    let retainedEarnings = ZERO;
    let currentYearEarnings = ZERO;

    for (const account of accounts) {
      if (isIncomeType(account.type) || account.type === AccountType.EXPENSE) {
        const sign = isIncomeType(account.type) ? 1 : -1;
        const all = this.naturalValue(account, cumulative.get(account.id));
        const ytd = this.naturalValue(account, yearToDate.get(account.id));
        retainedEarnings = retainedEarnings.add(all.mul(sign));
        currentYearEarnings = currentYearEarnings.add(ytd.mul(sign));
        continue;
      }
      const entry = this.naturalLine(account, cumulative.get(account.id));
      if (!entry) continue;
      if (account.type === AccountType.ASSET) {
        (startsWithAny(account.code, FIXED_ASSET_PREFIXES) ? fixedAssets : currentAssets).push(
          entry,
        );
      } else if (account.type === AccountType.LIABILITY) {
        (startsWithAny(account.code, LONG_TERM_LIABILITY_PREFIXES)
          ? longTermLiabilities
          : currentLiabilities
        ).push(entry);
      } else {
        equityLines.push(entry);
      }
    }

    const current = section(currentAssets);
    const fixed = section(fixedAssets);
    const curLiab = section(currentLiabilities);
    const ltLiab = section(longTermLiabilities);
    const equity = section(equityLines);

    const totalAssets = current.total.add(fixed.total);
    const totalLiabilities = curLiab.total.add(ltLiab.total);
    const totalEquity = equity.total.add(retainedEarnings);
    const totalLiabilitiesAndEquity = totalLiabilities.add(totalEquity);
    const difference = totalAssets.sub(totalLiabilitiesAndEquity);

    return {
      asOfDate: asOfIso,
      basis: 'POSTED_LEDGER',
      currencyCode,
      assets: { current: current.section, fixed: fixed.section, total: money(totalAssets) },
      liabilities: {
        current: curLiab.section,
        longTerm: ltLiab.section,
        total: money(totalLiabilities),
      },
      equity: {
        accounts: equity.section.accounts,
        retainedEarnings: money(retainedEarnings),
        currentYearEarnings: money(currentYearEarnings),
        total: money(totalEquity),
      },
      totalAssets: money(totalAssets),
      totalLiabilities: money(totalLiabilities),
      totalEquity: money(totalEquity),
      totalLiabilitiesAndEquity: money(totalLiabilitiesAndEquity),
      difference: money(difference),
      isBalanced: difference.isZero(),
    };
  }

  /**
   * Indirect-method cash flow from the posted ledger. Every non-cash account's period movement is
   * classified, with uncategorised working-capital movements in `otherOperatingChanges`, so the
   * computed net change always equals the actual movement of the cash/bank accounts.
   */
  async getCashFlowStatement(
    organizationId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<CashFlowReport> {
    const period = resolvePeriod(startDate, endDate);
    const [currencyCode, cashAccountIds, accounts, org] = await Promise.all([
      getBaseCurrency(this.prisma, organizationId),
      resolveCashAccountIds(this.prisma, organizationId),
      this.prisma.account.findMany({
        where: { organizationId },
        select: { id: true, code: true, name: true, type: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { defaultArAccountId: true, defaultApAccountId: true },
      }),
    ]);
    const cashIds = new Set(cashAccountIds);

    const [opening, movements] = await Promise.all([
      sumPostedLinesByAccount(this.prisma, organizationId, { lt: period.start }, cashAccountIds),
      sumPostedLinesByAccount(this.prisma, organizationId, { gte: period.start, lte: period.end }),
    ]);

    let openingCash = ZERO;
    for (const id of cashAccountIds) {
      const t = opening.get(id);
      if (t) openingCash = openingCash.add(t.debit.sub(t.credit));
    }

    let cashMovement = ZERO;
    let netIncome = ZERO;
    let arChange = ZERO;
    let apChange = ZERO;
    let inventoryChange = ZERO;
    let otherOperating = ZERO;
    let fixedAssetChange = ZERO;
    let equityChange = ZERO;
    let debtChange = ZERO;

    for (const account of accounts) {
      const t = movements.get(account.id);
      if (!t) continue;
      const debitMinusCredit = t.debit.sub(t.credit);
      if (cashIds.has(account.id)) {
        cashMovement = cashMovement.add(debitMinusCredit);
        continue;
      }
      // Cash effect of a non-cash account's movement is the negative of its (debit − credit).
      const cashEffect = debitMinusCredit.neg();
      if (isIncomeType(account.type) || account.type === AccountType.EXPENSE) {
        netIncome = netIncome.add(cashEffect);
      } else if (account.type === AccountType.ASSET) {
        if (account.id === org?.defaultArAccountId || account.code.startsWith('12')) {
          arChange = arChange.add(cashEffect);
        } else if (account.code.startsWith('11')) {
          inventoryChange = inventoryChange.add(cashEffect);
        } else if (startsWithAny(account.code, FIXED_ASSET_PREFIXES)) {
          fixedAssetChange = fixedAssetChange.add(cashEffect);
        } else {
          otherOperating = otherOperating.add(cashEffect);
        }
      } else if (account.type === AccountType.LIABILITY) {
        if (account.id === org?.defaultApAccountId || account.code.startsWith('2000')) {
          apChange = apChange.add(cashEffect);
        } else if (startsWithAny(account.code, LONG_TERM_LIABILITY_PREFIXES)) {
          debtChange = debtChange.add(cashEffect);
        } else {
          otherOperating = otherOperating.add(cashEffect);
        }
      } else {
        equityChange = equityChange.add(cashEffect);
      }
    }

    const operatingCashFlow = netIncome
      .add(arChange)
      .add(apChange)
      .add(inventoryChange)
      .add(otherOperating);
    const investingCashFlow = fixedAssetChange;
    const financingCashFlow = equityChange.add(debtChange);
    const netCashChange = operatingCashFlow.add(investingCashFlow).add(financingCashFlow);
    const closingCash = openingCash.add(cashMovement);
    const calculated = openingCash.add(netCashChange);

    return {
      period: { startDate: period.startDate, endDate: period.endDate },
      basis: 'POSTED_LEDGER_INDIRECT',
      currencyCode,
      cashAccountIds,
      openingCashBalance: money(openingCash),
      operating: {
        netIncome: money(netIncome),
        adjustments: {
          accountsReceivableChange: money(arChange),
          accountsPayableChange: money(apChange),
          inventoryChange: money(inventoryChange),
          otherOperatingChanges: money(otherOperating),
        },
        netCashFromOperating: money(operatingCashFlow),
      },
      investing: {
        fixedAssetPurchases: money(fixedAssetChange),
        netCashFromInvesting: money(investingCashFlow),
      },
      financing: {
        equityChanges: money(equityChange),
        debtChanges: money(debtChange),
        netCashFromFinancing: money(financingCashFlow),
      },
      netCashChange: money(netCashChange),
      closingCashBalance: money(closingCash),
      reconciliation: {
        calculated: money(calculated),
        actual: money(closingCash),
        variance: money(closingCash.sub(calculated)),
      },
    };
  }

  /** Σ debit == Σ credit for any set of balanced posted journals (inactive accounts included). */
  async getTrialBalance(organizationId: string, asOfDate?: string): Promise<TrialBalanceReport> {
    const { asOf, asOfDate: asOfIso } = resolveAsOf(asOfDate);
    const [currencyCode, accounts, totals] = await Promise.all([
      getBaseCurrency(this.prisma, organizationId),
      this.prisma.account.findMany({
        where: { organizationId },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { code: 'asc' },
      }),
      sumPostedLinesByAccount(this.prisma, organizationId, { lte: asOf }),
    ]);

    let totalDebits = ZERO;
    let totalCredits = ZERO;
    const lines: TrialBalanceLine[] = [];
    for (const account of accounts) {
      const t = totals.get(account.id);
      if (!t) continue;
      const net = t.debit.sub(t.credit);
      if (net.isZero()) continue;
      const debit = net.greaterThan(0) ? net : ZERO;
      const credit = net.lessThan(0) ? net.neg() : ZERO;
      totalDebits = totalDebits.add(debit);
      totalCredits = totalCredits.add(credit);
      lines.push({
        id: account.id,
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        debit: money(debit),
        credit: money(credit),
      });
    }

    const difference = totalDebits.sub(totalCredits);
    return {
      asOfDate: asOfIso,
      basis: 'POSTED_LEDGER',
      currencyCode,
      accounts: lines,
      totals: { debit: money(totalDebits), credit: money(totalCredits) },
      totalDebits: money(totalDebits),
      totalCredits: money(totalCredits),
      difference: money(difference),
      isBalanced: difference.isZero(),
    };
  }

  async getGeneralLedger(
    organizationId: string,
    accountId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<GeneralLedgerReport> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, organizationId },
      select: { id: true, code: true, name: true, type: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    const period = resolvePeriod(startDate, endDate);
    const [currencyCode, prior, lines] = await Promise.all([
      getBaseCurrency(this.prisma, organizationId),
      sumPostedLinesByAccount(this.prisma, organizationId, { lt: period.start }, [accountId]),
      this.prisma.journalLine.findMany({
        where: {
          accountId,
          journal: postedJournalWhere(organizationId, { gte: period.start, lte: period.end }),
        },
        include: {
          journal: {
            select: {
              id: true,
              journalNumber: true,
              date: true,
              reference: true,
              notes: true,
              sourceType: true,
              sourceId: true,
              reversalOfId: true,
            },
          },
        },
        orderBy: [
          { journal: { date: 'asc' } },
          { journal: { createdAt: 'asc' } },
          { journal: { journalNumber: 'asc' } },
          { id: 'asc' },
        ],
      }),
    ]);

    const openingBalance = this.naturalValue(account, prior.get(accountId));
    let running = openingBalance;
    let totalDebits = ZERO;
    let totalCredits = ZERO;
    const entries: GeneralLedgerEntry[] = lines.map((line) => {
      const debit = toDecimal(line.debit);
      const credit = toDecimal(line.credit);
      totalDebits = totalDebits.add(debit);
      totalCredits = totalCredits.add(credit);
      running = running.add(naturalBalance(account.type, debit, credit));
      return {
        date: line.journal.date,
        journalId: line.journal.id,
        journalNumber: line.journal.journalNumber,
        reference: line.journal.reference,
        description: line.description || line.journal.notes,
        sourceType: line.journal.sourceType,
        sourceId: line.journal.sourceId,
        reversalOfId: line.journal.reversalOfId,
        debit: money(debit),
        credit: money(credit),
        balance: money(running),
        runningBalance: money(running),
      };
    });

    return {
      account,
      normalBalance: normalSide(account.type),
      period: { startDate: period.startDate, endDate: period.endDate },
      currencyCode,
      openingBalance: money(openingBalance),
      entries,
      closingBalance: money(running),
      totalDebits: money(totalDebits),
      totalCredits: money(totalCredits),
    };
  }

  private naturalValue(account: AccountRow, totals: LineTotals | undefined): Decimal {
    if (!totals) return ZERO;
    return naturalBalance(account.type, totals.debit, totals.credit);
  }

  private naturalLine(
    account: AccountRow,
    totals: LineTotals | undefined,
  ): { line: StatementAccountLine; value: Decimal } | null {
    const value = this.naturalValue(account, totals);
    if (value.isZero()) return null;
    return {
      line: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        balance: money(value),
      },
      value,
    };
  }

  // === Sales & Purchases Reports (document based; draft/pending/void/deleted excluded) ===

  async getSalesByCustomer(
    organizationId: string,
    startDate?: string,
    endDate?: string,
    currency?: string,
  ): Promise<SalesByCustomerReport> {
    const period = resolvePeriod(startDate, endDate);
    const base = await getBaseCurrency(this.prisma, organizationId);
    const reportCurrency = normalizeCurrencyParam(currency, base);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: POSTED_INVOICE_STATUSES },
        date: { gte: period.start, lte: period.end },
      },
      select: {
        customerId: true,
        grandTotal: true,
        balanceDue: true,
        currencyCode: true,
        customer: { select: { id: true, name: true } },
      },
    });
    const { included, otherCurrencies } = splitByCurrency(
      invoices,
      (i) => documentCurrency(i.currencyCode, base),
      reportCurrency,
    );

    const byCustomer = new Map<
      string,
      { name: string; count: number; total: Decimal; balance: Decimal }
    >();
    for (const inv of included) {
      const row = byCustomer.get(inv.customerId) ?? {
        name: inv.customer.name,
        count: 0,
        total: ZERO,
        balance: ZERO,
      };
      row.count += 1;
      row.total = row.total.add(toDecimal(inv.grandTotal));
      row.balance = row.balance.add(toDecimal(inv.balanceDue));
      byCustomer.set(inv.customerId, row);
    }

    const rows = [...byCustomer.entries()].sort((a, b) => b[1].total.comparedTo(a[1].total));
    const totalAmount = rows.reduce((s, [, r]) => s.add(r.total), ZERO);
    const totalBalance = rows.reduce((s, [, r]) => s.add(r.balance), ZERO);
    return {
      entries: rows.map(([customerId, r]) => ({
        customerId,
        customerName: r.name,
        invoiceCount: r.count,
        totalAmount: money(r.total),
        paidAmount: money(r.total.sub(r.balance)),
        balanceDue: money(r.balance),
        currencyCode: reportCurrency,
      })),
      totalAmount: money(totalAmount),
      totalPaid: money(totalAmount.sub(totalBalance)),
      totalBalance: money(totalBalance),
      currencyCode: reportCurrency,
      otherCurrencies,
      period: { startDate: period.startDate, endDate: period.endDate },
    };
  }

  async getSalesByItem(
    organizationId: string,
    startDate?: string,
    endDate?: string,
    currency?: string,
  ): Promise<SalesByItemReport> {
    const period = resolvePeriod(startDate, endDate);
    const base = await getBaseCurrency(this.prisma, organizationId);
    const reportCurrency = normalizeCurrencyParam(currency, base);

    const invoiceLines = await this.prisma.invoiceLine.findMany({
      where: {
        invoice: {
          organizationId,
          deletedAt: null,
          status: { in: POSTED_INVOICE_STATUSES },
          date: { gte: period.start, lte: period.end },
        },
        itemId: { not: null },
      },
      select: {
        quantity: true,
        amount: true,
        invoice: { select: { currencyCode: true } },
        item: { select: { id: true, name: true, sku: true } },
      },
    });
    const { included, otherCurrencies } = splitByCurrency(
      invoiceLines,
      (l) => documentCurrency(l.invoice.currencyCode, base),
      reportCurrency,
    );

    const byItem = new Map<string, { name: string; sku: string; qty: Decimal; total: Decimal }>();
    for (const line of included) {
      if (!line.item) continue;
      const row = byItem.get(line.item.id) ?? {
        name: line.item.name,
        sku: line.item.sku || '',
        qty: ZERO,
        total: ZERO,
      };
      row.qty = row.qty.add(toDecimal(line.quantity));
      row.total = row.total.add(toDecimal(line.amount));
      byItem.set(line.item.id, row);
    }

    const rows = [...byItem.entries()].sort((a, b) => b[1].total.comparedTo(a[1].total));
    return {
      entries: rows.map(([itemId, r]) => ({
        itemId,
        itemName: r.name,
        sku: r.sku,
        quantitySold: money(r.qty),
        totalAmount: money(r.total),
        averagePrice: money(r.qty.greaterThan(0) ? r.total.div(r.qty) : ZERO),
        currencyCode: reportCurrency,
      })),
      totalAmount: money(rows.reduce((s, [, r]) => s.add(r.total), ZERO)),
      totalQuantity: money(rows.reduce((s, [, r]) => s.add(r.qty), ZERO)),
      currencyCode: reportCurrency,
      otherCurrencies,
      period: { startDate: period.startDate, endDate: period.endDate },
    };
  }

  /**
   * Approved bills (OPEN/PARTIALLY_PAID/PAID/OVERDUE) dated in the period, grouped by vendor, in a
   * single currency. `paidAmount`/`balanceDue` reflect payments recorded to date.
   */
  async getPurchasesByVendor(
    organizationId: string,
    startDate?: string,
    endDate?: string,
    currency?: string,
  ): Promise<PurchasesByVendorReport> {
    const period = resolvePeriod(startDate, endDate);
    const base = await getBaseCurrency(this.prisma, organizationId);
    const reportCurrency = normalizeCurrencyParam(currency, base);

    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: POSTED_BILL_STATUSES },
        date: { gte: period.start, lte: period.end },
      },
      select: {
        vendorId: true,
        grandTotal: true,
        balanceDue: true,
        currencyCode: true,
        vendor: { select: { id: true, name: true } },
      },
    });
    const { included, otherCurrencies } = splitByCurrency(
      bills,
      (b) => documentCurrency(b.currencyCode, base),
      reportCurrency,
    );

    const byVendor = new Map<
      string,
      { name: string; count: number; total: Decimal; balance: Decimal }
    >();
    for (const bill of included) {
      const row = byVendor.get(bill.vendorId) ?? {
        name: bill.vendor.name,
        count: 0,
        total: ZERO,
        balance: ZERO,
      };
      row.count += 1;
      row.total = row.total.add(toDecimal(bill.grandTotal));
      row.balance = row.balance.add(toDecimal(bill.balanceDue));
      byVendor.set(bill.vendorId, row);
    }

    const rows = [...byVendor.entries()].sort((a, b) => b[1].total.comparedTo(a[1].total));
    const totalAmount = rows.reduce((s, [, r]) => s.add(r.total), ZERO);
    const totalBalance = rows.reduce((s, [, r]) => s.add(r.balance), ZERO);
    return {
      entries: rows.map(([vendorId, r]) => ({
        vendorId,
        vendorName: r.name,
        billCount: r.count,
        totalAmount: money(r.total),
        paidAmount: money(r.total.sub(r.balance)),
        balanceDue: money(r.balance),
        currencyCode: reportCurrency,
      })),
      totalAmount: money(totalAmount),
      totalPaid: money(totalAmount.sub(totalBalance)),
      totalBalance: money(totalBalance),
      currencyCode: reportCurrency,
      otherCurrencies,
      period: { startDate: period.startDate, endDate: period.endDate },
    };
  }
}
