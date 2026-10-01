import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  OnboardingStatusResponse,
  OpeningBalancesStepDto,
} from '../../organizations/dto/onboarding.dto';
import { OrganizationsService } from '../../organizations/organizations.service';
import { JournalSourceType, JournalsService } from './journals.service';

/** Account subType that marks the equity account taking the opening-balance difference. */
export const OPENING_BALANCE_EQUITY_SUBTYPE = 'OPENING_BALANCE_EQUITY';
export const OPENING_BALANCE_EQUITY_NAME = 'Opening Balance Equity';

/** Account types whose normal balance is a debit. */
const DEBIT_NORMAL: AccountType[] = [AccountType.ASSET, AccountType.EXPENSE];

interface OpeningLine {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

@Injectable()
export class OpeningBalancesService {
  constructor(
    private prisma: PrismaService,
    private journalsService: JournalsService,
    private organizationsService: OrganizationsService,
  ) {}

  /**
   * Posts the opening balances as ONE balanced journal dated on the opening date. Any difference
   * between debits and credits goes to the Opening Balance Equity account (an error when none can
   * be resolved). The journal's source is (OPENING_BALANCE, organizationId), so a retried or
   * concurrent request cannot post a second time.
   *
   * Correcting posted balances is an explicit act (`replaceExisting`): the current opening
   * journal is reversed by a linked reversal and the new balances are posted as revision N+1
   * (source id `${organizationId}:${N+1}`), all in the same transaction under a per-organization
   * lock. Posted history is never edited.
   */
  async post(
    organizationId: string,
    dto: OpeningBalancesStepDto,
  ): Promise<OnboardingStatusResponse> {
    const openingDate = new Date(dto.openingDate);
    if (Number.isNaN(openingDate.getTime())) throw new BadRequestException('Invalid opening date');

    const entries = this.parseEntries(dto);

    await this.prisma.$transaction(async (tx) => {
      // One writer at a time per organization: replace and first-post cannot interleave.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`opening-balances:${organizationId}`}))`;

      // With replaceExisting and no non-zero entry the posted balances are cleared: the current
      // opening journal is reversed and nothing new is posted.
      if (entries.length > 0 || dto.replaceExisting) {
        const lines =
          entries.length > 0
            ? await this.buildLines(tx, organizationId, entries, dto.equityAccountId)
            : [];

        const current = await tx.journal.findFirst({
          where: {
            organizationId,
            sourceType: JournalSourceType.OPENING_BALANCE,
            deletedAt: null,
            reversalOfId: null,
            reversedBy: null,
          },
          select: { id: true, date: true },
        });
        if (current) {
          if (!dto.replaceExisting) {
            throw new ConflictException(
              'Opening balances have already been posted; send replaceExisting to reverse and repost them',
            );
          }
          await this.journalsService.reverse(
            organizationId,
            current.id,
            { date: current.date.toISOString() },
            {
              tx,
              source: {
                type: JournalSourceType.OPENING_BALANCE,
                id: `${organizationId}:reversal:${current.id}`,
              },
            },
          );
        }

        if (lines.length > 0) {
          const revisions = await tx.journal.count({
            where: {
              organizationId,
              sourceType: JournalSourceType.OPENING_BALANCE,
              reversalOfId: null,
            },
          });
          await this.journalsService.create(
            organizationId,
            {
              date: openingDate.toISOString(),
              reference: 'Opening Balances',
              notes: 'Opening balances',
              lines,
            },
            {
              tx,
              source: {
                type: JournalSourceType.OPENING_BALANCE,
                id: revisions === 0 ? organizationId : `${organizationId}:${revisions + 1}`,
              },
            },
          );
        }
      }

      await tx.organizationOnboarding.upsert({
        where: { organizationId },
        create: { organizationId, openingBalancesCompleted: true },
        update: { openingBalancesCompleted: true },
      });
    });

    return this.organizationsService.getOnboardingStatus(organizationId);
  }

