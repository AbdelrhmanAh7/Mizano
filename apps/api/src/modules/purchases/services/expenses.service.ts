import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    const taxAmount = dto.taxInclusive ? 0 : parseFloat(dto.amount) * (parseFloat(dto.taxRate || '0') / 100);
    return this.prisma.expense.create({
      data: {
        date: new Date(dto.date),
        accountId: dto.accountId,
        vendorId: dto.vendorId,
        amount: new Decimal(dto.amount),
        taxAmount: new Decimal(taxAmount),
        taxInclusive: dto.taxInclusive || false,
        paidThroughAccountId: dto.paidThroughAccountId,
        description: dto.description,
        reference: dto.reference,
        projectId: dto.projectId,
        organizationId,
      },
      include: { account: { select: { id: true, code: true, name: true } }, vendor: { select: { id: true, name: true } } },
    });
  }

  async findAll(organizationId: string, query: PaginationDto) {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };
    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: { account: { select: { id: true, code: true, name: true } }, vendor: { select: { id: true, name: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { data: expenses, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { account: true, vendor: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }
}
