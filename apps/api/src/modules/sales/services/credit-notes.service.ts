import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { CreateCreditNoteDto } from '../dto/create-credit-note.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { InvoicesService } from './invoices.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class CreditNotesService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, createCreditNoteDto: CreateCreditNoteDto) {
    const { customerId, invoiceId, date, reason, amount, type, appliedToInvoiceId } = createCreditNoteDto;

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
    });
    if (!invoice) throw new BadRequestException('Invoice not found');
    if (invoice.customerId !== customerId) throw new BadRequestException('Invoice does not belong to this customer');

    // Get organization settings for default accounts
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        defaultArAccountId: true,
        defaultSalesReturnsAccountId: true,
        defaultVatPayableAccountId: true,
      },
    });

    if (!org?.defaultArAccountId || !org?.defaultSalesReturnsAccountId) {
      throw new BadRequestException(
        'Please configure default accounts (Accounts Receivable and Sales Returns) in organization settings before creating credit notes',
      );
    }

    const creditNoteNumber = await this.generateCreditNoteNumber(organizationId);
    const creditAmount = parseFloat(amount);

    const creditNote = await this.prisma.creditNote.create({
      data: {
        creditNoteNumber,
        customerId,
        invoiceId,
        date: new Date(date),
        reason,
        amount: new Decimal(amount),
        type,
        appliedToInvoiceId,
        organizationId,
      },
      include: {
        customer: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    // Create accounting entry: Dr Sales Returns / Cr AR
    // If there's VAT involved, we also need to Dr VAT Payable
    const journalLines: Array<{ accountId: string; debit: string; credit: string; description?: string }> = [
      {
        accountId: org.defaultSalesReturnsAccountId,
        debit: creditAmount.toFixed(4),
        credit: '0',
        description: `Credit Note ${creditNoteNumber} - Sales Returns`,
      },
      {
        accountId: org.defaultArAccountId,
        debit: '0',
        credit: creditAmount.toFixed(4),
        description: `Credit Note ${creditNoteNumber} - Accounts Receivable`,
      },
    ];

    // Create journal entry
    await this.journalsService.create(organizationId, {
      date: new Date(date).toISOString(),
      reference: `Credit Note ${creditNoteNumber}`,
      notes: `Accounting entry for credit note ${creditNoteNumber} - ${reason}`,
      lines: journalLines,
    });

    // Update invoice balance if applied
    if (type === 'APPLY_TO_INVOICE' && appliedToInvoiceId) {
      await this.invoicesService.updateBalanceDue(appliedToInvoiceId);
    }

    return creditNote;
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };

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

    return { data: creditNotes, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const creditNote = await this.prisma.creditNote.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { customer: true, invoice: true },
    });
    if (!creditNote) throw new NotFoundException('Credit note not found');
    return creditNote;
  }

  async update(organizationId: string, id: string, dto: any) {
    const creditNote = await this.findOne(organizationId, id);
    const data: any = {};
    if (dto.reason !== undefined) data.reason = dto.reason;
    if (dto.date !== undefined) data.date = new Date(dto.date);

    return this.prisma.creditNote.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.creditNote.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Credit note deleted' };
  }

  async apply(organizationId: string, id: string, invoiceId: string) {
    const creditNote = await this.findOne(organizationId, id);
    if (creditNote.appliedToInvoiceId) {
      throw new BadRequestException('Credit note is already applied to an invoice');
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId, deletedAt: null },
    });
    if (!invoice) throw new BadRequestException('Invoice not found');

    const updated = await this.prisma.creditNote.update({
      where: { id },
      data: { appliedToInvoiceId: invoiceId },
      include: {
        customer: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    await this.invoicesService.updateBalanceDue(invoiceId);
    return updated;
  }

  private async generateCreditNoteNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.creditNote.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { creditNoteNumber: true },
    });
    if (!last) return 'CN-001';
    const num = parseInt(last.creditNoteNumber.split('-')[1], 10);
    return `CN-${String(num + 1).padStart(3, '0')}`;
  }
}
