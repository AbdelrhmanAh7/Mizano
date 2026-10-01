import { Prisma } from '@prisma/client';
import { ApiHelper } from './api-client.helper';
import { PrismaService } from '../../src/prisma/prisma.service';

/** Accounts of the seeded services chart that the posting specs rely on. */
export interface SeededChart {
  cash: string;
  bank: string;
  ap: string;
  vatPayable: string;
  vatInput: string;
  revenue: string;
  rent: string;
}

/** Seeds the default chart for the tenant and resolves the accounts by code. */
export async function seedChart(api: ApiHelper): Promise<SeededChart> {
  const seeded = await api.post('/accounts/seed-defaults');
  if (seeded.status !== 201) throw new Error(`seed-defaults failed: ${seeded.status}`);
  const list = await api.get('/accounts').query({ limit: 500 });
  const byCode = new Map<string, string>(
    list.body.data.map((x: { code: string; id: string }) => [x.code, x.id]),
  );
  const pick = (code: string): string => {
    const id = byCode.get(code);
    if (!id) throw new Error(`account ${code} missing from the seeded chart`);
    return id;
  };
  return {
    cash: pick('1000'),
    bank: pick('1010'),
    ap: pick('2000'),
    vatPayable: pick('2200'),
    vatInput: pick('2210'),
    revenue: pick('4000'),
    rent: pick('6100'),
  };
}

/** Creates an account through the API (it takes the organization's base currency). */
export async function createAccount(
  api: ApiHelper,
  code: string,
  name: string,
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE',
): Promise<string> {
  const res = await api.post('/accounts').send({ code, name, type });
  if (res.status !== 201) throw new Error(`create account ${code} failed: ${res.status}`);
  return res.body.id as string;
}

/** Exact debit/credit sums of a set of journal lines. */
export function sumLines(lines: Array<{ debit: unknown; credit: unknown }>): {
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
} {
  let debit = new Prisma.Decimal(0);
  let credit = new Prisma.Decimal(0);
  for (const l of lines) {
    debit = debit.add(String(l.debit));
    credit = credit.add(String(l.credit));
  }
  return { debit, credit };
}

/** Signature input for journal lines read straight from the database. */
export function dbLines(
  lines: Array<{ accountId: string; debit: unknown; credit: unknown }>,
): Array<{ accountId: string; debit: string; credit: string }> {
  return lines.map((l) => ({
    accountId: l.accountId,
    debit: String(l.debit),
    credit: String(l.credit),
  }));
}

/** Net (debit - credit) balance of one account over posted, non-deleted journals. */
export async function accountBalance(
  prisma: PrismaService,
  organizationId: string,
  accountId: string,
): Promise<Prisma.Decimal> {
  const { _sum } = await prisma.journalLine.aggregate({
    where: { accountId, journal: { organizationId, isPosted: true, deletedAt: null } },
    _sum: { debit: true, credit: true },
  });
  return (_sum.debit ?? new Prisma.Decimal(0)).sub(_sum.credit ?? new Prisma.Decimal(0));
}
