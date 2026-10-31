import { CreditNoteType, InvoiceStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Injectable } from '@nestjs/common';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import {
  AgingBucketKey,
  POSTED_BILL_STATUSES,
  POSTED_INVOICE_STATUSES,
  agingBucket,
  daysPastDue,
  endOfUtcDay,
  money,
  parseReportDate,
  resolveAsOf,
  sumDecimals,
  toDecimal,
} from '../../../common/utils/report-utils';

export interface AgingItem {
  invoiceId?: string;
  invoiceNumber?: string;
  billId?: string;
  billNumber?: string;
  customerId?: string;
  customerName?: string;
  vendorId?: string;
  vendorName?: string;
  /** Accounting date of the document. */
  date?: Date | null;
  issueDate?: Date | null;
  billDate?: Date | null;
  dueDate: Date;
  daysOverdue: number;
  balanceDue: number;
}

/** Receivables and payables aging row: money is a fixed 4-dp decimal string. */
export type ReceivableAgingItem = Omit<AgingItem, 'balanceDue'> & { balanceDue: string };

/** Unapplied credits per counterparty (exact totals) and their sum. */
function creditsByParty(credits: Array<{ partyId: string; partyName: string; amount: Decimal }>): {
  byParty: Map<string, { name: string; amount: Decimal }>;
  total: Decimal;
} {
  const byParty = new Map<string, { name: string; amount: Decimal }>();
  for (const credit of credits) {
    const row = byParty.get(credit.partyId) ?? { name: credit.partyName, amount: new Decimal(0) };
    row.amount = row.amount.add(credit.amount);
    byParty.set(credit.partyId, row);
  }
  return { byParty, total: sumDecimals([...byParty.values()].map((r) => r.amount)) };
}

type AgingRowFields = Omit<ReceivableAgingItem, 'dueDate' | 'daysOverdue' | 'balanceDue'>;

/**
 * Puts each open document in its aging bucket and returns the buckets with the summary, in exact
 * Decimal sent as fixed 4-dp strings; `netTotal` nets the unapplied credits.
 */
function ageDocuments<D extends { dueDate: Date; balanceDue: Decimal }>(
  documents: D[],
  asOf: Date,
  unappliedTotal: Decimal,
  rowOf: (document: D) => AgingRowFields,
): {
  buckets: Record<AgingBucketKey, ReceivableAgingItem[]>;
  summary: Record<AgingBucketKey | 'total' | 'unappliedCredits' | 'netTotal', string>;
} {
  const buckets: Record<AgingBucketKey, ReceivableAgingItem[]> = {
    current: [],
    days1_30: [],
    days31_60: [],
    days61_90: [],
    over90: [],
  };
  const totals: Record<AgingBucketKey, Decimal> = {
    current: new Decimal(0),
    days1_30: new Decimal(0),
    days31_60: new Decimal(0),
    days61_90: new Decimal(0),
    over90: new Decimal(0),
  };
  for (const document of documents) {
    const days = daysPastDue(document.dueDate, asOf);
    const key = agingBucket(days);
    buckets[key].push({
      ...rowOf(document),
      dueDate: document.dueDate,
      daysOverdue: Math.max(0, days),
      balanceDue: money(document.balanceDue),
    });
    totals[key] = totals[key].add(document.balanceDue);
  }
  const total = sumDecimals(Object.values(totals));
  return {
    buckets,
    summary: {
      current: money(totals.current),
      days1_30: money(totals.days1_30),
      days31_60: money(totals.days31_60),
      days61_90: money(totals.days61_90),
      over90: money(totals.over90),
      total: money(total),
      unappliedCredits: money(unappliedTotal),
      netTotal: money(total.sub(unappliedTotal)),
    },
  };
}

export interface StatementTransaction {
  date: Date;
  type: string;
  reference: string;
  /** The document the row links to (invoice, payment or credit note). */
  sourceType: 'invoice' | 'payment' | 'creditNote';
  sourceId: string;
  debit: Decimal;
  credit: Decimal;
}

@Injectable()
export class AgingReportsService {
  constructor(private prisma: ReadReplicaService) {}

