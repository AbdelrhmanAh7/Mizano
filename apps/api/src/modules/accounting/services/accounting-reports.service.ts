import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AccountingReportsService {
  constructor(private prisma: PrismaService) {}

  async getTrialBalance(organizationId: string, asOfDate?: string) {
    const accounts = await this.prisma.account.findMany({
      where: { organizationId, deletedAt: null, isActive: true },
      orderBy: { code: 'asc' },
    });

    const dateFilter: Prisma.JournalWhereInput = {};
    if (asOfDate) {
      dateFilter.date = { lte: new Date(asOfDate) };
    }

    const debitNormalTypes: string[] = [AccountType.ASSET, AccountType.EXPENSE];

    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);

    const trialBalanceAccounts = await Promise.all(
      accounts.map(async (account) => {
        const aggregation = await this.prisma.journalLine.aggregate({
          where: {
            accountId: account.id,
            journal: {
              organizationId,
              isPosted: true,
              deletedAt: null,
              ...dateFilter,
            },
          },
          _sum: {
            debit: true,
            credit: true,
          },
        });

        const sumDebits = new Decimal(aggregation._sum.debit?.toString() || '0');
        const sumCredits = new Decimal(aggregation._sum.credit?.toString() || '0');
        const openingBalance = new Decimal(account.openingBalance?.toString() || '0');

        const isDebitNormal = debitNormalTypes.includes(account.type);
        const netBalance = isDebitNormal
          ? sumDebits.minus(sumCredits).plus(openingBalance)
          : sumCredits.minus(sumDebits).plus(openingBalance);

        let debit = new Decimal(0);
        let credit = new Decimal(0);

        if (netBalance.greaterThan(0)) {
          if (isDebitNormal) {
            debit = netBalance;
          } else {
            credit = netBalance;
          }
        } else if (netBalance.lessThan(0)) {
          if (isDebitNormal) {
            credit = netBalance.abs();
          } else {
            debit = netBalance.abs();
          }
        }

        totalDebits = totalDebits.plus(debit);
        totalCredits = totalCredits.plus(credit);

        return {
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          debit,
          credit,
        };
      }),
    );

    // Filter out zero-balance accounts
    const nonZeroAccounts = trialBalanceAccounts.filter(
      (a) => !a.debit.isZero() || !a.credit.isZero(),
    );

    return {
      accounts: nonZeroAccounts,
      totals: { totalDebits, totalCredits },
      asOfDate: asOfDate || null,
    };
  }

  async getGeneralLedger(
    organizationId: string,
    accountId: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, organizationId, deletedAt: null },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const debitNormalTypes: string[] = [AccountType.ASSET, AccountType.EXPENSE];
    const isDebitNormal = debitNormalTypes.includes(account.type);

    // Calculate opening balance: all posted lines before dateFrom + openingBalance
    const openingBalanceBase = new Decimal(account.openingBalance?.toString() || '0');
    let openingBalance = openingBalanceBase;

    if (dateFrom) {
      const priorAggregation = await this.prisma.journalLine.aggregate({
        where: {
          accountId,
          journal: {
            organizationId,
            isPosted: true,
            deletedAt: null,
            date: { lt: new Date(dateFrom) },
          },
        },
        _sum: { debit: true, credit: true },
      });

      const priorDebits = new Decimal(priorAggregation._sum.debit?.toString() || '0');
      const priorCredits = new Decimal(priorAggregation._sum.credit?.toString() || '0');

      openingBalance = isDebitNormal
        ? priorDebits.minus(priorCredits).plus(openingBalanceBase)
        : priorCredits.minus(priorDebits).plus(openingBalanceBase);
    }

    // Get journal lines in date range
    const dateFilter: Prisma.JournalWhereInput = {};
    if (dateFrom || dateTo) {
      dateFilter.date = {};
      if (dateFrom) dateFilter.date.gte = new Date(dateFrom);
      if (dateTo) dateFilter.date.lte = new Date(dateTo);
    }

    const journalLines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        journal: {
          organizationId,
          isPosted: true,
          deletedAt: null,
          ...dateFilter,
        },
      },
      include: {
        journal: {
          select: {
            id: true,
            journalNumber: true,
            date: true,
            notes: true,
          },
        },
      },
      orderBy: { journal: { date: 'asc' } },
    });

    let runningBalance = openingBalance;
    const entries = journalLines.map((line) => {
      const debit = new Decimal(line.debit.toString());
      const credit = new Decimal(line.credit.toString());

      if (isDebitNormal) {
        runningBalance = runningBalance.plus(debit).minus(credit);
      } else {
        runningBalance = runningBalance.plus(credit).minus(debit);
      }

      return {
        date: line.journal.date,
        journalId: line.journal.id,
        journalNumber: line.journal.journalNumber,
        description: line.description || line.journal.notes || '',
        debit,
        credit,
        runningBalance,
      };
    });

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
      },
      openingBalance,
      entries,
      closingBalance: runningBalance,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    };
  }
}
