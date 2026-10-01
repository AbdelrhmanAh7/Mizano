import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuoteStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BulkResultDto } from '../../../common/dto/bulk-result.dto';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { computeDocumentTotals } from '../../../common/utils/document-totals';
import { runBulk } from '../../../common/utils/run-bulk';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateQuoteDto, QuoteLineDto } from '../dto/create-quote.dto';
import { QuoteQueryDto } from '../dto/quote-query.dto';
import { UpdateQuoteDto } from '../dto/update-quote.dto';
import {
  allocateInvoiceNumber,
  allocateQuoteNumber,
  assertMoneyFits,
  assertTotalsFit,
  mapDocumentNumberConflict,
  parseDocumentDate,
  startOfTodayUtc,
} from '../utils/sales-helpers';

const QUOTE_VIEW_INCLUDE = {
  customer: { select: { id: true, name: true } },
  lines: true,
} satisfies Prisma.QuoteInclude;

/** Days between conversion and the invoice due date. */
const DEFAULT_PAYMENT_TERMS_DAYS = 30;

@Injectable()
export class QuotesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateQuoteDto) {
    const date = parseDocumentDate(dto.date, 'quote date');
    const expiryDate = parseDocumentDate(dto.expiryDate, 'expiry date');
    const { lineData, totals } = this.buildLines(dto.lines);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertReferences(tx, organizationId, dto.customerId, dto.lines);
        const quoteNumber = await allocateQuoteNumber(tx, organizationId);
        return tx.quote.create({
          data: {
            quoteNumber,
            customerId: dto.customerId,
            date,
            expiryDate,
            subtotal: totals.subtotal,
            taxAmount: totals.taxAmount,
            grandTotal: totals.grandTotal,
            notes: dto.notes,
            terms: dto.terms,
            organizationId,
            lines: { create: lineData },
          },
          include: QUOTE_VIEW_INCLUDE,
        });
      });
    } catch (error) {
      throw mapDocumentNumberConflict(error, 'Quote');
    }
  }

  async findAll(organizationId: string, query: QuoteQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'date',
      sortOrder = 'desc',
      customerId,
      status,
    } = query;
    const where: Prisma.QuoteWhereInput = { organizationId, deletedAt: null };
    if (search) {
      where.OR = [
        { quoteNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (customerId) where.customerId = customerId;
    if (status) where.status = status as QuoteStatus;

    const [quotes, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.quote.count({ where }),
    ]);

    return { data: quotes, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, search, sortBy = 'date', sortOrder = 'desc' } = query;

    const where: Prisma.QuoteWhereInput = { organizationId, deletedAt: null };

    if (search) {
      where.OR = [
        { quoteNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return cursorPaginate(
      this.prisma.quote,
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

  async findOne(organizationId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { customer: true, lines: { include: { item: true } } },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  /** Draft quotes only. When lines are supplied they replace the old lines and totals. */
  async update(organizationId: string, id: string, dto: UpdateQuoteDto) {
    const date = dto.date !== undefined ? parseDocumentDate(dto.date, 'quote date') : undefined;
    const expiryDate =
      dto.expiryDate !== undefined ? parseDocumentDate(dto.expiryDate, 'expiry date') : undefined;

    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({ where: { id, organizationId, deletedAt: null } });
      if (!quote) throw new NotFoundException('Quote not found');
      if (quote.status !== QuoteStatus.DRAFT) {
        throw new BadRequestException('Only draft quotes can be updated');
      }
      await this.assertReferences(tx, organizationId, dto.customerId, dto.lines ?? []);

      // Guarded: the quote must still be a draft when the write lands.
      const { count } = await tx.quote.updateMany({
        where: { id, organizationId, status: QuoteStatus.DRAFT, deletedAt: null },
        data: { updatedAt: new Date() },
      });
      if (count === 0) throw new ConflictException('Quote was sent or changed concurrently');

      const data: Prisma.QuoteUncheckedUpdateInput = {};
      if (dto.customerId !== undefined) data.customerId = dto.customerId;
      if (date) data.date = date;
      if (expiryDate) data.expiryDate = expiryDate;
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.terms !== undefined) data.terms = dto.terms;
      if (dto.lines) {
        const { lineData, totals } = this.buildLines(dto.lines);
        await tx.quoteLine.deleteMany({ where: { quoteId: id } });
        await tx.quoteLine.createMany({ data: lineData.map((line) => ({ ...line, quoteId: id })) });
        data.subtotal = totals.subtotal;
        data.taxAmount = totals.taxAmount;
        data.grandTotal = totals.grandTotal;
      }

      return tx.quote.update({ where: { id }, data, include: QUOTE_VIEW_INCLUDE });
    });
  }

  /**
   * Converts an accepted quote into a draft invoice. The guarded ACCEPTED -> INVOICED transition
   * and the invoice creation commit together, so a quote converts exactly once even when the
   * request is repeated or raced.
   */
  async convertToInvoice(organizationId: string, id: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const quote = await tx.quote.findFirst({
          where: { id, organizationId, deletedAt: null },
          include: { lines: true },
        });
        if (!quote) throw new NotFoundException('Quote not found');
        if (quote.status !== QuoteStatus.ACCEPTED) {
          throw new BadRequestException('Only accepted quotes can be converted');
        }
        if (quote.lines.length === 0) throw new BadRequestException('Quote has no lines');

        const customer = await tx.customer.findFirst({
          where: { id: quote.customerId, organizationId, deletedAt: null },
          select: { id: true },
        });
        if (!customer) throw new BadRequestException('Customer not found');

        // The customer accepted the stored amounts: copy lines and totals verbatim rather
        // than recomputing. A quote whose stored figures disagree with its own lines is
        // corrupt and is rejected instead of silently invoiced at a different amount.
        const linesNet = quote.lines.reduce((sum, l) => sum.add(l.amount), new Decimal(0));
        if (
          !linesNet.equals(quote.subtotal) ||
          !quote.subtotal.add(quote.taxAmount).equals(quote.grandTotal)
        ) {
          throw new BadRequestException(
            'Quote totals do not match its lines; correct the quote before converting it',
          );
        }
        assertMoneyFits(quote.grandTotal, 'grand total');

        const { count } = await tx.quote.updateMany({
          where: { id, organizationId, status: QuoteStatus.ACCEPTED, deletedAt: null },
          data: { status: QuoteStatus.INVOICED },
        });
        if (count === 0) throw new ConflictException('Quote has already been converted');

        const invoiceNumber = await allocateInvoiceNumber(tx, organizationId);
        const date = startOfTodayUtc();
        const dueDate = new Date(date);
        dueDate.setUTCDate(dueDate.getUTCDate() + DEFAULT_PAYMENT_TERMS_DAYS);

        return tx.invoice.create({
          data: {
            invoiceNumber,
            customerId: quote.customerId,
            quoteId: quote.id,
            date,
            dueDate,
            subtotal: quote.subtotal,
            taxAmount: quote.taxAmount,
            shippingAmount: new Decimal(0),
            grandTotal: quote.grandTotal,
            balanceDue: quote.grandTotal,
            notes: quote.notes,
            terms: quote.terms,
            organizationId,
            lines: {
              create: quote.lines.map((line, i) => ({
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
          include: {
            customer: { select: { id: true, name: true, email: true } },
            lines: true,
          },
        });
      });
    } catch (error) {
      throw mapDocumentNumberConflict(error, 'Invoice');
    }
  }

  send(organizationId: string, id: string) {
    return this.transition(organizationId, id, QuoteStatus.DRAFT, QuoteStatus.SENT, 'sent');
  }

  accept(organizationId: string, id: string) {
    return this.transition(organizationId, id, QuoteStatus.SENT, QuoteStatus.ACCEPTED, 'accepted');
  }

  decline(organizationId: string, id: string) {
    return this.transition(organizationId, id, QuoteStatus.SENT, QuoteStatus.DECLINED, 'declined');
  }

  /** Soft-deletes a draft quote. */
  async remove(organizationId: string, id: string) {
    const { count } = await this.prisma.quote.updateMany({
      where: { id, organizationId, deletedAt: null, status: QuoteStatus.DRAFT },
      data: { deletedAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.quote.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Quote not found');
      throw new BadRequestException('Only draft quotes can be deleted');
    }
    return { message: 'Quote deleted successfully' };
  }

  async clone(organizationId: string, id: string) {
    const original = await this.prisma.quote.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { lines: true },
    });
    if (!original) throw new NotFoundException('Quote not found');

    const today = startOfTodayUtc();
    const expiryDate = new Date(today);
    expiryDate.setUTCDate(expiryDate.getUTCDate() + 30);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const quoteNumber = await allocateQuoteNumber(tx, organizationId);
        return tx.quote.create({
          data: {
            quoteNumber,
            customerId: original.customerId,
            date: today,
            expiryDate,
            subtotal: original.subtotal,
            taxAmount: original.taxAmount,
            grandTotal: original.grandTotal,
            notes: original.notes,
            terms: original.terms,
            organizationId,
            lines: {
              create: original.lines.map((line) => ({
                itemId: line.itemId,
                description: line.description,
                quantity: line.quantity,
                rate: line.rate,
                discount: line.discount,
                taxRate: line.taxRate,
                amount: line.amount,
              })),
            },
          },
          include: QUOTE_VIEW_INCLUDE,
        });
      });
    } catch (error) {
      throw mapDocumentNumberConflict(error, 'Quote');
    }
  }

  // === Bulk Operations — same command as the single-record routes ===

  bulkDelete(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.remove(organizationId, id));
  }

  bulkSend(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.send(organizationId, id));
  }

  bulkDecline(organizationId: string, ids: string[]): Promise<BulkResultDto> {
    return runBulk(ids, (id) => this.decline(organizationId, id));
  }

  // === Helpers ===

  /** Guarded status change: the write only lands while the quote is still in `from`. */
  private async transition(
    organizationId: string,
    id: string,
    from: QuoteStatus,
    to: QuoteStatus,
    verb: string,
  ) {
    const { count } = await this.prisma.quote.updateMany({
      where: { id, organizationId, status: from, deletedAt: null },
      data: { status: to },
    });
    if (count === 0) {
      const exists = await this.prisma.quote.findFirst({
        where: { id, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Quote not found');
      throw new BadRequestException(`Only ${from.toLowerCase()} quotes can be ${verb}`);
    }
    return this.prisma.quote.findFirstOrThrow({
      where: { id, organizationId },
      include: QUOTE_VIEW_INCLUDE,
    });
  }

  private buildLines(lines: QuoteLineDto[]) {
    const totals = computeDocumentTotals(
      lines.map((l) => ({
        quantity: l.quantity,
        rate: l.rate,
        taxRatePercent: l.taxRate,
        discountPercent: l.discount,
      })),
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
    }));
    return { lineData, totals };
  }

  /** Every referenced id must belong to the caller's organization. */
  private async assertReferences(
    db: Prisma.TransactionClient,
    organizationId: string,
    customerId: string | undefined,
    lines: Pick<QuoteLineDto, 'itemId'>[],
  ): Promise<void> {
    if (customerId) {
      const customer = await db.customer.findFirst({
        where: { id: customerId, organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!customer) throw new BadRequestException('Customer not found');
    }
    const itemIds = [...new Set(lines.map((l) => l.itemId).filter((i): i is string => !!i))];
    if (itemIds.length) {
      const found = await db.item.count({
        where: { id: { in: itemIds }, organizationId, deletedAt: null },
      });
      if (found !== itemIds.length) throw new BadRequestException('Item not found');
    }
  }
}
