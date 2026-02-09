import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { BankTransactionCursorQueryDto } from '../dto/bank-transaction-cursor-query.dto';

@Injectable()
export class BankTransactionsService {
  constructor(private prisma: PrismaService) {}

  async create(organizationId: string, dto: any) {
    return this.prisma.bankTransaction.create({
      data: {
        bankAccountId: dto.bankAccountId,
        date: new Date(dto.date),
        type: dto.type,
        amount: new Decimal(dto.amount),
        description: dto.description,
        reference: dto.reference,
        payee: dto.payee,
        organizationId,
      },
    });
  }

  async bulkImport(organizationId: string, bankAccountId: string, transactions: any[]) {
    const created = await this.prisma.bankTransaction.createMany({
      data: transactions.map((t) => ({
        bankAccountId,
        date: new Date(t.date),
        type: t.type,
        amount: new Decimal(t.amount),
        description: t.description,
        reference: t.reference,
        payee: t.payee,
        organizationId,
      })),
    });
    return { imported: created.count };
  }

  async findAll(
    organizationId: string,
    query: PaginationDto & { bankAccountId?: string; status?: string },
  ) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'date',
      sortOrder = 'desc',
      bankAccountId,
      status,
    } = query;
    const where: any = { organizationId };
    if (bankAccountId) where.bankAccountId = bankAccountId;
    if (status) where.status = status;

    const [transactions, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        include: { bankAccount: { select: { id: true, name: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);
    return {
      data: transactions,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllCursor(organizationId: string, query: BankTransactionCursorQueryDto) {
    const { cursor, take, sortBy = 'date', sortOrder = 'desc', bankAccountId, status } = query;
    const where: any = { organizationId };
    if (bankAccountId) where.bankAccountId = bankAccountId;
    if (status) where.status = status;
    return cursorPaginate(
      this.prisma.bankTransaction,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
        include: { bankAccount: { select: { id: true, name: true } } },
      },
    );
  }

  async findOne(organizationId: string, id: string) {
    const transaction = await this.prisma.bankTransaction.findFirst({
      where: { id, organizationId },
      include: { bankAccount: true },
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }
}
