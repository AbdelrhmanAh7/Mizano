import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction, BillStatus, InvoiceStatus, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { CacheService } from '../../../cache/cache.service';
import {
  containsPattern,
  normalizeArabic,
  normalizedSql,
} from '../../../common/utils/arabic-search';
import {
  daysPastDue,
  getBaseCurrency,
  money,
  startOfUtcDay,
  toIsoDate,
} from '../../../common/utils/report-utils';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateBillDto } from '../../purchases/dto/create-bill.dto';
import { CreateExpenseDto } from '../../purchases/dto/create-expense.dto';
import { BillsService } from '../../purchases/services/bills.service';
import { ExpensesService } from '../../purchases/services/expenses.service';
import { AgingReportsService } from '../../reports/services/aging-reports.service';
import { FinancialReportsService } from '../../reports/services/financial-reports.service';
import { CreateInvoiceDto } from '../../sales/dto/create-invoice.dto';
import { CreateQuoteDto } from '../../sales/dto/create-quote.dto';
import { InvoicesService } from '../../sales/services/invoices.service';
import { QuotesService } from '../../sales/services/quotes.service';
import { VatReturnsService } from '../../tax/services/vat-returns.service';
import { McpConfig } from '../mcp.config';
import { McpPrincipal } from '../oauth/mcp-oauth.service';
import { MCP_TEXT } from './mcp-text';

type Text = { ar: string; en: string };
export interface ToolAnswer {
  summary: Text;
  data: Record<string, unknown>;
}
export type Args = Record<string, unknown>;

/** A body the AI app sent that the shared DTO rules refused; carries field names only. */
export class ToolInputError extends Error {
  constructor(readonly fields: string[]) {
    super(`Invalid fields: ${fields.join(', ')}`);
  }
}
/** The record does not exist in this organization (or never did). */
export class ToolNotFoundError extends Error {}

const OPEN_INVOICE: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];
const OPEN_BILL: BillStatus[] = [BillStatus.OPEN, BillStatus.PARTIALLY_PAID, BillStatus.OVERDUE];
const DAY_MS = 24 * 60 * 60 * 1000;

function limitOf(args: Args, fallback = 20, max = 50): number {
  const n = typeof args.limit === 'number' ? Math.floor(args.limit) : fallback;
  return Math.min(Math.max(n, 1), max);
}
function text(args: Args, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function today(): string {
  return toIsoDate(new Date());
}
function plusDays(isoDate: string, days: number): string {
  return toIsoDate(new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY_MS));
}
function fieldPaths(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((e) => {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    return e.children?.length ? fieldPaths(e.children, path) : [path];
  });
}

/**
 * What the MCP tools do. Reads are scoped by organizationId on every query and return short,
 * decimal-string answers; reports come from the same services as the report pages, so the
 * figures reconcile. Drafts go through the same create commands as the web forms and are never
 * posted, sent or paid here: a person reviews and posts them in Mizano.
 */
