import { Decimal } from '@prisma/client/runtime/library';
import { Injectable } from '@nestjs/common';
import { ReadReplicaService } from '../../../prisma/read-replica.service';
import { endOfUtcDay } from '../utils/report-utils';

export interface AgingItem {
  invoiceId?: string;
  invoiceNumber?: string;
  billId?: string;
  billNumber?: string;
  customerId?: string;
  customerName?: string;
  vendorId?: string;
  vendorName?: string;
  issueDate?: Date | null;
  billDate?: Date | null;
  dueDate: Date;
  daysOverdue: number;
  balanceDue: number;
}

export interface StatementTransaction {
  date: Date | null;
  type: string;
  reference: string;
  debit: number;
  credit: number;
}

@Injectable()
export class AgingReportsService {
  constructor(private prisma: ReadReplicaService) {}

  async getReceivablesAging(organizationId: string, asOfDate?: string) {
    const date = asOfDate ? new Date(asOfDate) : new Date();
    date.setHours(23, 59, 59, 999);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        balanceDue: { gt: 0 },
        issueDate: { lte: date },
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });

    const buckets = {
      current: [] as AgingItem[],
      days1_30: [] as AgingItem[],
      days31_60: [] as AgingItem[],
      days61_90: [] as AgingItem[],
      over90: [] as AgingItem[],
    };

    for (const invoice of invoices) {
      const dueDate = invoice.dueDate;
      const daysOverdue = Math.floor((date.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const balanceDue = parseFloat(invoice.balanceDue.toString());

      const item: AgingItem = {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customer.id,
        customerName: invoice.customer.name,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
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
      summary,
      customerCount: new Set(invoices.map((i) => i.customerId)).size,
      invoiceCount: invoices.length,
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
      summary,
      vendorCount: new Set(bills.map((b) => b.vendorId)).size,
      billCount: bills.length,
    };
  }

  async getCustomerStatement(
    organizationId: string,
    customerId: string,
    startDate: string,
    endDate: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) return null;

    const start = new Date(startDate);
    // A date-only end must include that whole day (voids/payments later on the end date).
    const end = endOfUtcDay(new Date(endDate));

    // Get opening balance (sum of all invoices minus payments before start date)
    const openingInvoices = await this.prisma.invoice.findMany({
      where: { customerId, organizationId, issueDate: { lt: start }, deletedAt: null },
    });
    const openingPayments = await this.prisma.paymentReceived.findMany({
      where: { customerId, organizationId, date: { lt: start } },
    });

    const openingInvoiceTotal = openingInvoices.reduce(
      (sum, i) => sum + parseFloat((i.total ?? i.grandTotal).toString()),
      0,
    );
    const openingPaymentTotal = openingPayments.reduce(
      (sum, p) => sum + parseFloat(p.amount.toString()),
      0,
    );
    const openingBalance = openingInvoiceTotal - openingPaymentTotal;

    // Get transactions in period
    const invoices = await this.prisma.invoice.findMany({
      where: { customerId, organizationId, issueDate: { gte: start, lte: end }, deletedAt: null },
      orderBy: { issueDate: 'asc' },
    });

    const payments = await this.prisma.paymentReceived.findMany({
      where: { customerId, organizationId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });

    const creditNotes = await this.prisma.creditNote.findMany({
      where: { customerId, organizationId, issueDate: { gte: start, lte: end }, deletedAt: null },
      orderBy: { issueDate: 'asc' },
    });

    // Combine and sort by date
    const transactions: StatementTransaction[] = [
      ...invoices.map((i) => ({
        date: i.issueDate ?? i.date,
        type: 'Invoice' as const,
        reference: i.invoiceNumber,
        debit: parseFloat((i.total ?? i.grandTotal).toString()),
        credit: 0,
      })),
      ...payments.map((p) => ({
        date: p.date,
        type: 'Payment' as const,
        reference: p.paymentNumber,
        debit: 0,
        credit: parseFloat(p.amount.toString()),
      })),
      ...creditNotes.map((cn) => ({
        date: cn.issueDate ?? cn.date,
        type: 'Credit Note' as const,
        reference: cn.creditNoteNumber,
        debit: 0,
        credit: parseFloat((cn.total ?? cn.amount).toString()),
      })),
    ].sort((a, b) => new Date(a.date as Date).getTime() - new Date(b.date as Date).getTime());

    // Add running balance
    let runningBalance = openingBalance;
    const entries = transactions.map((t) => {
      runningBalance += t.debit - t.credit;
      return { ...t, balance: runningBalance };
    });

    return {
      customer: { id: customer.id, name: customer.name, email: customer.email },
      period: { startDate, endDate },
      openingBalance,
      transactions: entries,
      closingBalance: runningBalance,
      totalDebits: entries.reduce((sum, e) => sum + e.debit, 0),
      totalCredits: entries.reduce((sum, e) => sum + e.credit, 0),
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
      where: { vendorId, organizationId, date: { lt: start }, deletedAt: null },
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
      .add(sum(openingVoids.map((p) => p.amount)))
      .toNumber();

    // Period transactions
    const bills = await this.prisma.bill.findMany({
      where: { vendorId, organizationId, date: { gte: start, lte: end }, deletedAt: null },
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

    const transactions: StatementTransaction[] = [
      ...bills.map((b) => ({
        date: b.date,
        type: 'Bill' as const,
        reference: b.billNumber,
        debit: (b.total ?? b.grandTotal).toNumber(),
        credit: 0,
      })),
      ...payments.map((p) => ({
        date: p.date,
        type: 'Payment' as const,
        reference: p.paymentNumber,
        debit: 0,
        credit: p.amount.toNumber(),
      })),
      ...voids.map((p) => ({
        date: p.deletedAt as Date,
        type: 'Payment Void' as const,
        reference: p.paymentNumber,
        debit: p.amount.toNumber(),
        credit: 0,
      })),
    ].sort((a, b) => new Date(a.date as Date).getTime() - new Date(b.date as Date).getTime());

    let runningBalance = openingBalance;
    const entries = transactions.map((t) => {
      runningBalance += t.debit - t.credit;
      return { ...t, balance: runningBalance };
    });

    return {
      vendor: { id: vendor.id, name: vendor.name, email: vendor.email },
      period: { startDate, endDate },
      openingBalance,
      transactions: entries,
      closingBalance: runningBalance,
      totalDebits: entries.reduce((sum, e) => sum + e.debit, 0),
      totalCredits: entries.reduce((sum, e) => sum + e.credit, 0),
    };
  }
}
