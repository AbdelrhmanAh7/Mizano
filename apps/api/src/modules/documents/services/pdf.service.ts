import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { generateInvoiceHtml, InvoiceData } from '../templates/invoice.template';
import { generateQuoteHtml, QuoteData } from '../templates/quote.template';
import { generatePayslipHtml, PayslipData } from '../templates/payslip.template';
import { OrganizationInfo, DocumentLineItem, formatCurrency, formatDate } from '../templates/base.template';
import * as puppeteer from 'puppeteer';

@Injectable()
export class PdfService {
  constructor(private prisma: PrismaService) {}

  // ============ Invoice PDF ============

  async generateInvoicePdf(organizationId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
      include: {
        customer: true,
        lines: {
          include: {
            item: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const org = await this.getOrganizationInfo(organizationId);

    const invoiceData: InvoiceData = {
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.date,
      dueDate: invoice.dueDate,
      status: invoice.status,
      customer: {
        name: invoice.customer.name,
        email: invoice.customer.email || undefined,
        phone: invoice.customer.phone || undefined,
        address: invoice.customer.address || undefined,
        city: invoice.customer.city || undefined,
        country: invoice.customer.country || undefined,
        taxId: invoice.customer.taxId || undefined,
      },
      lines: invoice.lines.map((line) => ({
        description: line.description || line.item?.name || '',
        quantity: parseFloat(line.quantity.toString()),
        rate: parseFloat(line.rate.toString()),
        discount: line.discount ? parseFloat(line.discount.toString()) : undefined,
        taxRate: line.taxRate ? parseFloat(line.taxRate.toString()) : undefined,
        amount: parseFloat(line.amount.toString()),
      })),
      subtotal: parseFloat(invoice.subtotal.toString()),
      taxAmount: parseFloat(invoice.taxAmount.toString()),
      shippingAmount: invoice.shippingAmount ? parseFloat(invoice.shippingAmount.toString()) : undefined,
      grandTotal: parseFloat(invoice.grandTotal.toString()),
      balanceDue: parseFloat(invoice.balanceDue.toString()),
      currency: org.currency || 'SAR',
      notes: invoice.notes || undefined,
      terms: invoice.terms || undefined,
    };

    const html = generateInvoiceHtml(org, invoiceData);
    return this.htmlToPdf(html);
  }

  // ============ Quote PDF ============

  async generateQuotePdf(organizationId: string, quoteId: string): Promise<Buffer> {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, organizationId, deletedAt: null },
      include: {
        customer: true,
        lines: {
          include: {
            item: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const org = await this.getOrganizationInfo(organizationId);

    const quoteData: QuoteData = {
      quoteNumber: quote.quoteNumber,
      date: quote.date,
      expiryDate: quote.expiryDate,
      status: quote.status,
      customer: {
        name: quote.customer.name,
        email: quote.customer.email || undefined,
        phone: quote.customer.phone || undefined,
        address: quote.customer.address || undefined,
        city: quote.customer.city || undefined,
        country: quote.customer.country || undefined,
      },
      lines: quote.lines.map((line) => ({
        description: line.description || line.item?.name || '',
        quantity: parseFloat(line.quantity.toString()),
        rate: parseFloat(line.rate.toString()),
        discount: line.discount ? parseFloat(line.discount.toString()) : undefined,
        taxRate: line.taxRate ? parseFloat(line.taxRate.toString()) : undefined,
        amount: parseFloat(line.amount.toString()),
      })),
      subtotal: parseFloat(quote.subtotal.toString()),
      taxAmount: parseFloat(quote.taxAmount.toString()),
      grandTotal: parseFloat(quote.grandTotal.toString()),
      currency: org.currency || 'SAR',
      notes: quote.notes || undefined,
      terms: quote.terms || undefined,
    };

    const html = generateQuoteHtml(org, quoteData);
    return this.htmlToPdf(html);
  }

  // ============ Payslip PDF ============

  async generatePayslipPdf(organizationId: string, payslipId: string): Promise<Buffer> {
    const payslip = await this.prisma.payslip.findFirst({
      where: {
        id: payslipId,
        payrollRun: {
          organizationId,
        },
      },
      include: {
        employee: true,
        payrollRun: true,
      },
    });

    if (!payslip) {
      throw new NotFoundException('Payslip not found');
    }

    const org = await this.getOrganizationInfo(organizationId);

    // Parse earnings and deductions from JSON
    const earnings: Array<{ description: string; amount: number; isGross?: boolean }> = [];
    const deductions: Array<{ description: string; amount: number }> = [];

    // Add base salary
    const baseSalaryAmount = payslip.baseSalary ? parseFloat(payslip.baseSalary.toString()) : 0;
    earnings.push({
      description: 'Base Salary',
      amount: baseSalaryAmount,
      isGross: true,
    });

    // Add allowances
    if (payslip.housingAllowance && parseFloat(payslip.housingAllowance.toString()) > 0) {
      earnings.push({
        description: 'Housing Allowance',
        amount: parseFloat(payslip.housingAllowance.toString()),
      });
    }

    if (payslip.transportAllowance && parseFloat(payslip.transportAllowance.toString()) > 0) {
      earnings.push({
        description: 'Transport Allowance',
        amount: parseFloat(payslip.transportAllowance.toString()),
      });
    }

    if (payslip.otherAllowances && parseFloat(payslip.otherAllowances.toString()) > 0) {
      earnings.push({
        description: 'Other Allowances',
        amount: parseFloat(payslip.otherAllowances.toString()),
      });
    }

    if (payslip.overtime && parseFloat(payslip.overtime.toString()) > 0) {
      earnings.push({
        description: 'Overtime',
        amount: parseFloat(payslip.overtime.toString()),
      });
    }

    if (payslip.bonus && parseFloat(payslip.bonus.toString()) > 0) {
      earnings.push({
        description: 'Bonus',
        amount: parseFloat(payslip.bonus.toString()),
      });
    }

    // Add deductions
    if (payslip.gosiEmployee && parseFloat(payslip.gosiEmployee.toString()) > 0) {
      deductions.push({
        description: 'GOSI (Employee)',
        amount: parseFloat(payslip.gosiEmployee.toString()),
      });
    }

    if (payslip.incomeTax && parseFloat(payslip.incomeTax.toString()) > 0) {
      deductions.push({
        description: 'Income Tax',
        amount: parseFloat(payslip.incomeTax.toString()),
      });
    }

    if (payslip.loanDeduction && parseFloat(payslip.loanDeduction.toString()) > 0) {
      deductions.push({
        description: 'Loan Deduction',
        amount: parseFloat(payslip.loanDeduction.toString()),
      });
    }

    if (payslip.otherDeductions && parseFloat(payslip.otherDeductions.toString()) > 0) {
      deductions.push({
        description: 'Other Deductions',
        amount: parseFloat(payslip.otherDeductions.toString()),
      });
    }

    // Construct fallback dates from payrollRun month/year if periodStart/End/payDate not set
    const { month, year } = payslip.payrollRun;
    const defaultPeriodStart = new Date(year, month - 1, 1); // First day of month
    const defaultPeriodEnd = new Date(year, month, 0); // Last day of month
    const defaultPayDate = new Date(year, month - 1, 28); // 28th of month

    const payslipData: PayslipData = {
      payslipNumber: `PS-${payslip.id.slice(-8).toUpperCase()}`,
      payPeriodStart: payslip.payrollRun.periodStart ?? defaultPeriodStart,
      payPeriodEnd: payslip.payrollRun.periodEnd ?? defaultPeriodEnd,
      payDate: payslip.payrollRun.payDate ?? defaultPayDate,
      employee: {
        name: payslip.employee.name,
        employeeId: payslip.employee.employeeNumber || payslip.employee.employeeId,
        department: payslip.employee.department || undefined,
        position: payslip.employee.position || payslip.employee.jobTitle || undefined,
        email: payslip.employee.email || undefined,
        bankAccount: payslip.employee.bankAccount || undefined,
      },
      earnings,
      deductions,
      grossPay: parseFloat((payslip.grossPay || payslip.grossSalary).toString()),
      totalDeductions: parseFloat((payslip.totalDeductions || 0).toString()),
      netPay: parseFloat((payslip.netPay || payslip.netSalary).toString()),
      currency: 'SAR',
    };

    const html = generatePayslipHtml(org, payslipData);
    return this.htmlToPdf(html);
  }

  // ============ Statement PDF ============

  async generateStatementPdf(
    organizationId: string,
    customerId: string,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Buffer> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const org = await this.getOrganizationInfo(organizationId);

    // Get all invoices and payments in the period
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        customerId,
        date: { gte: dateFrom, lte: dateTo },
        status: { not: 'VOID' },
        deletedAt: null,
      },
      orderBy: { date: 'asc' },
    });

    const payments = await this.prisma.paymentReceived.findMany({
      where: {
        organizationId,
        customerId,
        date: { gte: dateFrom, lte: dateTo },
        deletedAt: null,
      },
      orderBy: { date: 'asc' },
    });

    // Calculate opening balance (invoices - payments before dateFrom)
    const priorInvoices = await this.prisma.invoice.aggregate({
      where: {
        organizationId,
        customerId,
        date: { lt: dateFrom },
        status: { not: 'VOID' },
        deletedAt: null,
      },
      _sum: { grandTotal: true },
    });

    const priorPayments = await this.prisma.paymentReceived.aggregate({
      where: {
        organizationId,
        customerId,
        date: { lt: dateFrom },
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    const openingBalance =
      parseFloat(priorInvoices._sum.grandTotal?.toString() || '0') -
      parseFloat(priorPayments._sum.amount?.toString() || '0');

    // Build statement transactions
    const transactions: Array<{
      date: Date;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    }> = [];

    let runningBalance = openingBalance;

    // Merge and sort invoices and payments
    const allTransactions = [
      ...invoices.map((inv) => ({
        date: inv.date,
        type: 'invoice' as const,
        ref: inv.invoiceNumber,
        amount: parseFloat(inv.grandTotal.toString()),
      })),
      ...payments.map((pay) => ({
        date: pay.date,
        type: 'payment' as const,
        ref: pay.paymentNumber,
        amount: parseFloat(pay.amount.toString()),
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const trans of allTransactions) {
      if (trans.type === 'invoice') {
        runningBalance += trans.amount;
        transactions.push({
          date: trans.date,
          description: `Invoice ${trans.ref}`,
          debit: trans.amount,
          credit: 0,
          balance: runningBalance,
        });
      } else {
        runningBalance -= trans.amount;
        transactions.push({
          date: trans.date,
          description: `Payment ${trans.ref}`,
          debit: 0,
          credit: trans.amount,
          balance: runningBalance,
        });
      }
    }

    const closingBalance = runningBalance;

    // Generate HTML
    const html = this.generateStatementHtml(org, {
      customer: {
        name: customer.name,
        email: customer.email || undefined,
        address: customer.address || undefined,
        city: customer.city || undefined,
        country: customer.country || undefined,
      },
      dateFrom,
      dateTo,
      openingBalance,
      transactions,
      closingBalance,
      currency: 'SAR',
    });

    return this.htmlToPdf(html);
  }

  // ============ Profit & Loss PDF ============

  async generateProfitAndLossPdf(organizationId: string, startDate: string, endDate: string): Promise<Buffer> {
    const org = await this.getOrganizationInfo(organizationId);
    const primaryColor = org.primaryColor || '#3B82F6';
    const currency = org.currency || 'SAR';
    const journalLines = await this.prisma.journalLine.findMany({
      where: { journal: { organizationId, isPosted: true, deletedAt: null, date: { gte: new Date(startDate), lte: new Date(endDate) } } },
      include: { account: { select: { name: true, type: true, subType: true, code: true } } },
    });
    const acctBal: Record<string, Record<string, { code: string; balance: number }>> = {};
    for (const line of journalLines) {
      const { type, name, code } = line.account;
      const debit = parseFloat(line.debit.toString()), credit = parseFloat(line.credit.toString());
      if (!acctBal[type]) acctBal[type] = {};
      if (!acctBal[type][name]) acctBal[type][name] = { code, balance: 0 };
      if (type === 'REVENUE' || type === 'INCOME') acctBal[type][name].balance += credit - debit;
      else if (type === 'EXPENSE') acctBal[type][name].balance += debit - credit;
    }
    const revAccts = { ...(acctBal['REVENUE'] || {}), ...(acctBal['INCOME'] || {}) };
    let totalRev = 0;
    const revRows = Object.entries(revAccts).sort((a, b) => a[1].code.localeCompare(b[1].code)).map(([n, d]) => { totalRev += d.balance; return `<tr style="border-bottom:1px solid #E5E7EB"><td style="padding:8px 10px;font-size:12px;padding-left:30px">${d.code} - ${n}</td><td style="padding:8px 10px;text-align:right;font-size:12px">${formatCurrency(d.balance, currency)}</td></tr>`; }).join('');
    let totalExp = 0;
    const expRows = Object.entries(acctBal['EXPENSE'] || {}).sort((a, b) => a[1].code.localeCompare(b[1].code)).map(([n, d]) => { totalExp += d.balance; return `<tr style="border-bottom:1px solid #E5E7EB"><td style="padding:8px 10px;font-size:12px;padding-left:30px">${d.code} - ${n}</td><td style="padding:8px 10px;text-align:right;font-size:12px">${formatCurrency(d.balance, currency)}</td></tr>`; }).join('');
    const net = totalRev - totalExp;
    return this.htmlToPdf(this.generateReportHtml(org, primaryColor, currency, { title: 'PROFIT & LOSS STATEMENT', subtitle: `${formatDate(startDate)} - ${formatDate(endDate)}`, sections: [{ heading: 'Revenue', rows: revRows, totalLabel: 'Total Revenue', totalAmount: totalRev }, { heading: 'Expenses', rows: expRows, totalLabel: 'Total Expenses', totalAmount: totalExp }], bottomBar: { label: `Net ${net >= 0 ? 'Profit' : 'Loss'}`, amount: Math.abs(net) } }));
  }

  // ============ Balance Sheet PDF ============

  async generateBalanceSheetPdf(organizationId: string, asOfDate: string): Promise<Buffer> {
    const org = await this.getOrganizationInfo(organizationId);
    const pc = org.primaryColor || '#3B82F6';
    const cur = org.currency || 'SAR';
    const lines = await this.prisma.journalLine.findMany({ where: { journal: { organizationId, isPosted: true, deletedAt: null, date: { lte: new Date(asOfDate) } } }, include: { account: { select: { name: true, type: true, code: true } } } });
    const sec: Record<string, Record<string, { code: string; balance: number }>> = {};
    for (const l of lines) { const { type, name, code } = l.account; const d = parseFloat(l.debit.toString()), c = parseFloat(l.credit.toString()); if (!sec[type]) sec[type] = {}; if (!sec[type][name]) sec[type][name] = { code, balance: 0 }; sec[type][name].balance += type === 'ASSET' ? d - c : c - d; }
    const totRev = Object.values(sec['REVENUE'] || {}).reduce((s, a) => s + a.balance, 0) + Object.values(sec['INCOME'] || {}).reduce((s, a) => s + a.balance, 0);
    const totExp = Object.values(sec['EXPENSE'] || {}).reduce((s, a) => s + a.balance, 0);
    const re = totRev + totExp;
    const br = (accts: Record<string, { code: string; balance: number }>) => { let t = 0; const r = Object.entries(accts).sort((a, b) => a[1].code.localeCompare(b[1].code)).map(([n, d]) => { t += d.balance; return `<tr style="border-bottom:1px solid #E5E7EB"><td style="padding:8px 10px;font-size:12px;padding-left:30px">${d.code} - ${n}</td><td style="padding:8px 10px;text-align:right;font-size:12px">${formatCurrency(d.balance, cur)}</td></tr>`; }).join(''); return { rows: r, total: t }; };
    const a = br(sec['ASSET'] || {}), li = br(sec['LIABILITY'] || {}), eq = br(sec['EQUITY'] || {});
    const eqR = (eq.rows || '') + `<tr style="border-bottom:1px solid #E5E7EB"><td style="padding:8px 10px;font-size:12px;padding-left:30px;font-style:italic">Retained Earnings</td><td style="padding:8px 10px;text-align:right;font-size:12px">${formatCurrency(re, cur)}</td></tr>`;
    return this.htmlToPdf(this.generateReportHtml(org, pc, cur, { title: 'BALANCE SHEET', subtitle: `As of ${formatDate(asOfDate)}`, sections: [{ heading: 'Assets', rows: a.rows, totalLabel: 'Total Assets', totalAmount: a.total }, { heading: 'Liabilities', rows: li.rows, totalLabel: 'Total Liabilities', totalAmount: li.total }, { heading: 'Equity', rows: eqR, totalLabel: 'Total Equity', totalAmount: eq.total + re }], bottomBar: { label: 'Total Liabilities & Equity', amount: li.total + eq.total + re } }));
  }

  // ============ Aging Report PDF ============

  async generateAgingReportPdf(organizationId: string, type: 'receivables' | 'payables', asOfDate?: string): Promise<Buffer> {
    const org = await this.getOrganizationInfo(organizationId);
    const pc = org.primaryColor || '#3B82F6', cur = org.currency || 'SAR';
    const ref = asOfDate ? new Date(asOfDate) : new Date();
    const cat = (due: Date, amt: number) => { const d = Math.floor((ref.getTime() - due.getTime()) / 86400000); if (d <= 0) return { current: amt }; if (d <= 30) return { days1to30: amt }; if (d <= 60) return { days31to60: amt }; if (d <= 90) return { days61to90: amt }; return { over90: amt }; };
    const eb = () => ({ current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 });
    const grp: Record<string, ReturnType<typeof eb>> = {}, tot = eb();
    if (type === 'receivables') { const inv = await this.prisma.invoice.findMany({ where: { organizationId, deletedAt: null, balanceDue: { gt: 0 } }, include: { customer: { select: { name: true } } } }); for (const i of inv) { const n = i.customer.name, b = parseFloat(i.balanceDue.toString()); if (!grp[n]) grp[n] = eb(); for (const [k, v] of Object.entries(cat(i.dueDate, b))) { (grp[n] as any)[k] += v; (tot as any)[k] += v; } grp[n].total += b; tot.total += b; } }
    else { const bills = await this.prisma.bill.findMany({ where: { organizationId, deletedAt: null, balanceDue: { gt: 0 } }, include: { vendor: { select: { name: true } } } }); for (const bl of bills) { const n = bl.vendor.name, b = parseFloat(bl.balanceDue.toString()); if (!grp[n]) grp[n] = eb(); for (const [k, v] of Object.entries(cat(bl.dueDate, b))) { (grp[n] as any)[k] += v; (tot as any)[k] += v; } grp[n].total += b; tot.total += b; } }
    const ti = type === 'receivables' ? 'ACCOUNTS RECEIVABLE AGING' : 'ACCOUNTS PAYABLE AGING';
    const la = type === 'receivables' ? 'Customer' : 'Vendor';
    const fc = (v: number) => formatCurrency(v, cur);
    const rw = Object.entries(grp).sort((a, b) => b[1].total - a[1].total).map(([n, b]) => `<tr style="border-bottom:1px solid #E5E7EB"><td style="padding:8px 10px;font-size:11px">${n}</td><td style="padding:8px 10px;text-align:right;font-size:11px">${fc(b.current)}</td><td style="padding:8px 10px;text-align:right;font-size:11px">${fc(b.days1to30)}</td><td style="padding:8px 10px;text-align:right;font-size:11px">${fc(b.days31to60)}</td><td style="padding:8px 10px;text-align:right;font-size:11px">${fc(b.days61to90)}</td><td style="padding:8px 10px;text-align:right;font-size:11px">${fc(b.over90)}</td><td style="padding:8px 10px;text-align:right;font-size:11px;font-weight:bold">${fc(b.total)}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${ti}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111827;line-height:1.5}.container{max-width:800px;margin:0 auto;padding:40px}</style></head><body><div class="container"><div style="margin-bottom:30px">${org.logoUrl ? `<img src="${org.logoUrl}" style="max-height:60px"/>` : ''}<h1 style="color:${pc};margin:10px 0 5px 0;font-size:24px">${org.name}</h1>${org.address ? `<p style="color:#6B7280;font-size:12px">${org.address}</p>` : ''}</div><div style="text-align:center;margin-bottom:30px"><h2 style="font-size:24px;color:${pc}">${ti}</h2><p style="color:#6B7280;font-size:14px">As of ${formatDate(ref)}</p></div><table style="width:100%;border-collapse:collapse;margin-bottom:20px"><thead><tr style="background:${pc};color:white"><th style="padding:10px;text-align:left;font-size:11px">${la}</th><th style="padding:10px;text-align:right;font-size:11px">Current</th><th style="padding:10px;text-align:right;font-size:11px">1-30</th><th style="padding:10px;text-align:right;font-size:11px">31-60</th><th style="padding:10px;text-align:right;font-size:11px">61-90</th><th style="padding:10px;text-align:right;font-size:11px">90+</th><th style="padding:10px;text-align:right;font-size:11px">Total</th></tr></thead><tbody>${rw || `<tr><td colspan="7" style="padding:10px;text-align:center;color:#6B7280">No outstanding ${type}</td></tr>`}</tbody><tfoot><tr style="background:#F3F4F6;font-weight:bold"><td style="padding:10px">Total</td><td style="padding:10px;text-align:right">${fc(tot.current)}</td><td style="padding:10px;text-align:right">${fc(tot.days1to30)}</td><td style="padding:10px;text-align:right">${fc(tot.days31to60)}</td><td style="padding:10px;text-align:right">${fc(tot.days61to90)}</td><td style="padding:10px;text-align:right">${fc(tot.over90)}</td><td style="padding:10px;text-align:right">${fc(tot.total)}</td></tr></tfoot></table><div style="margin-top:40px;text-align:center"><p style="color:#9CA3AF;font-size:10px">Generated automatically.</p></div></div></body></html>`;
    return this.htmlToPdf(html);
  }

  // ============ Helper Methods ============

  private generateReportHtml(org: OrganizationInfo, pc: string, cur: string, r: { title: string; subtitle: string; sections: Array<{ heading: string; rows: string; totalLabel: string; totalAmount: number }>; bottomBar: { label: string; amount: number } }): string {
    const sh = r.sections.map((s) => `<table style="width:100%;border-collapse:collapse;margin-bottom:10px;margin-top:20px"><thead><tr style="background:${pc};color:white"><th style="padding:10px;text-align:left;font-size:12px">${s.heading}</th><th style="padding:10px;text-align:right;font-size:12px">Amount</th></tr></thead><tbody>${s.rows || `<tr><td colspan="2" style="padding:10px;color:#6B7280">No ${s.heading.toLowerCase()} recorded</td></tr>`}<tr style="background:#F3F4F6;font-weight:bold"><td style="padding:10px;font-size:13px">${s.totalLabel}</td><td style="padding:10px;text-align:right;font-size:13px">${formatCurrency(s.totalAmount, cur)}</td></tr></tbody></table>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${r.title}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#111827;line-height:1.5}.container{max-width:800px;margin:0 auto;padding:40px}</style></head><body><div class="container"><div style="margin-bottom:30px">${org.logoUrl ? `<img src="${org.logoUrl}" style="max-height:60px"/>` : ''}<h1 style="color:${pc};margin:10px 0 5px 0;font-size:24px">${org.name}</h1>${org.address ? `<p style="color:#6B7280;font-size:12px">${org.address}</p>` : ''}</div><div style="text-align:center;margin-bottom:30px"><h2 style="font-size:24px;color:${pc}">${r.title}</h2><p style="color:#6B7280;font-size:14px">${r.subtitle}</p></div>${sh}<div style="background:${pc};color:white;padding:15px;border-radius:8px;margin-top:20px"><div style="display:flex;justify-content:space-between"><span style="font-weight:bold;font-size:16px">${r.bottomBar.label}</span><span style="font-weight:bold;font-size:18px">${formatCurrency(r.bottomBar.amount, cur)}</span></div></div><div style="margin-top:40px;text-align:center"><p style="color:#9CA3AF;font-size:10px">Generated automatically.</p>${org.footerText ? `<p style="color:#9CA3AF;font-size:10px">${org.footerText}</p>` : ''}</div></div></body></html>`;
  }

  private async getOrganizationInfo(organizationId: string): Promise<OrganizationInfo> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return {
      name: org.name,
      logoUrl: org.logoUrl || undefined,
      address: org.companyAddress || undefined,
      city: org.city || undefined,
      country: org.country || undefined,
      phone: org.phone || undefined,
      email: org.email || undefined,
      website: org.website || undefined,
      taxId: org.taxId || undefined,
      bankDetails: org.bankDetails || undefined,
      footerText: org.footerText || undefined,
      primaryColor: org.primaryColor || undefined,
      currency: org.currency || 'SAR',
    };
  }

  private async htmlToPdf(html: string): Promise<Buffer> {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm',
        },
      });
      return Buffer.from(pdf);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private generateStatementHtml(
    org: OrganizationInfo,
    data: {
      customer: {
        name: string;
        email?: string;
        address?: string;
        city?: string;
        country?: string;
      };
      dateFrom: Date;
      dateTo: Date;
      openingBalance: number;
      transactions: Array<{
        date: Date;
        description: string;
        debit: number;
        credit: number;
        balance: number;
      }>;
      closingBalance: number;
      currency: string;
    },
  ): string {
    const primaryColor = org.primaryColor || '#3B82F6';

    const transactionRows = data.transactions
      .map(
        (t) => `
        <tr style="border-bottom: 1px solid #E5E7EB;">
          <td style="padding: 10px; font-size: 12px;">${formatDate(t.date)}</td>
          <td style="padding: 10px; font-size: 12px;">${t.description}</td>
          <td style="padding: 10px; text-align: right; font-size: 12px;">${t.debit > 0 ? formatCurrency(t.debit, data.currency) : '-'}</td>
          <td style="padding: 10px; text-align: right; font-size: 12px;">${t.credit > 0 ? formatCurrency(t.credit, data.currency) : '-'}</td>
          <td style="padding: 10px; text-align: right; font-size: 12px; font-weight: bold;">${formatCurrency(t.balance, data.currency)}</td>
        </tr>
      `,
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Statement of Account - ${data.customer.name}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; line-height: 1.5; }
          .container { max-width: 800px; margin: 0 auto; padding: 40px; }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
            <div>
              ${org.logoUrl ? `<img src="${org.logoUrl}" alt="${org.name}" style="max-height: 60px;" />` : ''}
              <h1 style="color: ${primaryColor}; margin: 10px 0 5px 0; font-size: 24px;">${org.name}</h1>
              ${org.address ? `<p style="margin: 2px 0; color: #6B7280; font-size: 12px;">${org.address}</p>` : ''}
            </div>
          </div>

          <!-- Title -->
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="font-size: 24px; color: ${primaryColor};">STATEMENT OF ACCOUNT</h2>
            <p style="color: #6B7280; font-size: 14px;">${formatDate(data.dateFrom)} - ${formatDate(data.dateTo)}</p>
          </div>

          <!-- Customer Info -->
          <div style="margin-bottom: 30px;">
            <h4 style="color: ${primaryColor}; margin-bottom: 10px; font-size: 12px;">CUSTOMER</h4>
            <p style="font-weight: bold;">${data.customer.name}</p>
            ${data.customer.address ? `<p style="color: #6B7280; font-size: 12px;">${data.customer.address}</p>` : ''}
            ${data.customer.city && data.customer.country ? `<p style="color: #6B7280; font-size: 12px;">${data.customer.city}, ${data.customer.country}</p>` : ''}
          </div>

          <!-- Opening Balance -->
          <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="font-weight: bold;">Opening Balance</span>
              <span style="font-weight: bold;">${formatCurrency(data.openingBalance, data.currency)}</span>
            </div>
          </div>

          <!-- Transactions Table -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
              <tr style="background: ${primaryColor}; color: white;">
                <th style="padding: 10px; text-align: left; font-size: 12px;">Date</th>
                <th style="padding: 10px; text-align: left; font-size: 12px;">Description</th>
                <th style="padding: 10px; text-align: right; font-size: 12px;">Debit</th>
                <th style="padding: 10px; text-align: right; font-size: 12px;">Credit</th>
                <th style="padding: 10px; text-align: right; font-size: 12px;">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${transactionRows}
            </tbody>
          </table>

          <!-- Closing Balance -->
          <div style="background: ${primaryColor}; color: white; padding: 15px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between;">
              <span style="font-weight: bold; font-size: 16px;">Closing Balance</span>
              <span style="font-weight: bold; font-size: 18px;">${formatCurrency(data.closingBalance, data.currency)}</span>
            </div>
          </div>

          <!-- Footer -->
          <div style="margin-top: 40px; text-align: center;">
            <p style="color: #9CA3AF; font-size: 10px;">This statement was generated automatically.</p>
            ${org.footerText ? `<p style="color: #9CA3AF; font-size: 10px;">${org.footerText}</p>` : ''}
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
