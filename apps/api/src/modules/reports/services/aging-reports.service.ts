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
} from '../utils/report-utils';

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

/** Receivables aging row: money is a fixed 4-dp decimal string. */
export type ReceivableAgingItem = Omit<AgingItem, 'balanceDue'> & { balanceDue: string };

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
   * Voided payments with the accounting date of the void: the reversal journal's date (which
   * `JournalsService.reverse` takes from the original entry, so a future-dated payment voided early
   * is reversed on its own date), falling back to `deletedAt` for legacy voids without a journal.
   */
  private async paymentVoids(
    model: 'paymentReceived' | 'paymentMade',
    organizationId: string,
    partyId: string,
    sourceType: 'PAYMENT_RECEIVED_VOID' | 'PAYMENT_MADE_VOID',
  ): Promise<Array<{ id: string; paymentNumber: string; amount: Decimal; voidDate: Date }>> {
    const where =
      model === 'paymentReceived'
        ? { customerId: partyId, organizationId, deletedAt: { not: null } }
        : { vendorId: partyId, organizationId, deletedAt: { not: null } };
    const rows: Array<{
      id: string;
      paymentNumber: string;
      amount: Decimal;
      deletedAt: Date | null;
    }> =
      model === 'paymentReceived'
        ? await this.prisma.paymentReceived.findMany({ where })
        : await this.prisma.paymentMade.findMany({ where });
    if (rows.length === 0) return [];
    const journals = await this.prisma.journal.findMany({
      where: {
        organizationId,
        deletedAt: null,
        isPosted: true,
        sourceType,
        sourceId: { in: rows.map((r) => r.id) },
      },
      select: { sourceId: true, date: true },
    });
    const dates = new Map<string, Date>();
    for (const j of journals) if (j.sourceId) dates.set(j.sourceId, j.date);
    return rows.map((r) => ({
      id: r.id,
      paymentNumber: r.paymentNumber,
      amount: r.amount,
      voidDate: dates.get(r.id) ?? (r.deletedAt as Date),
    }));
  }

  /**
   * Receivables aging as of a cutoff. Only posted invoices count (DRAFT never does); an invoice
   * voided after the cutoff was still open on it. Each balance is rebuilt as of the cutoff from
   * the payments and applied credit notes dated on or before it that were still live then (a
   * void dated later is ignored), so the snapshot does not depend on today's `balanceDue`.
   * Unapplied APPLY_TO_INVOICE credit notes credited the AR control account without reducing any
   * invoice, so they are shown per customer and netted in `summary.netTotal`, which reconciles to
   * the AR control account (mirrors the payables aging with vendor credits).
   *
   * Limitation: applying a credit note has no applied-at column, so a note is treated as applied
   * on its own date; a note applied through `/apply` after the cutoff is still netted on that
   * date. The same holds for vendor credits in the payables aging.
   */
  async getReceivablesAging(organizationId: string, asOfDate?: string) {
    const { asOf } = resolveAsOf(asOfDate);

    // An invoice voided after the cutoff was still open on it (its reversal journal is dated
    // later), so it stays in the historical snapshot and the report matches the AR control account.
    const laterVoids = await this.prisma.journal.findMany({
      where: {
        organizationId,
        deletedAt: null,
        isPosted: true,
        sourceType: 'INVOICE_VOID',
        date: { gt: asOf },
      },
      select: { sourceId: true },
    });
    const laterVoidedIds = laterVoids.flatMap((j) => (j.sourceId ? [j.sourceId] : []));

    // No `balanceDue` filter: an invoice settled after the cutoff was still open on it.
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { status: { in: POSTED_INVOICE_STATUSES } },
          { status: InvoiceStatus.VOID, id: { in: laterVoidedIds } },
        ],
        date: { lte: asOf },
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });
    const invoiceIds = invoices.map((i) => i.id);

    const [allocations, creditNotes] = await Promise.all([
      invoiceIds.length === 0
        ? []
        : this.prisma.paymentAllocation.findMany({
            where: {
              invoiceId: { in: invoiceIds },
              payment: { organizationId, date: { lte: asOf } },
            },
            select: {
              invoiceId: true,
              amount: true,
              payment: { select: { id: true, deletedAt: true } },
            },
          }),
      this.prisma.creditNote.findMany({
        where: {
          organizationId,
          type: CreditNoteType.APPLY_TO_INVOICE,
          date: { lte: asOf },
          OR: [{ appliedToInvoiceId: null }, { appliedToInvoiceId: { in: invoiceIds } }],
        },
        select: {
          id: true,
          appliedToInvoiceId: true,
          customerId: true,
          amount: true,
          deletedAt: true,
          customer: { select: { id: true, name: true } },
        },
      }),
    ]);

    // Voids are dated on their reversal journal (deletedAt only for legacy voids without one).
    const voidedPaymentIds = allocations.flatMap((al) =>
      al.payment.deletedAt ? [al.payment.id] : [],
    );
    const voidedCreditIds = creditNotes.flatMap((c) => (c.deletedAt ? [c.id] : []));
    const voidJournals =
      voidedPaymentIds.length + voidedCreditIds.length === 0
        ? []
        : await this.prisma.journal.findMany({
            where: {
              organizationId,
              deletedAt: null,
              isPosted: true,
              OR: [
                { sourceType: 'PAYMENT_RECEIVED_VOID', sourceId: { in: voidedPaymentIds } },
                { sourceType: 'CREDIT_NOTE_VOID', sourceId: { in: voidedCreditIds } },
              ],
            },
            select: { sourceType: true, sourceId: true, date: true },
          });
    const voidDates = new Map<string, Date>();
    for (const j of voidJournals) {
      if (j.sourceId) voidDates.set(`${j.sourceType}:${j.sourceId}`, j.date);
    }
    const liveAsOf = (kind: string, row: { id: string; deletedAt: Date | null }): boolean =>
      row.deletedAt === null || (voidDates.get(`${kind}:${row.id}`) ?? row.deletedAt) > asOf;

    const settledByInvoice = new Map<string, Decimal>();
    const settle = (invoiceId: string, amount: Decimal): void => {
      settledByInvoice.set(
        invoiceId,
        (settledByInvoice.get(invoiceId) ?? new Decimal(0)).add(amount),
      );
    };
    for (const al of allocations) {
      if (liveAsOf('PAYMENT_RECEIVED_VOID', al.payment)) settle(al.invoiceId, al.amount);
    }
    const credits: Array<{ customerId: string; amount: Decimal; customer: { name: string } }> = [];
    for (const note of creditNotes) {
      if (!liveAsOf('CREDIT_NOTE_VOID', note)) continue;
      if (note.appliedToInvoiceId) settle(note.appliedToInvoiceId, note.amount);
      else credits.push(note);
    }
    const balanceAsOf = (invoice: { id: string; grandTotal: Decimal }): Decimal =>
      Decimal.max(
        invoice.grandTotal.sub(settledByInvoice.get(invoice.id) ?? new Decimal(0)),
        new Decimal(0),
      );
    const openInvoices = invoices
      .map((invoice) => ({ invoice, balance: balanceAsOf(invoice) }))
      .filter((row) => row.balance.greaterThan(0));

    const creditsByCustomer = new Map<string, { customerName: string; amount: Decimal }>();
    for (const credit of credits) {
      const row = creditsByCustomer.get(credit.customerId) ?? {
        customerName: credit.customer.name,
        amount: new Decimal(0),
      };
      row.amount = row.amount.add(credit.amount);
      creditsByCustomer.set(credit.customerId, row);
    }
    const unappliedTotal = sumDecimals([...creditsByCustomer.values()].map((r) => r.amount));

    const buckets: Record<AgingBucketKey, ReceivableAgingItem[]> = {
      current: [],
      days1_30: [],
      days31_60: [],
      days61_90: [],
      over90: [],
    };
    const bucketTotals: Record<AgingBucketKey, Decimal> = {
      current: new Decimal(0),
      days1_30: new Decimal(0),
      days31_60: new Decimal(0),
      days61_90: new Decimal(0),
      over90: new Decimal(0),
    };

    for (const { invoice, balance } of openInvoices) {
      const days = daysPastDue(invoice.dueDate, asOf);
      const key = agingBucket(days);
      buckets[key].push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customer.id,
        customerName: invoice.customer.name,
        // Accounting date (what the aging cut-off uses); issueDate stays as an extra field.
        date: invoice.date,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        daysOverdue: Math.max(0, days),
        balanceDue: money(balance),
      });
      bucketTotals[key] = bucketTotals[key].add(balance);
    }

    const invoicesTotal = sumDecimals(Object.values(bucketTotals));

    return {
      asOfDate: asOf,
      buckets,
      summary: {
        current: money(bucketTotals.current),
        days1_30: money(bucketTotals.days1_30),
        days31_60: money(bucketTotals.days31_60),
        days61_90: money(bucketTotals.days61_90),
        over90: money(bucketTotals.over90),
        total: money(invoicesTotal),
        unappliedCredits: money(unappliedTotal),
        netTotal: money(invoicesTotal.sub(unappliedTotal)),
      },
      unappliedCredits: {
        total: money(unappliedTotal),
        customers: [...creditsByCustomer.entries()].map(([customerId, r]) => ({
          customerId,
          customerName: r.customerName,
          amount: money(r.amount),
        })),
      },
      customerCount: new Set(openInvoices.map((r) => r.invoice.customerId)).size,
      invoiceCount: openInvoices.length,
    };
  }

  async getPayablesAging(organizationId: string, asOfDate?: string) {
    const date = asOfDate ? new Date(asOfDate) : new Date();
    date.setHours(23, 59, 59, 999);

    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        deletedAt: null,
        balanceDue: { gt: 0 },
        // Only bills posted to AP; `date` is the accounting date (billDate is optional).
        status: { in: ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'] },
        date: { lte: date },
      },
      include: {
        vendor: { select: { id: true, name: true } },
      },
    });

    // Live, unapplied, unrefunded vendor credits already debited AP but reduced no bill: they are
    // shown per vendor and netted in `summary.netTotal`, which reconciles to the AP control account.
    const credits = await this.prisma.vendorCredit.findMany({
      where: {
        organizationId,
        // Limitation: there is no applied-at column, so a credit applied to a bill after the
        // cutoff is still treated as applied (it is netted through the bill's current balance).
        appliedToBillId: null,
        // Refunded/voided after the cutoff: the credit still debited AP on the cutoff date.
        AND: [
          { OR: [{ refundedAt: null }, { refundedAt: { gt: date } }] },
          { OR: [{ deletedAt: null }, { deletedAt: { gt: date } }] },
        ],
        date: { lte: date },
      },
      select: { vendorId: true, amount: true, vendor: { select: { id: true, name: true } } },
    });
    const creditsByVendor = new Map<string, { vendorName: string; amount: Decimal }>();
    for (const credit of credits) {
      const row = creditsByVendor.get(credit.vendorId) ?? {
        vendorName: credit.vendor.name,
        amount: new Decimal(0),
      };
      row.amount = row.amount.add(credit.amount);
      creditsByVendor.set(credit.vendorId, row);
    }
    const unappliedTotal = [...creditsByVendor.values()].reduce(
      (sum, r) => sum.add(r.amount),
      new Decimal(0),
    );
    const billsTotal = bills.reduce((sum, b) => sum.add(b.balanceDue), new Decimal(0));

    const buckets = {
      current: [] as AgingItem[],
      days1_30: [] as AgingItem[],
      days31_60: [] as AgingItem[],
      days61_90: [] as AgingItem[],
      over90: [] as AgingItem[],
    };

    for (const bill of bills) {
      const dueDate = bill.dueDate;
      const daysOverdue = Math.floor((date.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const balanceDue = parseFloat(bill.balanceDue.toString());

      const item: AgingItem = {
        billId: bill.id,
        billNumber: bill.billNumber,
        vendorId: bill.vendor.id,
        vendorName: bill.vendor.name,
        billDate: bill.billDate,
        dueDate: bill.dueDate,
        daysOverdue: Math.max(0, daysOverdue),
        balanceDue,
      };

      if (daysOverdue <= 0) buckets.current.push(item);
      else if (daysOverdue <= 30) buckets.days1_30.push(item);
      else if (daysOverdue <= 60) buckets.days31_60.push(item);
      else if (daysOverdue <= 90) buckets.days61_90.push(item);
      else buckets.over90.push(item);
    }

    const summary = {
      current: buckets.current.reduce((sum, i) => sum + i.balanceDue, 0),
      days1_30: buckets.days1_30.reduce((sum, i) => sum + i.balanceDue, 0),
      days31_60: buckets.days31_60.reduce((sum, i) => sum + i.balanceDue, 0),
      days61_90: buckets.days61_90.reduce((sum, i) => sum + i.balanceDue, 0),
      over90: buckets.over90.reduce((sum, i) => sum + i.balanceDue, 0),
      total: 0,
    };
    summary.total =
      summary.current + summary.days1_30 + summary.days31_60 + summary.days61_90 + summary.over90;

    return {
      asOfDate: date,
      buckets,
      summary: {
        ...summary,
        unappliedCredits: unappliedTotal.toFixed(4),
        netTotal: billsTotal.sub(unappliedTotal).toFixed(4),
      },
      unappliedCredits: {
        total: unappliedTotal.toFixed(4),
        vendors: [...creditsByVendor.entries()].map(([vendorId, r]) => ({
          vendorId,
          vendorName: r.vendorName,
          amount: r.amount.toFixed(4),
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
    const paymentVoids = await this.paymentVoids(
      'paymentReceived',
      organizationId,
      customerId,
      'PAYMENT_RECEIVED_VOID',
    );
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

    const [openingInvoices, openingPayments, openingCredits, invoices, payments, creditNotes] =
      await Promise.all([
        this.prisma.invoice.findMany({ where: { ...invoiceBase, date: { lt: start } } }),
        this.prisma.paymentReceived.findMany({
          where: { customerId, organizationId, date: { lt: start } },
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
        this.prisma.creditNote.findMany({
          where: { ...creditBase, date: { gte: start, lte: end } },
          orderBy: { date: 'asc' },
        }),
      ]);

    const openingVoids = paymentVoids.filter((p) => p.voidDate < start);
    const voids = paymentVoids.filter((p) => p.voidDate >= start && p.voidDate <= end);
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
        date: p.voidDate,
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

    const start = parseReportDate(startDate, 'start', 'startDate') ?? new Date(0);
    // A date-only end must include that whole day; explicit timestamps stay exact.
    const end = parseReportDate(endDate, 'end', 'endDate') ?? endOfUtcDay(new Date());
    const paymentVoids = await this.paymentVoids(
      'paymentMade',
      organizationId,
      vendorId,
      'PAYMENT_MADE_VOID',
    );

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
    const openingVoids = paymentVoids.filter((p) => p.voidDate < start);

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
    const voids = paymentVoids.filter((p) => p.voidDate >= start && p.voidDate <= end);

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
        date: p.voidDate,
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
