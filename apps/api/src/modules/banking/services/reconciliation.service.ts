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
  ExpenseStatus,
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
  return [...new Set(words)].slice(0, 100);
}

/**
 * Pools of documents whose party name contains the bank line's payee (the same case-insensitive
 * rule the score uses): exact amount, near amount (invoices only), then any amount. Together
 * with the named, exact, near and newest pools every score level has its own bounded pool.
 * None without a payee.
 */
function payeePools(
  payee: string | null,
  amount: Decimal,
  nearCeiling?: Decimal,
): Array<{
  amount: { balanceDue?: Decimal | { gt: Decimal; lte: Decimal } };
  party: { name: { contains: string; mode: 'insensitive' } };
}> {
  if (!payee) return [];
  const party = { name: { contains: payee, mode: 'insensitive' as const } };
  return [
    { amount: { balanceDue: amount }, party },
    // Invoices also score near amounts, so they get a near-amount payee pool.
    ...(nearCeiling ? [{ amount: { balanceDue: { gt: amount, lte: nearCeiling } }, party }] : []),
    { amount: {}, party },
  ];
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}

/**
 * Same currency, ignoring case. A missing currency on either side is not treated as a mismatch
 * (the rule confirm has always used); note new bank accounts default to USD, not the base currency.
 */
function sameCurrency(accountCurrency: string | null, baseCurrency: string | null): boolean {
  if (!accountCurrency || !baseCurrency) return true;
  return accountCurrency.trim().toUpperCase() === baseCurrency.trim().toUpperCase();
}

/** A recorded payment within this many days of the bank line can be the same money (#635). */
const PAYMENT_WINDOW_DAYS = 45;

/**
 * What a bank line can be matched to: an open document to settle, or a payment or paid expense
 * already booked to this bank (#635, #682).
 */
export const MATCH_ENTITY_TYPES = [
  'invoice',
  'bill',
  'payment_received',
  'payment_made',
  'expense',
] as const;
export type MatchEntityType = (typeof MATCH_ENTITY_TYPES)[number];

export interface ReconciliationMatch {
  type: MatchEntityType;
  entity: unknown;
  confidence: number;
}

