/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AssetStatus, DepreciationMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DepreciationService } from './depreciation.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

export const ORG_A = 'org-a';
export const ORG_B = 'org-b';
export const FIXED_NOW = new Date(2026, 2, 15, 12, 0, 0);

export type Row = Record<string, any>;

export function asset(id: string, overrides: Row = {}): Row {
  return {
    id,
    assetNumber: `FA-${id}`,
    name: `Asset ${id}`,
    purchasePrice: new Decimal('2500.0000'),
    salvageValue: new Decimal('250.0000'),
    depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
    accumulatedDepreciation: new Decimal('975.0000'),
    currentBookValue: new Decimal('1525.0000'),
    status: AssetStatus.ACTIVE,
    depreciationAccountId: `exp-${id}`,
    accumulatedDeprAccountId: `accdep-${id}`,
    organizationId: ORG_A,
    deletedAt: null,
    ...overrides,
  };
}

export function schedule(
  assetId: string,
  amount: string,
  accumulated: string,
  book: string,
  overrides: Row = {},
): Row {
  return {
    id: `sch-${assetId}-2026-03`,
    assetId,
    month: 3,
    year: 2026,
    amount: new Decimal(amount),
    accumulatedTotal: new Decimal(accumulated),
    bookValue: new Decimal(book),
    journalId: null,
    executedAt: null,
    organizationId: ORG_A,
    ...overrides,
  };
}

export const mock = (fn: unknown): jest.Mock => fn as jest.Mock;

export const live = (a: Row, where: Row): boolean =>
  a.organizationId === where.organizationId && a.status === where.status && a.deletedAt === null;

export const DECLINING: Row = {
  purchasePrice: new Decimal('10000.0000'),
  salvageValue: new Decimal('1000.0000'),
  depreciationMethod: DepreciationMethod.DECLINING_BALANCE,
};

export interface DepreciationTestContext {
  service: DepreciationService;
  prisma: MockPrismaClient;
  assets: Row[];
  schedules: Row[];
  journalFor: (assetId: string) => Row;
  lines: (data: Row) => { accountId: string; debit: string; credit: string }[];
}

export async function setupDepreciationTestContext(): Promise<DepreciationTestContext> {
  const prisma = createMockPrisma();
  const module: TestingModule = await Test.createTestingModule({
    providers: [DepreciationService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  const service = module.get(DepreciationService);

  jest.useFakeTimers({
    now: FIXED_NOW,
    doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
  });

  const assets: Row[] = [
    asset('sl'),
    asset('db', DECLINING),
    asset('last', DECLINING),
    asset('other', { organizationId: ORG_B }),
  ];
  const schedules: Row[] = [
    schedule('sl', '37.5000', '1012.5000', '1487.5000'),
    schedule('db', '333.3333', '333.3333', '9666.6667'),
    schedule('last', '12.3456', '9000.0000', '1000.0000'),
    schedule('other', '37.5000', '1012.5000', '1487.5000', { organizationId: ORG_B }),
  ];
  let journalSeq = 41;

  mock(prisma.asset.findMany).mockImplementation(async ({ where }) =>
    assets.filter((a) => live(a, where)),
  );
  mock(prisma.asset.findFirst).mockImplementation(
    async ({ where }) => assets.find((a) => a.id === where.id && live(a, where)) ?? null,
  );
  mock(prisma.asset.update).mockImplementation(async ({ where, data }) =>
    Object.assign(
      assets.find((a) => a.id === where.id && a.organizationId === where.organizationId)!,
      data,
    ),
  );

  mock(prisma.depreciationSchedule.findUnique).mockImplementation(async ({ where }) => {
    const assetId = where.assetId_month_year?.assetId ?? where.assetId;
    const month = where.assetId_month_year?.month ?? where.month;
    const year = where.assetId_month_year?.year ?? where.year;
    const hit = schedules.find(
      (s) =>
        (where.organizationId === undefined || s.organizationId === where.organizationId) &&
        (where.id === undefined || s.id === where.id) &&
        (assetId === undefined || (s.assetId === assetId && s.month === month && s.year === year)),
    );
    return hit ? { ...hit, asset: assets.find((a) => a.id === hit.assetId), journal: null } : null;
  });

  mock(prisma.depreciationSchedule.findFirst).mockImplementation(async ({ where }) => {
    const hit = schedules.find(
      (s) =>
        s.organizationId === where.organizationId &&
        (where.id === undefined || s.id === where.id) &&
        (where.assetId === undefined ||
          (s.assetId === where.assetId && s.month === where.month && s.year === where.year)),
    );
    return hit ? { ...hit, asset: assets.find((a) => a.id === hit.assetId), journal: null } : null;
  });

  mock(prisma.depreciationSchedule.findMany).mockImplementation(async ({ where }) =>
    schedules
      .filter(
        (s) =>
          s.organizationId === where.organizationId &&
          (where.assetId === undefined || s.assetId === where.assetId) &&
          (where.month === undefined || (s.month === where.month && s.year === where.year)) &&
          (where.executedAt === null ? s.executedAt === null : s.executedAt !== null),
      )
      .map((s) => ({ ...s, asset: assets.find((a) => a.id === s.assetId) })),
  );

  mock(prisma.journal.update).mockResolvedValue({} as never);

  mock(prisma.depreciationSchedule.updateMany).mockImplementation(async ({ where, data }) => {
    const hit = schedules.find(
      (s) =>
        s.id === where.id &&
        s.organizationId === where.organizationId &&
        (where.executedAt !== null || s.executedAt === null),
    );
    if (hit) Object.assign(hit, data);
    return { count: hit ? 1 : 0 };
  });

  mock(prisma.depreciationSchedule.update).mockImplementation(async ({ where, data }) =>
    Object.assign(
      schedules.find((s) => s.id === where.id && s.organizationId === where.organizationId)!,
      data,
    ),
  );

  mock(prisma.journal.findFirst).mockImplementation(async () => ({
    journalNumber: `JRN-${String(journalSeq).padStart(3, '0')}`,
  }));

  mock(prisma.journal.create).mockImplementation(async ({ data }) => {
    journalSeq++;
    return { id: `jrn-${journalSeq}`, ...data };
  });

  function journalFor(assetId: string): Row {
    const call = mock(prisma.journal.create).mock.calls.find(([arg]) =>
      String(arg.data.reference).startsWith(`DEP-FA-${assetId}-`),
    );
    expect(call).toBeDefined();
    return call![0].data;
  }

  function lines(data: Row): { accountId: string; debit: string; credit: string }[] {
    const rows: Row[] = data.lines.create;
    const debits = rows.reduce((s, l) => s.add(l.debit), new Decimal(0));
    const credits = rows.reduce((s, l) => s.add(l.credit), new Decimal(0));
    expect(rows.every((l) => l.debit instanceof Decimal && l.credit instanceof Decimal)).toBe(true);
    expect(debits.equals(credits)).toBe(true);
    return rows.map((l) => ({
      accountId: l.accountId,
      debit: l.debit.toFixed(4),
      credit: l.credit.toFixed(4),
    }));
  }

  return {
    service,
    prisma,
    assets,
    schedules,
    journalFor,
    lines,
  };
}
