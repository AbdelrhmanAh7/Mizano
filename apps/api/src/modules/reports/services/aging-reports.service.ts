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

/** Journal source types of the reversals that void a document (see JournalsService). */
type VoidSourceType =
  | 'INVOICE_VOID'
  | 'PAYMENT_RECEIVED_VOID'
  | 'CREDIT_NOTE_VOID'
  | 'PAYMENT_MADE_VOID'
  | 'VENDOR_CREDIT_VOID';

/**
 * True when an event dated on or before the cutoff was still live on it: not voided, or voided
 * after the cutoff. The void date is its reversal journal's date, falling back to `deletedAt`.
 */
function liveAt(
  event: { id: string; date: Date; deletedAt: Date | null },
  voidDates: Map<string, Date>,
  asOf: Date,
): boolean {
  if (event.date > asOf) return false;
  if (!event.deletedAt) return true;
  return (voidDates.get(event.id) ?? event.deletedAt) > asOf;
}

/** A document's open balance from its total and the settlements live on the cutoff. */
function balanceAsOf(
  total: Decimal,
  settlements: Array<{ amount: Decimal; live: boolean }>,
): Decimal {
  const settled = sumDecimals(settlements.filter((s) => s.live).map((s) => s.amount));
  return Decimal.max(total.sub(settled), new Decimal(0));
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
   * Receivables aging as of the cutoff (#586). Each invoice's balance is rebuilt from dated
   * events instead of today's `balanceDue`: payments and applied credit notes count only when
   * dated on or before the cutoff and not voided by then (a void counts on its reversal journal's
   * date). An invoice voided after the cutoff still shows; a voided draft never posted and never
   * shows. Unapplied APPLY_TO_INVOICE credit notes credited the AR control account without
   * reducing any invoice, so they are shown per customer and netted in `summary.netTotal`, which
   * reconciles to the AR control account as of the cutoff (mirrors the payables aging).
   *
   * Known limit: no applied-at date is stored, so a credit dated before the cutoff but applied
   * after it already reduces its invoice; the net total is the same either way.
   */
  async getReceivablesAging(organizationId: string, asOfDate?: string) {
    const { asOf } = resolveAsOf(asOfDate);
    // Settled later or never: a zero balance today can be open as of the cutoff only when a live
    // payment or credit is dated after it (voided ones never reduced today's balance).
    const settledAfterCutoff = { deletedAt: null, date: { gt: asOf } };

    const [invoices, credits] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          organizationId,
          deletedAt: null,
          date: { lte: asOf },
          OR: [
            {
              status: { in: POSTED_INVOICE_STATUSES },
              OR: [
                { balanceDue: { gt: 0 } },
                { paymentAllocations: { some: { payment: settledAfterCutoff } } },
                { appliedCredits: { some: settledAfterCutoff } },
              ],
            },
            { status: InvoiceStatus.VOID },
          ],
        },
        include: {
          customer: { select: { id: true, name: true } },
          paymentAllocations: {
            select: {
              amount: true,
              payment: { select: { id: true, date: true, deletedAt: true } },
            },
          },
          appliedCredits: { select: { id: true, amount: true, date: true, deletedAt: true } },
        },
      }),
      this.prisma.creditNote.findMany({
        where: {
          organizationId,
          type: CreditNoteType.APPLY_TO_INVOICE,
          date: { lte: asOf },
          // Applied to an invoice dated after the cutoff: still unapplied as of the cutoff.
          OR: [{ appliedToInvoiceId: null }, { appliedToInvoice: { date: { gt: asOf } } }],
        },
        select: {
          id: true,
          customerId: true,
          amount: true,
          date: true,
          deletedAt: true,
          customer: { select: { id: true, name: true } },
        },
      }),
    ]);

    const voided = (rows: Array<{ id: string; deletedAt: Date | null }>): string[] =>
      rows.filter((r) => r.deletedAt).map((r) => r.id);
    const [paymentVoids, creditVoids, invoiceVoids] = await Promise.all([
      this.voidDates(
        organizationId,
        'PAYMENT_RECEIVED_VOID',
        voided(invoices.flatMap((i) => i.paymentAllocations.map((a) => a.payment))),
      ),
      this.voidDates(organizationId, 'CREDIT_NOTE_VOID', [
        ...voided(invoices.flatMap((i) => i.appliedCredits)),
        ...voided(credits),
      ]),
      this.voidDates(
        organizationId,
        'INVOICE_VOID',
        invoices.filter((i) => i.status === InvoiceStatus.VOID).map((i) => i.id),
      ),
    ]);

    const open = invoices
      .filter((invoice) => {
        if (invoice.status !== InvoiceStatus.VOID) return true;
        // Posted and voided after the cutoff (a voided draft has no reversal and never posted).
        const voidedOn = invoiceVoids.get(invoice.id);
        return voidedOn !== undefined && voidedOn > asOf;
      })
      .map((invoice) => ({
        ...invoice,
        balanceDue: balanceAsOf(invoice.grandTotal, [
          ...invoice.paymentAllocations.map((a) => ({
            amount: a.amount,
            live: liveAt(a.payment, paymentVoids, asOf),
          })),
          ...invoice.appliedCredits.map((c) => ({
            amount: c.amount,
            live: liveAt(c, creditVoids, asOf),
          })),
        ]),
      }))
      .filter((invoice) => invoice.balanceDue.greaterThan(0));

    const unapplied = creditsByParty(
      credits
        .filter((c) => liveAt(c, creditVoids, asOf))
        .map((c) => ({ partyId: c.customerId, partyName: c.customer.name, amount: c.amount })),
    );
    const { buckets, summary } = ageDocuments(open, asOf, unapplied.total, (invoice) => ({
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
      customerCount: new Set(open.map((i) => i.customerId)).size,
      invoiceCount: open.length,
    };
  }

  /**
   * Payables aging as of the cutoff (#586), the mirror of {@link getReceivablesAging}: each bill's
   * balance is rebuilt from payments and applied vendor credits dated on or before the cutoff and
   * not voided by then (a void counts on its reversal journal's date). Exact Decimal bucket totals
   * travel as fixed 4-dp strings; a date-only as-of means the end of that UTC day; every row
   * carries the bill's accounting `date` (billDate is optional and stays as an extra field).
   */
  async getPayablesAging(organizationId: string, asOfDate?: string) {
    const { asOf } = resolveAsOf(asOfDate);
    const settledAfterCutoff = { deletedAt: null, date: { gt: asOf } };

    const [bills, credits] = await Promise.all([
      this.prisma.bill.findMany({
        where: {
          organizationId,
          deletedAt: null,
          // Only bills posted to AP; `date` is the accounting date (billDate is optional).
          status: { in: POSTED_BILL_STATUSES },
          date: { lte: asOf },
          OR: [
            { balanceDue: { gt: 0 } },
            { billAllocations: { some: { payment: settledAfterCutoff } } },
            { appliedCredits: { some: settledAfterCutoff } },
          ],
        },
        include: {
          vendor: { select: { id: true, name: true } },
          billAllocations: {
            select: {
              amount: true,
              payment: { select: { id: true, date: true, deletedAt: true } },
            },
          },
          appliedCredits: { select: { id: true, amount: true, date: true, deletedAt: true } },
        },
      }),
      // Vendor credits that debited AP by the cutoff but reduced no bill by then: shown per
      // vendor and netted in `summary.netTotal`, which reconciles to the AP control account. A
      // credit refunded or voided after the cutoff was still open on it.
      this.prisma.vendorCredit.findMany({
        where: {
          organizationId,
          date: { lte: asOf },
          AND: [
            { OR: [{ appliedToBillId: null }, { appliedToBill: { date: { gt: asOf } } }] },
            { OR: [{ refundedAt: null }, { refundedAt: { gt: asOf } }] },
          ],
        },
        select: {
          id: true,
          vendorId: true,
          amount: true,
          date: true,
          deletedAt: true,
          vendor: { select: { id: true, name: true } },
        },
      }),
    ]);

    const voided = (rows: Array<{ id: string; deletedAt: Date | null }>): string[] =>
      rows.filter((r) => r.deletedAt).map((r) => r.id);
    const [paymentVoids, creditVoids] = await Promise.all([
      this.voidDates(
        organizationId,
        'PAYMENT_MADE_VOID',
        voided(bills.flatMap((b) => b.billAllocations.map((a) => a.payment))),
      ),
      this.voidDates(organizationId, 'VENDOR_CREDIT_VOID', [
        ...voided(bills.flatMap((b) => b.appliedCredits)),
        ...voided(credits),
      ]),
    ]);

    const open = bills
      .map((bill) => ({
        ...bill,
        balanceDue: balanceAsOf(bill.grandTotal, [
          ...bill.billAllocations.map((a) => ({
            amount: a.amount,
            live: liveAt(a.payment, paymentVoids, asOf),
          })),
          ...bill.appliedCredits.map((c) => ({
            amount: c.amount,
            live: liveAt(c, creditVoids, asOf),
          })),
        ]),
      }))
      .filter((bill) => bill.balanceDue.greaterThan(0));

    const unapplied = creditsByParty(
      credits
        .filter((c) => liveAt(c, creditVoids, asOf))
        .map((c) => ({ partyId: c.vendorId, partyName: c.vendor.name, amount: c.amount })),
    );
    const { buckets, summary } = ageDocuments(open, asOf, unapplied.total, (bill) => ({
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
      vendorCount: new Set(open.map((b) => b.vendorId)).size,
      billCount: open.length,
    };
  }

  /** Date of each source document's void (its posted reversal journal), by source id. */
  private async voidDates(
    organizationId: string,
    sourceType: VoidSourceType,
    sourceIds: string[],
  ): Promise<Map<string, Date>> {
    if (sourceIds.length === 0) return new Map();
    const journals = await this.prisma.journal.findMany({
      where: {
        organizationId,
        deletedAt: null,
        isPosted: true,
        sourceType,
        sourceId: { in: [...new Set(sourceIds)] },
      },
      select: { sourceId: true, date: true },
    });
    return new Map(journals.map((j) => [j.sourceId as string, j.date]));
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