  /**
   * Receivables aging. Only issued invoices count (DRAFT and VOID never do). Unapplied
   * APPLY_TO_INVOICE credit notes credited the AR control account without reducing any invoice,
   * so they are shown per customer and netted in `summary.netTotal`, which reconciles to the AR
   * control account (mirrors the payables aging with vendor credits).
   */
  async getReceivablesAging(organizationId: string, asOfDate?: string) {
    const { asOf } = resolveAsOf(asOfDate);

    const [invoices, credits] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          deletedAt: null,
          balanceDue: { gt: 0 },
          status: { in: POSTED_INVOICE_STATUSES },
          date: { lte: asOf },
        },
        include: {
          customer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.creditNote.findMany({
        where: {
          organizationId,
          deletedAt: null,
          type: CreditNoteType.APPLY_TO_INVOICE,
          appliedToInvoiceId: null,
          date: { lte: asOf },
        },
        select: {
          customerId: true,
          amount: true,
          customer: { select: { id: true, name: true } },
        },
      }),
    ]);

    const unapplied = creditsByParty(
      credits.map((c) => ({ partyId: c.customerId, partyName: c.customer.name, amount: c.amount })),
    );
    const { buckets, summary } = ageDocuments(invoices, asOf, unapplied.total, (invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customer.id,
      customerName: invoice.customer.name,
      // Accounting date (what the aging cut-off uses); issueDate stays as an extra field.
      date: invoice.date,
      issueDate: invoice.issueDate,
    }));

    return {
      asOfDate: asOf,
      buckets,
      summary,
      unappliedCredits: {
        total: money(unapplied.total),
        customers: [...unapplied.byParty.entries()].map(([customerId, r]) => ({
          customerId,
          customerName: r.name,
          amount: money(r.amount),
        })),
      },
      customerCount: new Set(invoices.map((i) => i.customerId)).size,
      invoiceCount: invoices.length,
    };
  }

  /**
   * Payables aging, the mirror of {@link getReceivablesAging}: exact Decimal bucket totals sent as
   * fixed 4-dp strings, a date-only as-of meaning the end of that UTC day, and the bill's
   * accounting `date` on every row (billDate is optional and stays as an extra field).
   */
  async getPayablesAging(organizationId: string, asOfDate?: string) {
    const { asOf } = resolveAsOf(asOfDate);

    const [bills, credits] = await Promise.all([
      this.prisma.bill.findMany({
        where: {
          organizationId,
          deletedAt: null,
          balanceDue: { gt: 0 },
          // Only bills posted to AP; `date` is the accounting date (billDate is optional).
          status: { in: POSTED_BILL_STATUSES },
          date: { lte: asOf },
        },
        include: {
          vendor: { select: { id: true, name: true } },
        },
      }),
      // Live, unapplied, unrefunded vendor credits already debited AP but reduced no bill: they
      // are shown per vendor and netted in `summary.netTotal`, which reconciles to the AP control
      // account.
      this.prisma.vendorCredit.findMany({
        where: {
          organizationId,
          deletedAt: null,
          appliedToBillId: null,
          refundedAt: null,
          date: { lte: asOf },
        },
        select: { vendorId: true, amount: true, vendor: { select: { id: true, name: true } } },
      }),
    ]);

    const unapplied = creditsByParty(
      credits.map((c) => ({ partyId: c.vendorId, partyName: c.vendor.name, amount: c.amount })),
    );
    const { buckets, summary } = ageDocuments(bills, asOf, unapplied.total, (bill) => ({
      billId: bill.id,
      billNumber: bill.billNumber,
      vendorId: bill.vendor.id,
      vendorName: bill.vendor.name,
      date: bill.date,
      billDate: bill.billDate,
    }));

    return {
      asOfDate: asOf,
      buckets,
      summary,
      unappliedCredits: {
        total: money(unapplied.total),
        vendors: [...unapplied.byParty.entries()].map(([vendorId, r]) => ({
          vendorId,
          vendorName: r.name,
          amount: money(r.amount),
        })),
      },
      vendorCount: new Set(bills.map((b) => b.vendorId)).size,
      billCount: bills.length,
    };
  }

  /**
   * Customer statement in exact Decimal. Issued invoices are debits; payments and applied credit
   * notes are credits. Corrections never rewrite an earlier period: a voided payment or invoice
   * keeps its original entry on its own date and shows a separate reversal on the date it was
   * voided (the reversal journal's date for invoices, `deletedAt` for payments), so a January
   * statement is unchanged by a February void. A REFUND credit note is paid out in cash, so it is
   * a credit plus an equal refund debit. DRAFT invoices (including drafts that were voided and
   * never posted) and deleted credit notes never appear.
   */
  async getCustomerStatement(
    organizationId: string,
    customerId: string,
    startDate: string,
    endDate: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, deletedAt: null },
    });
    if (!customer) return null;

    const start = parseReportDate(startDate, 'start', 'startDate') ?? new Date(0);
    // A date-only end must include that whole day (voids/payments later on the end date).
    const end = parseReportDate(endDate, 'end', 'endDate') ?? endOfUtcDay(new Date());

    // A voided invoice was posted (and reversed) only if its INVOICE_VOID journal exists; a
    // voided draft never reached the ledger.
    const voided = await this.prisma.invoice.findMany({
      where: { customerId, organizationId, deletedAt: null, status: InvoiceStatus.VOID },
    });
    const voidJournals =
      voided.length > 0
        ? await this.prisma.journal.findMany({
            where: {
              organizationId,
              deletedAt: null,
              isPosted: true,
              sourceType: 'INVOICE_VOID',
              sourceId: { in: voided.map((i) => i.id) },
            },
            select: { sourceId: true, date: true },
          })
        : [];
    const voidDate = new Map<string, Date>();
    for (const j of voidJournals) {
      if (j.sourceId) voidDate.set(j.sourceId, j.date);
    }
    const postedVoided = voided.filter((i) => voidDate.has(i.id));

    const invoiceBase = {
      customerId,
      organizationId,
      deletedAt: null,
      OR: [
        { status: { in: POSTED_INVOICE_STATUSES } },
        { status: InvoiceStatus.VOID, id: { in: postedVoided.map((i) => i.id) } },
      ],
    } satisfies Prisma.InvoiceWhereInput;
    const creditBase = { customerId, organizationId, deletedAt: null };

    const [
      openingInvoices,
      openingPayments,
      openingVoids,
      openingCredits,
      invoices,
      payments,
      voids,
      creditNotes,
    ] = await Promise.all([
      this.prisma.invoice.findMany({ where: { ...invoiceBase, date: { lt: start } } }),
      this.prisma.paymentReceived.findMany({
        where: { customerId, organizationId, date: { lt: start } },
      }),
      this.prisma.paymentReceived.findMany({
        where: { customerId, organizationId, deletedAt: { lt: start } },
      }),
      this.prisma.creditNote.findMany({ where: { ...creditBase, date: { lt: start } } }),
      this.prisma.invoice.findMany({
        where: { ...invoiceBase, date: { gte: start, lte: end } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.paymentReceived.findMany({
        where: { customerId, organizationId, date: { gte: start, lte: end } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.paymentReceived.findMany({
        where: { customerId, organizationId, deletedAt: { gte: start, lte: end } },
        orderBy: { deletedAt: 'asc' },
      }),
      this.prisma.creditNote.findMany({
        where: { ...creditBase, date: { gte: start, lte: end } },
        orderBy: { date: 'asc' },
      }),
    ]);

    const invoiceVoids = postedVoided.map((i) => ({
      invoice: i,
      date: voidDate.get(i.id) as Date,
    }));
    const voidsBefore = invoiceVoids.filter((v) => v.date < start);
    const voidsInPeriod = invoiceVoids.filter((v) => v.date >= start && v.date <= end);
    const invoiceTotal = (i: { total: Decimal | null; grandTotal: Decimal }): Decimal =>
      toDecimal(i.total ?? i.grandTotal);

    // Payments count on their own date even if voided later; a void is a separate debit.
    // A refund credit note nets to zero (credit + refund debit); only APPLY notes move the balance.
    const openingBalance = sumDecimals(openingInvoices.map(invoiceTotal))
      .sub(sumDecimals(voidsBefore.map((v) => invoiceTotal(v.invoice))))
      .sub(sumDecimals(openingPayments.map((p) => p.amount)))
      .add(sumDecimals(openingVoids.map((p) => p.amount)))
      .sub(
        sumDecimals(
          openingCredits
            .filter((cn) => cn.type === CreditNoteType.APPLY_TO_INVOICE)
            .map((cn) => cn.total ?? cn.amount),
        ),
      );

    const zero = new Decimal(0);
    const transactions: StatementTransaction[] = [
      ...invoices.map((i) => ({
        date: i.date,
        type: 'Invoice',
        reference: i.invoiceNumber,
        sourceType: 'invoice' as const,
        sourceId: i.id,
        debit: invoiceTotal(i),
        credit: zero,
      })),
      ...voidsInPeriod.map((v) => ({
        date: v.date,
        type: 'Invoice Void',
        reference: v.invoice.invoiceNumber,
        sourceType: 'invoice' as const,
        sourceId: v.invoice.id,
        debit: zero,
        credit: invoiceTotal(v.invoice),
      })),
      ...payments.map((p) => ({
        date: p.date,
        type: 'Payment',
        reference: p.paymentNumber,
        sourceType: 'payment' as const,
        sourceId: p.id,
        debit: zero,
        credit: toDecimal(p.amount),
      })),
      ...voids.map((p) => ({
        date: p.deletedAt as Date,
        type: 'Payment Void',
        reference: p.paymentNumber,
        sourceType: 'payment' as const,
        sourceId: p.id,
        debit: toDecimal(p.amount),
        credit: zero,
      })),
      ...creditNotes.flatMap((cn): StatementTransaction[] => {
        const amount = toDecimal(cn.total ?? cn.amount);
        const base = {
          date: cn.date,
          reference: cn.creditNoteNumber,
          sourceType: 'creditNote' as const,
          sourceId: cn.id,
        };
        const rows: StatementTransaction[] = [
          { ...base, type: 'Credit Note', debit: zero, credit: amount },
        ];
        if (cn.type === CreditNoteType.REFUND) {
          rows.push({ ...base, type: 'Credit Note Refund', debit: amount, credit: zero });
        }
        return rows;
      }),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = openingBalance;
    const entries = transactions.map((t) => {
      runningBalance = runningBalance.add(t.debit).sub(t.credit);
      return {
        ...t,
        debit: money(t.debit),
        credit: money(t.credit),
        balance: money(runningBalance),
      };
    });

    return {
      customer: { id: customer.id, name: customer.name, email: customer.email },
      period: { startDate, endDate },
      openingBalance: money(openingBalance),
      transactions: entries,
      closingBalance: money(runningBalance),
      /** Invoiced in the period: invoice debits only (no voided-payment or refund debits). */
      totalInvoiced: money(
        sumDecimals(transactions.filter((t) => t.type === 'Invoice').map((t) => t.debit)),
      ),
      totalDebits: money(sumDecimals(transactions.map((t) => t.debit))),
      totalCredits: money(sumDecimals(transactions.map((t) => t.credit))),
    };
  }

  async getVendorStatement(
    organizationId: string,
    vendorId: string,
    startDate: string,
    endDate: string,
  ) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, organizationId },
    });
    if (!vendor) return null;

    const start = new Date(startDate);
    // A date-only end must include that whole day (voids/payments later on the end date).
    const end = endOfUtcDay(new Date(endDate));

    // Opening balance
    const openingBills = await this.prisma.bill.findMany({
      where: {
        vendorId,
        organizationId,
        date: { lt: start },
        deletedAt: null,
        status: { in: POSTED_BILL_STATUSES },
      },
    });
    // Payments count on their own date even if voided later; a void is a separate debit on the
    // date it happened. Later corrections therefore never rewrite an earlier period.
    const openingPayments = await this.prisma.paymentMade.findMany({
      where: { vendorId, organizationId, date: { lt: start } },
    });
    const openingVoids = await this.prisma.paymentMade.findMany({
      where: { vendorId, organizationId, deletedAt: { lt: start } },
    });

    const sum = (values: Decimal[]): Decimal =>
      values.reduce((acc, v) => acc.add(v), new Decimal(0));
    const openingBalance = sum(openingBills.map((b) => b.total ?? b.grandTotal))
      .sub(sum(openingPayments.map((p) => p.amount)))
      .add(sum(openingVoids.map((p) => p.amount)));

    // Period transactions
    const bills = await this.prisma.bill.findMany({
      where: {
        vendorId,
        organizationId,
        date: { gte: start, lte: end },
        deletedAt: null,
        status: { in: POSTED_BILL_STATUSES },
      },
      orderBy: { date: 'asc' },
    });

    const payments = await this.prisma.paymentMade.findMany({
      where: { vendorId, organizationId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });
    const voids = await this.prisma.paymentMade.findMany({
      where: { vendorId, organizationId, deletedAt: { gte: start, lte: end } },
      orderBy: { deletedAt: 'asc' },
    });

    const zero = new Decimal(0);
    const transactions = [
      ...bills.map((b) => ({
        date: b.date,
        type: 'Bill' as const,
        reference: b.billNumber,
        debit: b.total ?? b.grandTotal,
        credit: zero,
      })),
      ...payments.map((p) => ({
        date: p.date,
        type: 'Payment' as const,
        reference: p.paymentNumber,
        debit: zero,
        credit: p.amount,
      })),
      ...voids.map((p) => ({
        date: p.deletedAt as Date,
        type: 'Payment Void' as const,
        reference: p.paymentNumber,
        debit: p.amount,
        credit: zero,
      })),
    ].sort((a, b) => new Date(a.date as Date).getTime() - new Date(b.date as Date).getTime());

    // Exact Decimal arithmetic; money leaves the service as fixed 4-dp decimal strings.
    let runningBalance = openingBalance;
    const entries = transactions.map((t) => {
      runningBalance = runningBalance.add(t.debit).sub(t.credit);
      return {
        ...t,
        debit: t.debit.toFixed(4),
        credit: t.credit.toFixed(4),
        balance: runningBalance.toFixed(4),
      };
    });

    return {
      vendor: { id: vendor.id, name: vendor.name, email: vendor.email },
      period: { startDate, endDate },
      openingBalance: openingBalance.toFixed(4),
      transactions: entries,
      closingBalance: runningBalance.toFixed(4),
      totalDebits: sum(transactions.map((t) => t.debit)).toFixed(4),
      totalCredits: sum(transactions.map((t) => t.credit)).toFixed(4),
    };
  }
}
