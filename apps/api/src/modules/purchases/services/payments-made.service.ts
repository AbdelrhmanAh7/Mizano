import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { BillsService } from './bills.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PaymentsMadeService {
  constructor(private prisma: PrismaService, private billsService: BillsService) {}

  async create(organizationId: string, dto: any) {
    const vendor = await this.prisma.vendor.findFirst({ where: { id: dto.vendorId, organizationId, deletedAt: null } });
    if (!vendor) throw new BadRequestException('Vendor not found');

    const totalAllocated = dto.allocations.reduce((sum: number, a: any) => sum + parseFloat(a.amount), 0);
    if (Math.abs(totalAllocated - parseFloat(dto.amount)) > 0.01) throw new BadRequestException('Allocation must equal payment');

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
        allocations: { create: dto.allocations.map((a: any) => ({ billId: a.billId, amount: new Decimal(a.amount) })) },
      },
      include: { vendor: { select: { id: true, name: true } }, allocations: true },
    });

    for (const alloc of dto.allocations) {
      await this.billsService.updateBalanceDue(alloc.billId);
    }

    return payment;
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };
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

  async findOne(organizationId: string, id: string) {
    const payment = await this.prisma.paymentMade.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { vendor: true, allocations: { include: { bill: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  private async generatePaymentNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.paymentMade.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' }, select: { paymentNumber: true } });
    if (!last) return 'VPMT-001';
    const num = parseInt(last.paymentNumber.split('-')[1], 10);
    return `VPMT-${String(num + 1).padStart(3, '0')}`;
  }
}
