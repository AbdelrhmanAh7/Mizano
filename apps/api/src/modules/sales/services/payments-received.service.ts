import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { CreatePaymentReceivedDto } from '../dto/create-payment-received.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { InvoicesService } from './invoices.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PaymentsReceivedService {
  constructor(
    private prisma: PrismaService,
    private invoicesService: InvoicesService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, createPaymentReceivedDto: CreatePaymentReceivedDto) {
    const { customerId, date, amount, paymentMode, depositToAccountId, reference, notes, allocations } = createPaymentReceivedDto;

    // Verify customer
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, deletedAt: null },
    });
    if (!customer) throw new BadRequestException('Customer not found');

    // Verify total allocation matches payment amount
    const totalAllocated = allocations.reduce((sum, a) => sum + parseFloat(a.amount), 0);
    if (Math.abs(totalAllocated - parseFloat(amount)) > 0.01) {
      throw new BadRequestException('Total allocation must equal payment amount');
    }

    // Verify all invoices exist and belong to customer
    for (const alloc of allocations) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: alloc.invoiceId, customerId, organizationId, deletedAt: null },
      });
      if (!invoice) throw new BadRequestException(`Invoice ${alloc.invoiceId} not found or doesn't belong to customer`);
    }

    // Get organization settings for default accounts
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        defaultArAccountId: true,
      },
    });

    if (!org?.defaultArAccountId) {
      throw new BadRequestException(
        'Please configure default Accounts Receivable account in organization settings before recording payments',
      );
    }

    // Verify the deposit account exists
    const depositAccount = await this.prisma.account.findFirst({
      where: { id: depositToAccountId, organizationId, isActive: true },
    });
    if (!depositAccount) {
      throw new BadRequestException('Deposit account not found or inactive');
    }

    const paymentNumber = await this.generatePaymentNumber(organizationId);
    const paymentAmount = parseFloat(amount);

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentReceived.create({
        data: {
          paymentNumber,
          customerId,
          date: new Date(date),
          amount: new Decimal(amount),
          paymentMode,
          depositToAccountId,
          reference,
          notes,
          organizationId,
          allocations: {
            create: allocations.map((alloc) => ({
              invoiceId: alloc.invoiceId,
              amount: new Decimal(alloc.amount),
            })),
          },
        },
        include: {
          customer: { select: { id: true, name: true } },
          allocations: { include: { invoice: { select: { id: true, invoiceNumber: true } } } },
        },
      });

      return created;
    });

    // Create accounting entry: Dr Bank/Cash / Cr AR
    const journalLines: Array<{ accountId: string; debit: string; credit: string; description?: string }> = [
      {
        accountId: depositToAccountId,
        debit: paymentAmount.toFixed(4),
        credit: '0',
        description: `Payment ${paymentNumber} - ${depositAccount.name}`,
      },
      {
        accountId: org.defaultArAccountId,
        debit: '0',
        credit: paymentAmount.toFixed(4),
        description: `Payment ${paymentNumber} - Accounts Receivable`,
      },
    ];

    // Create journal entry
    await this.journalsService.create(organizationId, {
      date: new Date(date).toISOString(),
      reference: `Payment ${paymentNumber}`,
      notes: `Payment received from ${customer.name}${reference ? ` - Ref: ${reference}` : ''}`,
      lines: journalLines,
    });

    // Update invoice balances
    for (const alloc of allocations) {
      await this.invoicesService.updateBalanceDue(alloc.invoiceId);
    }

    return payment;
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };

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

  async findOne(organizationId: string, id: string) {
    const payment = await this.prisma.paymentReceived.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        customer: true,
        allocations: { include: { invoice: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  private async generatePaymentNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.paymentReceived.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { paymentNumber: true },
    });
    if (!last) return 'PMT-001';
    const num = parseInt(last.paymentNumber.split('-')[1], 10);
    return `PMT-${String(num + 1).padStart(3, '0')}`;
  }
}
