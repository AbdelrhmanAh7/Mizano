import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isDebitNormal,
  money,
  naturalBalance,
  parseReportDate,
  postedJournalWhere,
  sumPostedLinesByAccount,
  toDecimal,
} from '../../reports/utils/report-utils';

export interface TrialBalanceAccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  /** Exact Decimal; serialized as a plain decimal string (JSON). */
  debit: Decimal;
  credit: Decimal;
}

export interface TrialBalanceResult {
  accounts: TrialBalanceAccountRow[];
  totals: { totalDebits: Decimal; totalCredits: Decimal };
  isBalanced: boolean;
  asOfDate: string | null;
}

export interface GeneralLedgerEntry {
  date: Date;
  journalId: string;
  journalNumber: string;
  description: string;
  debit: string;
  credit: string;
  runningBalance: string;
}

export interface GeneralLedgerResult {
  account: { id: string; code: string; name: string; type: string };
  openingBalance: string;
  entries: GeneralLedgerEntry[];
  closingBalance: string;
  dateFrom: string | null;
  dateTo: string | null;
}

/**
 * Ledger reports derived only from posted, non-deleted journal lines. Opening balances are posted
 * journals (see OpeningBalancesService), so `Account.openingBalance` is never added here.
 */
@Injectable()
export class AccountingReportsService {
  constructor(private prisma: PrismaService) {}

  async getTrialBalance(organizationId: string, asOfDate?: string): Promise<TrialBalanceResult> {
    const asOf = parseReportDate(asOfDate, 'end', 'asOfDate');

    const [accounts, totals] = await Promise.all([
      this.prisma.account.findMany({
        where: { organizationId, deletedAt: null },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true, type: true },
      }),
      sumPostedLinesByAccount(this.prisma, organizationId, asOf ? { lte: asOf } : undefined),
    ]);

    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);
    const rows: TrialBalanceAccountRow[] = [];

    for (const account of accounts) {
      const t = totals.get(account.id);
      if (!t) continue;
      const net = naturalBalance(account.type, t.debit, t.credit);
      if (net.isZero()) continue;

      // A negative natural balance sits on the opposite side of the account's normal side.
      const onDebitSide = isDebitNormal(account.type) ? net.greaterThan(0) : net.lessThan(0);
      const amount = net.abs();
      const debit = onDebitSide ? amount : new Decimal(0);
      const credit = onDebitSide ? new Decimal(0) : amount;
      totalDebits = totalDebits.add(debit);
      totalCredits = totalCredits.add(credit);
      rows.push({
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        debit,
        credit,
      });
    }

    return {
      accounts: rows,
      totals: { totalDebits, totalCredits },
      isBalanced: totalDebits.equals(totalCredits),
      asOfDate: asOfDate || null,
    };
  }

  async getGeneralLedger(
    organizationId: string,
    accountId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<GeneralLedgerResult> {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, organizationId, deletedAt: null },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const from = parseReportDate(dateFrom, 'start', 'dateFrom');
    const to = parseReportDate(dateTo, 'end', 'dateTo');

    let openingBalance = new Decimal(0);
    if (from) {
      const prior = await sumPostedLinesByAccount(this.prisma, organizationId, { lt: from }, [
        accountId,
      ]);
      const t = prior.get(accountId);
      if (t) openingBalance = naturalBalance(account.type, t.debit, t.credit);
    }

    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = from;
    if (to) range.lte = to;

    const journalLines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        journal: postedJournalWhere(organizationId, from || to ? range : undefined),
      },
      include: {
        journal: {
          select: { id: true, journalNumber: true, date: true, notes: true },
        },
      },
      orderBy: [{ journal: { date: 'asc' } }, { journalId: 'asc' }, { id: 'asc' }],
    });

    let runningBalance = openingBalance;
    const entries = journalLines.map((line): GeneralLedgerEntry => {
      const debit = toDecimal(line.debit);
      const credit = toDecimal(line.credit);
      runningBalance = runningBalance.add(naturalBalance(account.type, debit, credit));
      return {
        date: line.journal.date,
        journalId: line.journal.id,
        journalNumber: line.journal.journalNumber,
        description: line.description || line.journal.notes || '',
        debit: money(debit),
        credit: money(credit),
        runningBalance: money(runningBalance),
      };
    });

    return {
      account: { id: account.id, code: account.code, name: account.name, type: account.type },
      openingBalance: money(openingBalance),
      entries,
      closingBalance: money(runningBalance),
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    };
  }
}
