import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentsReceivedService } from '../../sales/services/payments-received.service';
import { RECEIVABLE_INVOICE_STATUSES } from '../../sales/services/invoices.service';
import { PAYABLE_BILL_STATUSES } from '../../purchases/services/bills.service';
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

/** At most this many open documents are scored per transaction (newest first). */
const MATCH_CANDIDATE_LIMIT = 200;
/** A balance up to 5 % above the transaction still reads as the same payment. */
const MATCH_NEAR_RATIO = new Decimal('1.05');
const DAY_MS = 86_400_000;

/**
 * Documents a bank line can settle: dated from a year before it to a week after it (a document is
 * sometimes entered a few days after the money moved).
 */
function matchWindow(transactionDate: Date): { gte: Date; lte: Date } {
  return {
    gte: new Date(transactionDate.getTime() - 365 * DAY_MS),
    lte: new Date(transactionDate.getTime() + 7 * DAY_MS),
  };
}

/**
 * Words of the bank line's reference and description that could be a document number. Both the
 * named-candidate query and the reference score use them, so every 100 % match is fetched.
 */
function referenceTokens(
  transaction: Pick<BankTransaction, 'reference' | 'description'>,
): string[] {
  const text = `${transaction.reference ?? ''} ${transaction.description ?? ''}`;
  // Any character outside a document number (letters, digits, - / _) separates words.
  const words = text.split(/[^\p{L}\p{N}\-/_]+/u).filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, 20);
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}

/** An empty account currency means the base currency (the schema default). */
function sameCurrency(accountCurrency: string | null, baseCurrency: string | null): boolean {
  if (!accountCurrency || !baseCurrency) return true;
  return accountCurrency.trim().toUpperCase() === baseCurrency.trim().toUpperCase();
}

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

  /**
   * Match suggestions for the latest pending transactions of one bank account. Only documents a
   * confirmation could actually settle are offered (#586): posted and open (never draft, void or
   * deleted), with an open balance that covers the transaction, dated within the match window.
   * A bank account outside the base currency gets none, since confirming would be refused.
   * Amounts compare as exact decimals. A person always confirms; nothing is matched here.
   */
  async getSuggestions(organizationId: string, bankAccountId: string) {
    const pendingTransactions = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId, organizationId, status: ReconciliationStatus.PENDING },
      orderBy: { date: 'desc' },
      take: 50,
    });
    const postable =
      pendingTransactions.length > 0 &&
      (await this.isBaseCurrencyAccount(organizationId, bankAccountId));

    const suggestions = [];
    for (const transaction of pendingTransactions) {
      const matches = postable ? await this.findMatches(organizationId, transaction) : [];
      suggestions.push({ transaction, matches });
    }
    return suggestions;
  }

  private async findMatches(organizationId: string, transaction: BankTransaction) {
    // Exact decimals end to end: a withdrawal may be stored negative, confirm posts its absolute.
    const amount = transaction.amount.abs();
    if (amount.isZero()) return [];
    // Confirming allocates the whole amount, so the open balance must cover it; within 5 % above
    // still reads as the same payment.
    const nearCeiling = amount.mul(MATCH_NEAR_RATIO);
    const dated = matchWindow(transaction.date);
    const tokens = referenceTokens(transaction);
    const matches: ReconciliationMatch[] = [];
    const amountScore = (balanceDue: Decimal): number => {
      if (balanceDue.equals(amount)) return 90;
      return balanceDue.lessThanOrEqualTo(nearCeiling) ? 50 : 0;
    };

    if (transaction.type === BankTransactionType.DEPOSIT) {
      const where = {
        organizationId,
        deletedAt: null,
        status: { in: RECEIVABLE_INVOICE_STATUSES },
        balanceDue: { gte: amount },
        date: dated,
      };
      const query = {
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' as const },
        take: MATCH_CANDIDATE_LIMIT,
      };
      // Separate pools in priority order, each bounded, so weaker candidates never crowd out
      // stronger ones: a named number, then exact amount, then near amounts, then the newest open
      // ones for name-only matches.
      const invoices = uniqueById(
        (
          await Promise.all([
            this.prisma.invoice.findMany({
              ...query,
              where: { ...where, invoiceNumber: { in: tokens } },
            }),
            this.prisma.invoice.findMany({ ...query, where: { ...where, balanceDue: amount } }),
            this.prisma.invoice.findMany({
              ...query,
              where: { ...where, balanceDue: { gt: amount, lte: nearCeiling } },
            }),
            this.prisma.invoice.findMany({ ...query, where }),
          ])
        ).flat(),
      );

      for (const invoice of invoices) {
        let confidence = amountScore(invoice.balanceDue);

        // Reference matching: the number is a word of the reference or description.
        if (tokens.includes(invoice.invoiceNumber)) confidence = 100;

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
      const where = {
        organizationId,
        deletedAt: null,
        status: { in: PAYABLE_BILL_STATUSES },
        balanceDue: { gte: amount },
        date: dated,
      };
      const query = {
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' as const },
        take: MATCH_CANDIDATE_LIMIT,
      };
      const bills = uniqueById(
        (
          await Promise.all([
            // Bills score no near amounts: a named number, then exact amount, then the newest.
            this.prisma.bill.findMany({
              ...query,
              where: { ...where, billNumber: { in: tokens } },
            }),
            this.prisma.bill.findMany({ ...query, where: { ...where, balanceDue: amount } }),
            this.prisma.bill.findMany({ ...query, where }),
          ])
        ).flat(),
      );

      for (const bill of bills) {
        let confidence = bill.balanceDue.equals(amount) ? 90 : 0;
        if (tokens.includes(bill.billNumber)) confidence = 100;
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
    const { bankAccount, baseCurrency } = await this.accountCurrency(organizationId, bankAccountId);
    if (!bankAccount) throw new NotFoundException('Bank account not found');
    if (!sameCurrency(bankAccount.currency, baseCurrency)) {
      throw new BadRequestException(
        `Bank account currency ${bankAccount.currency} differs from the base currency ${baseCurrency}; foreign-currency transactions cannot be posted yet`,
      );
    }
  }

  /** The bank account belongs to the organization and is kept in its base currency. */
  private async isBaseCurrencyAccount(
    organizationId: string,
    bankAccountId: string,
  ): Promise<boolean> {
    const { bankAccount, baseCurrency } = await this.accountCurrency(organizationId, bankAccountId);
    return !!bankAccount && sameCurrency(bankAccount.currency, baseCurrency);
  }

  private async accountCurrency(organizationId: string, bankAccountId: string) {
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
    return { bankAccount, baseCurrency: org?.baseCurrency ?? null };
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
