import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { BankTransactionCursorQueryDto } from '../dto/bank-transaction-cursor-query.dto';

import { BankTransactionType } from '@prisma/client';

export interface CreateBankTransactionDto {
  bankAccountId: string;
  date: string;
  type: BankTransactionType;
  amount: string | number;
  description?: string;
  reference?: string;
  payee?: string;
}

export interface BulkImportTransactionDto {
  date: string;
  type: BankTransactionType;
  amount: string | number;
  description?: string;
  reference?: string;
  payee?: string;
}

@Injectable()
export class BankTransactionsService {
  constructor(private prisma: PrismaService) {}

  /** A referenced bank account must belong to the caller's organization (body ids → 400). */
  private async assertOwnBankAccount(organizationId: string, bankAccountId: string): Promise<void> {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId },
      select: { id: true },
    });
    if (!account) throw new BadRequestException('Bank account not found');
  }

  async create(organizationId: string, dto: CreateBankTransactionDto) {
    await this.assertOwnBankAccount(organizationId, dto.bankAccountId);
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

  async bulkImport(
    organizationId: string,
    bankAccountId: string,
    transactions: BulkImportTransactionDto[],
  ) {
    await this.assertOwnBankAccount(organizationId, bankAccountId);
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
    query: PaginationDto & {
      bankAccountId?: string;
      status?: Prisma.EnumReconciliationStatusFilter | string;
      dateFrom?: string;
      dateTo?: string;
      amountMin?: string;
      amountMax?: string;
    },
  ) {
    const {
      page = 1,
      limit = 50,
      sortBy = 'date',
      sortOrder = 'desc',
      bankAccountId,
      status,
      dateFrom,
      dateTo,
      amountMin,
      amountMax,
    } = query;
    const where: Prisma.BankTransactionWhereInput = {
      organizationId,
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(status ? { status: status as Prisma.EnumReconciliationStatusFilter } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
      ...(amountMin || amountMax
        ? {
            amount: {
              ...(amountMin ? { gte: new Decimal(amountMin) } : {}),
              ...(amountMax ? { lte: new Decimal(amountMax) } : {}),
            },
          }
        : {}),
    };

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
    const {
      cursor,
      take,
      sortBy = 'date',
      sortOrder = 'desc',
      bankAccountId,
      status,
      dateFrom,
      dateTo,
      amountMin,
      amountMax,
    } = query;
    const where: Prisma.BankTransactionWhereInput = {
      organizationId,
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(status ? { status: status as Prisma.EnumReconciliationStatusFilter } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
      ...(amountMin || amountMax
        ? {
            amount: {
              ...(amountMin ? { gte: new Decimal(amountMin) } : {}),
              ...(amountMax ? { lte: new Decimal(amountMax) } : {}),
            },
          }
        : {}),
    };
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
