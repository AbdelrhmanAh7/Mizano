import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QuoteStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { QuoteQueryDto } from '../dto/quote-query.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateQuoteDto } from '../dto/create-quote.dto';
import { UpdateQuoteDto } from '../dto/update-quote.dto';

@Injectable()
export class QuotesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, createQuoteDto: CreateQuoteDto) {
    const { customerId, date, expiryDate, lines, notes, terms } = createQuoteDto;

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, deletedAt: null },
    });
    if (!customer) throw new BadRequestException('Customer not found');

    let subtotal = 0,
      taxAmount = 0;
    const calculatedLines = lines.map((line) => {
      const qty = parseFloat(line.quantity);
      const rate = parseFloat(line.rate);
      const discount = parseFloat(line.discount || '0');
      const tax = parseFloat(line.taxRate || '0');
      const lineTotal = qty * rate * (1 - discount / 100);
      subtotal += lineTotal;
      taxAmount += lineTotal * (tax / 100);
      return { ...line, amount: lineTotal.toFixed(4) };
    });

    const quoteNumber = await this.generateQuoteNumber(organizationId);

    return this.prisma.quote.create({
      data: {
        quoteNumber,
        customerId,
        date: new Date(date),
        expiryDate: new Date(expiryDate),
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        grandTotal: new Decimal(subtotal + taxAmount),
        notes,
        terms,
        organizationId,
        lines: {
          create: calculatedLines.map((line) => ({
            itemId: line.itemId,
            description: line.description,
            quantity: new Decimal(line.quantity),
            rate: new Decimal(line.rate),
            discount: new Decimal(line.discount || '0'),
            taxRate: new Decimal(line.taxRate || '0'),
            amount: new Decimal(line.amount),
          })),
        },
      },
      include: { customer: { select: { id: true, name: true } }, lines: true },
    });
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

  async update(organizationId: string, id: string, updateQuoteDto: UpdateQuoteDto) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.status !== QuoteStatus.DRAFT)
      throw new BadRequestException('Only draft quotes can be updated');

    const { customerId, lines: _lines, date, expiryDate, ...restData } = updateQuoteDto;
    return this.prisma.quote.update({
      where: { id },
      data: {
        ...restData,
        ...(date && { date: new Date(date) }),
        ...(expiryDate && { expiryDate: new Date(expiryDate) }),
        ...(customerId && { customer: { connect: { id: customerId } } }),
      },
    });
  }

  async convertToInvoice(organizationId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { lines: true },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.status !== QuoteStatus.ACCEPTED)
      throw new BadRequestException('Only accepted quotes can be converted');

    const invoiceNumber = await this.generateInvoiceNumber(organizationId);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId: quote.customerId,
        quoteId: quote.id,
        date: new Date(),
        dueDate,
        subtotal: quote.subtotal,
        taxAmount: quote.taxAmount,
        grandTotal: quote.grandTotal,
        balanceDue: quote.grandTotal,
        notes: quote.notes,
        terms: quote.terms,
        organizationId,
        lines: {
          create: quote.lines.map((line) => ({
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
    });

    await this.prisma.quote.update({ where: { id }, data: { status: QuoteStatus.INVOICED } });
    return invoice;
  }

  async send(organizationId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException('Only draft quotes can be sent');
    }

    return this.prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.SENT },
      include: { customer: { select: { id: true, name: true } }, lines: true },
    });
  }

  async accept(organizationId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.status !== QuoteStatus.SENT) {
      throw new BadRequestException('Only sent quotes can be accepted');
    }

    return this.prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.ACCEPTED },
      include: { customer: { select: { id: true, name: true } }, lines: true },
    });
  }

  async decline(organizationId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    if (quote.status !== QuoteStatus.SENT) {
      throw new BadRequestException('Only sent quotes can be declined');
    }

    return this.prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.DECLINED },
      include: { customer: { select: { id: true, name: true } }, lines: true },
    });
  }

  async remove(organizationId: string, id: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    await this.prisma.quote.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Quote deleted successfully' };
  }

  private async generateQuoteNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.quote.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { quoteNumber: true },
    });
    if (!last) return 'EST-001';
    const num = parseInt(last.quoteNumber.split('-')[1], 10);
    return `EST-${String(num + 1).padStart(3, '0')}`;
  }

  async clone(organizationId: string, id: string) {
    const original = await this.prisma.quote.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        lines: true,
      },
    });

    if (!original) {
      throw new NotFoundException('Quote not found');
    }

    const quoteNumber = await this.generateQuoteNumber(organizationId);
    const today = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    const cloned = await this.prisma.quote.create({
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
      include: {
        customer: { select: { id: true, name: true } },
        lines: true,
      },
    });

    return cloned;
  }

  // === Bulk Operations ===

  async bulkDelete(organizationId: string, ids: string[]) {
    const result = await this.prisma.quote.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: QuoteStatus.DRAFT,
      },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count, total: ids.length };
  }

  async bulkSend(organizationId: string, ids: string[]) {
    const result = await this.prisma.quote.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: QuoteStatus.DRAFT,
      },
      data: { status: QuoteStatus.SENT },
    });
    return { sent: result.count, total: ids.length };
  }

  async bulkDecline(organizationId: string, ids: string[]) {
    const result = await this.prisma.quote.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: QuoteStatus.SENT,
      },
      data: { status: QuoteStatus.DECLINED },
    });
    return { declined: result.count, total: ids.length };
  }

  private async generateInvoiceNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.invoice.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });
    if (!last) return 'INV-001';
    const num = parseInt(last.invoiceNumber.split('-')[1], 10);
    return `INV-${String(num + 1).padStart(3, '0')}`;
  }
}
