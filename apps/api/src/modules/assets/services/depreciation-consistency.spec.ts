import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AssetStatus, AssetType, DepreciationMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AssetsService } from './assets.service';
import { DepreciationService } from './depreciation.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

// #511: schedule generation rounds once (ROUND_HALF_UP, 4dp) and posting rejects any
// row whose amount differs from either balance delta, before the executedAt claim.

const ORG = 'org-a';
const NOW = new Date(2026, 2, 15, 12, 0, 0);

type Row = Record<string, unknown>;
const mock = (fn: unknown): jest.Mock => fn as jest.Mock;
const d = (v: unknown): Decimal => v as Decimal;

describe('depreciation schedule generation', () => {
  let service: AssetsService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module = await Test.createTestingModule({
      providers: [AssetsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AssetsService);
    mock(prisma.account.count).mockResolvedValue(3);
    mock(prisma.asset.findFirst).mockResolvedValue(null);
    mock(prisma.asset.create).mockResolvedValue({ id: 'a1' });
  });

  function createdRows(): Row[] {
    return mock(prisma.depreciationSchedule.createMany).mock.calls[0][0].data;
  }

  function expectExactChain(rows: Row[], start: Decimal, salvage: Decimal): void {
    let prevAcc = new Decimal(0);
    let prevBook = start;
    for (const r of rows) {
      const amount = d(r.amount);
      expect(amount.decimalPlaces()).toBeLessThanOrEqual(4);
      expect(d(r.accumulatedTotal).minus(prevAcc).equals(amount)).toBe(true);
      expect(prevBook.minus(d(r.bookValue)).equals(amount)).toBe(true);
      expect(d(r.accumulatedTotal).plus(d(r.bookValue)).equals(start)).toBe(true);
      prevAcc = d(r.accumulatedTotal);
      prevBook = d(r.bookValue);
    }
    expect(prevBook.equals(salvage)).toBe(true);
  }

  const dto = (over: Row) => ({
    name: 'Rig',
    assetType: AssetType.MACHINERY,
    purchaseDate: '2026-01-01',
    purchasePrice: 1000,
    salvageValue: 0,
    usefulLifeYears: 1,
    depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
    assetAccountId: 'x',
    depreciationAccountId: 'y',
    accumulatedDeprAccountId: 'z',
    ...over,
  });

  it('straight-line 1000/12 rounds to 83.3333 and the last period absorbs the residual', async () => {
    await service.create(ORG, dto({}) as never);
    const rows = createdRows();
    expect(rows).toHaveLength(12);
    expect(d(rows[0].amount).toFixed(4)).toBe('83.3333');
    expect(d(rows[11].amount).toFixed(4)).toBe('83.3337');
    expectExactChain(rows, new Decimal(1000), new Decimal(0));
  });

  it('declining balance keeps every amount equal to both deltas and ends on salvage', async () => {
    await service.create(
      ORG,
      dto({
        purchasePrice: 10000,
        salvageValue: 1000,
        usefulLifeYears: 5,
        depreciationMethod: DepreciationMethod.DECLINING_BALANCE,
      }) as never,
    );
    const rows = createdRows();
    expect(d(rows[0].amount).toFixed(4)).toBe('333.3333');
    expectExactChain(rows, new Decimal(10000), new Decimal(1000));
  });

  it('regeneration rounds the same way, keeps executed history and lands exactly on salvage', async () => {
    mock(prisma.asset.findFirst).mockResolvedValue({ id: 'a1', status: AssetStatus.ACTIVE });
    mock(prisma.asset.update).mockResolvedValue({
      id: 'a1',
      salvageValue: new Decimal(0),
      usefulLifeYears: 1,
      purchasePrice: new Decimal(1000),
      purchaseDate: new Date(2026, 0, 1),
      depreciationMethod: DepreciationMethod.STRAIGHT_LINE,
    });
    mock(prisma.depreciationSchedule.findFirst).mockResolvedValue({
      month: 3,
      year: 2026,
      accumulatedTotal: new Decimal('300.0000'),
      bookValue: new Decimal('700.0000'),
    });

    await service.update(ORG, 'a1', { salvageValue: 0 } as never);

    expect(prisma.depreciationSchedule.deleteMany).toHaveBeenCalledWith({
      where: { assetId: 'a1', executedAt: null },
    });
    const rows = createdRows();
    expect(rows).toHaveLength(9);
    expect(d(rows[0].amount).toFixed(4)).toBe('77.7778');
    expect(d(rows[8].amount).toFixed(4)).toBe('77.7776');
    let prevAcc = new Decimal('300.0000');
    let prevBook = new Decimal('700.0000');
    for (const r of rows) {
      expect(d(r.accumulatedTotal).minus(prevAcc).equals(d(r.amount))).toBe(true);
      expect(prevBook.minus(d(r.bookValue)).equals(d(r.amount))).toBe(true);
      prevAcc = d(r.accumulatedTotal);
      prevBook = d(r.bookValue);
    }
    expect(prevBook.equals(0)).toBe(true);
    expect(prevAcc.equals(1000)).toBe(true);
  });
});

