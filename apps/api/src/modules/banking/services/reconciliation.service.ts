import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { InvoicesService } from '../../sales/services/invoices.service';
import { PaymentsMadeService } from '../../purchases/services/payments-made.service';
import { ReconciliationStatus, BankTransactionType, BankTransaction } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface ReconciliationMatch {
  type: 'invoice' | 'bill';
  entity: unknown;
  confidence: number;
}

@Injectable()
export class ReconciliationService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private paymentsMadeService: PaymentsMadeService,
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

  private async findMatches(organizationId: string, transaction: BankTransaction) {
    const amount = parseFloat(transaction.amount.toString());
    const matches: ReconciliationMatch[] = [];

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

    // Record the payment first: if it is rejected the transaction stays PENDING.
    const amount = transaction.amount.abs();
    if (entityType === 'invoice') {
      await this.createPaymentForInvoice(organizationId, entityId, amount, transaction);
    } else if (entityType === 'bill') {
      await this.createPaymentForBill(organizationId, entityId, amount, transaction);
    } else {
      throw new BadRequestException('entityType must be invoice or bill');
    }

    await this.prisma.bankTransaction.update({
      where: { id: transactionId },
      data: {
        status: ReconciliationStatus.MATCHED,
        matchedEntityType: entityType,
        matchedEntityId: entityId,
      },
    });

    return { message: 'Reconciliation confirmed' };
  }

  private async createPaymentForInvoice(
    organizationId: string,
    invoiceId: string,
    amount: Decimal,
    transaction: BankTransaction,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
    });
    if (!invoice)
      throw new NotFoundException(`Invoice ${invoiceId} not found for reconciliation payment`);

    const paymentNumber = await this.generatePaymentNumber(organizationId, 'PMT');
    await this.prisma.paymentReceived.create({
      data: {
        paymentNumber,
        customerId: invoice.customerId,
        date: transaction.date,
        amount,
        paymentMode: 'BANK_TRANSFER',
        depositToAccountId: transaction.bankAccountId,
        reference: transaction.reference,
        organizationId,
        allocations: { create: [{ invoiceId, amount }] },
      },
    });
    await this.invoicesService.updateBalanceDue(invoiceId);
  }

  /** Goes through the standard vendor-payment command so AP, balances and the ledger agree. */
  private async createPaymentForBill(
    organizationId: string,
    billId: string,
    amount: Decimal,
    transaction: BankTransaction,
  ) {
    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, organizationId, deletedAt: null },
    });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found for reconciliation payment`);

    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: transaction.bankAccountId, organizationId },
      select: { linkedAccountId: true },
    });
    if (!bankAccount) throw new NotFoundException('Bank account not found');

    await this.paymentsMadeService.create(organizationId, {
      vendorId: bill.vendorId,
      date: transaction.date.toISOString(),
      amount: amount.toFixed(4),
      paymentMode: 'BANK_TRANSFER',
      paidFromAccountId: bankAccount.linkedAccountId,
      reference: transaction.reference ?? undefined,
      allocations: [{ billId, amount: amount.toFixed(4) }],
    });
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

  async getSummary(organizationId: string, bankAccountId: string) {
    const [total, matched, pending, created] = await Promise.all([
      this.prisma.bankTransaction.count({
        where: { organizationId, bankAccountId },
      }),
      this.prisma.bankTransaction.count({
        where: { organizationId, bankAccountId, status: ReconciliationStatus.MATCHED },
      }),
      this.prisma.bankTransaction.count({
        where: { organizationId, bankAccountId, status: ReconciliationStatus.PENDING },
      }),
      this.prisma.bankTransaction.count({
        where: { organizationId, bankAccountId, status: ReconciliationStatus.CREATED },
      }),
    ]);

    const matchedAmountResult = await this.prisma.bankTransaction.aggregate({
      where: { organizationId, bankAccountId, status: ReconciliationStatus.MATCHED },
      _sum: { amount: true },
    });

    const totalAmountResult = await this.prisma.bankTransaction.aggregate({
      where: { organizationId, bankAccountId },
      _sum: { amount: true },
    });

    return {
      total,
      matched,
      pending,
      created,
      unmatched: pending,
      totalAmount: totalAmountResult._sum.amount?.toString() || '0',
      matchedAmount: matchedAmountResult._sum.amount?.toString() || '0',
      reconciliationRate: total > 0 ? Math.round(((matched + created) / total) * 100) : 0,
    };
  }

  private async generatePaymentNumber(organizationId: string, prefix: string): Promise<string> {
    let lastNumber: string | undefined;

    if (prefix === 'PMT') {
      const last = await this.prisma.paymentReceived.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: { paymentNumber: true },
      });
      lastNumber = last?.paymentNumber;
    } else {
      const last = await this.prisma.paymentMade.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        select: { paymentNumber: true },
      });
      lastNumber = last?.paymentNumber;
    }

    if (!lastNumber) return `${prefix}-001`;
    const num = parseInt(lastNumber.split('-')[1], 10);
    return `${prefix}-${String(num + 1).padStart(3, '0')}`;
  }
}
