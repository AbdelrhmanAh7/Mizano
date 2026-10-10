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

export type PayableAgingItem = Omit<AgingItem, 'balanceDue'> & { balanceDue: string };

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

    for (const invoice of invoices) {
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
        balanceDue: money(invoice.balanceDue),
      });
      bucketTotals[key] = bucketTotals[key].add(invoice.balanceDue);
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
      customerCount: new Set(invoices.map((i) => i.customerId)).size,
      invoiceCount: invoices.length,
    };
  }

  async getPayablesAging(organizationId: string, asOfDate?: string) {
    const { asOf, asOfDate: asOfIso } = resolveAsOf(asOfDate);

    const bills = await this.prisma.bill.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: POSTED_BILL_STATUSES },
        date: { lte: asOf },
      },
      include: {
        vendor: { select: { id: true, name: true } },
      },
    });
    const billIds = bills.map((bill) => bill.id);

    const [allocations, creditCandidates] = await Promise.all([
      billIds.length
        ? this.prisma.billAllocation.findMany({
            where: {
              billId: { in: billIds },
              payment: { organizationId, date: { lte: asOf } },
            },
            select: {
              billId: true,
              amount: true,
              payment: { select: { id: true, deletedAt: true } },
            },
          })
        : Promise.resolve([]),
      this.prisma.vendorCredit.findMany({
        where: {
          organizationId,
          date: { lte: asOf },
          OR: [{ refundedAt: null }, { refundedAt: { gt: asOf } }],
        },
        select: {
          id: true,
          vendorId: true,
          amount: true,
          appliedToBillId: true,
          deletedAt: true,
          vendor: { select: { id: true, name: true } },
        },
      }),
    ]);
    const [paymentVoidDates, creditVoidDates] = await Promise.all([
      this.voidJournalDates(
        organizationId,
        'PAYMENT_MADE_VOID',
        allocations.flatMap((allocation) =>
          allocation.payment.deletedAt ? [allocation.payment.id] : [],
        ),
      ),
      this.voidJournalDates(
        organizationId,
        'VENDOR_CREDIT_VOID',
        creditCandidates.flatMap((credit) => (credit.deletedAt ? [credit.id] : [])),
      ),
    ]);

    const paymentsByBill = new Map<string, Decimal>();
    for (const allocation of allocations) {
      const voidDate = paymentVoidDates.get(allocation.payment.id) ?? allocation.payment.deletedAt;
      if (allocation.payment.deletedAt && voidDate && voidDate <= asOf) continue;
      const current = paymentsByBill.get(allocation.billId) ?? new Decimal(0);
      paymentsByBill.set(allocation.billId, current.add(allocation.amount));
    }

    const creditsByVendor = new Map<string, { vendorName: string; amount: Decimal }>();
    const appliedCreditsByBill = new Map<string, Decimal>();
    for (const credit of creditCandidates) {
      const voidDate = creditVoidDates.get(credit.id) ?? credit.deletedAt;
      if (credit.deletedAt && voidDate && voidDate <= asOf) continue;
      if (credit.appliedToBillId) {
        const current = appliedCreditsByBill.get(credit.appliedToBillId) ?? new Decimal(0);
        appliedCreditsByBill.set(credit.appliedToBillId, current.add(credit.amount));
        continue;
      }
      const row = creditsByVendor.get(credit.vendorId) ?? {
        vendorName: credit.vendor.name,
        amount: new Decimal(0),
      };
      row.amount = row.amount.add(credit.amount);
      creditsByVendor.set(credit.vendorId, row);
    }
    const unappliedTotal = sumDecimals([...creditsByVendor.values()].map((row) => row.amount));

    const buckets: Record<AgingBucketKey, PayableAgingItem[]> = {
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

    for (const bill of bills) {
      const balanceDue = toDecimal(bill.total ?? bill.grandTotal)
        .sub(paymentsByBill.get(bill.id) ?? 0)
        .sub(appliedCreditsByBill.get(bill.id) ?? 0);
      if (!balanceDue.greaterThan(0)) continue;

      const daysOverdue = daysPastDue(bill.dueDate, asOf);
      const bucket = agingBucket(daysOverdue);
      buckets[bucket].push({
        billId: bill.id,
        billNumber: bill.billNumber,
        vendorId: bill.vendor.id,
        vendorName: bill.vendor.name,
        date: bill.date,
        billDate: bill.billDate,
        dueDate: bill.dueDate,
        daysOverdue: Math.max(0, daysOverdue),
        balanceDue: money(balanceDue),
      });
      bucketTotals[bucket] = bucketTotals[bucket].add(balanceDue);
    }
    const billsTotal = sumDecimals(Object.values(bucketTotals));

    return {
      asOfDate: asOfIso,
      buckets,
      summary: {
        current: money(bucketTotals.current),
        days1_30: money(bucketTotals.days1_30),
        days31_60: money(bucketTotals.days31_60),
        days61_90: money(bucketTotals.days61_90),
        over90: money(bucketTotals.over90),
        total: money(billsTotal),
        unappliedCredits: money(unappliedTotal),
        netTotal: money(billsTotal.sub(unappliedTotal)),
      },
      unappliedCredits: {
        total: money(unappliedTotal),
        vendors: [...creditsByVendor.entries()].map(([vendorId, row]) => ({
          vendorId,
          vendorName: row.vendorName,
          amount: money(row.amount),
        })),
      },
      vendorCount: new Set(
        Object.values(buckets)
          .flat()
          .map((bill) => bill.vendorId),
      ).size,
      billCount: Object.values(buckets).reduce((count, items) => count + items.length, 0),
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

  private async voidJournalDates(
    organizationId: string,
    sourceType: string,
    sourceIds: string[],
  ): Promise<Map<string, Date>> {
    if (sourceIds.length === 0) return new Map();
    const journals = await this.prisma.journal.findMany({
      where: {
        organizationId,
        isPosted: true,
        deletedAt: null,
        sourceType,
        sourceId: { in: sourceIds },
      },
      select: { sourceId: true, date: true },
    });
    return new Map(
      journals.flatMap((journal) =>
        journal.sourceId ? [[journal.sourceId, journal.date] as const] : [],
      ),
    );
  }
}