describe('posting rejects schedule rows inconsistent with balance deltas', () => {
  let service: DepreciationService;
  let prisma: MockPrismaClient;
  let entry: Row;

  const asset = (): Row => ({
    id: 'sl',
    assetNumber: 'FA-sl',
    name: 'Asset sl',
    salvageValue: new Decimal('250.0000'),
    accumulatedDepreciation: new Decimal('975.0000'),
    currentBookValue: new Decimal('1525.0000'),
    status: AssetStatus.ACTIVE,
    depreciationAccountId: 'exp',
    accumulatedDeprAccountId: 'accdep',
    organizationId: ORG,
    deletedAt: null,
  });

  const row = (amount: string, accumulated: string, book: string): Row => ({
    id: 'sch-1',
    assetId: 'sl',
    month: 3,
    year: 2026,
    amount: new Decimal(amount),
    accumulatedTotal: new Decimal(accumulated),
    bookValue: new Decimal(book),
    journalId: null,
    executedAt: null,
    organizationId: ORG,
  });

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module = await Test.createTestingModule({
      providers: [DepreciationService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DepreciationService);
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    mock(prisma.asset.findMany).mockImplementation(async () => [asset()]);
    mock(prisma.asset.findFirst).mockImplementation(async () => asset());
    mock(prisma.depreciationSchedule.findFirst).mockImplementation(async () => entry);
    mock(prisma.depreciationSchedule.updateMany).mockResolvedValue({ count: 1 });
    mock(prisma.depreciationSchedule.update).mockResolvedValue({});
    mock(prisma.asset.update).mockResolvedValue({});
    mock(prisma.journal.findFirst).mockResolvedValue({ journalNumber: 'JRN-041' });
    mock(prisma.journal.create).mockResolvedValue({ id: 'jrn-42' });
  });

  afterEach(() => jest.useRealTimers());

  function expectNothingPosted(): void {
    expect(prisma.depreciationSchedule.updateMany).not.toHaveBeenCalled();
    expect(prisma.journal.create).not.toHaveBeenCalled();
    expect(prisma.asset.update).not.toHaveBeenCalled();
  }

  // amount 37.5000, previous book 1525.0000, next book 1487.5001: book delta is 37.4999
  const badBook = (): Row => row('37.5000', '1012.5000', '1487.5001');
  // accumulated delta is 37.5001
  const badAccumulated = (): Row => row('37.5000', '1012.5001', '1487.5000');

  it.each([
    ['book delta', badBook],
    ['accumulated delta', badAccumulated],
  ])('monthly run skips a row whose amount differs from the %s', async (_name, make) => {
    entry = make();
    const result = await service.runMonthlyDepreciation(ORG);
    expect(result).toEqual({ processed: 0, journalsCreated: 0, totalDepreciation: 0 });
    expectNothingPosted();
  });

  it.each([
    ['book delta', badBook],
    ['accumulated delta', badAccumulated],
  ])('manual run rejects a row whose amount differs from the %s', async (_name, make) => {
    entry = make();
    await expect(service.runDepreciationForAsset(ORG, 'sl')).rejects.toThrow(BadRequestException);
    expectNothingPosted();
  });

  it('still posts a consistent row', async () => {
    entry = row('37.5000', '1012.5000', '1487.5000');
    await expect(service.runDepreciationForAsset(ORG, 'sl')).resolves.toEqual({
      journalId: 'jrn-42',
      amount: 37.5,
    });
    expect(prisma.journal.create).toHaveBeenCalledTimes(1);
  });
});
