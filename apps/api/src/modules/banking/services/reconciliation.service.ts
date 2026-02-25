import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { InvoicesService } from '../../sales/services/invoices.service';
import { BillsService } from '../../purchases/services/bills.service';
import { ReconciliationStatus, BankTransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ReconciliationService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private billsService: BillsService,
  ) {}

  async getSuggestions(organizationId: string, bankAccountId: string) {
    const pendingTransactions = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId, organizationId, status: ReconciliationStatus.PENDING },
      orderBy: { date: 'desc' },
      take: 50,
    });

    const suggestions = [];
    for (const transaction of pendingTransactions) {
      const matches = await this.findMatches(organizationId, transaction);
      suggestions.push({ transaction, matches });
    }
    return suggestions;
  }

  private async findMatches(organizationId: string, transaction: any) {
    const amount = parseFloat(transaction.amount.toString());
    const matches: any[] = [];

    if (transaction.type === BankTransactionType.DEPOSIT) {
      // Match against invoices
      const invoices = await this.prisma.invoice.findMany({
        where: { organizationId, deletedAt: null, balanceDue: { gt: 0 } },
        include: { customer: { select: { id: true, name: true } } },
      });

      for (const invoice of invoices) {
        let confidence = 0;
        const balanceDue = parseFloat(invoice.balanceDue.toString());

        // Exact amount match
        if (Math.abs(balanceDue - amount) < 0.01) confidence += 90;
        else if (Math.abs(balanceDue - amount) / amount < 0.05) confidence += 50;

        // Reference matching
        if (transaction.reference && transaction.reference.includes(invoice.invoiceNumber))
          confidence = 100;
        if (transaction.description?.includes(invoice.invoiceNumber)) confidence = 100;

        // Name matching
        if (
          transaction.payee &&
          invoice.customer.name.toLowerCase().includes(transaction.payee.toLowerCase())
        )
          confidence += 30;

        if (confidence > 0) {
          matches.push({ type: 'invoice', entity: invoice, confidence: Math.min(100, confidence) });
        }
      }
    } else {
      // Match against bills
      const bills = await this.prisma.bill.findMany({
        where: { organizationId, deletedAt: null, balanceDue: { gt: 0 } },
        include: { vendor: { select: { id: true, name: true } } },
      });

      for (const bill of bills) {
        let confidence = 0;
        const balanceDue = parseFloat(bill.balanceDue.toString());

        if (Math.abs(balanceDue - amount) < 0.01) confidence += 90;
        if (transaction.reference && transaction.reference.includes(bill.billNumber))
          confidence = 100;
        if (
          transaction.payee &&
          bill.vendor.name.toLowerCase().includes(transaction.payee.toLowerCase())
        )
          confidence += 30;

        if (confidence > 0) {
          matches.push({ type: 'bill', entity: bill, confidence: Math.min(100, confidence) });
        }
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  async confirmMatch(
    organizationId: string,
    transactionId: string,
    entityType: string,
    entityId: string,
  ) {
    const transaction = await this.prisma.bankTransaction.findFirst({
      where: { id: transactionId, organizationId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    if (transaction.status !== ReconciliationStatus.PENDING)
      throw new BadRequestException('Already reconciled');

    // Update transaction
    await this.prisma.bankTransaction.update({
      where: { id: transactionId },
      data: {
        status: ReconciliationStatus.MATCHED,
        matchedEntityType: entityType,
        matchedEntityId: entityId,
      },
    });

    // Create payment record
    const amount = parseFloat(transaction.amount.toString());
    if (entityType === 'invoice') {
      await this.createPaymentForInvoice(organizationId, entityId, amount, transaction);
    } else if (entityType === 'bill') {
      await this.createPaymentForBill(organizationId, entityId, amount, transaction);
    }

    return { message: 'Reconciliation confirmed' };
  }

  private async createPaymentForInvoice(
    organizationId: string,
    invoiceId: string,
    amount: number,
    transaction: any,
  ) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return;

    const paymentNumber = await this.generatePaymentNumber(organizationId, 'PMT');
    await this.prisma.paymentReceived.create({
      data: {
        paymentNumber,
        customerId: invoice.customerId,
        date: transaction.date,
        amount: new Decimal(amount),
        paymentMode: 'BANK_TRANSFER',
        depositToAccountId: transaction.bankAccountId,
        reference: transaction.reference,
        organizationId,
        allocations: { create: [{ invoiceId, amount: new Decimal(amount) }] },
      },
    });
    await this.invoicesService.updateBalanceDue(invoiceId);
  }

  private async createPaymentForBill(
    organizationId: string,
    billId: string,
    amount: number,
    transaction: any,
  ) {
    const bill = await this.prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) return;

    const paymentNumber = await this.generatePaymentNumber(organizationId, 'VPMT');
    await this.prisma.paymentMade.create({
      data: {
        paymentNumber,
        vendorId: bill.vendorId,
        date: transaction.date,
        amount: new Decimal(amount),
        paymentMode: 'BANK_TRANSFER',
        paidFromAccountId: transaction.bankAccountId,
        reference: transaction.reference,
        organizationId,
        allocations: { create: [{ billId, amount: new Decimal(amount) }] },
      },
    });
    await this.billsService.updateBalanceDue(billId);
  }

  async createExpenseFromTransaction(
    organizationId: string,
    transactionId: string,
    accountId: string,
    vendorId?: string,
  ) {
    const transaction = await this.prisma.bankTransaction.findFirst({
      where: { id: transactionId, organizationId },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    await this.prisma.expense.create({
      data: {
        date: transaction.date,
        accountId,
        vendorId,
        amount: transaction.amount,
        taxAmount: new Decimal(0),
        paidThroughAccountId: accountId,
        description: transaction.description,
        reference: transaction.reference,
        organizationId,
      },
    });

    await this.prisma.bankTransaction.update({
      where: { id: transactionId },
      data: { status: ReconciliationStatus.CREATED },
    });

    return { message: 'Expense created' };
  }

  private async generatePaymentNumber(organizationId: string, prefix: string): Promise<string> {
    const model = prefix === 'PMT' ? this.prisma.paymentReceived : this.prisma.paymentMade;
    const field = prefix === 'PMT' ? 'paymentNumber' : 'paymentNumber';
    const last = await (model as any).findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { [field]: true },
    });
    if (!last) return `${prefix}-001`;
    const num = parseInt(last[field].split('-')[1], 10);
    return `${prefix}-${String(num + 1).padStart(3, '0')}`;
  }
}
