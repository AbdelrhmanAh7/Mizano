import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class VendorCreditsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: dto.vendorId, organizationId, deletedAt: null },
    });
    if (!vendor) throw new BadRequestException('Vendor not found');

    const bill = await this.prisma.bill.findFirst({
      where: { id: dto.billId, organizationId, deletedAt: null },
    });
    if (!bill) throw new BadRequestException('Bill not found');

    const creditNumber = await this.generateCreditNumber(organizationId);

    return this.prisma.vendorCredit.create({
      data: {
        creditNumber,
        vendorId: dto.vendorId,
        billId: dto.billId,
        date: dto.date ? new Date(dto.date) : new Date(),
        reason: dto.reason || '',
        amount: new Decimal(dto.amount),
        organizationId,
      },
      include: {
        vendor: { select: { id: true, name: true } },
        bill: { select: { id: true, billNumber: true } },
      },
    });
  }

  async findAll(organizationId: string, query: PaginationDto & { vendorId?: string }) {
    const where: any = { organizationId, deletedAt: null };
    if (query.vendorId) where.vendorId = query.vendorId;

    const page = query.page || 1;
    const limit = query.limit || 20;

    const [data, total] = await Promise.all([
      this.prisma.vendorCredit.findMany({
        where,
        include: {
          vendor: { select: { id: true, name: true } },
          bill: { select: { id: true, billNumber: true } },
          appliedToBill: { select: { id: true, billNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.vendorCredit.count({ where }),
    ]);

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string) {
    const credit = await this.prisma.vendorCredit.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        vendor: { select: { id: true, name: true, email: true } },
        bill: { select: { id: true, billNumber: true, total: true, status: true } },
        appliedToBill: { select: { id: true, billNumber: true, total: true, status: true } },
      },
    });
    if (!credit) throw new NotFoundException('Vendor credit not found');
    return credit;
  }

  async applyToBill(organizationId: string, id: string, billId: string) {
    const credit = await this.findOne(organizationId, id);
    if (credit.appliedToBillId) {
      throw new BadRequestException('Vendor credit is already applied to a bill');
    }

    const bill = await this.prisma.bill.findFirst({
      where: { id: billId, organizationId, deletedAt: null },
    });
    if (!bill) throw new BadRequestException('Target bill not found');

    return this.prisma.vendorCredit.update({
      where: { id },
      data: { appliedToBillId: billId },
      include: {
        vendor: { select: { id: true, name: true } },
        bill: { select: { id: true, billNumber: true } },
        appliedToBill: { select: { id: true, billNumber: true } },
      },
    });
  }

  async refund(organizationId: string, id: string, dto: { bankAccountId: string; date?: string }) {
    const credit = await this.findOne(organizationId, id);
    if (credit.refundedAt) {
      throw new BadRequestException('Vendor credit has already been refunded');
    }

    return this.prisma.vendorCredit.update({
      where: { id },
      data: {
        refundedAt: dto.date ? new Date(dto.date) : new Date(),
      },
      include: {
        vendor: { select: { id: true, name: true } },
        bill: { select: { id: true, billNumber: true } },
      },
    });
  }

  private async generateCreditNumber(organizationId: string): Promise<string> {
    const last = await this.prisma.vendorCredit.findFirst({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: { creditNumber: true },
    });
    if (!last?.creditNumber) return 'VC-001';
    const num = parseInt(last.creditNumber.split('-')[1], 10);
    return `VC-${String(num + 1).padStart(3, '0')}`;
  }
}
