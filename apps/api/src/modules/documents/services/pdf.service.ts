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

  // ============ Helper Methods ============

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
