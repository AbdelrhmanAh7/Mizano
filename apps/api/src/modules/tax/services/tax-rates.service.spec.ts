import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { TaxRatesService } from './tax-rates.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('TaxRatesService', () => {
  let service: TaxRatesService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  const mockTaxRate = {
    id: 'tax-test-001',
    organizationId: ORG_ID,
    name: 'Standard Rate (15%)',
    description: 'Standard VAT rate',
    rate: new Decimal('15'),
    type: 'BOTH',
    linkedAccountId: 'acc-vat',
    collectAccountId: null,
    isDefault: true,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    linkedAccount: { id: 'acc-vat', code: '2100', name: 'VAT Payable' },
    collectAccount: null,
  };

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TaxRatesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<TaxRatesService>(TaxRatesService);
  });

  describe('create', () => {
    const validDto = {
      name: 'Standard Rate (15%)',
      description: 'Standard VAT rate',
      rate: '15',
      type: 'BOTH',
      linkedAccountId: 'acc-vat',
      isDefault: true,
      isActive: true,
    };

    it('should create a tax rate with correct data', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);
      prisma.taxRate.create.mockResolvedValue(mockTaxRate as any);

      const result = await service.create(ORG_ID, validDto as any);

      expect(result).toBeDefined();
      expect(prisma.taxRate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Standard Rate (15%)',
            organizationId: ORG_ID,
          }),
        }),
      );
    });

    it('should always include organizationId in the created record', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);
      prisma.taxRate.create.mockResolvedValue(mockTaxRate as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.taxRate.create.mock.calls[0]![0] as any;
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should store rate as Decimal', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);
      prisma.taxRate.create.mockResolvedValue(mockTaxRate as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.taxRate.create.mock.calls[0]![0] as any;
      expect(createCall.data.rate).toBeInstanceOf(Decimal);
    });

    it('should throw BadRequestException when name already exists', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);

      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, validDto as any)).rejects.toThrow(
        'Tax rate with this name already exists',
      );
    });

    it('should check name uniqueness within organization', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);
      prisma.taxRate.create.mockResolvedValue(mockTaxRate as any);

      await service.create(ORG_ID, validDto as any);

      expect(prisma.taxRate.findFirst).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, name: 'Standard Rate (15%)' },
      });
    });

    it('should default type to BOTH when not provided', async () => {
      const dtoWithoutType = { ...validDto, type: undefined };
      prisma.taxRate.findFirst.mockResolvedValue(null);
      prisma.taxRate.create.mockResolvedValue(mockTaxRate as any);

      await service.create(ORG_ID, dtoWithoutType as any);

      const createCall = prisma.taxRate.create.mock.calls[0]![0] as any;
      expect(createCall.data.type).toBe('BOTH');
    });

    it('should default isDefault to false and isActive to true', async () => {
      const dtoWithoutDefaults = {
        ...validDto,
        isDefault: undefined,
        isActive: undefined,
      };
      prisma.taxRate.findFirst.mockResolvedValue(null);
      prisma.taxRate.create.mockResolvedValue(mockTaxRate as any);

      await service.create(ORG_ID, dtoWithoutDefaults as any);

      const createCall = prisma.taxRate.create.mock.calls[0]![0] as any;
      expect(createCall.data.isDefault).toBe(false);
      expect(createCall.data.isActive).toBe(true);
    });
  });

  describe('findAll', () => {
    it('should return tax rates for the organization', async () => {
      prisma.taxRate.findMany.mockResolvedValue([mockTaxRate] as any);

      const result = await service.findAll(ORG_ID, {} as any);

      expect(result).toHaveLength(1);
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.taxRate.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, {} as any);

      const findCall = prisma.taxRate.findMany.mock.calls[0]![0] as any;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should filter by type when provided', async () => {
      prisma.taxRate.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { type: 'SALES' } as any);

      const findCall = prisma.taxRate.findMany.mock.calls[0]![0] as any;
      expect(findCall.where!.type).toBe('SALES');
    });

    it('should filter by isActive when provided', async () => {
      prisma.taxRate.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { isActive: true } as any);

      const findCall = prisma.taxRate.findMany.mock.calls[0]![0] as any;
      expect(findCall.where!.isActive).toBe(true);
    });

    it('should include linkedAccount and collectAccount relations', async () => {
      prisma.taxRate.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, {} as any);

      const findCall = prisma.taxRate.findMany.mock.calls[0]![0] as any;
      expect(findCall.include!.linkedAccount).toBeDefined();
      expect(findCall.include!.collectAccount).toBeDefined();
    });

    it('should order by name ascending', async () => {
      prisma.taxRate.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, {} as any);

      const findCall = prisma.taxRate.findMany.mock.calls[0]![0] as any;
      expect(findCall.orderBy).toEqual({ name: 'asc' });
    });
  });

  describe('findOne', () => {
    it('should return a tax rate by id', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);

      const result = await service.findOne(ORG_ID, 'tax-test-001');

      expect(result.id).toBe('tax-test-001');
    });

    it('should throw NotFoundException when tax rate does not exist', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Tax rate not found');
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'tax-1');
      } catch {
        // Expected
      }

      const findCall = prisma.taxRate.findFirst.mock.calls[0]![0] as any;
      expect(findCall.where!.id).toBe('tax-1');
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a tax rate', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);
      prisma.taxRate.update.mockResolvedValue({
        ...mockTaxRate,
        name: 'Updated Rate',
      } as any);

      const result = await service.update(ORG_ID, 'tax-test-001', {
        name: 'Updated Rate',
      } as any);

      expect(result.name).toBe('Updated Rate');
    });

    it('should throw NotFoundException when tax rate does not exist', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, 'nonexistent', { name: 'Updated' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should convert rate to Decimal when updating', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);
      prisma.taxRate.update.mockResolvedValue(mockTaxRate as any);

      await service.update(ORG_ID, 'tax-test-001', { rate: '20' } as any);

      const updateCall = prisma.taxRate.update.mock.calls[0]![0] as any;
      expect(updateCall.data.rate).toBeInstanceOf(Decimal);
    });

    it('should unset other defaults when setting as default', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);
      prisma.taxRate.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.taxRate.update.mockResolvedValue(mockTaxRate as any);

      await service.update(ORG_ID, 'tax-test-001', { isDefault: true } as any);

      expect(prisma.taxRate.updateMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, isDefault: true, id: { not: 'tax-test-001' } },
        data: { isDefault: false },
      });
    });

    it('should not unset other defaults when isDefault is not set', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);
      prisma.taxRate.update.mockResolvedValue(mockTaxRate as any);

      await service.update(ORG_ID, 'tax-test-001', { name: 'Updated' } as any);

      expect(prisma.taxRate.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft-delete a tax rate not in use', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);
      prisma.invoiceLine.count.mockResolvedValue(0);
      prisma.billLine.count.mockResolvedValue(0);
      prisma.taxRate.update.mockResolvedValue({} as any);

      const result = await service.remove(ORG_ID, 'tax-test-001');

      expect(result.message).toBe('Tax rate deleted');
      expect(prisma.taxRate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('should throw NotFoundException when tax rate does not exist', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow('Tax rate not found');
    });

    it('should throw BadRequestException when tax rate is used in invoices', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);
      prisma.invoiceLine.count.mockResolvedValue(5);
      prisma.billLine.count.mockResolvedValue(0);

      await expect(service.remove(ORG_ID, 'tax-test-001')).rejects.toThrow(BadRequestException);
      await expect(service.remove(ORG_ID, 'tax-test-001')).rejects.toThrow(
        'Tax rate is in use and cannot be deleted',
      );
    });

    it('should throw BadRequestException when tax rate is used in bills', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);
      prisma.invoiceLine.count.mockResolvedValue(0);
      prisma.billLine.count.mockResolvedValue(3);

      await expect(service.remove(ORG_ID, 'tax-test-001')).rejects.toThrow(BadRequestException);
    });

    it('should never hard-delete tax rates', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);
      prisma.invoiceLine.count.mockResolvedValue(0);
      prisma.billLine.count.mockResolvedValue(0);
      prisma.taxRate.update.mockResolvedValue({} as any);

      await service.remove(ORG_ID, 'tax-test-001');

      expect(prisma.taxRate.delete).not.toHaveBeenCalled();
      expect(prisma.taxRate.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getDefaultTaxRate', () => {
    it('should return the default active tax rate for the organization', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);

      const result = await service.getDefaultTaxRate(ORG_ID);

      expect(result).toBeDefined();
      expect(prisma.taxRate.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_ID,
          isDefault: true,
          isActive: true,
          deletedAt: null,
        },
      });
    });

    it('should return null when no default tax rate exists', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);

      const result = await service.getDefaultTaxRate(ORG_ID);

      expect(result).toBeNull();
    });
  });

  describe('seedDefaultTaxRates', () => {
    it('should create default tax rates when none exist', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);
      prisma.taxRate.create.mockResolvedValue(mockTaxRate as any);

      const result = await service.seedDefaultTaxRates(ORG_ID, 'acc-vat');

      expect(result.message).toBe('Default tax rates seeded');
      expect(prisma.taxRate.create).toHaveBeenCalledTimes(3);
    });

    it('should not create duplicate tax rates', async () => {
      // All three already exist
      prisma.taxRate.findFirst.mockResolvedValue(mockTaxRate as any);

      await service.seedDefaultTaxRates(ORG_ID, 'acc-vat');

      expect(prisma.taxRate.create).not.toHaveBeenCalled();
    });

    it('should store seeded rates as Decimal', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);
      prisma.taxRate.create.mockResolvedValue(mockTaxRate as any);

      await service.seedDefaultTaxRates(ORG_ID, 'acc-vat');

      const createCalls = prisma.taxRate.create.mock.calls;
      for (const call of createCalls) {
        expect(call[0].data.rate).toBeInstanceOf(Decimal);
      }
    });

    it('should include organizationId in all seeded rates', async () => {
      prisma.taxRate.findFirst.mockResolvedValue(null);
      prisma.taxRate.create.mockResolvedValue(mockTaxRate as any);

      await service.seedDefaultTaxRates(ORG_ID, 'acc-vat');

      const createCalls = prisma.taxRate.create.mock.calls;
      for (const call of createCalls) {
        expect(call[0].data.organizationId).toBe(ORG_ID);
      }
    });
  });
});
