import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { JournalsService } from '../../modules/accounting/services/journals.service';
import { OrganizationsService } from '../../modules/organizations/organizations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MockPrismaClient } from '../mocks/prisma.mock';

/**
 * The real ledger command over a mocked Prisma client, so a posting service's unit test exercises
 * the actual balance, lock-date and source-link rules instead of a stub. Every account exists,
 * journal numbering starts at JRN-001 and `journal.create` echoes what was written.
 */
export function realJournalsService(
  prisma: MockPrismaClient,
  lockDate: Date | null = null,
): JournalsService {
  prisma.account.findMany.mockImplementation(((args: Prisma.AccountFindManyArgs) =>
    Promise.resolve(
      ((args.where?.id as { in: string[] }).in ?? []).map((id) => ({ id })),
    )) as never);
  prisma.$queryRaw.mockResolvedValue([{ max: 0 }] as never);
  prisma.journal.create.mockImplementation(((args: Prisma.JournalCreateArgs) =>
    Promise.resolve({
      id: 'journal-new',
      ...args.data,
      lines: (args.data.lines as { create: unknown[] }).create,
    })) as never);
  const organizations = { getLockDate: jest.fn().mockResolvedValue(lockDate) };
  return new JournalsService(
    prisma as unknown as PrismaService,
    organizations as unknown as OrganizationsService,
  );
}

export interface WrittenJournal {
  date: Date;
  sourceType?: string;
  sourceId?: string;
  reversalOfId?: string;
  isPosted?: boolean;
  lines: { accountId: string; debit: Decimal; credit: Decimal }[];
}

/** The data of every journal the ledger command wrote. */
export function writtenJournals(prisma: MockPrismaClient): WrittenJournal[] {
  return prisma.journal.create.mock.calls.map(([args]) => {
    const data = args.data as unknown as WrittenJournal & { lines: { create: unknown } };
    return { ...data, lines: data.lines.create as WrittenJournal['lines'] };
  });
}

/** Asserts debits equal credits (and are non-zero) to the last decimal place. */
export function expectBalanced(lines: WrittenJournal['lines']): void {
  const debit = lines.reduce((s, l) => s.add(l.debit), new Decimal(0));
  const credit = lines.reduce((s, l) => s.add(l.credit), new Decimal(0));
  expect(debit.toFixed(4)).toBe(credit.toFixed(4));
  expect(debit.greaterThan(0)).toBe(true);
}
