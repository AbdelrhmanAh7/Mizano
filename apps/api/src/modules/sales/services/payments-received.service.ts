import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreditNoteType, PaymentMode, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import { CreatePaymentReceivedDto } from '../dto/create-payment-received.dto';
import { PaymentReceivedQueryDto } from '../dto/payment-received-query.dto';
import { RecordInvoicePaymentDto } from '../dto/record-invoice-payment.dto';
import {
  mapDocumentNumberConflict,
  nextPaymentReceivedNumber,
  parseDocumentDate,
  parsePositiveDecimal,
} from '../utils/sales-helpers';
import { InvoicesService, RECEIVABLE_INVOICE_STATUSES } from './invoices.service';

export interface PayInFullOptions {
  depositToAccountId?: string;
  date?: string;
  paymentMode?: PaymentMode;
}

const PAYMENT_VIEW_INCLUDE = {
  customer: { select: { id: true, name: true } },
  allocations: { include: { invoice: { select: { id: true, invoiceNumber: true } } } },
} satisfies Prisma.PaymentReceivedInclude;

@Injectable()
export class PaymentsReceivedService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private journalsService: JournalsService,
  ) {}

  /**
   * Records a customer payment: allocations, invoice balances and the Dr bank / Cr AR journal
   * commit in one transaction. Invoices are row-locked so concurrent payments cannot overpay.
   */
  async create(
    organizationId: string,
    dto: CreatePaymentReceivedDto,
    options: { tx?: Prisma.TransactionClient } = {},
  ) {
    const amount = parsePositiveDecimal(dto.amount, 'amount');
    const allocations = dto.allocations.map((a, i) => ({
      invoiceId: a.invoiceId,
      amount: parsePositiveDecimal(a.amount, `allocations[${i}].amount`),
    }));
    const invoiceIds = allocations.map((a) => a.invoiceId);
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      throw new BadRequestException('Each invoice can only be allocated once per payment');
    }
    const allocated = allocations.reduce((s, a) => s.add(a.amount), new Decimal(0));
    if (!allocated.equals(amount)) {
      throw new BadRequestException('Allocation must equal payment');
    }
    const date = parseDocumentDate(dto.date, 'payment date');

    const run = async (tx: Prisma.TransactionClient) => {
      const customer = await tx.customer.findFirst({
        where: { id: dto.customerId, organizationId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!customer) throw new BadRequestException('Customer not found');

      const depositAccount = await tx.account.findFirst({
        where: { id: dto.depositToAccountId, organizationId, deletedAt: null, isActive: true },
        select: { id: true, name: true },
      });
      if (!depositAccount) throw new BadRequestException('Deposit account not found or inactive');

      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { defaultArAccountId: true },
      });
      if (!org?.defaultArAccountId) {
        throw new BadRequestException(
          'Please configure default Accounts Receivable account in organization settings before recording payments',
        );
      }

      await this.invoicesService.lockInvoices(tx, invoiceIds);
      const invoices = await tx.invoice.findMany({
        where: { id: { in: invoiceIds }, organizationId, deletedAt: null },
      });
      for (const alloc of allocations) {
        const invoice = invoices.find((i) => i.id === alloc.invoiceId);
        if (!invoice) throw new BadRequestException('Invoice not found');
        if (invoice.customerId !== dto.customerId) {
          throw new BadRequestException(
            `Invoice ${invoice.invoiceNumber} belongs to a different customer`,
          );
        }
        if (!RECEIVABLE_INVOICE_STATUSES.includes(invoice.status)) {
          throw new BadRequestException(`Invoice ${invoice.invoiceNumber} is not open for payment`);
        }
        if (alloc.amount.greaterThan(invoice.balanceDue)) {
          throw new BadRequestException(
            `Allocation exceeds the balance due on invoice ${invoice.invoiceNumber}`,
          );
        }
      }

      const paymentNumber = await nextPaymentReceivedNumber(tx, organizationId);
      const payment = await tx.paymentReceived.create({
        data: {
          paymentNumber,
          customerId: dto.customerId,
          date,
          amount,
          paymentMode: dto.paymentMode,
          depositToAccountId: dto.depositToAccountId,
          reference: dto.reference,
          notes: dto.notes,
          organizationId,
          allocations: {
            create: allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })),
          },
        },
        include: PAYMENT_VIEW_INCLUDE,
      });

      for (const invoiceId of invoiceIds) {
        await this.invoicesService.recalculateBalance(tx, invoiceId);
      }

      await this.journalsService.create(
        organizationId,
        {
          date: date.toISOString(),
          reference: `Payment ${paymentNumber}`,
          notes: `Payment received from ${customer.name}${dto.reference ? ` - Ref: ${dto.reference}` : ''}`,
          lines: [
            {
              accountId: dto.depositToAccountId,
              debit: amount.toFixed(4),
              credit: '0',
              description: `Payment ${paymentNumber} - ${depositAccount.name}`,
            },
            {
              accountId: org.defaultArAccountId,
              debit: '0',
              credit: amount.toFixed(4),
              description: `Payment ${paymentNumber} - Accounts Receivable`,
            },
          ],
        },
        { tx, source: { type: JournalSourceType.PAYMENT_RECEIVED, id: payment.id } },
      );

      return payment;
    };

    try {
      return await (options.tx ? run(options.tx) : this.prisma.$transaction(run));
    } catch (error) {
      throw mapDocumentNumberConflict(error, 'Payment');
    }
  }

  /**
   * Records one payment against a single invoice (POST /invoices/:id/record-payment). A thin
   * wrapper over {@link create}: same validation, allocation, numbering and journal.
   */
  async recordForInvoice(organizationId: string, invoiceId: string, dto: RecordInvoicePaymentDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
      select: { id: true, customerId: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const depositToAccountId =
      dto.depositToAccountId ??
      dto.bankAccountId ??
      (await this.defaultDepositAccountId(organizationId));

    return this.create(organizationId, {
      customerId: invoice.customerId,
      date: dto.date,
      amount: dto.amount,
      paymentMode: dto.paymentMode ?? PaymentMode.BANK_TRANSFER,
      depositToAccountId,
      reference: dto.reference,
      notes: dto.notes,
      allocations: [{ invoiceId: invoice.id, amount: dto.amount }],
    });
  }

  /** Receives the full remaining balance of one invoice (used by bulk pay). */
  async payInvoiceInFull(
    organizationId: string,
    invoiceId: string,
    options: PayInFullOptions = {},
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
      select: { id: true, customerId: true, balanceDue: true, status: true, invoiceNumber: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (
      !RECEIVABLE_INVOICE_STATUSES.includes(invoice.status) ||
      invoice.balanceDue.lessThanOrEqualTo(0)
    ) {
      throw new BadRequestException(`Invoice ${invoice.invoiceNumber} is not open for payment`);
    }

    const depositToAccountId =
      options.depositToAccountId ?? (await this.defaultDepositAccountId(organizationId));

    const amount = invoice.balanceDue.toFixed(4);
    return this.create(organizationId, {
      customerId: invoice.customerId,
      date: options.date ?? new Date().toISOString(),
      amount,
      paymentMode: options.paymentMode ?? PaymentMode.BANK_TRANSFER,
      depositToAccountId,
      allocations: [{ invoiceId: invoice.id, amount }],
    });
  }

  bulkPayInvoices(
    organizationId: string,
    invoiceIds: string[],
    options: PayInFullOptions = {},
  ): Promise<BulkResultDto> {
    return runBulk(invoiceIds, (id) => this.payInvoiceInFull(organizationId, id, options));
  }

  /**
   * Voids a payment: soft-deletes it, restores invoice balances from the remaining allocations
   * and posts a linked reversal of its journal. History is never rewritten.
   */
  async void(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.paymentReceived.findFirst({
        where: { id, organizationId, deletedAt: null },
        include: { allocations: true },
      });
      if (!payment) throw new NotFoundException('Payment not found');

      const invoiceIds = payment.allocations.map((a) => a.invoiceId);
      await this.invoicesService.lockInvoices(tx, invoiceIds);

      // Refund credit notes were capped by the money received: voiding this payment must not
      // leave an invoice with more live refunds than live receipts.
      for (const invoiceId of invoiceIds) {
        const remaining = await tx.paymentAllocation.findMany({
          where: {
            invoiceId,
            payment: { organizationId, deletedAt: null, id: { not: id } },
          },
          select: { amount: true },
        });
        const refunded = await tx.creditNote.aggregate({
          where: { organizationId, invoiceId, type: CreditNoteType.REFUND, deletedAt: null },
          _sum: { amount: true },
        });
        const received = remaining.reduce((s, a) => s.add(a.amount), new Decimal(0));
        if ((refunded._sum.amount ?? new Decimal(0)).greaterThan(received)) {
          throw new BadRequestException(
            'Cannot void this payment: refund credit notes on the invoice depend on it; void the refund credit note first',
          );
        }
      }

      const { count } = await tx.paymentReceived.updateMany({
        where: { id, organizationId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException('Payment not found');

      for (const invoiceId of invoiceIds) {
        await this.invoicesService.recalculateBalance(tx, invoiceId);
      }

      const journal = await tx.journal.findFirst({
        where: {
          organizationId,
          sourceType: JournalSourceType.PAYMENT_RECEIVED,
          sourceId: id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!journal) {
        // Legacy payments (created before journals were source-linked) cannot be voided safely:
        // restoring the invoice without reversing Dr bank / Cr AR would unbalance the ledger.
        throw new BadRequestException(
          'This payment has no linked ledger entry; reverse its journal manually before voiding',
        );
      }
      await this.journalsService.reverse(organizationId, journal.id, undefined, {
        tx,
        source: { type: JournalSourceType.PAYMENT_RECEIVED_VOID, id },
      });

      return { message: 'Payment voided successfully' };
    });
  }

  async findAll(organizationId: string, query: PaymentReceivedQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'date',
      sortOrder = 'desc',
      customerId,
      paymentMode,
      dateFrom,
      dateTo,
    } = query;
    const where: Prisma.PaymentReceivedWhereInput = { organizationId, deletedAt: null };

    if (customerId) where.customerId = customerId;
    if (paymentMode) where.paymentMode = paymentMode;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [payments, total] = await Promise.all([
      this.prisma.paymentReceived.findMany({
        where,
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.paymentReceived.count({ where }),
    ]);

    return { data: payments, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, sortBy = 'date', sortOrder = 'desc' } = query;

    const where: Prisma.PaymentReceivedWhereInput = { organizationId, deletedAt: null };

    return cursorPaginate(
      this.prisma.paymentReceived,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
        include: {
          customer: { select: { id: true, name: true } },
        },
      },
    );
  }

  /** Voided payments stay readable (read-only, `deletedAt` set); lists exclude them. */
  async findOne(organizationId: string, id: string) {
    const payment = await this.prisma.paymentReceived.findFirst({
      where: { id, organizationId },
      include: {
        customer: true,
        allocations: { include: { invoice: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  // === Bulk Operations — same command as the single-record route ===

  bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.void(organizationId, id));
  }

  /** Organization default bank account, falling back to the default cash account. */
  private async defaultDepositAccountId(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { defaultBankAccountId: true, defaultCashAccountId: true },
    });
    const accountId = org?.defaultBankAccountId ?? org?.defaultCashAccountId;
    if (!accountId) {
      throw new BadRequestException(
        'Choose a deposit account or configure a default bank account in organization settings',
      );
    }
    return accountId;
  }
}
