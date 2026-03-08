import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { CurrencyService } from './currency.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('CurrencyService', () => {
  let service: CurrencyService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  const mockExchangeRate = {
    id: 'rate-test-001',
    organizationId: ORG_ID,
    fromCurrency: 'USD',
    toCurrency: 'SAR',
    rate: new Decimal('3.75'),
    date: new Date('2024-06-01'),
    source: 'MANUAL',
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date('2024-06-01'),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CurrencyService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<CurrencyService>(CurrencyService);
  });

  describe('createExchangeRate', () => {
    const validDto = {
      fromCurrency: 'USD',
      toCurrency: 'SAR',
      rate: '3.75',
      date: '2024-06-01',
      source: 'MANUAL',
    };

    it('should create a new exchange rate', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(null);
      prisma.exchangeRate.create.mockResolvedValue(mockExchangeRate as any);

      const result = await service.createExchangeRate(ORG_ID, validDto as any);

      expect(result).toBeDefined();
      expect(prisma.exchangeRate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromCurrency: 'USD',
            toCurrency: 'SAR',
            organizationId: ORG_ID,
          }),
        }),
      );
    });

    it('should store rate as Decimal', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(null);
      prisma.exchangeRate.create.mockResolvedValue(mockExchangeRate as any);

      await service.createExchangeRate(ORG_ID, validDto as any);

      const createCall = prisma.exchangeRate.create.mock.calls[0]![0]!;
      expect(createCall.data.rate).toBeInstanceOf(Decimal);
    });

    it('should always include organizationId in the created record', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(null);
      prisma.exchangeRate.create.mockResolvedValue(mockExchangeRate as any);

      await service.createExchangeRate(ORG_ID, validDto as any);

      const createCall = prisma.exchangeRate.create.mock.calls[0]![0]!;
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should uppercase currency codes', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(null);
      prisma.exchangeRate.create.mockResolvedValue(mockExchangeRate as any);

      await service.createExchangeRate(ORG_ID, {
        ...validDto,
        fromCurrency: 'usd',
        toCurrency: 'sar',
      } as any);

      const createCall = prisma.exchangeRate.create.mock.calls[0]![0]!;
      expect(createCall.data.fromCurrency).toBe('USD');
      expect(createCall.data.toCurrency).toBe('SAR');
    });

    it('should update existing rate for same currency pair and date', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(mockExchangeRate as any);
      prisma.exchangeRate.update.mockResolvedValue({
        ...mockExchangeRate,
        rate: new Decimal('3.80'),
      } as any);

      const result = await service.createExchangeRate(ORG_ID, {
        ...validDto,
        rate: '3.80',
      } as any);

      expect(new Decimal(result.rate.toString()).equals(new Decimal('3.80'))).toBe(true);
      expect(prisma.exchangeRate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rate-test-001' },
        }),
      );
    });

    it('should throw BadRequestException when from and to currencies are the same', async () => {
      await expect(
        service.createExchangeRate(ORG_ID, {
          ...validDto,
          fromCurrency: 'USD',
          toCurrency: 'USD',
        } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createExchangeRate(ORG_ID, {
          ...validDto,
          fromCurrency: 'USD',
          toCurrency: 'USD',
        } as any),
      ).rejects.toThrow('From and To currencies cannot be the same');
    });

    it('should throw BadRequestException for invalid currency code', async () => {
      await expect(
        service.createExchangeRate(ORG_ID, {
          ...validDto,
          fromCurrency: 'ABCD',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should default source to MANUAL when not provided', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(null);
      prisma.exchangeRate.create.mockResolvedValue(mockExchangeRate as any);

      await service.createExchangeRate(ORG_ID, {
        ...validDto,
        source: undefined,
      } as any);

      const createCall = prisma.exchangeRate.create.mock.calls[0]![0]!;
      expect(createCall.data.source).toBe('MANUAL');
    });
  });

  describe('updateExchangeRate', () => {
    it('should update an exchange rate', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(mockExchangeRate as any);
      prisma.exchangeRate.update.mockResolvedValue({
        ...mockExchangeRate,
        rate: new Decimal('3.80'),
      } as any);

      const result = await service.updateExchangeRate(ORG_ID, 'rate-test-001', {
        rate: '3.80',
      } as any);

      expect(new Decimal(result.rate.toString()).equals(new Decimal('3.80'))).toBe(true);
    });

    it('should throw NotFoundException when rate does not exist', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(null);

      await expect(
        service.updateExchangeRate(ORG_ID, 'nonexistent', { rate: '3.80' } as any),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateExchangeRate(ORG_ID, 'nonexistent', { rate: '3.80' } as any),
      ).rejects.toThrow('Exchange rate not found');
    });

    it('should filter by organizationId when finding rate to update', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(null);

      try {
        await service.updateExchangeRate(ORG_ID, 'rate-1', { rate: '3.80' } as any);
      } catch {
        // Expected
      }

      expect(prisma.exchangeRate.findFirst).toHaveBeenCalledWith({
        where: { id: 'rate-1', organizationId: ORG_ID },
      });
    });
  });

  describe('deleteExchangeRate', () => {
    it('should delete an exchange rate', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(mockExchangeRate as any);
      prisma.exchangeRate.delete.mockResolvedValue({} as any);

      const result = await service.deleteExchangeRate(ORG_ID, 'rate-test-001');

      expect(result.message).toBe('Exchange rate deleted');
      expect(prisma.exchangeRate.delete).toHaveBeenCalledWith({
        where: { id: 'rate-test-001' },
      });
    });

    it('should throw NotFoundException when rate does not exist', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(null);

      await expect(service.deleteExchangeRate(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getExchangeRates', () => {
    it('should return paginated exchange rates for the organization', async () => {
      prisma.exchangeRate.findMany.mockResolvedValue([mockExchangeRate] as any);
      prisma.exchangeRate.count.mockResolvedValue(1);

      const result = await service.getExchangeRates(ORG_ID, {} as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by organizationId', async () => {
      prisma.exchangeRate.findMany.mockResolvedValue([]);
      prisma.exchangeRate.count.mockResolvedValue(0);

      await service.getExchangeRates(ORG_ID, {} as any);

      const findCall = prisma.exchangeRate.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
    });

    it('should filter by fromCurrency when provided', async () => {
      prisma.exchangeRate.findMany.mockResolvedValue([]);
      prisma.exchangeRate.count.mockResolvedValue(0);

      await service.getExchangeRates(ORG_ID, { fromCurrency: 'usd' } as any);

      const findCall = prisma.exchangeRate.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.fromCurrency).toBe('USD');
    });

    it('should filter by toCurrency when provided', async () => {
      prisma.exchangeRate.findMany.mockResolvedValue([]);
      prisma.exchangeRate.count.mockResolvedValue(0);

      await service.getExchangeRates(ORG_ID, { toCurrency: 'sar' } as any);

      const findCall = prisma.exchangeRate.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.toCurrency).toBe('SAR');
    });

    it('should filter by date range when provided', async () => {
      prisma.exchangeRate.findMany.mockResolvedValue([]);
      prisma.exchangeRate.count.mockResolvedValue(0);

      await service.getExchangeRates(ORG_ID, {
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
      } as any);

      const findCall = prisma.exchangeRate.findMany.mock.calls[0]![0]!;
      const dateFilter = findCall.where!.date as { gte?: Date; lte?: Date };
      expect(dateFilter).toBeDefined();
      expect(dateFilter.gte).toBeInstanceOf(Date);
      expect(dateFilter.lte).toBeInstanceOf(Date);
    });

    it('should convert rate to float in response', async () => {
      prisma.exchangeRate.findMany.mockResolvedValue([mockExchangeRate] as any);
      prisma.exchangeRate.count.mockResolvedValue(1);

      const result = await service.getExchangeRates(ORG_ID, {} as any);

      expect(typeof result.data[0].rate).toBe('number');
      expect(result.data[0].rate).toBe(3.75);
    });
  });

  describe('getRate', () => {
    it('should return rate 1 for same currency', async () => {
      const result = await service.getRate(ORG_ID, 'USD', 'USD');

      expect(result.rate).toBe(1);
      expect(result.source).toBe('SAME_CURRENCY');
    });

    it('should return direct rate when found', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(mockExchangeRate as any);

      const result = await service.getRate(ORG_ID, 'USD', 'SAR');

      expect(result.rate).toBe(3.75);
      expect(result.source).toBe('MANUAL');
    });

    it('should return inverse rate when direct rate is not found', async () => {
      prisma.exchangeRate.findFirst
        .mockResolvedValueOnce(null) // no direct rate
        .mockResolvedValueOnce({
          ...mockExchangeRate,
          fromCurrency: 'SAR',
          toCurrency: 'USD',
          rate: new Decimal('3.75'),
          source: 'MANUAL',
        } as any); // inverse rate found

      const result = await service.getRate(ORG_ID, 'USD', 'SAR');

      expect(result.rate).toBeCloseTo(1 / 3.75, 10);
      expect(result.source).toBe('MANUAL_INVERSE');
    });

    it('should throw NotFoundException when no rate is found', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'SAR' } as any);

      await expect(service.getRate(ORG_ID, 'XYZ', 'ABC')).rejects.toThrow(NotFoundException);
    });

    it('should uppercase currency codes before lookup', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(mockExchangeRate as any);

      await service.getRate(ORG_ID, 'usd', 'sar');

      const findCall = prisma.exchangeRate.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.fromCurrency).toBe('USD');
      expect(findCall.where!.toCurrency).toBe('SAR');
    });
  });

  describe('convertAmount', () => {
    it('should convert amount using the exchange rate', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue(mockExchangeRate as any);

      const result = await service.convertAmount(ORG_ID, {
        fromCurrency: 'USD',
        toCurrency: 'SAR',
        amount: 100,
      } as any);

      expect(result.originalAmount).toBe(100);
      expect(result.convertedAmount).toBe(375);
      expect(result.fromCurrency).toBe('USD');
      expect(result.toCurrency).toBe('SAR');
      expect(result.rate).toBe(3.75);
    });

    it('should round converted amount to 4 decimal places', async () => {
      prisma.exchangeRate.findFirst.mockResolvedValue({
        ...mockExchangeRate,
        rate: new Decimal('3.33333'),
      } as any);

      const result = await service.convertAmount(ORG_ID, {
        fromCurrency: 'USD',
        toCurrency: 'SAR',
        amount: 100,
      } as any);

      // 100 * 3.33333 = 333.333, rounded to 4 decimal places
      expect(result.convertedAmount).toBe(Math.round(333.333 * 10000) / 10000);
    });
  });

  describe('convertToBaseCurrency', () => {
    it('should return same amount when currency matches base currency', async () => {
      prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'SAR' } as any);

      const result = await service.convertToBaseCurrency(ORG_ID, 100, 'SAR');

      expect(result.baseAmount).toBe(100);
      expect(result.rate).toBe(1);
    });

    it('should convert to base currency using exchange rate', async () => {
      prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'SAR' } as any);
      prisma.exchangeRate.findFirst.mockResolvedValue(mockExchangeRate as any);

      const result = await service.convertToBaseCurrency(ORG_ID, 100, 'USD');

      expect(result.baseAmount).toBe(375);
      expect(result.rate).toBe(3.75);
    });

    it('should default base currency to SAR when organization has none', async () => {
      prisma.organization.findUnique.mockResolvedValue({ baseCurrency: null } as any);
      prisma.exchangeRate.findFirst.mockResolvedValue(mockExchangeRate as any);

      await service.convertToBaseCurrency(ORG_ID, 100, 'USD');

      // The method should still work with the default SAR
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: ORG_ID },
        select: { baseCurrency: true },
      });
    });
  });

  describe('calculateGainLoss', () => {
    it('should calculate gain for receivable when rate increases', () => {
      const result = service.calculateGainLoss({
        originalAmount: 1000,
        originalRate: 3.75,
        currentRate: 4.0,
        transactionType: 'receivable',
      });

      // originalBase = 1000 * 3.75 = 3750
      // currentBase = 1000 * 4.00 = 4000
      // gainLoss = 4000 - 3750 = 250 (gain for receivable)
      expect(result.gainLoss).toBe(250);
      expect(result.isGain).toBe(true);
      expect(result.originalBaseAmount).toBe(3750);
      expect(result.currentBaseAmount).toBe(4000);
    });

    it('should calculate loss for receivable when rate decreases', () => {
      const result = service.calculateGainLoss({
        originalAmount: 1000,
        originalRate: 4.0,
        currentRate: 3.75,
        transactionType: 'receivable',
      });

      // gainLoss = 3750 - 4000 = -250 (loss for receivable)
      expect(result.gainLoss).toBe(-250);
      expect(result.isGain).toBe(false);
    });

    it('should calculate gain for payable when rate decreases', () => {
      const result = service.calculateGainLoss({
        originalAmount: 1000,
        originalRate: 4.0,
        currentRate: 3.75,
        transactionType: 'payable',
      });

      // For payable: gain if current < original (we pay less)
      // gainLoss = originalBase - currentBase = 4000 - 3750 = 250
      expect(result.gainLoss).toBe(250);
      expect(result.isGain).toBe(true);
    });

    it('should calculate loss for payable when rate increases', () => {
      const result = service.calculateGainLoss({
        originalAmount: 1000,
        originalRate: 3.75,
        currentRate: 4.0,
        transactionType: 'payable',
      });

      // gainLoss = 3750 - 4000 = -250 (loss for payable)
      expect(result.gainLoss).toBe(-250);
      expect(result.isGain).toBe(false);
    });

    it('should return zero gain/loss when rates are equal', () => {
      const result = service.calculateGainLoss({
        originalAmount: 1000,
        originalRate: 3.75,
        currentRate: 3.75,
        transactionType: 'receivable',
      });

      expect(result.gainLoss).toBe(0);
      expect(result.isGain).toBe(true); // 0 >= 0
      expect(result.percentageChange).toBe(0);
    });

    it('should calculate percentage change correctly', () => {
      const result = service.calculateGainLoss({
        originalAmount: 1000,
        originalRate: 4.0,
        currentRate: 4.4,
        transactionType: 'receivable',
      });

      // (4.40 - 4.00) / 4.00 * 100 = 10%
      expect(result.percentageChange).toBe(10);
    });

    it('should round all monetary values to 4 decimal places', () => {
      const result = service.calculateGainLoss({
        originalAmount: 333.3333,
        originalRate: 3.33333,
        currentRate: 3.66667,
        transactionType: 'receivable',
      });

      // All values should be rounded to 4 decimals
      const decimalPlaces = (n: number) => {
        const str = n.toString();
        const dot = str.indexOf('.');
        return dot === -1 ? 0 : str.length - dot - 1;
      };
      expect(decimalPlaces(result.originalBaseAmount)).toBeLessThanOrEqual(4);
      expect(decimalPlaces(result.currentBaseAmount)).toBeLessThanOrEqual(4);
      expect(decimalPlaces(result.gainLoss)).toBeLessThanOrEqual(4);
    });
  });

  describe('calculateUnrealizedGainLoss', () => {
    it('should calculate gain/loss for unpaid foreign currency invoices', async () => {
      prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'SAR' } as any);
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          currencyCode: 'USD',
          exchangeRate: new Decimal('3.75'),
          balanceDue: new Decimal('1000'),
        },
      ] as any);
      prisma.bill.findMany.mockResolvedValue([]);
      prisma.exchangeRate.findFirst.mockResolvedValue({
        ...mockExchangeRate,
        rate: new Decimal('4.00'),
      } as any);

      const result = await service.calculateUnrealizedGainLoss(ORG_ID);

      expect(result.receivablesGainLoss).toBe(250); // (4.00 - 3.75) * 1000
      expect(result.payablesGainLoss).toBe(0);
      expect(result.totalGainLoss).toBe(250);
      expect(result.details).toHaveLength(1);
      expect(result.details[0].type).toBe('receivable');
    });

    it('should calculate gain/loss for unpaid foreign currency bills', async () => {
      prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'SAR' } as any);
      prisma.invoice.findMany.mockResolvedValue([]);
      prisma.bill.findMany.mockResolvedValue([
        {
          id: 'bill-1',
          currencyCode: 'USD',
          exchangeRate: new Decimal('3.75'),
          balanceDue: new Decimal('500'),
        },
      ] as any);
      prisma.exchangeRate.findFirst.mockResolvedValue({
        ...mockExchangeRate,
        rate: new Decimal('4.00'),
      } as any);

      const result = await service.calculateUnrealizedGainLoss(ORG_ID);

      expect(result.payablesGainLoss).toBe(-125); // payable: 3.75*500 - 4.00*500 = -125 (loss)
      expect(result.receivablesGainLoss).toBe(0);
    });

    it('should skip invoices in base currency', async () => {
      prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'SAR' } as any);
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          currencyCode: 'SAR',
          exchangeRate: new Decimal('1'),
          balanceDue: new Decimal('1000'),
        },
      ] as any);
      prisma.bill.findMany.mockResolvedValue([]);

      const result = await service.calculateUnrealizedGainLoss(ORG_ID);

      expect(result.details).toHaveLength(0);
      expect(result.totalGainLoss).toBe(0);
    });

    it('should handle missing exchange rates gracefully', async () => {
      prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'SAR' } as any);
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          currencyCode: 'XYZ',
          exchangeRate: new Decimal('1'),
          balanceDue: new Decimal('1000'),
        },
      ] as any);
      prisma.bill.findMany.mockResolvedValue([]);
      prisma.exchangeRate.findFirst.mockResolvedValue(null);

      // Should not throw, just skip the invoice
      const result = await service.calculateUnrealizedGainLoss(ORG_ID);

      expect(result.details).toHaveLength(0);
    });
  });

  describe('getCurrencyInfo', () => {
    it('should return base currency and supported currencies', async () => {
      prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'SAR' } as any);
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getCurrencyInfo(ORG_ID);

      expect(result.baseCurrency).toBe('SAR');
      expect(result.supportedCurrencies).toBeDefined();
      expect(Array.isArray(result.supportedCurrencies)).toBe(true);
    });

    it('should default baseCurrency to SAR when organization has none', async () => {
      prisma.organization.findUnique.mockResolvedValue({ baseCurrency: null } as any);
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getCurrencyInfo(ORG_ID);

      expect(result.baseCurrency).toBe('SAR');
    });
  });

  describe('getSupportedCurrencies', () => {
    it('should return the list of supported currencies', () => {
      const currencies = service.getSupportedCurrencies();

      expect(Array.isArray(currencies)).toBe(true);
      expect(currencies).toContain('SAR');
      expect(currencies).toContain('USD');
      expect(currencies).toContain('EUR');
    });
  });

  describe('validateCurrencyCode (via createExchangeRate)', () => {
    it('should reject empty currency code', async () => {
      await expect(
        service.createExchangeRate(ORG_ID, {
          fromCurrency: '',
          toCurrency: 'SAR',
          rate: '3.75',
          date: '2024-06-01',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject currency code with wrong length', async () => {
      await expect(
        service.createExchangeRate(ORG_ID, {
          fromCurrency: 'US',
          toCurrency: 'SAR',
          rate: '3.75',
          date: '2024-06-01',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
