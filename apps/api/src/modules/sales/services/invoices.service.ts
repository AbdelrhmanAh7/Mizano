import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { InvoiceCursorQueryDto } from '../dto/invoice-cursor-query.dto';
import { InvoiceQueryDto } from '../dto/invoice-query.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, createInvoiceDto: CreateInvoiceDto) {
    const { customerId, quoteId, date, dueDate, lines, shippingAmount, notes, terms, projectId } =
      createInvoiceDto;

    // Verify customer exists
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, deletedAt: null },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    // Calculate totals
    let subtotal = 0;
    let taxAmount = 0;
    const calculatedLines = lines.map((line) => {
      const qty = parseFloat(line.quantity);
      const rate = parseFloat(line.rate);
      const discount = parseFloat(line.discount || '0');
      const tax = parseFloat(line.taxRate || '0');

      const lineTotal = qty * rate * (1 - discount / 100);
      const lineTax = lineTotal * (tax / 100);

      subtotal += lineTotal;
      taxAmount += lineTax;

      return {
        ...line,
        amount: lineTotal.toFixed(4),
      };
    });

    const shipping = parseFloat(shippingAmount || '0');
    const grandTotal = subtotal + taxAmount + shipping;

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber(organizationId);

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId,
        quoteId,
        projectId,
        date: new Date(date),
        dueDate: new Date(dueDate),
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        shippingAmount: new Decimal(shipping),
        grandTotal: new Decimal(grandTotal),
        balanceDue: new Decimal(grandTotal),
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
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
        lines: {
          include: {
            item: { select: { id: true, name: true, sku: true } },
          },
        },
      },
    });

    return invoice;
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
          include: {
            item: { select: { id: true, name: true, sku: true } },
          },
        },
        paymentAllocations: {
          include: {
            payment: { select: { id: true, paymentNumber: true, date: true, amount: true } },
          },
        },
        creditNotes: {
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

  async update(organizationId: string, id: string, updateInvoiceDto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Only draft invoices can be updated');
    }

    // Recalculate if lines are updated
    const { lines: dtoLines, ...restDto } = updateInvoiceDto;
    let updateData: Prisma.InvoiceUpdateInput = { ...restDto };

    if (dtoLines) {
      let subtotal = 0;
      let taxAmount = 0;

      const calculatedLines = dtoLines.map((line) => {
        const qty = parseFloat(line.quantity);
        const rate = parseFloat(line.rate);
        const discount = parseFloat(line.discount || '0');
        const tax = parseFloat(line.taxRate || '0');

        const lineTotal = qty * rate * (1 - discount / 100);
        const lineTax = lineTotal * (tax / 100);

        subtotal += lineTotal;
        taxAmount += lineTax;

        return { ...line, amount: lineTotal.toFixed(4) };
      });

      const shipping = parseFloat(
        updateInvoiceDto.shippingAmount || invoice.shippingAmount.toString(),
      );
      const grandTotal = subtotal + taxAmount + shipping;

      // Delete existing lines and create new ones
      await this.prisma.invoiceLine.deleteMany({ where: { invoiceId: id } });

      updateData = {
        ...updateData,
        subtotal: new Decimal(subtotal),
        taxAmount: new Decimal(taxAmount),
        grandTotal: new Decimal(grandTotal),
        balanceDue: new Decimal(grandTotal),
      };

      // Create new lines separately after the update
      await this.prisma.invoiceLine.createMany({
        data: calculatedLines.map((line) => ({
          invoiceId: id,
          itemId: line.itemId,
          description: line.description,
          quantity: new Decimal(line.quantity),
          rate: new Decimal(line.rate),
          discount: new Decimal(line.discount || '0'),
          taxRate: new Decimal(line.taxRate || '0'),
          amount: new Decimal(line.amount),
        })),
      });
    }

    const updatedInvoice = await this.prisma.invoice.update({
      where: { id },
      data: updateData,
      include: {
        customer: { select: { id: true, name: true } },
        lines: true,
      },
    });

    return updatedInvoice;
  }

  async send(organizationId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Only draft invoices can be sent');
    }

    // Get organization settings for default accounts
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        defaultArAccountId: true,
        defaultRevenueAccountId: true,
        defaultVatPayableAccountId: true,
      },
    });

    if (!org?.defaultArAccountId || !org?.defaultRevenueAccountId) {
      throw new BadRequestException(
        'Please configure default accounts (Accounts Receivable and Revenue) in organization settings before sending invoices',
      );
    }

    // Create accounting entry: Dr AR / Cr Revenue / Cr VAT
    const grandTotal = parseFloat(invoice.grandTotal.toString());
    const subtotal = parseFloat(invoice.subtotal.toString());
    const taxAmount = parseFloat(invoice.taxAmount.toString());
    const shippingAmount = parseFloat(invoice.shippingAmount.toString());

    const journalLines: Array<{
      accountId: string;
      debit: string;
      credit: string;
      description?: string;
    }> = [
      {
        accountId: org.defaultArAccountId,
        debit: grandTotal.toFixed(4),
        credit: '0',
        description: `Invoice ${invoice.invoiceNumber} - Accounts Receivable`,
      },
      {
        accountId: org.defaultRevenueAccountId,
        debit: '0',
        credit: (subtotal + shippingAmount).toFixed(4),
        description: `Invoice ${invoice.invoiceNumber} - Sales Revenue`,
      },
    ];

    // Add VAT line if tax amount exists and VAT account is configured
    if (taxAmount > 0 && org.defaultVatPayableAccountId) {
      journalLines.push({
        accountId: org.defaultVatPayableAccountId,
        debit: '0',
        credit: taxAmount.toFixed(4),
        description: `Invoice ${invoice.invoiceNumber} - VAT Payable`,
      });
    }

    // Create journal entry
    await this.journalsService.create(organizationId, {
      date: new Date().toISOString(),
      reference: `Invoice ${invoice.invoiceNumber}`,
      notes: `Accounting entry for invoice ${invoice.invoiceNumber}`,
      lines: journalLines,
    });

    // Update invoice status
    const updatedInvoice = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SENT },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        lines: true,
      },
    });

    return updatedInvoice;
  }

  async voidInvoice(organizationId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { paymentAllocations: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.paymentAllocations.length > 0) {
      throw new BadRequestException('Cannot void invoice with payments');
    }

    const updatedInvoice = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.VOID },
    });

    return updatedInvoice;
  }

  async remove(organizationId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { paymentAllocations: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Only draft invoices can be deleted');
    }

    await this.prisma.invoice.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: 'Invoice deleted successfully' };
  }

  async recordPayment(
    organizationId: string,
    id: string,
    dto: { amount: number; date: string; bankAccountId: string; reference?: string },
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { customer: { select: { id: true, name: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException('Cannot record payment for a draft invoice');
    }
    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('Cannot record payment for a voided invoice');
    }

    const paymentAmount = new Decimal(dto.amount);
    const balanceDue = invoice.balanceDue || invoice.grandTotal;
    if (paymentAmount.greaterThan(balanceDue)) {
      throw new BadRequestException('Payment amount exceeds balance due');
    }

    // Generate payment number
    const lastPayment = await this.prisma.paymentReceived.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { paymentNumber: true },
    });
    const paymentNum = lastPayment?.paymentNumber
      ? parseInt(lastPayment.paymentNumber.split('-')[1], 10) + 1
      : 1;
    const paymentNumber = `PMT-${String(paymentNum).padStart(3, '0')}`;

    const payment = await this.prisma.$transaction(async (tx) => {
      const pr = await tx.paymentReceived.create({
        data: {
          paymentNumber,
          customerId: invoice.customerId,
          date: new Date(dto.date),
          amount: paymentAmount,
          paymentMode: 'BANK_TRANSFER',
          depositToAccountId: dto.bankAccountId,
          reference: dto.reference,
          organizationId,
          allocations: {
            create: {
              invoiceId: id,
              amount: paymentAmount,
            },
          },
        },
        include: {
          customer: { select: { id: true, name: true } },
          allocations: true,
        },
      });
      return pr;
    });

    await this.updateBalanceDue(id);
    return payment;
  }

  // Update balance due after payment
  async updateBalanceDue(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        paymentAllocations: true,
        creditNotes: { where: { type: 'APPLY_TO_INVOICE', deletedAt: null } },
      },
    });

    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found for balance update`);

    const totalPayments = invoice.paymentAllocations.reduce(
      (sum, alloc) => sum + parseFloat(alloc.amount.toString()),
      0,
    );

    const totalCredits = invoice.creditNotes.reduce(
      (sum, cn) => sum + parseFloat(cn.amount.toString()),
      0,
    );

    const balanceDue = parseFloat(invoice.grandTotal.toString()) - totalPayments - totalCredits;

    let status = invoice.status;
    if (balanceDue <= 0) {
      status = InvoiceStatus.PAID;
    } else if (totalPayments > 0) {
      status = InvoiceStatus.PARTIALLY_PAID;
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        balanceDue: new Decimal(Math.max(0, balanceDue)),
        status,
      },
    });
  }

  // Cron job to mark overdue invoices
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueInvoices() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.invoice.updateMany({
      where: {
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] },
        dueDate: { lt: today },
        deletedAt: null,
      },
      data: { status: InvoiceStatus.OVERDUE },
    });
  }

  // === Bulk Operations ===

  async bulkDelete(organizationId: string, ids: string[]) {
    // Only draft invoices can be deleted
    const result = await this.prisma.invoice.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: 'DRAFT',
      },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count, total: ids.length };
  }

  async bulkSend(organizationId: string, ids: string[]) {
    const result = await this.prisma.invoice.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: 'DRAFT',
      },
      data: { status: InvoiceStatus.SENT },
    });
    return { sent: result.count, total: ids.length };
  }

  async bulkVoid(organizationId: string, ids: string[]) {
    const result = await this.prisma.invoice.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: { in: ['DRAFT', 'SENT'] },
      },
      data: { status: InvoiceStatus.VOID },
    });
    return { voided: result.count, total: ids.length };
  }

  async bulkPay(organizationId: string, ids: string[]) {
    const result = await this.prisma.invoice.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] },
      },
      data: { status: InvoiceStatus.PAID, balanceDue: 0 },
    });
    return { paid: result.count, total: ids.length };
  }

  private async generateInvoiceNumber(organizationId: string): Promise<string> {
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });

    if (!lastInvoice) {
      return 'INV-001';
    }

    const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[1], 10);
    return `INV-${String(lastNumber + 1).padStart(3, '0')}`;
  }
}