  /** Validates amounts as exact decimals; zero balances need no entry. */
  private parseEntries(
    dto: OpeningBalancesStepDto,
  ): { accountId: string; amount: Decimal; isDebit?: boolean }[] {
    const seen = new Set<string>();
    const entries: { accountId: string; amount: Decimal; isDebit?: boolean }[] = [];
    for (const [i, balance] of dto.balances.entries()) {
      let amount: Decimal;
      try {
        amount = new Decimal(balance.amount);
      } catch {
        throw new BadRequestException(`balances[${i}].amount must be a valid decimal number`);
      }
      if (!amount.isFinite() || amount.isNegative()) {
        throw new BadRequestException(`balances[${i}].amount must be a non-negative number`);
      }
      if (seen.has(balance.accountId)) {
        throw new BadRequestException('Each account can only appear once in the opening balances');
      }
      seen.add(balance.accountId);
      if (!amount.isZero()) {
        entries.push({ accountId: balance.accountId, amount, isDebit: balance.isDebit });
      }
    }
    return entries;
  }

  private async buildLines(
    tx: Prisma.TransactionClient,
    organizationId: string,
    entries: { accountId: string; amount: Decimal; isDebit?: boolean }[],
    equityAccountId?: string,
  ): Promise<OpeningLine[]> {
    const accounts = await tx.account.findMany({
      where: {
        id: { in: entries.map((e) => e.accountId) },
        organizationId,
        deletedAt: null,
      },
      select: { id: true, type: true },
    });
    if (accounts.length !== entries.length) {
      throw new BadRequestException('One or more accounts not found');
    }

    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    const lines: OpeningLine[] = entries.map((entry) => {
      const account = accounts.find((a) => a.id === entry.accountId) as { type: AccountType };
      const isDebit = entry.isDebit ?? DEBIT_NORMAL.includes(account.type);
      if (isDebit) totalDebit = totalDebit.add(entry.amount);
      else totalCredit = totalCredit.add(entry.amount);
      return {
        accountId: entry.accountId,
        debit: isDebit ? entry.amount.toFixed(4) : '0',
        credit: isDebit ? '0' : entry.amount.toFixed(4),
        description: 'Opening Balance',
      };
    });

    const difference = totalDebit.sub(totalCredit);
    if (!difference.isZero()) {
      const equityId = await this.resolveOpeningBalanceEquity(tx, organizationId, equityAccountId);
      lines.push({
        accountId: equityId,
        debit: difference.isNegative() ? difference.abs().toFixed(4) : '0',
        credit: difference.isPositive() ? difference.toFixed(4) : '0',
        description: 'Opening Balance Equity (difference)',
      });
    }
    return lines;
  }

  /** The explicit equity account, else the org's "Opening Balance Equity" account. */
  private async resolveOpeningBalanceEquity(
    tx: Prisma.TransactionClient,
    organizationId: string,
    explicitId?: string,
  ): Promise<string> {
    if (explicitId) {
      const account = await tx.account.findFirst({
        where: {
          id: explicitId,
          organizationId,
          deletedAt: null,
          isActive: true,
          type: AccountType.EQUITY,
        },
        select: { id: true },
      });
      if (!account) {
        throw new BadRequestException(
          'equityAccountId must be an active equity account of this organization',
        );
      }
      return account.id;
    }

    const account = await tx.account.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        isActive: true,
        type: AccountType.EQUITY,
        OR: [
          { subType: OPENING_BALANCE_EQUITY_SUBTYPE },
          { name: { equals: OPENING_BALANCE_EQUITY_NAME, mode: 'insensitive' } },
        ],
      },
      orderBy: { code: 'asc' },
      select: { id: true },
    });
    if (!account) {
      throw new BadRequestException(
        `The opening balances do not balance and no "${OPENING_BALANCE_EQUITY_NAME}" equity account exists. ` +
          'Create one (or pass equityAccountId) so the difference can be posted.',
      );
    }
    return account.id;
  }
}