@Injectable()
export class McpToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mcpConfig: McpConfig,
    private readonly cache: CacheService,
    private readonly aging: AgingReportsService,
    private readonly reports: FinancialReportsService,
    private readonly vat: VatReturnsService,
    private readonly quotes: QuotesService,
    private readonly invoices: InvoicesService,
    private readonly bills: BillsService,
    private readonly expenses: ExpensesService,
  ) {}

  // ── Find (Arabic-normalised) ───────────────────────────────

  /**
   * Folded contains-match plus trigram similarity on the folded name, best match first. Small
   * per-organization tables, so a scan is fine; frecency ranking needs usage data we lack here.
   */
  private async findParties(
    table: 'customers' | 'vendors',
    org: string,
    query: string,
    limit: number,
  ): Promise<Array<{ id: string; name: string; email: string | null; phone: string | null }>> {
    const q = normalizeArabic(query);
    if (!q) return [];
    const name = normalizedSql('name');
    const display = normalizedSql(`COALESCE("displayName", '')`);
    const like = containsPattern(q);
    return this.prisma.$queryRaw`
      SELECT id, name, email, phone FROM ${Prisma.raw(`"${table}"`)}
      WHERE "organizationId" = ${org} AND "deletedAt" IS NULL
        AND (${name} LIKE ${like} OR ${display} LIKE ${like}
             OR similarity(${name}, ${q}) > 0.3
             OR email ILIKE ${like} OR phone LIKE ${like})
      ORDER BY (${name} LIKE ${`${q}%`}) DESC, similarity(${name}, ${q}) DESC, name ASC
      LIMIT ${limit}`;
  }

  async findCustomers(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const rows = await this.findParties(
      'customers',
      p.organizationId,
      text(args, 'query') ?? '',
      limitOf(args, 10),
    );
    const ids = rows.map((r) => r.id);
    const balances = ids.length
      ? await this.prisma.invoice.groupBy({
          by: ['customerId'],
          where: {
            organizationId: p.organizationId,
            customerId: { in: ids },
            deletedAt: null,
            status: { in: OPEN_INVOICE },
          },
          _sum: { balanceDue: true },
        })
      : [];
    const owed = new Map(balances.map((b) => [b.customerId, money(b._sum.balanceDue)]));
    return {
      summary: MCP_TEXT.found(rows.length, MCP_TEXT.customers),
      data: {
        customers: rows.map((r) => ({ ...r, openBalance: owed.get(r.id) ?? money(0) })),
      },
    };
  }

  async findVendors(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const rows = await this.findParties(
      'vendors',
      p.organizationId,
      text(args, 'query') ?? '',
      limitOf(args, 10),
    );
    return { summary: MCP_TEXT.found(rows.length, MCP_TEXT.vendors), data: { vendors: rows } };
  }

  async findItems(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const q = normalizeArabic(text(args, 'query') ?? '');
    const limit = limitOf(args, 10);
    const name = normalizedSql('name');
    const like = containsPattern(q);
    const rows = q
      ? await this.prisma.$queryRaw<
          Array<{
            id: string;
            name: string;
            sku: string;
            unit: string | null;
            type: string;
            sellingPrice: Prisma.Decimal;
            costPrice: Prisma.Decimal;
            taxRate: Prisma.Decimal | null;
          }>
        >`
          SELECT id, name, sku, unit, type::text AS type, "sellingPrice", "costPrice", "taxRate"
          FROM "items"
          WHERE "organizationId" = ${p.organizationId} AND "deletedAt" IS NULL AND "isActive" = true
            AND (${name} LIKE ${like} OR similarity(${name}, ${q}) > 0.3 OR sku ILIKE ${like})
          ORDER BY (${name} LIKE ${`${q}%`}) DESC, similarity(${name}, ${q}) DESC, name ASC
          LIMIT ${limit}`
      : [];
    return {
      summary: MCP_TEXT.found(rows.length, MCP_TEXT.items),
      data: {
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          sku: r.sku,
          unit: r.unit,
          type: r.type,
          sellingPrice: money(r.sellingPrice),
          costPrice: money(r.costPrice),
          taxRate: r.taxRate === null ? null : new Prisma.Decimal(r.taxRate).toFixed(2),
        })),
      },
    };
  }

  // ── Invoices and bills ─────────────────────────────────────

  async listInvoices(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const status = text(args, 'status') ?? 'unpaid';
    const todayStart = startOfUtcDay(new Date());
    const where: Prisma.InvoiceWhereInput = {
      organizationId: p.organizationId,
      deletedAt: null,
      ...(text(args, 'customerId') && { customerId: text(args, 'customerId') }),
      ...(status === 'unpaid' && { status: { in: OPEN_INVOICE }, balanceDue: { gt: 0 } }),
      ...(status === 'overdue' && {
        status: { in: OPEN_INVOICE },
        balanceDue: { gt: 0 },
        dueDate: { lt: todayStart },
      }),
      ...(status === 'draft' && { status: InvoiceStatus.DRAFT }),
      ...(status === 'paid' && { status: InvoiceStatus.PAID }),
      ...(status === 'all' && { status: { not: InvoiceStatus.VOID } }),
    };
    const open = status === 'unpaid' || status === 'overdue';
    const [rows, total, currency] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: open ? { dueDate: 'asc' } : { date: 'desc' },
        take: limitOf(args),
        select: {
          id: true,
          invoiceNumber: true,
          date: true,
          dueDate: true,
          status: true,
          grandTotal: true,
          balanceDue: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.invoice.aggregate({
        where,
        _count: true,
        _sum: { balanceDue: true, grandTotal: true },
      }),
      getBaseCurrency(this.prisma, p.organizationId),
    ]);
    return {
      summary: MCP_TEXT.found(total._count, MCP_TEXT.invoices),
      data: {
        status,
        currency,
        count: total._count,
        totalAmount: money(total._sum.grandTotal),
        totalBalanceDue: money(total._sum.balanceDue),
        shown: rows.length,
        invoices: rows.map((r) => ({
          id: r.id,
          number: r.invoiceNumber,
          customer: r.customer,
          date: toIsoDate(r.date),
          dueDate: toIsoDate(r.dueDate),
          status: r.status,
          total: money(r.grandTotal),
          balanceDue: money(r.balanceDue),
          daysOverdue: open ? Math.max(0, daysPastDue(r.dueDate, todayStart)) : undefined,
        })),
      },
    };
  }

  async getInvoice(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const ref = text(args, 'invoice') ?? '';
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        organizationId: p.organizationId,
        OR: [{ id: ref }, { invoiceNumber: { equals: ref, mode: 'insensitive' } }],
        // Voided posted invoices stay readable; deleted drafts do not.
        AND: [{ OR: [{ deletedAt: null }, { status: InvoiceStatus.VOID }] }],
      },
      include: {
        customer: { select: { id: true, name: true } },
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!invoice) throw new ToolNotFoundError();
    const currency = invoice.currencyCode ?? (await getBaseCurrency(this.prisma, p.organizationId));
    return {
      summary: MCP_TEXT.invoice(invoice.invoiceNumber),
      data: {
        id: invoice.id,
        number: invoice.invoiceNumber,
        status: invoice.status,
        customer: invoice.customer,
        date: toIsoDate(invoice.date),
        dueDate: toIsoDate(invoice.dueDate),
        reference: invoice.reference,
        currency,
        subtotal: money(invoice.subtotal),
        tax: money(invoice.taxAmount),
        shipping: money(invoice.shippingAmount),
        total: money(invoice.grandTotal),
        paid: money(invoice.grandTotal.sub(invoice.balanceDue)),
        balanceDue: money(invoice.balanceDue),
        lines: invoice.lines.map((l) => ({
          description: l.description,
          quantity: money(l.quantity),
          rate: money(l.rate),
          discountPercent: money(l.discount),
          taxPercent: money(l.taxRate),
          amount: money(l.amount),
        })),
        link: this.link(p, `sales/invoices/${invoice.id}`),
      },
    };
  }

  async listBills(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const status = text(args, 'status') ?? 'unpaid';
    const todayStart = startOfUtcDay(new Date());
    const where: Prisma.BillWhereInput = {
      organizationId: p.organizationId,
      deletedAt: null,
      ...(text(args, 'vendorId') && { vendorId: text(args, 'vendorId') }),
      ...(status === 'unpaid' && { status: { in: OPEN_BILL }, balanceDue: { gt: 0 } }),
      ...(status === 'overdue' && {
        status: { in: OPEN_BILL },
        balanceDue: { gt: 0 },
        dueDate: { lt: todayStart },
      }),
      ...(status === 'draft' && { status: { in: [BillStatus.DRAFT, BillStatus.PENDING] } }),
      ...(status === 'paid' && { status: BillStatus.PAID }),
      ...(status === 'all' && { status: { not: BillStatus.VOID } }),
    };
    const open = status === 'unpaid' || status === 'overdue';
    const [rows, total, currency] = await Promise.all([
      this.prisma.bill.findMany({
        where,
        orderBy: open ? { dueDate: 'asc' } : { date: 'desc' },
        take: limitOf(args),
        select: {
          id: true,
          billNumber: true,
          date: true,
          dueDate: true,
          status: true,
          grandTotal: true,
          balanceDue: true,
          vendor: { select: { id: true, name: true } },
        },
      }),
      this.prisma.bill.aggregate({
        where,
        _count: true,
        _sum: { balanceDue: true, grandTotal: true },
      }),
      getBaseCurrency(this.prisma, p.organizationId),
    ]);
    return {
      summary: MCP_TEXT.found(total._count, MCP_TEXT.bills),
      data: {
        status,
        currency,
        count: total._count,
        totalAmount: money(total._sum.grandTotal),
        totalBalanceDue: money(total._sum.balanceDue),
        shown: rows.length,
        bills: rows.map((r) => ({
          id: r.id,
          number: r.billNumber,
          vendor: r.vendor,
          date: toIsoDate(r.date),
          dueDate: toIsoDate(r.dueDate),
          status: r.status,
          total: money(r.grandTotal),
          balanceDue: money(r.balanceDue),
          daysOverdue: open ? Math.max(0, daysPastDue(r.dueDate, todayStart)) : undefined,
        })),
      },
    };
  }

  async getBill(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const ref = text(args, 'bill') ?? '';
    const bill = await this.prisma.bill.findFirst({
      where: {
        organizationId: p.organizationId,
        OR: [{ id: ref }, { billNumber: { equals: ref, mode: 'insensitive' } }],
        AND: [{ OR: [{ deletedAt: null }, { status: BillStatus.VOID }] }],
      },
      include: { vendor: { select: { id: true, name: true } }, lines: true },
    });
    if (!bill) throw new ToolNotFoundError();
    const currency = bill.currencyCode ?? (await getBaseCurrency(this.prisma, p.organizationId));
    return {
      summary: MCP_TEXT.bill(bill.billNumber),
      data: {
        id: bill.id,
        number: bill.billNumber,
        status: bill.status,
        vendor: bill.vendor,
        date: toIsoDate(bill.date),
        dueDate: toIsoDate(bill.dueDate),
        reference: bill.reference,
        currency,
        subtotal: money(bill.subtotal),
        tax: money(bill.taxAmount),
        total: money(bill.grandTotal),
        paid: money(bill.grandTotal.sub(bill.balanceDue)),
        balanceDue: money(bill.balanceDue),
        lines: bill.lines.map((l) => ({
          description: l.description,
          quantity: money(l.quantity),
          rate: money(l.rate),
          taxPercent: money(l.taxRate),
          amount: money(l.amount),
        })),
        link: this.link(p, `purchases/bills/${bill.id}`),
      },
    };
  }

  // ── Reports (same services as the report pages) ───────────

  async receivablesAging(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const r = await this.aging.getReceivablesAging(p.organizationId, text(args, 'asOfDate'));
    const asOf = toIsoDate(r.asOfDate);
    return {
      summary: MCP_TEXT.arAging(asOf),
      data: {
        asOfDate: asOf,
        summary: r.summary,
        unappliedCredits: r.unappliedCredits.total,
        customerCount: r.customerCount,
        invoiceCount: r.invoiceCount,
      },
    };
  }

  async payablesAging(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const r = await this.aging.getPayablesAging(p.organizationId, text(args, 'asOfDate'));
    const asOf = toIsoDate(r.asOfDate);
    return {
      summary: MCP_TEXT.apAging(asOf),
      data: {
        asOfDate: asOf,
        summary: r.summary,
        unappliedCredits: r.unappliedCredits.total,
        vendorCount: r.vendorCount,
        billCount: r.billCount,
      },
    };
  }

  async profitAndLoss(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const r = await this.reports.getProfitAndLoss(
      p.organizationId,
      text(args, 'startDate'),
      text(args, 'endDate'),
    );
    const lines = (accounts: Array<{ code: string; name: string; balance: string }>) =>
      accounts
        .filter((a) => a.balance !== money(0))
        .map((a) => ({ code: a.code, name: a.name, amount: a.balance }));
    return {
      summary: MCP_TEXT.profitAndLoss(r.period.startDate, r.period.endDate),
      data: {
        period: r.period,
        currency: r.currencyCode,
        revenue: r.revenue.total,
        costOfGoodsSold: r.costOfGoodsSold.total,
        grossProfit: r.grossProfit,
        operatingExpenses: r.operatingExpenses.total,
        operatingProfit: r.operatingProfit,
        otherIncome: r.otherIncome,
        otherExpenses: r.otherExpenses,
        netProfit: r.netProfit,
        incomeAccounts: lines(r.income),
        expenseAccounts: lines(r.expenses),
      },
    };
  }

  async balanceSheet(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const r = await this.reports.getBalanceSheet(p.organizationId, text(args, 'asOfDate'));
    return {
      summary: MCP_TEXT.balanceSheet(r.asOfDate),
      data: {
        asOfDate: r.asOfDate,
        currency: r.currencyCode,
        currentAssets: r.assets.current.total,
        fixedAssets: r.assets.fixed.total,
        totalAssets: r.totalAssets,
        currentLiabilities: r.liabilities.current.total,
        longTermLiabilities: r.liabilities.longTerm.total,
        totalLiabilities: r.totalLiabilities,
        retainedEarnings: r.equity.retainedEarnings,
        totalEquity: r.totalEquity,
        isBalanced: r.isBalanced,
      },
    };
  }

  async cashSummary(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const r = await this.reports.getCashFlowStatement(
      p.organizationId,
      text(args, 'startDate'),
      text(args, 'endDate'),
    );
    return {
      summary: MCP_TEXT.cashSummary(r.period.startDate, r.period.endDate),
      data: {
        period: r.period,
        currency: r.currencyCode,
        openingCash: r.openingCashBalance,
        fromOperations: r.operating.netCashFromOperating,
        fromInvesting: r.investing.netCashFromInvesting,
        fromFinancing: r.financing.netCashFromFinancing,
        netChange: r.netCashChange,
        closingCash: r.closingCashBalance,
      },
    };
  }

  async vatSummary(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const end = text(args, 'endDate') ?? today();
    const start = text(args, 'startDate') ?? `${end.slice(0, 7)}-01`;
    const r = await this.vat.getVatSummary(p.organizationId, start, end);
    return { summary: MCP_TEXT.vatSummary(start, end), data: r };
  }

  async recentPayments(
    p: McpPrincipal,
    args: Args,
    canSeeReceived: boolean,
    canSeeMade: boolean,
  ): Promise<ToolAnswer> {
    const direction = text(args, 'direction') ?? 'both';
    const limit = limitOf(args, 10);
    const since = text(args, 'since');
    const date = since ? { gte: new Date(`${since}T00:00:00Z`) } : undefined;
    const base = { organizationId: p.organizationId, deletedAt: null, ...(date && { date }) };
    const [received, made, currency] = await Promise.all([
      direction !== 'made' && canSeeReceived
        ? this.prisma.paymentReceived.findMany({
            where: base,
            orderBy: { date: 'desc' },
            take: limit,
            select: {
              id: true,
              paymentNumber: true,
              date: true,
              amount: true,
              paymentMode: true,
              customer: { select: { id: true, name: true } },
            },
          })
        : [],
      direction !== 'received' && canSeeMade
        ? this.prisma.paymentMade.findMany({
            where: base,
            orderBy: { date: 'desc' },
            take: limit,
            select: {
              id: true,
              paymentNumber: true,
              date: true,
              amount: true,
              paymentMode: true,
              vendor: { select: { id: true, name: true } },
            },
          })
        : [],
      getBaseCurrency(this.prisma, p.organizationId),
    ]);
    return {
      summary: MCP_TEXT.found(received.length + made.length, MCP_TEXT.payments),
      data: {
        currency,
        received: received.map((r) => ({
          number: r.paymentNumber,
          date: toIsoDate(r.date),
          customer: r.customer,
          amount: money(r.amount),
          mode: r.paymentMode,
        })),
        made: made.map((r) => ({
          number: r.paymentNumber,
          date: toIsoDate(r.date),
          vendor: r.vendor,
          amount: money(r.amount),
          mode: r.paymentMode,
        })),
      },
    };
  }

  async expenseAccountOptions(p: McpPrincipal): Promise<ToolAnswer> {
    const [expenseAccounts, payFromAccounts] = await Promise.all([
      this.expenses.expenseAccounts(p.organizationId),
      this.expenses.paidThroughAccounts(p.organizationId),
    ]);
    return { summary: MCP_TEXT.accountOptions, data: { expenseAccounts, payFromAccounts } };
  }

  // ── Drafts (never posted here) ─────────────────────────────

  async draftQuote(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const date = text(args, 'date') ?? today();
    const dto = await this.dto(CreateQuoteDto, {
      customerId: args.customerId,
      date,
      expiryDate: text(args, 'expiryDate') ?? plusDays(date, 30),
      lines: args.lines,
      notes: args.notes,
      terms: args.terms,
    });
    const quote = await this.quotes.create(p.organizationId, dto);
    await this.afterDraft(p, 'quote', quote.id, ['quotes:*']);
    return this.drafted(
      p,
      MCP_TEXT.quoteNoun,
      quote.quoteNumber,
      `sales/quotes/${quote.id}`,
      quote.id,
      money(quote.grandTotal),
    );
  }

  async draftInvoice(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const date = text(args, 'date') ?? today();
    const dto = await this.dto(CreateInvoiceDto, {
      customerId: args.customerId,
      date,
      dueDate: text(args, 'dueDate') ?? plusDays(date, 30),
      lines: args.lines,
      notes: args.notes,
      terms: args.terms,
      reference: args.reference,
    });
    const invoice = await this.invoices.create(p.organizationId, dto);
    await this.afterDraft(p, 'invoice', invoice.id, ['invoices:*', 'customers:*']);
    return this.drafted(
      p,
      MCP_TEXT.invoiceNoun,
      invoice.invoiceNumber,
      `sales/invoices/${invoice.id}`,
      invoice.id,
      money(invoice.grandTotal),
    );
  }

  async draftBill(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const date = text(args, 'date') ?? today();
    const dto = await this.dto(CreateBillDto, {
      vendorId: args.vendorId,
      billNumber: args.billNumber,
      date,
      dueDate: text(args, 'dueDate') ?? plusDays(date, 30),
      reference: args.reference,
      notes: args.notes,
      lines: args.lines,
    });
    const bill = await this.bills.create(p.organizationId, dto);
    await this.afterDraft(p, 'bill', bill.id, ['bills:*', 'vendors:*']);
    return this.drafted(
      p,
      MCP_TEXT.billNoun,
      bill.billNumber,
      `purchases/bills/${bill.id}`,
      bill.id,
      money(bill.grandTotal),
    );
  }

  async draftExpense(p: McpPrincipal, args: Args): Promise<ToolAnswer> {
    const dto = await this.dto(CreateExpenseDto, {
      date: text(args, 'date') ?? today(),
      accountId: args.accountId,
      paidThroughAccountId: args.paidThroughAccountId,
      amount: args.amount,
      taxRate: args.taxRate,
      taxInclusive: args.taxInclusive,
      vendorId: args.vendorId,
      description: args.description,
      reference: args.reference,
    });
    // post: false keeps it PENDING with no journal; a person posts it from the expense page.
    const expense = await this.expenses.create(p.organizationId, dto, { post: false });
    await this.afterDraft(p, 'expense', expense.id, ['expenses:*']);
    return this.drafted(
      p,
      MCP_TEXT.expenseNoun,
      expense.reference ?? '',
      `purchases/expenses/${expense.id}`,
      expense.id,
      money(new Prisma.Decimal(expense.amount).add(expense.taxAmount)),
    );
  }

  /** The DTO rules of the web route, applied to the AI app's input (whitelisted, strict). */
  private async dto<T extends object>(cls: new () => T, plain: Args): Promise<T> {
    const defined = Object.fromEntries(Object.entries(plain).filter(([, v]) => v !== undefined));
    const instance = plainToInstance(cls, defined);
    const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw new ToolInputError(fieldPaths(errors));
    return instance;
  }

  /** Audit trail (who created which draft, through which connection) and fresh list caches. */
  private async afterDraft(
    p: McpPrincipal,
    entityType: string,
    entityId: string,
    patterns: string[],
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId: p.userId,
        organizationId: p.organizationId,
        action: AuditAction.CREATE,
        entityType,
        entityId,
        oldValues: Prisma.DbNull,
        newValues: { source: 'mcp', grantId: p.grantId, status: 'draft' },
        userAgent: 'mcp',
      },
    });
    await Promise.all(
      patterns.map((pattern) => this.cache.deletePattern(pattern, p.organizationId)),
    );
  }

  private drafted(
    p: McpPrincipal,
    noun: Text,
    number: string,
    path: string,
    id: string,
    total: string,
  ): ToolAnswer {
    return {
      summary: MCP_TEXT.draftSaved(noun, number),
      data: { id, number, status: 'draft', total, link: this.link(p, path) },
    };
  }

  private link(p: McpPrincipal, path: string): string {
    return `${this.mcpConfig.webOrigin}/${p.locale}/${path}`;
  }

  /** Domain refusals keep their message; everything else is a generic failure. */
  static isRefusal(error: unknown): error is BadRequestException {
    return error instanceof BadRequestException;
  }
}
