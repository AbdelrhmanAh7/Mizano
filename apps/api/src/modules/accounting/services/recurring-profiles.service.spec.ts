import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RecurringFrequency, RecurringType } from '@prisma/client';
import { RecurringProfilesService } from './recurring-profiles.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('RecurringProfilesService', () => {
  let service: RecurringProfilesService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  const mockProfile = {
    id: 'rp-1',
    name: 'Monthly Rent',
    frequency: RecurringFrequency.MONTHLY,
    type: RecurringType.JOURNAL,
    entityType: 'journal',
    startDate: new Date('2024-01-01'),
    endDate: null,
    nextRunDate: new Date('2024-02-01'),
    autoPost: false,
    autoSend: false,
    isActive: true,
    executionCount: 0,
    lastExecutedAt: null,
    templateData: {
      lines: [
        { accountId: 'acc-1', debit: '1000', credit: '0', description: 'Rent debit' },
        { accountId: 'acc-2', debit: '0', credit: '1000', description: 'Rent credit' },
      ],
    },
    organizationId: ORG_ID,
    deletedAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    executions: [],
  };

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurringProfilesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<RecurringProfilesService>(RecurringProfilesService);
  });

  describe('create', () => {
    const createDto = {
      name: 'Monthly Rent',
      frequency: RecurringFrequency.MONTHLY,
      startDate: '2024-01-01T00:00:00.000Z',
      entityType: 'journal',
      templateData: {
        lines: [
          { accountId: 'acc-1', debit: '1000', credit: '0' },
          { accountId: 'acc-2', debit: '0', credit: '1000' },
        ],
      },
    };

    it('should create a recurring profile successfully', async () => {
      prisma.recurringProfile.create.mockResolvedValue(mockProfile as any);

      const result = await service.create(ORG_ID, createDto as any);

      expect(result).toBeDefined();
      expect(result.name).toBe('Monthly Rent');
      expect(result.organizationId).toBe(ORG_ID);
    });

    it('should include organizationId in the created profile', async () => {
      prisma.recurringProfile.create.mockResolvedValue(mockProfile as any);

      await service.create(ORG_ID, createDto as any);

      const createCall = prisma.recurringProfile.create.mock.calls[0]?.[0];
      expect(createCall?.data.organizationId).toBe(ORG_ID);
    });

    it('should calculate the next run date based on frequency', async () => {
      prisma.recurringProfile.create.mockResolvedValue(mockProfile as any);

      await service.create(ORG_ID, createDto as any);

      const createCall = prisma.recurringProfile.create.mock.calls[0]?.[0];
      const nextRunDate = createCall?.data.nextRunDate as Date;
      expect(nextRunDate).toBeInstanceOf(Date);
      // Monthly from Jan 1 should be Feb 1
      expect(nextRunDate.getMonth()).toBe(1); // February
    });

    it('should map entityType string to RecurringType enum', async () => {
      prisma.recurringProfile.create.mockResolvedValue(mockProfile as any);

      await service.create(ORG_ID, createDto as any);

      const createCall = prisma.recurringProfile.create.mock.calls[0]?.[0];
      expect(createCall?.data.type).toBe(RecurringType.JOURNAL);
    });

    it('should default autoPost and autoSend to false', async () => {
      prisma.recurringProfile.create.mockResolvedValue(mockProfile as any);

      await service.create(ORG_ID, createDto as any);

      const createCall = prisma.recurringProfile.create.mock.calls[0]?.[0];
      expect(createCall?.data.autoPost).toBe(false);
      expect(createCall?.data.autoSend).toBe(false);
    });

    it('should set endDate to null when not provided', async () => {
      prisma.recurringProfile.create.mockResolvedValue(mockProfile as any);

      await service.create(ORG_ID, createDto as any);

      const createCall = prisma.recurringProfile.create.mock.calls[0]?.[0];
      expect(createCall?.data.endDate).toBeNull();
    });

    it('should include executions in the created result', async () => {
      prisma.recurringProfile.create.mockResolvedValue(mockProfile as any);

      await service.create(ORG_ID, createDto as any);

      const createCall = prisma.recurringProfile.create.mock.calls[0]?.[0];
      expect(createCall?.include?.executions).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return all profiles for the organization', async () => {
      prisma.recurringProfile.findMany.mockResolvedValue([mockProfile] as any);

      const result = await service.findAll(ORG_ID);

      expect(result).toHaveLength(1);
    });

    it('should filter by organizationId and exclude soft-deleted records', async () => {
      prisma.recurringProfile.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      const findCall = prisma.recurringProfile.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should filter by isActive when provided', async () => {
      prisma.recurringProfile.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { isActive: true });

      const findCall = prisma.recurringProfile.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.isActive).toBe(true);
    });

    it('should filter by type when provided', async () => {
      prisma.recurringProfile.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID, { type: RecurringType.INVOICE });

      const findCall = prisma.recurringProfile.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.type).toBe(RecurringType.INVOICE);
    });

    it('should order by nextRunDate ascending', async () => {
      prisma.recurringProfile.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      const findCall = prisma.recurringProfile.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ nextRunDate: 'asc' });
    });
  });

  describe('findOne', () => {
    it('should return a profile by id', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(mockProfile as any);

      const result = await service.findOne(ORG_ID, 'rp-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('rp-1');
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(
        'Recurring profile not found',
      );
    });

    it('should query with organizationId and deletedAt: null', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'rp-1');
      } catch {
        // Expected NotFoundException
      }

      const findCall = prisma.recurringProfile.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('getExecutionHistory', () => {
    it('should return execution history for a profile', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(mockProfile as any);
      const executions = [
        { id: 'exec-1', profileId: 'rp-1', status: 'success', executedAt: new Date() },
      ];
      prisma.recurringExecution.findMany.mockResolvedValue(executions as any);

      const result = await service.getExecutionHistory(ORG_ID, 'rp-1');

      expect(result).toHaveLength(1);
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(null);

      await expect(service.getExecutionHistory(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should respect the limit parameter', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(mockProfile as any);
      prisma.recurringExecution.findMany.mockResolvedValue([]);

      await service.getExecutionHistory(ORG_ID, 'rp-1', 10);

      const findCall = prisma.recurringExecution.findMany.mock.calls[0]![0]!;
      expect(findCall.take).toBe(10);
    });

    it('should default limit to 50', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(mockProfile as any);
      prisma.recurringExecution.findMany.mockResolvedValue([]);

      await service.getExecutionHistory(ORG_ID, 'rp-1');

      const findCall = prisma.recurringExecution.findMany.mock.calls[0]![0]!;
      expect(findCall.take).toBe(50);
    });
  });

  describe('update', () => {
    it('should update a profile successfully', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(mockProfile as any);
      prisma.recurringProfile.update.mockResolvedValue({
        ...mockProfile,
        name: 'Updated Rent',
      } as any);

      const result = await service.update(ORG_ID, 'rp-1', { name: 'Updated Rent' } as any);

      expect(result.name).toBe('Updated Rent');
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'nonexistent', { name: 'test' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should recalculate nextRunDate when frequency changes', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(mockProfile as any);
      prisma.recurringProfile.update.mockResolvedValue({
        ...mockProfile,
        frequency: RecurringFrequency.WEEKLY,
      } as any);

      await service.update(ORG_ID, 'rp-1', {
        frequency: RecurringFrequency.WEEKLY,
      } as any);

      const updateCall = prisma.recurringProfile.update.mock.calls[0]?.[0];
      expect(updateCall?.data.nextRunDate).toBeInstanceOf(Date);
    });

    it('should keep existing nextRunDate when frequency does not change', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(mockProfile as any);
      prisma.recurringProfile.update.mockResolvedValue({
        ...mockProfile,
        name: 'Same frequency',
      } as any);

      await service.update(ORG_ID, 'rp-1', { name: 'Same frequency' } as any);

      const updateCall = prisma.recurringProfile.update.mock.calls[0]?.[0];
      expect(updateCall?.data.nextRunDate).toEqual(mockProfile.nextRunDate);
    });
  });

  describe('toggle', () => {
    it('should toggle isActive from true to false', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(mockProfile as any);
      prisma.recurringProfile.update.mockResolvedValue({
        ...mockProfile,
        isActive: false,
      } as any);

      const result = await service.toggle(ORG_ID, 'rp-1');

      expect(result.isActive).toBe(false);
      expect(prisma.recurringProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rp-1' },
          data: { isActive: false },
        }),
      );
    });

    it('should toggle isActive from false to true', async () => {
      const inactiveProfile = { ...mockProfile, isActive: false };
      prisma.recurringProfile.findFirst.mockResolvedValue(inactiveProfile as any);
      prisma.recurringProfile.update.mockResolvedValue({
        ...inactiveProfile,
        isActive: true,
      } as any);

      const result = await service.toggle(ORG_ID, 'rp-1');

      expect(result.isActive).toBe(true);
      expect(prisma.recurringProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isActive: true },
        }),
      );
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(null);

      await expect(service.toggle(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete a profile by setting deletedAt', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(mockProfile as any);
      prisma.recurringProfile.update.mockResolvedValue({
        ...mockProfile,
        deletedAt: new Date(),
      } as any);

      const result = await service.remove(ORG_ID, 'rp-1');

      expect(result.message).toBe('Recurring profile deleted successfully');
      expect(prisma.recurringProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rp-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should NOT hard-delete the record', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(mockProfile as any);
      prisma.recurringProfile.update.mockResolvedValue({
        ...mockProfile,
        deletedAt: new Date(),
      } as any);

      await service.remove(ORG_ID, 'rp-1');

      expect(prisma.recurringProfile.delete).not.toHaveBeenCalled();
      expect(prisma.recurringProfile.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent profile', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('executeProfile', () => {
    it('should execute a journal-type profile and record success', async () => {
      const journalProfile = {
        ...mockProfile,
        type: RecurringType.JOURNAL,
        entityType: 'journal',
        templateData: {
          lines: [
            { accountId: 'acc-1', debit: '500', credit: '0' },
            { accountId: 'acc-2', debit: '0', credit: '500' },
          ],
        },
      };

      prisma.recurringProfile.findFirst.mockResolvedValue(journalProfile as any);
      prisma.journal.findFirst.mockResolvedValue(null); // for journal number generation
      prisma.journal.create.mockResolvedValue({ id: 'jrn-new' } as any);
      prisma.recurringExecution.create.mockResolvedValue({} as any);
      prisma.recurringProfile.update.mockResolvedValue({} as any);

      const result = await service.executeProfile(ORG_ID, 'rp-1');

      expect(result.success).toBe(true);
      expect(result.createdEntityId).toBe('jrn-new');
    });

    it('should execute an invoice-type profile', async () => {
      const invoiceProfile = {
        ...mockProfile,
        type: RecurringType.INVOICE,
        entityType: 'invoice',
        templateData: {
          customerId: 'cust-1',
          lines: [{ description: 'Service', quantity: 1, rate: 500 }],
        },
      };

      prisma.recurringProfile.findFirst.mockResolvedValue(invoiceProfile as any);
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-1',
        paymentTerms: 30,
        organizationId: ORG_ID,
      } as any);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue({ id: 'inv-new' } as any);
      prisma.recurringExecution.create.mockResolvedValue({} as any);
      prisma.recurringProfile.update.mockResolvedValue({} as any);

      const result = await service.executeProfile(ORG_ID, 'rp-1');

      expect(result.success).toBe(true);
      expect(result.createdEntityId).toBe('inv-new');
    });

    it('should execute a bill-type profile', async () => {
      const billProfile = {
        ...mockProfile,
        type: RecurringType.BILL,
        entityType: 'bill',
        templateData: {
          vendorId: 'vendor-1',
          lines: [{ description: 'Supply', quantity: 10, rate: 50 }],
        },
      };

      prisma.recurringProfile.findFirst.mockResolvedValue(billProfile as any);
      prisma.vendor.findFirst.mockResolvedValue({
        id: 'vendor-1',
        paymentTerms: 30,
        organizationId: ORG_ID,
      } as any);
      prisma.bill.findFirst.mockResolvedValue(null);
      prisma.bill.create.mockResolvedValue({ id: 'bill-new' } as any);
      prisma.recurringExecution.create.mockResolvedValue({} as any);
      prisma.recurringProfile.update.mockResolvedValue({} as any);

      const result = await service.executeProfile(ORG_ID, 'rp-1');

      expect(result.success).toBe(true);
      expect(result.createdEntityId).toBe('bill-new');
    });

    it('should execute an expense-type profile', async () => {
      const expenseProfile = {
        ...mockProfile,
        type: RecurringType.EXPENSE,
        entityType: 'expense',
        templateData: {
          accountId: 'acc-expense',
          paidThroughAccountId: 'acc-bank',
          amount: '250.00',
        },
      };

      prisma.recurringProfile.findFirst.mockResolvedValue(expenseProfile as any);
      prisma.expense.create.mockResolvedValue({ id: 'exp-new' } as any);
      prisma.recurringExecution.create.mockResolvedValue({} as any);
      prisma.recurringProfile.update.mockResolvedValue({} as any);

      const result = await service.executeProfile(ORG_ID, 'rp-1');

      expect(result.success).toBe(true);
      expect(result.createdEntityId).toBe('exp-new');
    });

    it('should record a failed execution and return error', async () => {
      const badProfile = {
        ...mockProfile,
        type: 'unsupported_type',
        entityType: 'unsupported_type',
        templateData: {},
      };

      prisma.recurringProfile.findFirst.mockResolvedValue(badProfile as any);
      prisma.recurringExecution.create.mockResolvedValue({} as any);

      const result = await service.executeProfile(ORG_ID, 'rp-1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Should record the failed execution
      expect(prisma.recurringExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
          }),
        }),
      );
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(null);

      await expect(service.executeProfile(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should increment executionCount and set lastExecutedAt on success', async () => {
      const journalProfile = {
        ...mockProfile,
        type: RecurringType.JOURNAL,
        entityType: 'journal',
      };

      prisma.recurringProfile.findFirst.mockResolvedValue(journalProfile as any);
      prisma.journal.findFirst.mockResolvedValue(null);
      prisma.journal.create.mockResolvedValue({ id: 'jrn-new' } as any);
      prisma.recurringExecution.create.mockResolvedValue({} as any);
      prisma.recurringProfile.update.mockResolvedValue({} as any);

      await service.executeProfile(ORG_ID, 'rp-1');

      expect(prisma.recurringProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rp-1' },
          data: expect.objectContaining({
            executionCount: { increment: 1 },
            lastExecutedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should record execution with organizationId', async () => {
      const journalProfile = {
        ...mockProfile,
        type: RecurringType.JOURNAL,
        entityType: 'journal',
      };

      prisma.recurringProfile.findFirst.mockResolvedValue(journalProfile as any);
      prisma.journal.findFirst.mockResolvedValue(null);
      prisma.journal.create.mockResolvedValue({ id: 'jrn-new' } as any);
      prisma.recurringExecution.create.mockResolvedValue({} as any);
      prisma.recurringProfile.update.mockResolvedValue({} as any);

      await service.executeProfile(ORG_ID, 'rp-1');

      expect(prisma.recurringExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            status: 'success',
          }),
        }),
      );
    });

    it('should generate proper journal number for created journal', async () => {
      const journalProfile = {
        ...mockProfile,
        type: RecurringType.JOURNAL,
        entityType: 'journal',
      };

      prisma.recurringProfile.findFirst.mockResolvedValue(journalProfile as any);
      prisma.journal.findFirst.mockResolvedValue({ journalNumber: 'JRN-005' } as any);
      prisma.journal.create.mockResolvedValue({ id: 'jrn-new' } as any);
      prisma.recurringExecution.create.mockResolvedValue({} as any);
      prisma.recurringProfile.update.mockResolvedValue({} as any);

      await service.executeProfile(ORG_ID, 'rp-1');

      const createCall = prisma.journal.create.mock.calls[0]?.[0];
      expect(createCall?.data.journalNumber).toBe('JRN-006');
    });
  });

  describe('getStatistics', () => {
    it('should return aggregated statistics', async () => {
      prisma.recurringProfile.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(7) // active
        .mockResolvedValueOnce(3); // paused
      prisma.recurringProfile.groupBy.mockResolvedValue([
        { type: RecurringType.JOURNAL, _count: { id: 4 } },
        { type: RecurringType.INVOICE, _count: { id: 3 } },
      ] as any);
      prisma.recurringExecution.findMany.mockResolvedValue([]);

      const result = await service.getStatistics(ORG_ID);

      expect(result.total).toBe(10);
      expect(result.active).toBe(7);
      expect(result.paused).toBe(3);
      expect(result.byType).toHaveLength(2);
    });

    it('should filter statistics by organizationId', async () => {
      prisma.recurringProfile.count.mockResolvedValue(0);
      prisma.recurringProfile.groupBy.mockResolvedValue([] as any);
      prisma.recurringExecution.findMany.mockResolvedValue([]);

      await service.getStatistics(ORG_ID);

      // All count calls should include organizationId
      for (const call of prisma.recurringProfile.count.mock.calls) {
        expect(call[0]?.where?.organizationId).toBe(ORG_ID);
      }
    });
  });

  describe('getUpcoming', () => {
    it('should return profiles due within the specified days', async () => {
      prisma.recurringProfile.findMany.mockResolvedValue([mockProfile] as any);

      const result = await service.getUpcoming(ORG_ID, 7);

      expect(result).toHaveLength(1);
    });

    it('should filter by organizationId, isActive, and deletedAt', async () => {
      prisma.recurringProfile.findMany.mockResolvedValue([]);

      await service.getUpcoming(ORG_ID);

      const findCall = prisma.recurringProfile.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.isActive).toBe(true);
      expect(findCall.where!.deletedAt).toBeNull();
    });

    it('should default to 7 days', async () => {
      prisma.recurringProfile.findMany.mockResolvedValue([]);

      await service.getUpcoming(ORG_ID);

      const findCall = prisma.recurringProfile.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.nextRunDate).toBeDefined();
    });
  });

  describe('processRecurringProfiles (cron)', () => {
    it('should process active profiles with nextRunDate <= today', async () => {
      const dueProfile = {
        ...mockProfile,
        nextRunDate: new Date('2020-01-01'), // past date
        type: RecurringType.JOURNAL,
        entityType: 'journal',
      };

      prisma.recurringProfile.findMany.mockResolvedValue([dueProfile] as any);
      prisma.journal.findFirst.mockResolvedValue(null);
      prisma.journal.create.mockResolvedValue({ id: 'jrn-auto' } as any);
      prisma.recurringExecution.create.mockResolvedValue({} as any);
      prisma.recurringProfile.update.mockResolvedValue({} as any);

      await service.processRecurringProfiles();

      // Should have created a journal and updated the profile
      expect(prisma.journal.create).toHaveBeenCalled();
      // Should update next run date after processing
      expect(prisma.recurringProfile.update).toHaveBeenCalled();
    });

    it('should filter for active and non-deleted profiles only', async () => {
      prisma.recurringProfile.findMany.mockResolvedValue([]);

      await service.processRecurringProfiles();

      const findCall = prisma.recurringProfile.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.isActive).toBe(true);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });
});