/** Days between two dates, ignoring the time of day. */
function daysApart(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / DAY_MS));
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

    const linkedAccountId = postable
      ? await this.linkedLedgerAccount(organizationId, bankAccountId)
      : null;

    const suggestions = [];
    for (const transaction of pendingTransactions) {
      const matches = postable
        ? [
            // A payment already booked to this bank comes first: matching it posts nothing (#635).
            ...(linkedAccountId
              ? await this.findRecordedPayments(organizationId, transaction, linkedAccountId)
              : []),
            ...(linkedAccountId && transaction.type === BankTransactionType.WITHDRAWAL
              ? await this.findRecordedExpenses(organizationId, transaction, linkedAccountId)
              : []),
            ...(await this.findMatches(organizationId, transaction)),
          ]
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5)
        : [];
      suggestions.push({ transaction, matches });
    }
    return suggestions;
  }

  private async linkedLedgerAccount(
    organizationId: string,
    bankAccountId: string,
  ): Promise<string | null> {
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId },
      select: { linkedAccountId: true },
    });
    return bankAccount?.linkedAccountId ?? null;
  }

  /**
   * Payments already in the books that this bank line may be (#635): same direction, booked to
   * this bank's ledger account, the exact amount, not voided and not yet linked to another line,
   * dated within PAYMENT_WINDOW_DAYS (or named on the line). Matching one posts nothing.
   */
  private async findRecordedPayments(
    organizationId: string,
    transaction: BankTransaction,
    linkedAccountId: string,
  ): Promise<ReconciliationMatch[]> {
    const amount = transaction.amount.abs();
    if (amount.isZero()) return [];
    const tokens = referenceTokens(transaction);
    const window = PAYMENT_WINDOW_DAYS * DAY_MS;
    const dated = {
      gte: new Date(transaction.date.getTime() - window),
      lte: new Date(transaction.date.getTime() + window),
    };
    const named = [{ paymentNumber: { in: tokens } }, { reference: { in: tokens } }];
    const base = { organizationId, deletedAt: null, bankTransactionId: null, amount };
    const query = { orderBy: { date: 'desc' as const }, take: MATCH_CANDIDATE_LIMIT };
    const payee = transaction.payee?.toLowerCase() ?? '';

    /** The number or reference named on the line is certain; otherwise the exact amount, nearer is better. */
    const score = (p: {
      paymentNumber: string;
      reference: string | null;
      date: Date;
      partyName: string;
    }): number => {
      if (tokens.includes(p.paymentNumber) || (p.reference && tokens.includes(p.reference))) {
        return 100;
      }
      let confidence = 90 - Math.min(20, Math.floor(daysApart(p.date, transaction.date) / 3));
      if (payee && p.partyName.toLowerCase().includes(payee)) confidence += 30;
      return Math.min(99, confidence);
    };

    // Separate bounded pools, strongest first, so newer weaker candidates never crowd out a payment
    // named on the line or one of the payee: named (whatever its date), payee, then the date window.
    const party = payee ? { name: { contains: payee, mode: 'insensitive' as const } } : null;
    if (transaction.type === BankTransactionType.DEPOSIT) {
      const where = { ...base, depositToAccountId: linkedAccountId };
      const include = { customer: { select: { id: true, name: true } } };
      const pools = [
        { ...where, OR: named },
        ...(party ? [{ ...where, date: dated, customer: party }] : []),
        { ...where, date: dated },
      ];
      const payments = uniqueById(
        (
          await Promise.all(
            pools.map((w) => this.prisma.paymentReceived.findMany({ ...query, where: w, include })),
          )
        ).flat(),
      );
      return payments.map((payment) => ({
        type: 'payment_received' as const,
        entity: payment,
        confidence: score({ ...payment, partyName: payment.customer.name }),
      }));
    }
    const where = { ...base, paidFromAccountId: linkedAccountId };
    const include = { vendor: { select: { id: true, name: true } } };
    const pools = [
      { ...where, OR: named },
      ...(party ? [{ ...where, date: dated, vendor: party }] : []),
      { ...where, date: dated },
    ];
    const payments = uniqueById(
      (
        await Promise.all(
          pools.map((w) => this.prisma.paymentMade.findMany({ ...query, where: w, include })),
        )
      ).flat(),
    );
    return payments.map((payment) => ({
      type: 'payment_made' as const,
      entity: payment,
      confidence: score({ ...payment, partyName: payment.vendor.name }),
    }));
  }

  /**
   * Expenses already paid from this bank that this withdrawal may be (#682): posted, not voided,
   * paid through this bank's ledger account, total (net + VAT) equal to the line, dated within
   * PAYMENT_WINDOW_DAYS (or whose reference is named on the line), and not linked to another line.
   * Matching one posts nothing.
   */
  private async findRecordedExpenses(
    organizationId: string,
    transaction: BankTransaction,
    linkedAccountId: string,
  ): Promise<ReconciliationMatch[]> {
    const amount = transaction.amount.abs();
    if (amount.isZero()) return [];
    const tokens = referenceTokens(transaction);
    const window = PAYMENT_WINDOW_DAYS * DAY_MS;
    const base = {
      organizationId,
      deletedAt: null,
      status: ExpenseStatus.POSTED,
      paidThroughAccountId: linkedAccountId,
    };
    const query = {
      orderBy: { date: 'desc' as const },
      take: MATCH_CANDIDATE_LIMIT,
      include: { vendor: { select: { id: true, name: true } } },
    };
    // The total is net + VAT, which no column holds, so pools are bounded and the amount is
    // compared exactly afterwards: the reference named on the line (any date), then the window.
    const pools = [
      { ...base, reference: { in: tokens } },
      {
        ...base,
        date: {
          gte: new Date(transaction.date.getTime() - window),
          lte: new Date(transaction.date.getTime() + window),
        },
      },
    ];
    const candidates = uniqueById(
      (await Promise.all(pools.map((where) => this.prisma.expense.findMany({ ...query, where }))))
        .flat()
        .filter((e) => e.amount.add(e.taxAmount).equals(amount)),
    );
    if (candidates.length === 0) return [];

    const linked = await this.prisma.bankTransaction.findMany({
      where: {
        organizationId,
        matchedEntityType: 'expense',
        matchedEntityId: { in: candidates.map((e) => e.id) },
      },
      select: { matchedEntityId: true },
    });
    const taken = new Set(linked.map((l) => l.matchedEntityId));
    const payee = transaction.payee?.toLowerCase() ?? '';
    const description = transaction.description?.trim().toLowerCase() ?? '';

    return candidates
      .filter((e) => !taken.has(e.id))
      .map((expense) => {
        let confidence: number;
        if (expense.reference && tokens.includes(expense.reference)) {
          confidence = 100;
        } else {
          confidence = 90 - Math.min(20, Math.floor(daysApart(expense.date, transaction.date) / 3));
          if (payee && expense.vendor?.name.toLowerCase().includes(payee)) confidence += 30;
          if (description && expense.description?.trim().toLowerCase() === description) {
            confidence += 30;
          }
          confidence = Math.min(99, confidence);
        }
        return {
          type: 'expense' as const,
          entity: { ...expense, total: expense.amount.add(expense.taxAmount).toFixed(4) },
          confidence,
        };
      });
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
      // stronger ones: a named number, the payee (with and without the exact amount), the exact
      // amount, near amounts, then the newest open ones.
      const invoices = uniqueById(
        (
          await Promise.all([
            this.prisma.invoice.findMany({
              ...query,
              // A document named on the bank line is offered whatever its age.
              where: { ...where, date: undefined, invoiceNumber: { in: tokens } },
            }),
            ...payeePools(transaction.payee, amount, nearCeiling).map((extra) =>
              this.prisma.invoice.findMany({
                ...query,
                where: { ...where, ...extra.amount, customer: extra.party },
              }),
            ),
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
            // Bills score no near amounts: a named number, the payee, the exact amount, the newest.
            this.prisma.bill.findMany({
              ...query,
              // A document named on the bank line is offered whatever its age.
              where: { ...where, date: undefined, billNumber: { in: tokens } },
            }),
            ...payeePools(transaction.payee, amount).map((extra) =>
              this.prisma.bill.findMany({
                ...query,
                where: { ...where, ...extra.amount, vendor: extra.party },
              }),
            ),
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

    return matches;
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

    if (!(MATCH_ENTITY_TYPES as readonly string[]).includes(entityType)) {
      throw new BadRequestException(
        'entityType must be invoice, bill, payment_received, payment_made or expense',
      );
    }

    if (entityType === 'expense') {
      if (transaction.type !== BankTransactionType.WITHDRAWAL) {
        throw new BadRequestException('Only withdrawals can be matched to an expense');
      }
      await this.assertBaseCurrencyAccount(organizationId, transaction.bankAccountId);
      await this.linkRecordedExpense(organizationId, transaction, entityId);
      return { message: 'Reconciliation confirmed' };
    }

    // Money direction must agree with the entity: a deposit settles an invoice or is a received
    // payment, a withdrawal pays a bill or is a payment made. A mismatch would post (or link) the
    // opposite entry, so it is rejected before anything is written.
    const incoming = entityType === 'invoice' || entityType === 'payment_received';
    const expected = incoming ? BankTransactionType.DEPOSIT : BankTransactionType.WITHDRAWAL;
    if (transaction.type !== expected) {
      throw new BadRequestException(
        incoming
          ? 'Only deposits can be matched to a customer payment'
          : 'Only withdrawals can be matched to a vendor payment',
      );
    }
    await this.assertBaseCurrencyAccount(organizationId, transaction.bankAccountId);

    if (entityType === 'payment_received' || entityType === 'payment_made') {
      await this.linkRecordedPayment(organizationId, transaction, entityType, entityId);
      return { message: 'Reconciliation confirmed' };
    }

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

      // The new payment is this line's money, so it is linked to it and never offered again.
      if (entityType === 'invoice') {
        const payment = await this.createPaymentForInvoice(
          tx,
          organizationId,
          entityId,
          amount,
          transaction,
        );
        await tx.paymentReceived.updateMany({
          where: { id: payment.id, organizationId },
          data: { bankTransactionId: transactionId },
        });
      } else {
        const payment = await this.createPaymentForBill(
          tx,
          organizationId,
          entityId,
          amount,
          transaction,
        );
        await tx.paymentMade.updateMany({
          where: { id: payment.id, organizationId },
          data: { bankTransactionId: transactionId },
        });
      }
    });

    return { message: 'Reconciliation confirmed' };
  }

  /**
   * Reconciles a bank line with a payment that is already in the books (#635): both are marked as
   * reconciled with each other and nothing is posted. The payment must be the same money: same
   * direction (checked by the caller), booked to this bank's ledger account, the exact amount, not
   * voided and not linked to another line. Both guarded updates run in one transaction, so a
   * retried or concurrent confirmation cannot link a line or a payment twice.
   */
  private async linkRecordedPayment(
    organizationId: string,
    transaction: BankTransaction,
    entityType: 'payment_received' | 'payment_made',
    paymentId: string,
  ): Promise<void> {
    const amount = transaction.amount.abs();
    await this.prisma.$transaction(async (tx) => {
      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: transaction.bankAccountId, organizationId },
        select: { linkedAccountId: true },
      });
      if (!bankAccount) throw new NotFoundException('Bank account not found');

      // Lock order shared with voiding a payment: the payment row first, then the bank line. The
      // reads below then see the payment as any concurrent void or link left it.
      if (entityType === 'payment_received') {
        await tx.$queryRaw`SELECT id FROM "payments_received" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT id FROM "payments_made" WHERE id = ${paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      }
      const payment =
        entityType === 'payment_received'
          ? await tx.paymentReceived
              .findFirst({
                where: { id: paymentId, organizationId, deletedAt: null },
                select: { amount: true, depositToAccountId: true, bankTransactionId: true },
              })
              .then((p) => p && { ...p, accountId: p.depositToAccountId })
          : await tx.paymentMade
              .findFirst({
                where: { id: paymentId, organizationId, deletedAt: null },
                select: { amount: true, paidFromAccountId: true, bankTransactionId: true },
              })
              .then((p) => p && { ...p, accountId: p.paidFromAccountId });
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.accountId !== bankAccount.linkedAccountId) {
        throw new BadRequestException('This payment was recorded to a different bank account');
      }
      if (!payment.amount.equals(amount)) {
        throw new BadRequestException('The payment amount differs from the bank line');
      }
      if (payment.bankTransactionId) {
        throw new BadRequestException('This payment is already matched to another bank line');
      }

      const { count } = await tx.bankTransaction.updateMany({
        where: { id: transaction.id, organizationId, status: ReconciliationStatus.PENDING },
        data: {
          status: ReconciliationStatus.MATCHED,
          matchedEntityType: entityType,
          matchedEntityId: paymentId,
        },
      });
      if (count === 0) throw new BadRequestException('Already reconciled');

      const paymentWhere = {
        id: paymentId,
        organizationId,
        deletedAt: null,
        bankTransactionId: null,
      };
      const linked =
        entityType === 'payment_received'
          ? await tx.paymentReceived.updateMany({
              where: paymentWhere,
              data: { bankTransactionId: transaction.id },
            })
          : await tx.paymentMade.updateMany({
              where: paymentWhere,
              data: { bankTransactionId: transaction.id },
            });
      if (linked.count === 0) {
        throw new BadRequestException('This payment is already matched to another bank line');
      }
    });
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
    return this.paymentsReceivedService.create(
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

    return this.paymentsMadeService.create(
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
   * Reconciles a withdrawal with an expense already paid from this bank (#682): the line is marked
   * as matched to it and nothing is posted. The expense must be the same money: posted, not
   * voided, paid through this bank's ledger account, total (net + VAT) equal to the line, and not
   * linked to another line. The expense row is locked first (the order voiding an expense also
   * takes), so two lines cannot link the same expense and a concurrent void is never missed.
   */
  private async linkRecordedExpense(
    organizationId: string,
    transaction: BankTransaction,
    expenseId: string,
  ): Promise<void> {
    const amount = transaction.amount.abs();
    await this.prisma.$transaction(async (tx) => {
      const bankAccount = await tx.bankAccount.findFirst({
        where: { id: transaction.bankAccountId, organizationId },
        select: { linkedAccountId: true },
      });
      if (!bankAccount) throw new NotFoundException('Bank account not found');

      await tx.$queryRaw`SELECT id FROM "expenses" WHERE id = ${expenseId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      const expense = await tx.expense.findFirst({
        where: { id: expenseId, organizationId, deletedAt: null },
        select: { amount: true, taxAmount: true, status: true, paidThroughAccountId: true },
      });
      if (!expense) throw new NotFoundException('Expense not found');
      if (expense.status !== ExpenseStatus.POSTED) {
        throw new BadRequestException('Only a posted expense can be matched to a bank line');
      }
      if (expense.paidThroughAccountId !== bankAccount.linkedAccountId) {
        throw new BadRequestException('This expense was paid from a different account');
      }
      if (!expense.amount.add(expense.taxAmount).equals(amount)) {
        throw new BadRequestException('The expense amount differs from the bank line');
      }
      const other = await tx.bankTransaction.findFirst({
        where: { organizationId, matchedEntityType: 'expense', matchedEntityId: expenseId },
        select: { id: true },
      });
      if (other) {
        throw new BadRequestException('This expense is already matched to another bank line');
      }

      const { count } = await tx.bankTransaction.updateMany({
        where: { id: transaction.id, organizationId, status: ReconciliationStatus.PENDING },
        data: {
          status: ReconciliationStatus.MATCHED,
          matchedEntityType: 'expense',
          matchedEntityId: expenseId,
        },
      });
      if (count === 0) throw new BadRequestException('Already reconciled');
    });
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
