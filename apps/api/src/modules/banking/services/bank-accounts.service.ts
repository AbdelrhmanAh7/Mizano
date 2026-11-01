import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { BankAccountType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { BankAccountQueryDto } from '../dto/bank-account-query.dto';
import { CreateBankAccountDto } from '../dto/create-bank-account.dto';
import { UpdateBankAccountDto } from '../dto/update-bank-account.dto';
import {
  endOfUtcDay,
  money,
  sumDecimals,
  sumPostedLinesByAccount,
} from '../../../common/utils/report-utils';

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
    await this.assertLinkableAccount(organizationId, dto.linkedAccountId);

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
        include: {
          linkedAccount: {
            select: { id: true, code: true, name: true, nameAr: true, nameEn: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bankAccount.count({ where }),
    ]);

    return {
      data: await this.withLedgerBalances(organizationId, data),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(organizationId: string, id: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { linkedAccount: true },
    });
    if (!account) throw new NotFoundException('Bank account not found');
    const [withBalance] = await this.withLedgerBalances(organizationId, [account]);
    return withBalance;
  }

  /**
   * The system balance of a bank account is its linked ledger account's posted balance (as the
   * dashboard shows it); the stored column is never updated by postings, so it always read 0.
   */
  private async withLedgerBalances<T extends { linkedAccountId: string }>(
    organizationId: string,
    accounts: T[],
  ): Promise<Array<T & { systemBalance: string }>> {
    const totals = await sumPostedLinesByAccount(
      this.prisma,
      organizationId,
      { lte: endOfUtcDay(new Date()) },
      [...new Set(accounts.map((a) => a.linkedAccountId))],
    );
    return accounts.map((account) => {
      const t = totals.get(account.linkedAccountId);
      return { ...account, systemBalance: money(t ? t.debit.sub(t.credit) : new Decimal(0)) };
    });
  }

  /**
   * A bank record's balance IS its ledger account's balance, so two bank records on one ledger
   * account would each show the full balance and every total would count it twice (#663).
   */
  private async assertLinkableAccount(
    organizationId: string,
    linkedAccountId: string,
    exceptBankAccountId?: string,
  ): Promise<void> {
    const [linked, taken] = await Promise.all([
      this.prisma.account.findFirst({
        where: { id: linkedAccountId, organizationId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.bankAccount.findFirst({
        where: {
          organizationId,
          linkedAccountId,
          deletedAt: null,
          ...(exceptBankAccountId ? { id: { not: exceptBankAccountId } } : {}),
        },
        select: { name: true },
      }),
    ]);
    if (!linked) throw new BadRequestException('Linked ledger account not found');
    if (taken) {
      throw new ConflictException(
        `This ledger account is already linked to the bank account "${taken.name}". Each bank account needs its own ledger account.`,
      );
    }
  }

  async update(organizationId: string, id: string, dto: UpdateBankAccountDto) {
    const current = await this.findOne(organizationId, id);
    if (dto.linkedAccountId !== undefined && dto.linkedAccountId !== current.linkedAccountId) {
      await this.assertLinkableAccount(organizationId, dto.linkedAccountId, id);
    }
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

    const [activeAccounts, pendingCount, monthlyCount] = await Promise.all([
      this.prisma.bankAccount.findMany({
        where: { organizationId, isActive: true, deletedAt: null },
        select: { linkedAccountId: true },
      }),
      this.prisma.bankTransaction.count({
        where: { organizationId, status: 'PENDING' },
      }),
      this.prisma.bankTransaction.count({
        where: { organizationId, createdAt: { gte: startOfMonth } },
      }),
    ]);

    const accounts = await this.withLedgerBalances(organizationId, activeAccounts);
    // One ledger balance per ledger account: bank records that share one count it once (#663).
    const ledgerBalances = new Map(accounts.map((a) => [a.linkedAccountId, a.systemBalance]));
    const totalSystemBalance = money(sumDecimals([...ledgerBalances.values()]));

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
