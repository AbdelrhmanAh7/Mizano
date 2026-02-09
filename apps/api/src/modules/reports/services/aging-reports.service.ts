import { Injectable } from '@nestjs/common';
import { ReadReplicaService } from '../../../prisma/read-replica.service';

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
      current: [] as any[],
      days1_30: [] as any[],
      days31_60: [] as any[],
      days61_90: [] as any[],
      over90: [] as any[],
    };

    for (const invoice of invoices) {
      const dueDate = invoice.dueDate;
      const daysOverdue = Math.floor((date.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const balanceDue = parseFloat(invoice.balanceDue.toString());

      const item = {
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
        billDate: { lte: date },
      },
      include: {
        vendor: { select: { id: true, name: true } },
      },
    });

    const buckets = {
      current: [] as any[],
      days1_30: [] as any[],
      days31_60: [] as any[],
      days61_90: [] as any[],
      over90: [] as any[],
    };

    for (const bill of bills) {
      const dueDate = bill.dueDate;
      const daysOverdue = Math.floor((date.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const balanceDue = parseFloat(bill.balanceDue.toString());

      const item = {
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
    const end = new Date(endDate);

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
    const transactions: any[] = [
      ...invoices.map((i) => ({
        date: i.issueDate ?? i.date,
        type: 'Invoice',
        reference: i.invoiceNumber,
        debit: parseFloat((i.total ?? i.grandTotal).toString()),
        credit: 0,
      })),
      ...payments.map((p) => ({
        date: p.date,
        type: 'Payment',
        reference: p.paymentNumber,
        debit: 0,
        credit: parseFloat(p.amount.toString()),
      })),
      ...creditNotes.map((cn) => ({
        date: cn.issueDate ?? cn.date,
        type: 'Credit Note',
        reference: cn.creditNoteNumber,
        debit: 0,
        credit: parseFloat((cn.total ?? cn.amount).toString()),
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
    const end = new Date(endDate);

    // Opening balance
    const openingBills = await this.prisma.bill.findMany({
      where: { vendorId, organizationId, billDate: { lt: start }, deletedAt: null },
    });
    const openingPayments = await this.prisma.paymentMade.findMany({
      where: { vendorId, organizationId, date: { lt: start } },
    });

    const openingBillTotal = openingBills.reduce(
      (sum, b) => sum + parseFloat((b.total ?? b.grandTotal).toString()),
      0,
    );
    const openingPaymentTotal = openingPayments.reduce(
      (sum, p) => sum + parseFloat(p.amount.toString()),
      0,
    );
    const openingBalance = openingBillTotal - openingPaymentTotal;

    // Period transactions
    const bills = await this.prisma.bill.findMany({
      where: { vendorId, organizationId, billDate: { gte: start, lte: end }, deletedAt: null },
      orderBy: { billDate: 'asc' },
    });

    const payments = await this.prisma.paymentMade.findMany({
      where: { vendorId, organizationId, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });

    const transactions: any[] = [
      ...bills.map((b) => ({
        date: b.billDate ?? b.date,
        type: 'Bill',
        reference: b.billNumber,
        debit: parseFloat((b.total ?? b.grandTotal).toString()),
        credit: 0,
      })),
      ...payments.map((p) => ({
        date: p.date,
        type: 'Payment',
        reference: p.paymentNumber,
        debit: 0,
        credit: parseFloat(p.amount.toString()),
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
