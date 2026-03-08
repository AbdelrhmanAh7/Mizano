import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { dec, expectDecimalEqual } from '../../../test/helpers/decimal.helpers';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let prisma: MockPrismaClient;
  let journalsService: { create: jest.Mock };

  const ORG_ID = 'org-test-001';

  const createMockExpense = (overrides: Record<string, unknown> = {}) => ({
    id: 'exp-test-001',
    organizationId: ORG_ID,
    accountId: 'acc-expense-001',
    vendorId: 'vendor-test-001',
    amount: dec('500'),
    taxAmount: dec('0'),
    taxInclusive: false,
    date: new Date('2024-06-15'),
    description: 'Office supplies',
    reference: null,
    projectId: null,
    paidThroughAccountId: 'acc-bank-001',
    deletedAt: null,
    createdAt: new Date('2024-06-15'),
    updatedAt: new Date('2024-06-15'),
    account: { id: 'acc-expense-001', code: '5000', name: 'Office Expenses' },
    vendor: { id: 'vendor-test-001', name: 'Test Vendor' },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = createMockPrisma();
    journalsService = { create: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalsService, useValue: journalsService },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
  });

  describe('create', () => {
    const validDto = {
      date: '2024-06-15',
      accountId: 'acc-expense-001',
      vendorId: 'vendor-test-001',
      amount: '500',
      paidThroughAccountId: 'acc-bank-001',
      description: 'Office supplies',
    };

    it('should create an expense with organizationId', async () => {
      prisma.expense.create.mockResolvedValue(createMockExpense() as any);

      const result = await service.create(ORG_ID, validDto as any);

      expect(result).toBeDefined();
      const createCall = prisma.expense.create.mock.calls[0][0];
      expect(createCall.data.organizationId).toBe(ORG_ID);
    });

    it('should store monetary values as Decimal', async () => {
      prisma.expense.create.mockResolvedValue(createMockExpense() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.expense.create.mock.calls[0][0];
      expect(createCall.data.amount).toBeInstanceOf(Decimal);
      expect(createCall.data.taxAmount).toBeInstanceOf(Decimal);
    });

    it('should calculate tax amount when not tax-inclusive', async () => {
      prisma.expense.create.mockResolvedValue(createMockExpense() as any);

      const dtoWithTax = { ...validDto, taxRate: '15' };
      await service.create(ORG_ID, dtoWithTax as any);

      const createCall = prisma.expense.create.mock.calls[0][0];
      // 500 * 15% = 75
      expectDecimalEqual(createCall.data.taxAmount as any, '75');
    });

    it('should set tax amount to zero when tax-inclusive', async () => {
      prisma.expense.create.mockResolvedValue(createMockExpense() as any);

      const dtoTaxInclusive = { ...validDto, taxRate: '15', taxInclusive: true };
      await service.create(ORG_ID, dtoTaxInclusive as any);

      const createCall = prisma.expense.create.mock.calls[0][0];
      expectDecimalEqual(createCall.data.taxAmount as any, '0');
    });

    it('should set tax amount to zero when no tax rate provided', async () => {
      prisma.expense.create.mockResolvedValue(createMockExpense() as any);

      await service.create(ORG_ID, validDto as any);

      const createCall = prisma.expense.create.mock.calls[0][0];
      expectDecimalEqual(createCall.data.taxAmount as any, '0');
    });

    it('should create journal entry when accountId and paidThroughAccountId provided', async () => {
      prisma.expense.create.mockResolvedValue(createMockExpense() as any);

      await service.create(ORG_ID, validDto as any);

      expect(journalsService.create).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ accountId: 'acc-expense-001', debit: '500.0000' }),
            expect.objectContaining({ accountId: 'acc-bank-001', credit: '500.0000' }),
          ]),
        }),
      );
    });

    it('should include VAT receivable journal line when tax applies', async () => {
      prisma.expense.create.mockResolvedValue(createMockExpense() as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultVatReceivableAccountId: 'vat-rec-001',
      } as any);

      const dtoWithTax = { ...validDto, taxRate: '10' };
      await service.create(ORG_ID, dtoWithTax as any);

      expect(journalsService.create).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({
              accountId: 'vat-rec-001',
              debit: '50.0000',
              credit: '0',
            }),
          ]),
        }),
      );
    });

    it('should not create journal entry when accountId is missing', async () => {
      prisma.expense.create.mockResolvedValue(createMockExpense() as any);

      const dtoNoAccount = { ...validDto, accountId: undefined };
      await service.create(ORG_ID, dtoNoAccount as any);

      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('should not create journal entry when paidThroughAccountId is missing', async () => {
      prisma.expense.create.mockResolvedValue(createMockExpense() as any);

      const dtoNoPaid = { ...validDto, paidThroughAccountId: undefined };
      await service.create(ORG_ID, dtoNoPaid as any);

      expect(journalsService.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated results with meta', async () => {
      prisma.expense.findMany.mockResolvedValue([
        createMockExpense({ id: 'e1' }),
        createMockExpense({ id: 'e2' }),
      ] as any);
      prisma.expense.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should always filter by organizationId and exclude soft-deleted', async () => {
      prisma.expense.findMany.mockResolvedValue([]);
      prisma.expense.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.expense.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should use default sort by date descending', async () => {
      prisma.expense.findMany.mockResolvedValue([]);
      prisma.expense.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.expense.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ date: 'desc' });
    });
  });

  describe('findOne', () => {
    it('should return expense with account and vendor', async () => {
      const expense = createMockExpense();
      prisma.expense.findFirst.mockResolvedValue(expense as any);

      const result = await service.findOne(ORG_ID, 'exp-test-001');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException for non-existent expense', async () => {
      prisma.expense.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Expense not found');
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.expense.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'exp-1');
      } catch {
        // Expected
      }

      const findCall = prisma.expense.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete an expense', async () => {
      const expense = createMockExpense({ id: 'exp-1' });
      prisma.expense.findFirst.mockResolvedValue(expense as any);
      prisma.expense.update.mockResolvedValue({ ...expense, deletedAt: new Date() } as any);

      const result = await service.remove(ORG_ID, 'exp-1');

      expect(result.message).toBe('Expense deleted successfully');
      expect(prisma.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent expense', async () => {
      prisma.expense.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should never hard-delete financial records', async () => {
      const expense = createMockExpense({ id: 'exp-1' });
      prisma.expense.findFirst.mockResolvedValue(expense as any);
      prisma.expense.update.mockResolvedValue({ ...expense, deletedAt: new Date() } as any);

      await service.remove(ORG_ID, 'exp-1');

      expect(prisma.expense.delete).not.toHaveBeenCalled();
      expect(prisma.expense.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('bulkDelete', () => {
    it('should soft-delete multiple expenses by organizationId', async () => {
      prisma.expense.updateMany.mockResolvedValue({ count: 3 } as any);

      const result = await service.bulkDelete(ORG_ID, ['e1', 'e2', 'e3']);

      expect(result.deleted).toBe(3);
      expect(result.total).toBe(3);

      const updateCall = prisma.expense.updateMany.mock.calls[0]![0]!;
      expect(updateCall.where!.organizationId).toBe(ORG_ID);
      expect(updateCall.where!.deletedAt).toBeNull();
      expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
    });

    it('should report partial deletions', async () => {
      prisma.expense.updateMany.mockResolvedValue({ count: 2 } as any);

      const result = await service.bulkDelete(ORG_ID, ['e1', 'e2', 'e3']);

      expect(result.deleted).toBe(2);
      expect(result.total).toBe(3);
    });
  });

  describe('bulkCategorize', () => {
    it('should update account for multiple expenses', async () => {
      prisma.expense.updateMany.mockResolvedValue({ count: 2 } as any);

      const result = await service.bulkCategorize(ORG_ID, ['e1', 'e2'], 'acc-new');

      expect(result.categorized).toBe(2);
      expect(result.total).toBe(2);

      const updateCall = prisma.expense.updateMany.mock.calls[0]![0]!;
      expect(updateCall.where!.organizationId).toBe(ORG_ID);
      expect(updateCall.where!.deletedAt).toBeNull();
      expect(updateCall.data.accountId).toBe('acc-new');
    });
  });

  describe('bulkApprove', () => {
    it('should set status to POSTED for multiple expenses', async () => {
      prisma.expense.updateMany.mockResolvedValue({ count: 3 } as any);

      const result = await service.bulkApprove(ORG_ID, ['e1', 'e2', 'e3']);

      expect(result.approved).toBe(3);
      expect(result.total).toBe(3);

      const updateCall = prisma.expense.updateMany.mock.calls[0]![0]!;
      expect(updateCall.where!.organizationId).toBe(ORG_ID);
      expect(updateCall.data.status).toBe('POSTED');
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.expense.updateMany.mockResolvedValue({ count: 0 } as any);

      await service.bulkApprove(ORG_ID, ['e1']);

      const updateCall = prisma.expense.updateMany.mock.calls[0]![0]!;
      expect(updateCall.where!.organizationId).toBe(ORG_ID);
      expect(updateCall.where!.deletedAt).toBeNull();
    });
  });
});
