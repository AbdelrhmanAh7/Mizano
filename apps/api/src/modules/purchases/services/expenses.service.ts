import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { ExpenseQueryDto } from '../dto/expense-query.dto';
import { cursorPaginate } from '../../../common/utils/cursor-paginate';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { CreateExpenseDto } from '../dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
  ) {}

  async create(organizationId: string, dto: CreateExpenseDto) {
    const taxAmount = dto.taxInclusive
      ? 0
      : parseFloat(dto.amount) * (parseFloat(dto.taxRate || '0') / 100);
    const expense = await this.prisma.expense.create({
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
      include: {
        account: { select: { id: true, code: true, name: true } },
        vendor: { select: { id: true, name: true } },
      },
    });

    // Create accounting entry: Dr Expense / Dr VAT Receivable / Cr Paid-Through
    if (dto.accountId && dto.paidThroughAccountId) {
      const amount = parseFloat(dto.amount);
      const journalLines: Array<{
        accountId: string;
        debit: string;
        credit: string;
        description?: string;
      }> = [
        {
          accountId: dto.accountId,
          debit: amount.toFixed(4),
          credit: '0',
          description: `Expense - ${dto.description || 'General expense'}`,
        },
      ];

      if (!dto.taxInclusive && taxAmount > 0) {
        const org = await this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { defaultVatReceivableAccountId: true },
        });

        if (org?.defaultVatReceivableAccountId) {
          journalLines.push({
            accountId: org.defaultVatReceivableAccountId,
            debit: taxAmount.toFixed(4),
            credit: '0',
            description: `Expense - VAT Receivable`,
          });
        }
      }

      journalLines.push({
        accountId: dto.paidThroughAccountId,
        debit: '0',
        credit: (amount + taxAmount).toFixed(4),
        description: `Expense - Payment`,
      });

      await this.journalsService.create(organizationId, {
        date: new Date(dto.date).toISOString(),
        reference: `Expense ${expense.id.slice(-6)}`,
        notes: `Expense entry - ${dto.description || 'General expense'}`,
        lines: journalLines,
      });
    }

    return expense;
  }

  async findAll(organizationId: string, query: ExpenseQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'date',
      sortOrder = 'desc',
      vendorId,
      accountId,
      dateFrom,
      dateTo,
    } = query;
    const where: {
      organizationId: string;
      deletedAt: null;
      vendorId?: string;
      accountId?: string;
      date?: { gte?: Date; lte?: Date };
    } = { organizationId, deletedAt: null };
    if (vendorId) where.vendorId = vendorId;
    if (accountId) where.accountId = accountId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }
    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        include: {
          account: { select: { id: true, code: true, name: true } },
          vendor: { select: { id: true, name: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { data: expenses, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findAllCursor(organizationId: string, query: CursorPaginationDto) {
    const { cursor, take = 50, sortBy = 'date', sortOrder = 'desc' } = query;
    const where = { organizationId, deletedAt: null };
    return cursorPaginate(
      this.prisma.expense,
      where,
      { [sortBy]: sortOrder },
      {
        cursor,
        take,
        include: {
          account: { select: { id: true, code: true, name: true } },
          vendor: { select: { id: true, name: true } },
        },
      },
    );
  }

  async findOne(organizationId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { account: true, vendor: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  // === Bulk Operations ===

  async remove(organizationId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    await this.prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Expense deleted successfully' };
  }

  async bulkDelete(organizationId: string, ids: string[]) {
    const result = await this.prisma.expense.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count, total: ids.length };
  }

  async bulkCategorize(organizationId: string, ids: string[], accountId: string) {
    const result = await this.prisma.expense.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
      },
      data: { accountId },
    });
    return { categorized: result.count, total: ids.length };
  }

  async bulkApprove(organizationId: string, ids: string[]) {
    const result = await this.prisma.expense.updateMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
      },
      data: { status: 'POSTED' },
    });
    return { approved: result.count, total: ids.length };
  }
}
