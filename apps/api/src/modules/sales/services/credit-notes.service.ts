import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreditNoteType, InvoiceStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import { CreateCreditNoteDto } from '../dto/create-credit-note.dto';
import { CreditNoteQueryDto } from '../dto/credit-note-query.dto';
import { UpdateCreditNoteDto } from '../dto/update-credit-note.dto';
import {
  assertMoneyFits,
  bankCashAccountWhere,
  mapDocumentNumberConflict,
  nextCreditNoteNumber,
  parseDocumentDate,
  parsePositiveDecimal,
} from '../utils/sales-helpers';
import { InvoicesService, RECEIVABLE_INVOICE_STATUSES } from './invoices.service';

const CREDIT_NOTE_VIEW_INCLUDE = {
  customer: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
  appliedToInvoice: { select: { id: true, invoiceNumber: true } },
} satisfies Prisma.CreditNoteInclude;

@Injectable()
export class CreditNotesService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private journalsService: JournalsService,
  ) {}

  /**
   * Issues a credit note and posts its journal in one transaction:
   *   Dr Sales Returns (amount - VAT) / Dr VAT Payable (VAT) / Cr AR (APPLY_TO_INVOICE)
   *   or Cr refund bank/cash account (REFUND, which never touches AR).
   * VAT is the credit's proportional share of the invoice VAT, rounded to 4 decimals.
   */
  async create(organizationId: string, dto: CreateCreditNoteDto) {
    const amount = parsePositiveDecimal(dto.amount, 'amount');
    assertMoneyFits(amount, 'amount');
    const date = parseDocumentDate(dto.date, 'credit note date');

    const isApply = dto.type === CreditNoteType.APPLY_TO_INVOICE;
    if (isApply && dto.refundAccountId) {
      throw new BadRequestException('A refund account is only valid for REFUND credit notes');
    }
    if (!isApply && dto.appliedToInvoiceId) {
      throw new BadRequestException(
        'Only APPLY_TO_INVOICE credit notes can be applied to an invoice',
      );
    }
    if (!isApply && !dto.refundAccountId) {
      throw new BadRequestException('Choose the bank or cash account the refund is paid from');
    }
    const applyTargetId = isApply ? (dto.appliedToInvoiceId ?? dto.invoiceId) : undefined;

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Every referenced invoice must be this organization's before any lock is taken.
        const invoiceIds = [...new Set([dto.invoiceId, ...(applyTargetId ? [applyTargetId] : [])])];
        const owned = await tx.invoice.count({
          where: { id: { in: invoiceIds }, organizationId, deletedAt: null },
        });
        if (owned !== invoiceIds.length) throw new BadRequestException('Invoice not found');

        // Serialize with payments, voids and other credit notes on the same invoice(s), then
        // read the rows fresh so balances and statuses cannot be stale.
        await this.invoicesService.lockInvoices(tx, invoiceIds);
        const invoice = await tx.invoice.findFirst({
          where: { id: dto.invoiceId, organizationId, deletedAt: null },
        });
        if (!invoice) throw new BadRequestException('Invoice not found');
        if (invoice.customerId !== dto.customerId) {
          throw new BadRequestException('Invoice does not belong to this customer');
        }
        if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.VOID) {
          throw new BadRequestException('Credit notes can only be issued against a sent invoice');
        }

        const existing = await tx.creditNote.aggregate({
          where: { organizationId, invoiceId: dto.invoiceId, deletedAt: null },
          _sum: { amount: true },
        });
        const alreadyCredited = existing._sum.amount ?? new Decimal(0);
        if (alreadyCredited.add(amount).greaterThan(invoice.grandTotal)) {
          throw new BadRequestException(
            `Credit notes would exceed the total of invoice ${invoice.invoiceNumber}`,
          );
        }

        let refundAccountId: string | undefined;
        if (!isApply) {
          // Only a bank/cash asset account can pay a refund (revenue, expense, liability... are
          // rejected); see bankCashAccountWhere for the authoritative rule.
          const refundAccount = await tx.account.findFirst({
            where: {
              AND: [{ id: dto.refundAccountId }, await bankCashAccountWhere(tx, organizationId)],
            },
            select: { id: true },
          });
          if (!refundAccount) {
            throw new BadRequestException(
              'Refund account must be an active bank or cash account of this organization',
            );
          }
          refundAccountId = refundAccount.id;
          await this.assertRefundCovered(tx, organizationId, invoice.id, amount);
        }

        if (applyTargetId) {
          const target =
            applyTargetId === invoice.id
              ? invoice
              : await tx.invoice.findFirst({
                  where: { id: applyTargetId, organizationId, deletedAt: null },
                });
          if (!target) throw new BadRequestException('Invoice not found');
          this.assertApplicable(target, dto.customerId, amount);
        }

        const org = await tx.organization.findUnique({
          where: { id: organizationId },
          select: {
            defaultArAccountId: true,
            defaultSalesReturnsAccountId: true,
            defaultVatPayableAccountId: true,
          },
        });
        if (!org?.defaultSalesReturnsAccountId || (isApply && !org.defaultArAccountId)) {
          throw new BadRequestException(
            'Please configure default accounts (Accounts Receivable and Sales Returns) in organization settings before creating credit notes',
          );
        }

        const tax = amount
          .mul(invoice.taxAmount)
          .div(invoice.grandTotal)
          .toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        if (tax.greaterThan(0) && !org.defaultVatPayableAccountId) {
          throw new BadRequestException(
            'Please configure the default VAT Payable account in organization settings before crediting taxed invoices',
          );
        }
        const net = amount.sub(tax);

        const creditNoteNumber = await nextCreditNoteNumber(tx, organizationId);
        const creditNote = await tx.creditNote.create({
          data: {
            creditNoteNumber,
            customerId: dto.customerId,
            invoiceId: dto.invoiceId,
            date,
            reason: dto.reason,
            amount,
            type: dto.type,
            appliedToInvoiceId: applyTargetId,
            // A REFUND pays the customer out in this same transaction, so it is refunded as of
            // the credit note's own document date (the date its journal is posted on).
            refundedAt: isApply ? undefined : date,
            organizationId,
          },
          include: CREDIT_NOTE_VIEW_INCLUDE,
        });

        if (applyTargetId) await this.invoicesService.recalculateBalance(tx, applyTargetId);

        const journalLines = [
          {
            accountId: org.defaultSalesReturnsAccountId,
            debit: net.toFixed(4),
            credit: '0',
            description: `Credit Note ${creditNoteNumber} - Sales Returns`,
          },
        ];
        if (tax.greaterThan(0)) {
          journalLines.push({
            accountId: org.defaultVatPayableAccountId as string,
            debit: tax.toFixed(4),
            credit: '0',
            description: `Credit Note ${creditNoteNumber} - VAT Payable`,
          });
        }
        journalLines.push({
          accountId: (isApply ? org.defaultArAccountId : refundAccountId) as string,
          debit: '0',
          credit: amount.toFixed(4),
          description: isApply
            ? `Credit Note ${creditNoteNumber} - Accounts Receivable`
            : `Credit Note ${creditNoteNumber} - Refund`,
        });

        await this.journalsService.create(
          organizationId,
          {
            date: date.toISOString(),
            reference: `Credit Note ${creditNoteNumber}`,
            notes: `Accounting entry for credit note ${creditNoteNumber} - ${dto.reason}`,
            lines: journalLines,
          },
          { tx, source: { type: JournalSourceType.CREDIT_NOTE, id: creditNote.id } },
        );

        return creditNote;
      });
    } catch (error) {
      throw mapDocumentNumberConflict(error, 'Credit note');
    }
  }

  /**
   * Accounts a REFUND can be paid from, for users who hold sales.create but not accounting.view.
   * Same rule that create() enforces (see bankCashAccountWhere).
   */
  async refundAccounts(
    organizationId: string,
  ): Promise<{ id: string; code: string; name: string; currency: string }[]> {
    return this.prisma.account.findMany({
      where: await bankCashAccountWhere(this.prisma, organizationId),
      select: { id: true, code: true, name: true, currency: true },
      orderBy: { code: 'asc' },
    });
  }

  async findAll(organizationId: string, query: CreditNoteQueryDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc', customerId } = query;
    const where: Prisma.CreditNoteWhereInput = { organizationId, deletedAt: null };
    if (customerId) where.customerId = customerId;

    const [creditNotes, total] = await Promise.all([
      this.prisma.creditNote.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.creditNote.count({ where }),
    ]);

    return {
      data: creditNotes,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, sortBy = 'date', sortOrder = 'desc' } = query;

    const where: Prisma.CreditNoteWhereInput = { organizationId, deletedAt: null };

    return cursorPaginate(
      this.prisma.creditNote,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
        include: {
          customer: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      },
    );
  }

  async findOne(organizationId: string, id: string) {
    const creditNote = await this.prisma.creditNote.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { customer: true, invoice: true, appliedToInvoice: true },
    });
    if (!creditNote) throw new NotFoundException('Credit note not found');
    return creditNote;
  }

  /** Posted credit notes are immutable; only the reason text can be corrected. */
  async update(organizationId: string, id: string, dto: UpdateCreditNoteDto) {
    const { count } = await this.prisma.creditNote.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: dto.reason !== undefined ? { reason: dto.reason } : { updatedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Credit note not found');
    return this.prisma.creditNote.findFirstOrThrow({
      where: { id, organizationId },
      include: CREDIT_NOTE_VIEW_INCLUDE,
    });
  }

  /**
   * Voids a credit note: soft-deletes it, restores the applied invoice's balance and posts a
   * linked reversal of its journal. History is never rewritten.
   */
  async void(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const creditNote = await tx.creditNote.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true, appliedToInvoiceId: true },
      });
      if (!creditNote) throw new NotFoundException('Credit note not found');

      const lockIds = creditNote.appliedToInvoiceId ? [creditNote.appliedToInvoiceId] : [];
      await this.invoicesService.lockInvoices(tx, lockIds);

      const { count } = await tx.creditNote.updateMany({
        where: { id, organizationId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (count === 0) throw new NotFoundException('Credit note not found');

      if (creditNote.appliedToInvoiceId) {
        await this.invoicesService.recalculateBalance(tx, creditNote.appliedToInvoiceId);
      }

      const journal = await tx.journal.findFirst({
        where: {
          organizationId,
          sourceType: JournalSourceType.CREDIT_NOTE,
          sourceId: id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!journal) {
        // Legacy credit notes (created before journals were source-linked) cannot be voided
        // safely: restoring the invoice without reversing the credit would unbalance AR.
        throw new BadRequestException(
          'This credit note has no linked ledger entry; reverse its journal manually before voiding',
        );
      }
      await this.journalsService.reverse(organizationId, journal.id, undefined, {
        tx,
        source: { type: JournalSourceType.CREDIT_NOTE_VOID, id },
      });

      return { message: 'Credit note voided successfully' };
    });
  }

  /** Credit notes are never hard-deleted: deleting one voids it (reversal + restored balance). */
  remove(organizationId: string, id: string) {
    return this.void(organizationId, id);
  }

  /**
   * Applies a not-yet-applied APPLY_TO_INVOICE credit note to an invoice's balance. The AR
   * credit was already posted when the note was created, so no journal is written here.
   */
  async apply(organizationId: string, id: string, invoiceId: string) {
    return this.prisma.$transaction(async (tx) => {
      const creditNote = await tx.creditNote.findFirst({
        where: { id, organizationId, deletedAt: null },
      });
      if (!creditNote) throw new NotFoundException('Credit note not found');
      if (creditNote.type !== CreditNoteType.APPLY_TO_INVOICE) {
        throw new BadRequestException('Only APPLY_TO_INVOICE credit notes can be applied');
      }
      if (creditNote.appliedToInvoiceId) {
        throw new BadRequestException('Credit note is already applied to an invoice');
      }

      const owned = await tx.invoice.count({
        where: { id: invoiceId, organizationId, deletedAt: null },
      });
      if (owned === 0) throw new BadRequestException('Invoice not found');
      await this.invoicesService.lockInvoices(tx, [invoiceId]);
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, organizationId, deletedAt: null },
      });
      if (!invoice) throw new BadRequestException('Invoice not found');
      this.assertApplicable(invoice, creditNote.customerId, creditNote.amount);

      // Guarded: only one concurrent apply can attach the note.
      const { count } = await tx.creditNote.updateMany({
        where: {
          id,
          organizationId,
          deletedAt: null,
          appliedToInvoiceId: null,
          type: CreditNoteType.APPLY_TO_INVOICE,
        },
        data: { appliedToInvoiceId: invoiceId },
      });
      if (count === 0) throw new ConflictException('Credit note was applied concurrently');

      await this.invoicesService.recalculateBalance(tx, invoiceId);
      return tx.creditNote.findUniqueOrThrow({
        where: { id },
        include: CREDIT_NOTE_VIEW_INCLUDE,
      });
    });
  }

  // === Bulk Operations — same command as the single-record route ===

  bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.void(organizationId, id));
  }

  // === Helpers ===

  /** The target must be the customer's open invoice with enough balance left for the credit. */
  private assertApplicable(
    invoice: {
      customerId: string;
      status: InvoiceStatus;
      balanceDue: Decimal;
      invoiceNumber: string;
    },
    customerId: string,
    amount: Decimal,
  ): void {
    if (invoice.customerId !== customerId) {
      throw new BadRequestException(
        `Invoice ${invoice.invoiceNumber} belongs to a different customer`,
      );
    }
    if (!RECEIVABLE_INVOICE_STATUSES.includes(invoice.status)) {
      throw new BadRequestException(`Invoice ${invoice.invoiceNumber} is not open for credit`);
    }
    if (amount.greaterThan(invoice.balanceDue)) {
      throw new BadRequestException(
        `Credit exceeds the balance due on invoice ${invoice.invoiceNumber}`,
      );
    }
  }

  /**
   * A refund pays money back, so it cannot exceed what the customer has actually paid on the
   * invoice (live payments) minus refunds already issued against it.
   */
  private async assertRefundCovered(
    tx: Prisma.TransactionClient,
    organizationId: string,
    invoiceId: string,
    amount: Decimal,
  ): Promise<void> {
    const allocations = await tx.paymentAllocation.findMany({
      where: { invoiceId, payment: { organizationId, deletedAt: null } },
      select: { amount: true },
    });
    const refunded = await tx.creditNote.aggregate({
      where: {
        organizationId,
        invoiceId,
        type: CreditNoteType.REFUND,
        deletedAt: null,
      },
      _sum: { amount: true },
    });
    const paid = allocations.reduce((s, a) => s.add(a.amount), new Decimal(0));
    const refundable = paid.sub(refunded._sum.amount ?? new Decimal(0));
    if (amount.greaterThan(refundable)) {
      throw new BadRequestException('Refund exceeds the amount received on this invoice');
    }
  }
}
