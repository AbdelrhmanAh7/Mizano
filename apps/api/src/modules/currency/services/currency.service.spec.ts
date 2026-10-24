import { NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { CurrencyService } from './currency.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const NOW = new Date('2026-03-31T12:00:00.000Z');

interface RateRow {
  id: string;
  organizationId: string;
  fromCurrency: string;
  toCurrency: string;
  rate: Decimal;
  date: Date;
  source: string;
}

interface RateWhere {
  id?: string;
  organizationId?: string;
  fromCurrency?: string;
  toCurrency?: string;
  date?: { lte?: Date } | Date;
}

const rate = (
  id: string,
  organizationId: string,
  from: string,
  to: string,
  value: string,
  isoDate: string,
): RateRow => ({
  id,
  organizationId,
  fromCurrency: from,
  toCurrency: to,
  rate: new Decimal(value),
  date: new Date(isoDate),
  source: 'MANUAL',
});

// Org B owns rates for the same pairs at very different values: any cross-tenant read shows up
// as a wrong amount, not only as a wrong where clause.
const RATES: RateRow[] = [
  rate('r-a-usd-old', ORG_A, 'USD', 'SAR', '3.7000', '2026-01-10T00:00:00.000Z'),
  rate('r-a-usd', ORG_A, 'USD', 'SAR', '3.7512', '2026-03-01T00:00:00.000Z'),
  rate('r-a-usd-future', ORG_A, 'USD', 'SAR', '9.0000', '2026-06-01T00:00:00.000Z'),
  rate('r-a-sar-eur', ORG_A, 'SAR', 'EUR', '0.25', '2026-03-01T00:00:00.000Z'),
  rate('r-b-usd', ORG_B, 'USD', 'SAR', '100', '2026-03-01T00:00:00.000Z'),
  rate('r-b-gbp', ORG_B, 'GBP', 'SAR', '4.70', '2026-03-01T00:00:00.000Z'),
];

function findRate(where: RateWhere): RateRow | null {
  // Exact-date lookups (createExchangeRate's upsert check) are stubbed per test.
  if (where.date instanceof Date) return null;
  const lte = where.date?.lte;
  return (
    RATES.filter(
      (r) =>
        (where.id === undefined || r.id === where.id) &&
        r.organizationId === where.organizationId &&
        (where.fromCurrency === undefined || r.fromCurrency === where.fromCurrency) &&
        (where.toCurrency === undefined || r.toCurrency === where.toCurrency) &&
        (lte === undefined || r.date <= lte),
    ).sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null
  );
}

// Every write path a ledger posting could take; none of them may be touched by this service.
function expectNoLedgerWrites(prisma: MockPrismaClient): void {
  expect(prisma.journal.create).not.toHaveBeenCalled();
  expect(prisma.journal.createMany).not.toHaveBeenCalled();
  expect(prisma.journal.upsert).not.toHaveBeenCalled();
  expect(prisma.journalLine.create).not.toHaveBeenCalled();
  expect(prisma.journalLine.createMany).not.toHaveBeenCalled();
  expect(prisma.invoice.update).not.toHaveBeenCalled();
  expect(prisma.bill.update).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
}

describe('CurrencyService', () => {
  let prisma: MockPrismaClient;
  let service: CurrencyService;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    prisma = createMockPrisma();
    service = new CurrencyService(prisma as unknown as PrismaService);

    prisma.organization.findUnique.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(
        args.where.id === ORG_A ? { baseCurrency: 'SAR' } : null,
      )) as unknown as typeof prisma.organization.findUnique);
    prisma.exchangeRate.findFirst.mockImplementation(((args: { where: RateWhere }) =>
      Promise.resolve(findRate(args.where))) as unknown as typeof prisma.exchangeRate.findFirst);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('convertToBaseCurrency', () => {
    it('returns the amount unchanged at rate 1 for the base currency, without a rate lookup', async () => {
      await expect(service.convertToBaseCurrency(ORG_A, 1234.5678, 'sar')).resolves.toEqual({
        baseAmount: 1234.5678,
        rate: 1,
      });
      expect(prisma.exchangeRate.findFirst).not.toHaveBeenCalled();
    });

    it('converts with the latest rate on or before the date and rounds to 4 decimals', async () => {
      // 100.00 * 3.7512 = 375.12; 10.123456 * 3.7512 = 37.9751... -> 37.9751
      await expect(
        service.convertToBaseCurrency(ORG_A, 100, 'USD', new Date('2026-03-15T00:00:00Z')),
      ).resolves.toEqual({ baseAmount: 375.12, rate: 3.7512 });
      await expect(
        service.convertToBaseCurrency(ORG_A, 10.123456, 'USD', new Date('2026-03-15T00:00:00Z')),
      ).resolves.toEqual({ baseAmount: 37.9751, rate: 3.7512 });
    });

    it('rounds a half at the 5th decimal up (0.50005 -> 0.5001)', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValueOnce(
        rate('r-half', ORG_A, 'USD', 'SAR', '0.5', '2026-03-01T00:00:00.000Z') as never,
      );
      await expect(service.convertToBaseCurrency(ORG_A, 1.0001, 'USD')).resolves.toEqual({
        baseAmount: 0.5001,
        rate: 0.5,
      });
    });

    it('uses an older rate for an older date and never a future-dated one (fixed clock)', async () => {
      await expect(
        service.convertToBaseCurrency(ORG_A, 100, 'USD', new Date('2026-02-01T00:00:00Z')),
      ).resolves.toEqual({ baseAmount: 370, rate: 3.7 });
      // No date: "today" is the fake clock (2026-03-31), so the June rate is out of range.
      await expect(service.convertToBaseCurrency(ORG_A, 100, 'USD')).resolves.toEqual({
        baseAmount: 375.12,
        rate: 3.7512,
      });
    });

    it('inverts a base->foreign rate when no direct rate exists', async () => {
      // SAR->EUR 0.25 means EUR->SAR 4.
      await expect(service.convertToBaseCurrency(ORG_A, 12.5, 'EUR')).resolves.toEqual({
        baseAmount: 50,
        rate: 4,
      });
    });

    it('throws NotFoundException when the org has no rate, even if another org has one', async () => {
      // Only org B has a GBP->SAR rate.
      await expect(service.convertToBaseCurrency(ORG_A, 10, 'GBP')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.convertToBaseCurrency(ORG_A, 10, 'GBP')).rejects.toThrow(
        /No exchange rate found for GBP to SAR/,
      );
    });

    it('defaults the base currency to SAR when the organization has none', async () => {
      prisma.organization.findUnique.mockResolvedValueOnce(null);
      await expect(service.convertToBaseCurrency(ORG_A, 7, 'SAR')).resolves.toEqual({
        baseAmount: 7,
        rate: 1,
      });
    });
  });

  describe('getRate', () => {
    it('triangulates through the base currency when neither direct nor inverse exists', async () => {
      // USD->SAR 3.7512, SAR->EUR 0.25 => USD->EUR 0.9378
      const result = await service.getRate(ORG_A, 'usd', 'eur', new Date('2026-03-15T00:00:00Z'));
      expect(result.source).toBe('TRIANGULATED');
      expect(result.rate).toBeCloseTo(0.9378, 10);
    });
  });

  describe('calculateGainLoss', () => {
    it('books a receivable gain when the foreign currency strengthens', () => {
      expect(
        service.calculateGainLoss({
          originalAmount: 1000,
          originalRate: 3.75,
          currentRate: 3.7512,
          transactionType: 'receivable',
        }),
      ).toEqual({
        originalBaseAmount: 3750,
        currentBaseAmount: 3751.2,
        gainLoss: 1.2,
        isGain: true,
        percentageChange: 0.03,
      });
    });

    it('books a payable loss when the foreign currency strengthens', () => {
      expect(
        service.calculateGainLoss({
          originalAmount: 1000,
          originalRate: 3.75,
          currentRate: 3.7512,
          transactionType: 'payable',
        }),
      ).toEqual({
        originalBaseAmount: 3750,
        currentBaseAmount: 3751.2,
        gainLoss: -1.2,
        isGain: false,
        percentageChange: 0.03,
      });
    });
  });

  describe('calculateUnrealizedGainLoss', () => {
    beforeEach(() => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-usd',
          currencyCode: 'USD',
          exchangeRate: new Decimal('3.70'),
          balanceDue: new Decimal('1000.00'),
        },
        // Org A has no GBP rate: skipped, not guessed from org B.
        {
          id: 'inv-gbp',
          currencyCode: 'GBP',
          exchangeRate: new Decimal('4.50'),
          balanceDue: new Decimal('10.00'),
        },
      ] as never);
      prisma.bill.findMany.mockResolvedValue([
        {
          id: 'bill-eur',
          currencyCode: 'EUR',
          exchangeRate: new Decimal('4.10'),
          balanceDue: new Decimal('200.00'),
        },
      ] as never);
    });

    it('computes exact receivable and payable gain/loss per open document', async () => {
      const result = await service.calculateUnrealizedGainLoss(
        ORG_A,
        new Date('2026-03-15T00:00:00Z'),
      );

      // Invoice: 1000 * (3.7512 - 3.70) = +51.2; bill: 200 * (4.10 - 4) = +20 (we pay less).
      expect(result).toEqual({
        receivablesGainLoss: 51.2,
        payablesGainLoss: 20,
        totalGainLoss: 71.2,
        details: [
          {
            type: 'receivable',
            entityType: 'invoice',
            entityId: 'inv-usd',
            currency: 'USD',
            originalAmount: 1000,
            originalRate: 3.7,
            currentRate: 3.7512,
            gainLoss: 51.2,
          },
          {
            type: 'payable',
            entityType: 'bill',
            entityId: 'bill-eur',
            currency: 'EUR',
            originalAmount: 200,
            originalRate: 4.1,
            currentRate: 4,
            gainLoss: 20,
          },
        ],
      });
      // Total equals the sum of the parts (no dropped or double-counted document).
      const sum = result.details.reduce((s, d) => s.add(d.gainLoss), new Decimal(0));
      expect(sum.equals(new Decimal(result.totalGainLoss))).toBe(true);
    });

    it('only reads open, non-deleted, foreign-currency documents of the caller org', async () => {
      await service.calculateUnrealizedGainLoss(ORG_A, new Date('2026-03-15T00:00:00Z'));

      expect(prisma.invoice.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_A,
          status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
          currencyCode: { not: 'SAR' },
          deletedAt: null,
        },
      });
      expect(prisma.bill.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_A,
          status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
          currencyCode: { not: 'SAR' },
          deletedAt: null,
        },
      });
    });

    it('posts nothing: running it twice gives the same figures and writes no journal', async () => {
      // The service only reports unrealised FX; it has no posting path. A retry therefore
      // cannot create a second journal, because it creates none (AI/advisory, never auto-post).
      const asOf = new Date('2026-03-15T00:00:00Z');
      const first = await service.calculateUnrealizedGainLoss(ORG_A, asOf);
      const second = await service.calculateUnrealizedGainLoss(ORG_A, asOf);

      expect(second).toEqual(first);
      expectNoLedgerWrites(prisma);
    });
  });

  describe('tenant scoping', () => {
    it('scopes every exchange-rate lookup by organizationId', async () => {
      await service.convertToBaseCurrency(ORG_A, 1, 'EUR');
      await service.getRate(ORG_A, 'USD', 'EUR');
      prisma.exchangeRate.findMany.mockResolvedValue([]);
      prisma.exchangeRate.count.mockResolvedValue(0);
      await service.getExchangeRates(ORG_A, {});

      const calls = [
        ...prisma.exchangeRate.findFirst.mock.calls,
        ...prisma.exchangeRate.findMany.mock.calls,
        ...prisma.exchangeRate.count.mock.calls,
      ];
      expect(calls.length).toBeGreaterThan(0);
      for (const [args] of calls) {
        expect((args as { where: RateWhere }).where.organizationId).toBe(ORG_A);
      }
      for (const [args] of prisma.organization.findUnique.mock.calls) {
        expect(args.where.id).toBe(ORG_A);
      }
    });

    it('queries the camelCase columns Prisma creates (P2010: organization_id does not exist)', async () => {
      prisma.$queryRaw.mockResolvedValue([] as never);
      await service.getLatestRates(ORG_A);

      const sql = ((prisma.$queryRaw.mock.calls[0] as unknown[])[0] as string[]).join('?');
      expect(sql).toContain('"organizationId"');
      expect(sql).toContain('"fromCurrency"');
      expect(sql).toContain('"toCurrency"');
      expect(sql).not.toMatch(/organization_id|from_currency|to_currency/);
    });

    it('maps raw camelCase rows to the response shape', async () => {
      prisma.$queryRaw.mockResolvedValue([
        {
          fromCurrency: 'SAR',
          toCurrency: 'USD',
          rate: '0.2666',
          date: new Date('2026-03-01'),
          source: 'MANUAL',
        },
      ] as never);
      const [row] = await service.getLatestRates(ORG_A, 'SAR');
      expect(row).toMatchObject({ fromCurrency: 'SAR', toCurrency: 'USD', rate: 0.2666 });
    });

    it('passes organizationId into the latest-rates raw query', async () => {
      prisma.$queryRaw.mockResolvedValue([] as never);
      await service.getLatestRates(ORG_A);

      const values = (prisma.$queryRaw.mock.calls[0] as unknown[]).slice(1);
      expect(values).toContain(ORG_A);
    });

    it('does not update or delete another org rate', async () => {
      await expect(service.updateExchangeRate(ORG_A, 'r-b-usd', { rate: 1 })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.deleteExchangeRate(ORG_A, 'r-b-usd')).rejects.toThrow(NotFoundException);
      expect(prisma.exchangeRate.update).not.toHaveBeenCalled();
      expect(prisma.exchangeRate.delete).not.toHaveBeenCalled();
    });

    it('keeps organizationId on the update and delete writes themselves', async () => {
      await service.updateExchangeRate(ORG_A, 'r-a-usd', { rate: 3.76 });
      await service.deleteExchangeRate(ORG_A, 'r-a-usd');
      // Same pair and date already stored: create updates it in place.
      prisma.exchangeRate.findFirst.mockResolvedValueOnce(RATES[1] as never);
      await service.createExchangeRate(ORG_A, {
        fromCurrency: 'USD',
        toCurrency: 'SAR',
        rate: 3.77,
        date: '2026-03-01',
      });

      const writes = [
        ...prisma.exchangeRate.update.mock.calls,
        ...prisma.exchangeRate.delete.mock.calls,
      ];
      expect(writes).toHaveLength(3);
      for (const [args] of writes) {
        expect(args.where).toEqual({ id: 'r-a-usd', organizationId: ORG_A });
      }
    });

    it('creates a new rate in the caller org with an exact Decimal rate', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValueOnce(null);
      await service.createExchangeRate(ORG_A, {
        fromCurrency: 'usd',
        toCurrency: 'sar',
        rate: 3.751234,
        date: '2026-03-02',
      });

      const { data } = prisma.exchangeRate.create.mock.calls[0][0];
      expect(data.organizationId).toBe(ORG_A);
      expect(data.fromCurrency).toBe('USD');
      expect(data.toCurrency).toBe('SAR');
      expect(new Decimal(data.rate as Decimal).equals(new Decimal('3.751234'))).toBe(true);
    });
  });
});
