import { Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

/** Balance on the account's normal side from a debit-minus-credit net. */
export function natural(type: string, net: Prisma.Decimal): Prisma.Decimal {
  return type === 'ASSET' || type === 'EXPENSE' ? net : net.neg();
}

export interface LedgerBalance {
  type: string;
  net: Prisma.Decimal;
}

/**
 * Ground truth read straight from the database: debit minus credit per account over posted,
 * non-deleted journals of the organization. Never reads `Account.openingBalance`.
 */
export async function ledgerNetByAccount(
  prisma: PrismaService,
  organizationId: string,
): Promise<Map<string, LedgerBalance>> {
  const accounts = await prisma.account.findMany({
    where: { organizationId },
    select: { id: true, type: true },
  });
  const groups = await prisma.journalLine.groupBy({
    by: ['accountId'],
    where: { journal: { organizationId, isPosted: true, deletedAt: null } },
    _sum: { debit: true, credit: true },
  });
  const sums = new Map(groups.map((g) => [g.accountId, g._sum]));
  const result = new Map<string, LedgerBalance>();
  for (const a of accounts) {
    const s = sums.get(a.id);
    result.set(a.id, {
      type: a.type,
      net: (s?.debit ?? new Prisma.Decimal(0)).sub(s?.credit ?? new Prisma.Decimal(0)),
    });
  }
  return result;
}

/** Cash and bank ledger accounts of the tenant, found independently of the report code. */
export async function cashAccountIds(
  prisma: PrismaService,
  organizationId: string,
): Promise<string[]> {
  const [org, bankAccounts, typed] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { defaultBankAccountId: true, defaultCashAccountId: true },
    }),
    prisma.bankAccount.findMany({
      where: { organizationId, deletedAt: null },
      select: { linkedAccountId: true },
    }),
    prisma.account.findMany({
      where: {
        organizationId,
        type: 'ASSET',
        subType: { in: ['cash', 'bank', 'CASH', 'BANK', 'Cash', 'Bank'] },
      },
      select: { id: true },
    }),
  ]);
  const ids = new Set<string>();
  for (const b of bankAccounts) ids.add(b.linkedAccountId);
  for (const a of typed) ids.add(a.id);
  if (org.defaultBankAccountId) ids.add(org.defaultBankAccountId);
  if (org.defaultCashAccountId) ids.add(org.defaultCashAccountId);
  return [...ids];
}
