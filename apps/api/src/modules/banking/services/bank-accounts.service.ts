import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { BankAccountType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { BankAccountQueryDto } from '../dto/bank-account-query.dto';
import { CreateBankAccountDto } from '../dto/create-bank-account.dto';
import { UpdateBankAccountDto } from '../dto/update-bank-account.dto';
import {
  bankBookBalances,
  endOfUtcDay,
  sumPostedLinesByAccount,
} from '../../reports/utils/report-utils';

@Injectable()
export class BankAccountsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Creates a bank account. A non-zero opening balance is rejected: opening balances are posted
   * journals, recorded in one place (Accounting > Opening Balances) so the ledger, trial balance
   * and cash KPIs all agree. Stored balances are never a source of truth.
   */
  async create(organizationId: string, dto: CreateBankAccountDto) {
    const opening = new Decimal(dto.openingBalance || '0');
    if (!opening.isZero()) {
      throw new BadRequestException(
        'Record opening bank balances through Opening Balances (Accounting → Opening Balances)',
      );
    }
    const linked = await this.prisma.account.findFirst({
      where: { id: dto.linkedAccountId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!linked) throw new BadRequestException('Linked ledger account not found');

    return this.prisma.bankAccount.create({
      data: {
        name: dto.name,
        accountNumber: dto.accountNumber,
        currency: dto.currency || 'USD',
        type: dto.type,
        systemBalance: new Decimal(0),
        bankBalance: new Decimal(0),
        linkedAccountId: dto.linkedAccountId,
        organizationId,
      },
    });
  }

  async findAll(organizationId: string, query: BankAccountQueryDto = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'name',
      sortOrder = 'asc',
      isActive,
      type,
    } = query;

    const where: Prisma.BankAccountWhereInput = { organizationId, deletedAt: null };

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (type) {
      where.type = type as BankAccountType;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { accountNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.bankAccount.findMany({
        where,
        include: { linkedAccount: { select: { id: true, code: true, name: true } } },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bankAccount.count({ where }),
    ]);

    // The stored systemBalance is not maintained; the book balance is the linked ledger balance
    // as of today (future-dated entries do not count yet).
    const totals = await sumPostedLinesByAccount(
      this.prisma,
      organizationId,
      { lte: endOfUtcDay(new Date()) },
      data.map((a) => a.linkedAccountId),
    );
    const withBook = data.map((a) => {
      const t = totals.get(a.linkedAccountId);
      return { ...a, systemBalance: t ? t.debit.sub(t.credit) : new Decimal(0) };
    });

    return { data: withBook, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(organizationId: string, id: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { linkedAccount: true },
    });
    if (!account) throw new NotFoundException('Bank account not found');
    const totals = await sumPostedLinesByAccount(
      this.prisma,
      organizationId,
      { lte: endOfUtcDay(new Date()) },
      [account.linkedAccountId],
    );
    const t = totals.get(account.linkedAccountId);
    return { ...account, systemBalance: t ? t.debit.sub(t.credit) : new Decimal(0) };
  }

  async update(organizationId: string, id: string, dto: UpdateBankAccountDto) {
    await this.findOne(organizationId, id);
    return this.prisma.bankAccount.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { _count: { select: { transactions: true } } },
    });
    if (!account) throw new NotFoundException('Bank account not found');
    if (account._count.transactions > 0) throw new BadRequestException('Account has transactions');
    await this.prisma.bankAccount.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Bank account deleted' };
  }

  async getDashboardStats(organizationId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [accounts, pendingCount, monthlyCount] = await Promise.all([
      bankBookBalances(this.prisma, organizationId),
      this.prisma.bankTransaction.count({
        where: { organizationId, status: 'PENDING' },
      }),
      this.prisma.bankTransaction.count({
        where: { organizationId, createdAt: { gte: startOfMonth } },
      }),
    ]);

    const totalSystemBalance = accounts.reduce(
      (sum, a) => sum + parseFloat(a.balance.toString()),
      0,
    );

    return {
      totalAccounts: accounts.length,
      totalSystemBalance,
      pendingTransactionCount: pendingCount,
      monthlyTransactionCount: monthlyCount,
    };
  }

  async getBalanceHistory(organizationId: string, id: string, days = 30) {
    await this.findOne(organizationId, id);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const transactions = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId: id, organizationId, date: { gte: since } },
      orderBy: { date: 'asc' },
      select: { date: true, amount: true, type: true },
    });

    let runningBalance = 0;
    const history = transactions.map((t) => {
      const amt = parseFloat(t.amount.toString());
      runningBalance += t.type === 'DEPOSIT' ? amt : -amt;
      return {
        date: t.date.toISOString().split('T')[0],
        runningBalance: Math.round(runningBalance * 100) / 100,
      };
    });

    return { history };
  }

  async updateBalance(id: string, amount: number, type: 'add' | 'subtract') {
    const account = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`Bank account ${id} not found for balance update`);
    const newBalance =
      type === 'add'
        ? parseFloat(account.systemBalance.toString()) + amount
        : parseFloat(account.systemBalance.toString()) - amount;
    await this.prisma.bankAccount.update({
      where: { id },
      data: { systemBalance: new Decimal(newBalance) },
    });
  }
}
