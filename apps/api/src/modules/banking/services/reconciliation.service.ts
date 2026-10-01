import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentsReceivedService } from '../../sales/services/payments-received.service';
import { ExpensesService } from '../../purchases/services/expenses.service';
import { PaymentsMadeService } from '../../purchases/services/payments-made.service';
import {
  BankTransaction,
  BankTransactionType,
  PaymentMode,
  Prisma,
  ReconciliationStatus,
} from '@prisma/client';
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
    private paymentsMadeService: PaymentsMadeService,
    private paymentsReceivedService: PaymentsReceivedService,
    private expensesService: ExpensesService,
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

    if (entityType !== 'invoice' && entityType !== 'bill') {
      throw new BadRequestException('entityType must be invoice or bill');
    }

    // Money direction must agree with the entity: a deposit settles an invoice, a withdrawal pays
    // a bill. A mismatch would post the opposite entry, so it is rejected before anything is posted.
    const expected =
      entityType === 'invoice' ? BankTransactionType.DEPOSIT : BankTransactionType.WITHDRAWAL;
    if (transaction.type !== expected) {
      throw new BadRequestException(
        entityType === 'invoice'
          ? 'Only deposits can be matched to an invoice payment'
          : 'Only withdrawals can be matched to a bill payment',
      );
    }
    await this.assertBaseCurrencyAccount(organizationId, transaction.bankAccountId);

    // One transaction: the guarded PENDING -> MATCHED transition happens first, so a retried or
    // concurrent confirmation cannot create a second payment; any failure rolls both back.
    const amount = transaction.amount.abs();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bankTransaction.updateMany({
        where: { id: transactionId, organizationId, status: ReconciliationStatus.PENDING },
        data: {
          status: ReconciliationStatus.MATCHED,
          matchedEntityType: entityType,
          matchedEntityId: entityId,
        },
      });
      if (count === 0) throw new BadRequestException('Already reconciled');

      if (entityType === 'invoice') {
        await this.createPaymentForInvoice(tx, organizationId, entityId, amount, transaction);
      } else {
        await this.createPaymentForBill(tx, organizationId, entityId, amount, transaction);
      }
    });

    return { message: 'Reconciliation confirmed' };
  }

  private async createPaymentForInvoice(
    tx: Prisma.TransactionClient,
    organizationId: string,
    invoiceId: string,
    amount: Decimal,
    transaction: BankTransaction,
  ) {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
    });
    if (!invoice)
      throw new NotFoundException(`Invoice ${invoiceId} not found for reconciliation payment`);

    const bankAccount = await tx.bankAccount.findFirst({
      where: { id: transaction.bankAccountId, organizationId },
      select: { linkedAccountId: true },
    });
    if (!bankAccount) throw new NotFoundException('Bank account not found');

    // Goes through the standard customer-payment command (locks the invoice, allocates,
    // recalculates the balance and posts Dr bank / Cr AR) inside the caller's transaction.
    await this.paymentsReceivedService.create(
      organizationId,
      {
        customerId: invoice.customerId,
        date: transaction.date.toISOString(),
        amount: amount.toFixed(4),
        paymentMode: PaymentMode.BANK_TRANSFER,
        depositToAccountId: bankAccount.linkedAccountId,
        reference: transaction.reference ?? undefined,
        allocations: [{ invoiceId, amount: amount.toFixed(4) }],
      },
      { tx },
    );
  }

  /** Goes through the standard vendor-payment command so AP, balances and the ledger agree. */
  private async createPaymentForBill(
    tx: Prisma.TransactionClient,
    organizationId: string,
    billId: string,
    amount: Decimal,
    transaction: BankTransaction,
  ) {
    const bill = await tx.bill.findFirst({
      where: { id: billId, organizationId, deletedAt: null },
    });
    if (!bill) throw new NotFoundException(`Bill ${billId} not found for reconciliation payment`);

    const bankAccount = await tx.bankAccount.findFirst({
      where: { id: transaction.bankAccountId, organizationId },
      select: { linkedAccountId: true },
    });
    if (!bankAccount) throw new NotFoundException('Bank account not found');

    await this.paymentsMadeService.create(
      organizationId,
      {
        vendorId: bill.vendorId,
        date: transaction.date.toISOString(),
        amount: amount.toFixed(4),
        paymentMode: 'BANK_TRANSFER',
        paidFromAccountId: bankAccount.linkedAccountId,
        reference: transaction.reference ?? undefined,
        allocations: [{ billId, amount: amount.toFixed(4) }],
      },
      { tx },
    );
  }

  /**
   * Books a withdrawal as an expense through the standard expense command (posts Dr expense,
   * Cr the bank account's ledger account). The guarded PENDING -> CREATED transition and the
   * expense commit in one transaction, so a retry cannot create a second expense.
   */
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
    if (transaction.status !== ReconciliationStatus.PENDING) {
      throw new BadRequestException('Already reconciled');
    }
    if (transaction.type !== BankTransactionType.WITHDRAWAL) {
      throw new BadRequestException('Only withdrawals can be recorded as expenses');
    }

    await this.assertBaseCurrencyAccount(organizationId, transaction.bankAccountId);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bankTransaction.updateMany({
        where: { id: transactionId, organizationId, status: ReconciliationStatus.PENDING },
        data: { status: ReconciliationStatus.CREATED },
      });
      if (count === 0) throw new BadRequestException('Already reconciled');

      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: transaction.bankAccountId, organizationId },
        select: { linkedAccountId: true },
      });
      if (!bankAccount) throw new NotFoundException('Bank account not found');

      await this.expensesService.create(
        organizationId,
        {
          date: transaction.date.toISOString(),
          accountId,
          vendorId,
          amount: transaction.amount.abs().toFixed(4),
          paidThroughAccountId: bankAccount.linkedAccountId,
          description: transaction.description ?? undefined,
          reference: transaction.reference ?? undefined,
        },
        { tx },
      );
    });

    return { message: 'Expense created' };
  }

  /**
   * The ledger is single-currency and nothing is converted: a transaction on a bank account whose
   * currency differs from the organization's base currency cannot be posted.
   */
  private async assertBaseCurrencyAccount(
    organizationId: string,
    bankAccountId: string,
  ): Promise<void> {
    const [bankAccount, org] = await Promise.all([
      this.prisma.bankAccount.findFirst({
        where: { id: bankAccountId, organizationId },
        select: { currency: true },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { baseCurrency: true },
      }),
    ]);
    if (!bankAccount) throw new NotFoundException('Bank account not found');
    if (
      bankAccount.currency &&
      org &&
      bankAccount.currency.trim().toUpperCase() !== org.baseCurrency.trim().toUpperCase()
    ) {
      throw new BadRequestException(
        `Bank account currency ${bankAccount.currency} differs from the base currency ${org.baseCurrency}; foreign-currency transactions cannot be posted yet`,
      );
    }
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
}
