import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoiceStatus, Prisma, TaxType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { computeDocumentTotals } from '../../../common/utils/document-totals';
import { lockOrganizationLedger } from '../../../common/utils/ledger-lock';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import { CreateInvoiceDto, InvoiceLineDto } from '../dto/create-invoice.dto';
import { InvoiceCursorQueryDto } from '../dto/invoice-cursor-query.dto';
import { InvoiceQueryDto } from '../dto/invoice-query.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';
import {
  allocateInvoiceNumber,
  mapDocumentNumberConflict,
  assertMoneyFits,
  assertTotalsFit,
  parseDocumentDate,
  startOfTodayUtc,
} from '../utils/sales-helpers';

/** Invoice statuses that carry an open AR balance and can receive payments or credits. */
export const RECEIVABLE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

const INVOICE_VIEW_INCLUDE = {
  customer: { select: { id: true, name: true, email: true } },
  lines: {
    orderBy: { sortOrder: 'asc' },
    include: { item: { select: { id: true, name: true, sku: true } } },
  },
} satisfies Prisma.InvoiceInclude;

interface InvoiceReferences {
  customerId?: string;
  quoteId?: string;
  projectId?: string;
  lines?: Pick<InvoiceLineDto, 'itemId'>[];
}

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, dto: CreateInvoiceDto) {
    const date = parseDocumentDate(dto.date, 'invoice date');
    const dueDate = parseDocumentDate(dto.dueDate, 'due date');
    const { lineData, totals } = this.buildLines(dto.lines, dto.shippingAmount);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertReferences(tx, organizationId, dto, dto.customerId);
        const invoiceNumber = await allocateInvoiceNumber(tx, organizationId);
        return tx.invoice.create({
          data: {
            invoiceNumber,
            customerId: dto.customerId,
            quoteId: dto.quoteId,
            projectId: dto.projectId,
            date,
            dueDate,
            subtotal: totals.subtotal,
            taxAmount: totals.taxAmount,
            shippingAmount: totals.shipping,
            grandTotal: totals.grandTotal,
            balanceDue: totals.grandTotal,
            notes: dto.notes,
            terms: dto.terms,
            organizationId,
            lines: { create: lineData },
          },
          include: INVOICE_VIEW_INCLUDE,
        });
      });
    } catch (error) {
      throw mapDocumentNumberConflict(error, 'Invoice');
    }
  }

  async findAll(organizationId: string, query: InvoiceQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'date',
      sortOrder = 'desc',
      status,
      customerId,
      dateFrom,
      dateTo,
    } = query;

    const where: Prisma.InvoiceWhereInput = {
      organizationId,
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    if (dateFrom || dateTo) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.date = dateFilter;
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAllCursor(organizationId: string, query: InvoiceCursorQueryDto) {
    const {
      cursor,
      take = 50,
      search,
      sortBy = 'date',
      sortOrder = 'desc',
      status,
      customerId,
      dateFrom,
      dateTo,
    } = query;

    const where: Prisma.InvoiceWhereInput = { organizationId, deletedAt: null };

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    if (dateFrom || dateTo) {
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (dateFrom) dateFilter.gte = new Date(dateFrom);
      if (dateTo) dateFilter.lte = new Date(dateTo);
      where.date = dateFilter;
    }

    return cursorPaginate(
      this.prisma.invoice,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
        include: {
          customer: { select: { id: true, name: true, email: true } },
        },
      },
    );
  }

  async findOne(organizationId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        customer: true,
        lines: {
          orderBy: { sortOrder: 'asc' },
          include: {
            item: { select: { id: true, name: true, sku: true } },
          },
        },
        // Voided payments are history, not part of the invoice's live settlement.
        paymentAllocations: {
          where: { payment: { deletedAt: null } },
          include: {
            payment: { select: { id: true, paymentNumber: true, date: true, amount: true } },
          },
        },
        creditNotes: {
          where: { deletedAt: null },
          select: { id: true, creditNoteNumber: true, amount: true, date: true, type: true },
        },
        appliedCredits: {
          where: { deletedAt: null },
          select: { id: true, creditNoteNumber: true, amount: true, date: true },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  /** Draft invoices only. When lines are supplied they replace the old lines and totals. */
  async update(organizationId: string, id: string, dto: UpdateInvoiceDto) {
    const date = dto.date !== undefined ? parseDocumentDate(dto.date, 'invoice date') : undefined;
    const dueDate =
      dto.dueDate !== undefined ? parseDocumentDate(dto.dueDate, 'due date') : undefined;

    return this.prisma.$transaction(async (tx) => {
      // Same row lock as send(): an edit and a send serialize, so a posted journal always
      // matches the document that was sent.
      await this.lockOwnedInvoice(tx, organizationId, id);
      const invoice = await tx.invoice.findFirst({
        where: { id, organizationId, deletedAt: null },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Only draft invoices can be updated');
      }

      await this.assertReferences(tx, organizationId, dto, dto.customerId ?? invoice.customerId);

      // Guarded: the invoice must still be a draft when the write lands (a concurrent send
      // holds the row and wins).
      const { count } = await tx.invoice.updateMany({
        where: { id, organizationId, status: InvoiceStatus.DRAFT, deletedAt: null },
        data: { updatedAt: new Date() },
      });
      if (count === 0) throw new ConflictException('Invoice was sent or changed concurrently');

      const data: Prisma.InvoiceUncheckedUpdateInput = {};
      if (dto.customerId !== undefined) data.customerId = dto.customerId;
      if (dto.quoteId !== undefined) data.quoteId = dto.quoteId;
      if (dto.projectId !== undefined) data.projectId = dto.projectId;
      if (date) data.date = date;
      if (dueDate) data.dueDate = dueDate;
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.terms !== undefined) data.terms = dto.terms;

      if (dto.lines) {
        const { lineData, totals } = this.buildLines(
          dto.lines,
          dto.shippingAmount ?? invoice.shippingAmount.toString(),
        );
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceLine.createMany({
          data: lineData.map((line) => ({ ...line, invoiceId: id })),
        });
        data.subtotal = totals.subtotal;
        data.taxAmount = totals.taxAmount;
        data.shippingAmount = totals.shipping;
        data.grandTotal = totals.grandTotal;
        data.balanceDue = totals.grandTotal;
      } else if (dto.shippingAmount !== undefined) {
        // Shipping changed on its own: lines are untouched, so re-derive the gross total.
        const { shipping } = computeDocumentTotals([], { shipping: dto.shippingAmount });
        const grandTotal = invoice.subtotal.add(invoice.taxAmount).add(shipping);
        assertMoneyFits(grandTotal, 'grand total');
        data.shippingAmount = shipping;
        data.grandTotal = grandTotal;
        data.balanceDue = grandTotal;
      }

      return tx.invoice.update({ where: { id }, data, include: INVOICE_VIEW_INCLUDE });
    });
  }

  /**
   * Sends a draft invoice and posts Dr AR / Cr Revenue / Cr VAT Payable, dated on the invoice
   * date. The state change and the journal commit together; a concurrent or repeated send posts
   * once (the loser gets a 409/400 and nothing is written).
   */
  async send(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the invoice row before reading the values that get posted (a concurrent edit
      // waits and cannot make the journal disagree with the document). Lock order is
      // invoice -> ledger everywhere (payments, credit notes, voids), so no deadlock.
      await this.lockOwnedInvoice(tx, organizationId, id);
      // Then the ledger: the currency/account checks must see the settings the journal posts under.
      await lockOrganizationLedger(tx, organizationId);
      const invoice = await tx.invoice.findFirst({
        where: { id, organizationId, deletedAt: null },
        include: { lines: { select: { id: true } } },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException('Only draft invoices can be sent');
      }
      if (invoice.lines.length === 0) throw new BadRequestException('Invoice has no lines');
      if (invoice.grandTotal.lessThanOrEqualTo(0)) {
        throw new BadRequestException('Invoice total must be greater than zero before sending');
      }

      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: {
          defaultArAccountId: true,
          defaultRevenueAccountId: true,
          defaultVatPayableAccountId: true,
          baseCurrency: true,
        },
      });
      // The ledger is single-currency: never post foreign amounts as if they were base currency.
      const invoiceCurrency = invoice.currencyCode?.trim().toUpperCase();
      if (invoiceCurrency && org && invoiceCurrency !== org.baseCurrency.toUpperCase()) {
        throw new BadRequestException(
          `Invoice currency ${invoiceCurrency} differs from the base currency ${org.baseCurrency}; foreign-currency invoices cannot be posted yet`,
        );
      }
      if (!org?.defaultArAccountId || !org?.defaultRevenueAccountId) {
        throw new BadRequestException(
          'Please configure default accounts (Accounts Receivable and Revenue) in organization settings before sending invoices',
        );
      }
      if (invoice.taxAmount.greaterThan(0) && !org.defaultVatPayableAccountId) {
        throw new BadRequestException(
          'Please configure the default VAT Payable account in organization settings before sending taxed invoices',
        );
      }

      // Guarded transition: only one concurrent send can move DRAFT -> SENT.
      const { count } = await tx.invoice.updateMany({
        where: { id, organizationId, status: InvoiceStatus.DRAFT, deletedAt: null },
        data: { status: InvoiceStatus.SENT, issueDate: new Date() },
      });
      if (count === 0) throw new ConflictException('Invoice has already been sent');

      // Revenue is the balancing figure (subtotal + shipping, net of VAT) so the entry always
      // balances against the gross receivable, including shipping and discounts.
      const revenue = invoice.grandTotal.sub(invoice.taxAmount);
      const journalLines = [
        {
          accountId: org.defaultArAccountId,
          debit: invoice.grandTotal.toFixed(4),
          credit: '0',
          description: `Invoice ${invoice.invoiceNumber} - Accounts Receivable`,
        },
        {
          accountId: org.defaultRevenueAccountId,
          debit: '0',
          credit: revenue.toFixed(4),
          description: `Invoice ${invoice.invoiceNumber} - Sales Revenue`,
        },
      ];
      if (invoice.taxAmount.greaterThan(0)) {
        journalLines.push({
          accountId: org.defaultVatPayableAccountId as string,
          debit: '0',
          credit: invoice.taxAmount.toFixed(4),
          description: `Invoice ${invoice.invoiceNumber} - VAT Payable`,
        });
      }

      await this.journalsService.create(
        organizationId,
        {
          date: invoice.date.toISOString(),
          reference: `Invoice ${invoice.invoiceNumber}`,
          notes: `Accounting entry for invoice ${invoice.invoiceNumber}`,
          lines: journalLines,
        },
        { tx, source: { type: JournalSourceType.INVOICE_SEND, id: invoice.id } },
      );

      return tx.invoice.findUniqueOrThrow({ where: { id }, include: INVOICE_VIEW_INCLUDE });
    });
  }

  /**
   * Voids an invoice. A draft is simply cancelled; a sent invoice is voided together with a
   * linked reversal of its INVOICE_SEND journal. Invoices with live payments or credit notes
   * cannot be voided: undo those first.
   */
  async voidInvoice(organizationId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.invoice.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Invoice not found');

      await this.lockInvoices(tx, [id]);
      const invoice = await tx.invoice.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status === InvoiceStatus.VOID) {
        throw new BadRequestException('Invoice is already void');
      }

      const livePayments = await tx.paymentAllocation.count({
        where: { invoiceId: id, payment: { organizationId, deletedAt: null } },
      });
      if (livePayments > 0) {
        throw new BadRequestException(
          'Cannot void an invoice with payments applied; void the payments first',
        );
      }
      const liveCredits = await tx.creditNote.count({
        where: {
          organizationId,
          deletedAt: null,
          OR: [{ invoiceId: id }, { appliedToInvoiceId: id }],
        },
      });
      if (liveCredits > 0) {
        throw new BadRequestException(
          'Cannot void an invoice with credit notes; void the credit notes first',
        );
      }

      // Guarded transition on the status we read under the row lock.
      const { count } = await tx.invoice.updateMany({
        where: { id, organizationId, status: invoice.status, deletedAt: null },
        data: { status: InvoiceStatus.VOID },
      });
      if (count === 0) throw new ConflictException('Invoice changed concurrently');

      if (invoice.status !== InvoiceStatus.DRAFT) {
        const journal = await tx.journal.findFirst({
          where: {
            organizationId,
            sourceType: JournalSourceType.INVOICE_SEND,
            sourceId: id,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!journal) {
          // Legacy invoices (sent before journals were source-linked) cannot be voided safely:
          // cancelling the invoice without reversing Dr AR / Cr Revenue would unbalance AR.
          throw new BadRequestException(
            'This invoice has no linked ledger entry; reverse its journal manually before voiding',
          );
        }
        await this.journalsService.reverse(organizationId, journal.id, undefined, {
          tx,
          source: { type: JournalSourceType.INVOICE_VOID, id },
        });
      }

      return tx.invoice.findUniqueOrThrow({ where: { id }, include: INVOICE_VIEW_INCLUDE });
    });
  }

  /** Soft-deletes a draft invoice. Sent invoices must be voided, never deleted. */
  async remove(organizationId: string, id: string) {
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, organizationId, deletedAt: null, status: InvoiceStatus.DRAFT },
      data: { deletedAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.invoice.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Invoice not found');
      throw new BadRequestException('Only draft invoices can be deleted');
    }
    return { message: 'Invoice deleted successfully' };
  }

  /**
   * Recalculates balance and status from live (non-voided) payment allocations and applied
   * credit notes. Must run inside the caller's transaction after the invoice row is locked.
   * Draft and void invoices are never touched.
   */
  async recalculateBalance(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found for balance update`);
    if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.VOID) return;

    const allocations = await tx.paymentAllocation.findMany({
      where: { invoiceId, payment: { deletedAt: null } },
      select: { amount: true },
    });
    const credits = await tx.creditNote.findMany({
      where: { appliedToInvoiceId: invoiceId, deletedAt: null },
      select: { amount: true },
    });
    const paid = allocations.reduce((s, a) => s.add(a.amount), new Decimal(0));
    const credited = credits.reduce((s, c) => s.add(c.amount), new Decimal(0));
    const settled = paid.add(credited);
    const balance = Decimal.max(invoice.grandTotal.sub(settled), new Decimal(0));

    let status: InvoiceStatus;
    if (balance.isZero()) status = InvoiceStatus.PAID;
    else if (settled.greaterThan(0)) status = InvoiceStatus.PARTIALLY_PAID;
    else if (invoice.dueDate < startOfTodayUtc()) status = InvoiceStatus.OVERDUE;
    else status = InvoiceStatus.SENT;

    await tx.invoice.update({ where: { id: invoiceId }, data: { balanceDue: balance, status } });
  }

  /** Locks one invoice row, but only if it belongs to the organization (404 otherwise). */
  private async lockOwnedInvoice(
    tx: Prisma.TransactionClient,
    organizationId: string,
    id: string,
  ): Promise<void> {
    const owned = await tx.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Invoice not found');
    await this.lockInvoices(tx, [id]);
  }

  /**
   * Active sales-side tax rates for invoice/quote/credit forms. Gated by `sales.view` (not
   * `tax.view`) so sales users can pick a rate; purchase-only rates are never offered.
   */
  async taxRateOptions(
    organizationId: string,
  ): Promise<{ id: string; name: string; rate: string }[]> {
    const rates = await this.prisma.taxRate.findMany({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null,
        type: { in: [TaxType.SALES, TaxType.BOTH] },
      },
      select: { id: true, name: true, rate: true },
      orderBy: { name: 'asc' },
    });
    return rates.map((r) => ({ id: r.id, name: r.name, rate: r.rate.toFixed(2) }));
  }

  /** Row-locks invoices (sorted to avoid deadlocks) for the rest of the transaction. */
  async lockInvoices(tx: Prisma.TransactionClient, invoiceIds: string[]): Promise<void> {
    for (const id of [...new Set(invoiceIds)].sort()) {
      await tx.$queryRaw`SELECT id FROM "invoices" WHERE id = ${id} FOR UPDATE`;
    }
  }

  /**
   * Standalone balance refresh kept for callers outside the sales module (bank reconciliation).
   * Locks the invoice and recalculates in its own transaction.
   * @deprecated Call lockInvoices + recalculateBalance inside the transaction that wrote the
   * payment so the allocation and the balance commit together.
   */
  async updateBalanceDue(invoiceId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockInvoices(tx, [invoiceId]);
      await this.recalculateBalance(tx, invoiceId);
    });
  }

  /** Marks sent invoices past their due date as overdue (open balance only). */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueInvoices(): Promise<void> {
    await this.prisma.invoice.updateMany({
      where: {
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
        dueDate: { lt: startOfTodayUtc() },
        balanceDue: { gt: 0 },
        deletedAt: null,
      },
      data: { status: InvoiceStatus.OVERDUE },
    });
  }

  async clone(organizationId: string, id: string) {
    const original = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!original) throw new NotFoundException('Invoice not found');

    const today = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const invoiceNumber = await allocateInvoiceNumber(tx, organizationId);
        return tx.invoice.create({
          data: {
            invoiceNumber,
            customerId: original.customerId,
            date: today,
            dueDate,
            subtotal: original.subtotal,
            taxAmount: original.taxAmount,
            shippingAmount: original.shippingAmount,
            grandTotal: original.grandTotal,
            balanceDue: original.grandTotal,
            notes: original.notes,
            terms: original.terms,
            projectId: original.projectId,
            organizationId,
            lines: {
              create: original.lines.map((line, i) => ({
                itemId: line.itemId,
                description: line.description,
                quantity: line.quantity,
                rate: line.rate,
                discount: line.discount,
                taxRate: line.taxRate,
                amount: line.amount,
                sortOrder: i,
              })),
            },
          },
          include: INVOICE_VIEW_INCLUDE,
        });
      });
    } catch (error) {
      throw mapDocumentNumberConflict(error, 'Invoice');
    }
  }

  // === Bulk Operations — same command as the single-record routes ===

  bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.remove(organizationId, id));
  }

  bulkSend(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.send(organizationId, id));
  }

  bulkVoid(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.voidInvoice(organizationId, id));
  }

  // === Helpers ===

  private buildLines(lines: InvoiceLineDto[], shipping?: string) {
    const totals = computeDocumentTotals(
      lines.map((l) => ({
        quantity: l.quantity,
        rate: l.rate,
        taxRatePercent: l.taxRate,
        discountPercent: l.discount,
      })),
      { shipping },
    );
    assertTotalsFit(totals);
    const lineData = lines.map((line, i) => ({
      itemId: line.itemId,
      description: line.description,
      quantity: new Decimal(line.quantity),
      rate: new Decimal(line.rate),
      discount: new Decimal(line.discount || '0'),
      taxRate: new Decimal(line.taxRate || '0'),
      amount: totals.lines[i].netAmount,
      sortOrder: i,
    }));
    return { lineData, totals };
  }

  /** Every referenced id must belong to the caller's organization. */
  private async assertReferences(
    db: Prisma.TransactionClient,
    organizationId: string,
    refs: InvoiceReferences,
    effectiveCustomerId: string | undefined,
  ): Promise<void> {
    if (refs.customerId) {
      const customer = await db.customer.findFirst({
        where: { id: refs.customerId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) throw new BadRequestException('Customer not found');
    }
    if (refs.projectId) {
      const project = await db.project.findFirst({
        where: { id: refs.projectId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!project) throw new BadRequestException('Project not found');
    }
    if (refs.quoteId) {
      const quote = await db.quote.findFirst({
        where: { id: refs.quoteId, organizationId, deletedAt: null },
        select: { id: true, customerId: true },
      });
      if (!quote) throw new BadRequestException('Quote not found');
      if (effectiveCustomerId && quote.customerId !== effectiveCustomerId) {
        throw new BadRequestException('Quote belongs to a different customer');
      }
    }
    const itemIds = [
      ...new Set((refs.lines ?? []).map((l) => l.itemId).filter((i): i is string => !!i)),
    ];
    if (itemIds.length) {
      const found = await db.item.count({
        where: { id: { in: itemIds }, organizationId, deletedAt: null },
      });
      if (found !== itemIds.length) throw new BadRequestException('Item not found');
    }
  }
}
