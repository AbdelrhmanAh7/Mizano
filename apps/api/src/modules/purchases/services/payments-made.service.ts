import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { PaymentMadeQueryDto } from '../dto/payment-made-query.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { CreatePaymentMadeDto } from '../dto/create-payment-made.dto';
import { BillsService } from './bills.service';

@Injectable()
export class PaymentsMadeService {
  constructor(
    private prisma: PrismaService,
    private billsService: BillsService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, dto: CreatePaymentMadeDto) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: dto.vendorId, organizationId, deletedAt: null },
    });
    if (!vendor) throw new BadRequestException('Vendor not found');

    const totalAllocated = dto.allocations.reduce((sum, a) => sum + parseFloat(a.amount), 0);
    if (Math.abs(totalAllocated - parseFloat(dto.amount)) > 0.01)
      throw new BadRequestException('Allocation must equal payment');

    const paymentNumber = await this.generatePaymentNumber(organizationId);

    const payment = await this.prisma.paymentMade.create({
      data: {
        paymentNumber,
        vendorId: dto.vendorId,
        date: new Date(dto.date),
        amount: new Decimal(dto.amount),
        paymentMode: dto.paymentMode,
        paidFromAccountId: dto.paidFromAccountId,
        reference: dto.reference,
        notes: dto.notes,
        organizationId,
        allocations: {
          create: dto.allocations.map((a) => ({
            billId: a.billId,
            amount: new Decimal(a.amount),
          })),
        },
      },
      include: { vendor: { select: { id: true, name: true } }, allocations: true },
    });

    for (const alloc of dto.allocations) {
      await this.billsService.updateBalanceDue(alloc.billId);
    }

    // Create accounting entry: Dr AP / Cr Bank
    if (dto.paidFromAccountId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { defaultApAccountId: true },
      });

      if (org?.defaultApAccountId) {
        const amount = parseFloat(dto.amount);
        await this.journalsService.create(organizationId, {
          date: new Date(dto.date).toISOString(),
          reference: `Payment ${payment.paymentNumber}`,
          notes: `Vendor payment ${payment.paymentNumber}`,
          lines: [
            {
              accountId: org.defaultApAccountId,
              debit: amount.toFixed(4),
              credit: '0',
              description: `${payment.paymentNumber} - Accounts Payable`,
            },
            {
              accountId: dto.paidFromAccountId,
              debit: '0',
              credit: amount.toFixed(4),
              description: `${payment.paymentNumber} - Payment`,
            },
          ],
        });
      }
    }

    return payment;
  }

  async findAll(organizationId: string, query: PaymentMadeQueryDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc', vendorId } = query;
    const where: Record<string, unknown> = { organizationId, deletedAt: null };
    if (vendorId) where.vendorId = vendorId;
    const [payments, total] = await Promise.all([
      this.prisma.paymentMade.findMany({
        where,
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.paymentMade.count({ where }),
    ]);
    return { data: payments, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };
    return cursorPaginate(
      this.prisma.paymentMade,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
        include: { vendor: { select: { id: true, name: true } } },
      },
    );
  }

  async findOne(organizationId: string, id: string) {
    const payment = await this.prisma.paymentMade.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { vendor: true, allocations: { include: { bill: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  async bulkDelete(organizationId: string, ids: string[]) {
    const result = await this.prisma.paymentMade.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count, total: ids.length };
  }

  private async generatePaymentNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.paymentMade.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { paymentNumber: true },
    });
    if (!last) return 'VPMT-001';
    const num = parseInt(last.paymentNumber.split('-')[1], 10);
    return `VPMT-${String(num + 1).padStart(3, '0')}`;
  }
}
