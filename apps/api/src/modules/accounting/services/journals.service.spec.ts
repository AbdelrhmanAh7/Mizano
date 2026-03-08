import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JournalsService } from './journals.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockJournalEntry, createMockJournalLine } from '../../../test/helpers/test-utils';
import { dec } from '../../../test/helpers/decimal.helpers';

describe('JournalsService', () => {
  let service: JournalsService;
  let prisma: MockPrismaClient;
  let organizationsService: { getLockDate: jest.Mock };

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();
    organizationsService = {
      getLockDate: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrganizationsService, useValue: organizationsService },
      ],
    }).compile();

    service = module.get<JournalsService>(JournalsService);
  });

  describe('create', () => {
    const balancedDto = {
      date: '2024-06-15T00:00:00.000Z',
      reference: 'Test Ref',
      notes: 'Test journal',
      lines: [
        { accountId: 'acc-1', debit: '1000.0000', credit: '0', description: 'Debit line' },
        { accountId: 'acc-2', debit: '0', credit: '1000.0000', description: 'Credit line' },
      ],
    };

    it('should create a balanced journal entry successfully', async () => {
      const mockJournal = createMockJournalEntry({
        journalNumber: 'JRN-001',
        lines: [
          createMockJournalLine({ debit: dec('1000'), credit: dec('0') }),
          createMockJournalLine({ debit: dec('0'), credit: dec('1000') }),
        ],
      });

      prisma.account.findMany.mockResolvedValue([
        { id: 'acc-1', organizationId: ORG_ID },
        { id: 'acc-2', organizationId: ORG_ID },
      ] as any);
      prisma.journal.findFirst.mockResolvedValue(null);
      prisma.journal.create.mockResolvedValue(mockJournal as any);

      const result = await service.create(ORG_ID, balancedDto);

      expect(result).toBeDefined();
      expect(result.totalDebit).toBe('1000.0000');
      expect(result.totalCredit).toBe('1000.0000');
    });

    it('should reject unbalanced journal entries (debits != credits)', async () => {
      const unbalancedDto = {
        date: '2024-06-15T00:00:00.000Z',
        lines: [
          { accountId: 'acc-1', debit: '1000.0000', credit: '0' },
          { accountId: 'acc-2', debit: '0', credit: '500.0000' },
        ],
      };

      await expect(service.create(ORG_ID, unbalancedDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, unbalancedDto)).rejects.toThrow(
        'Total debits must equal total credits',
      );
    });

    it('should reject entries with a small imbalance beyond tolerance', async () => {
      const slightlyUnbalancedDto = {
        date: '2024-06-15T00:00:00.000Z',
        lines: [
          { accountId: 'acc-1', debit: '1000.0000', credit: '0' },
          { accountId: 'acc-2', debit: '0', credit: '999.9998' },
        ],
      };

      await expect(service.create(ORG_ID, slightlyUnbalancedDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow entries within floating-point tolerance (0.0001)', async () => {
      // Difference of exactly 0.0001 should still pass (abs <= 0.0001)
      const nearBalancedDto = {
        date: '2024-06-15T00:00:00.000Z',
        lines: [
          { accountId: 'acc-1', debit: '1000.0001', credit: '0' },
          { accountId: 'acc-2', debit: '0', credit: '1000.0000' },
        ],
      };

      prisma.account.findMany.mockResolvedValue([
        { id: 'acc-1', organizationId: ORG_ID },
        { id: 'acc-2', organizationId: ORG_ID },
      ] as any);

      const mockJournal = createMockJournalEntry({
        journalNumber: 'JRN-001',
        lines: [
          createMockJournalLine({ debit: dec('1000.0001'), credit: dec('0') }),
          createMockJournalLine({ debit: dec('0'), credit: dec('1000.0000') }),
        ],
      });
      prisma.journal.findFirst.mockResolvedValue(null);
      prisma.journal.create.mockResolvedValue(mockJournal as any);

      const result = await service.create(ORG_ID, nearBalancedDto);
      expect(result).toBeDefined();
    });

    it('should reject when referenced accounts do not exist', async () => {
      prisma.account.findMany.mockResolvedValue([{ id: 'acc-1', organizationId: ORG_ID }] as any);

      await expect(service.create(ORG_ID, balancedDto)).rejects.toThrow(
        'One or more accounts not found',
      );
    });

    it('should generate JRN-001 for the first journal entry', async () => {
      prisma.account.findMany.mockResolvedValue([
        { id: 'acc-1', organizationId: ORG_ID },
        { id: 'acc-2', organizationId: ORG_ID },
      ] as any);

      // No existing journal
      prisma.journal.findFirst.mockResolvedValue(null);

      const mockJournal = createMockJournalEntry({
        journalNumber: 'JRN-001',
        lines: [],
      });
      prisma.journal.create.mockResolvedValue(mockJournal as any);

      await service.create(ORG_ID, balancedDto);

      // The create call inside the transaction should have been called with journalNumber
      const createCall = prisma.journal.create.mock.calls[0]?.[0];
      expect(createCall?.data).toHaveProperty('journalNumber', 'JRN-001');
    });

    it('should auto-increment journal numbers (JRN-XXX format)', async () => {
      prisma.account.findMany.mockResolvedValue([
        { id: 'acc-1', organizationId: ORG_ID },
        { id: 'acc-2', organizationId: ORG_ID },
      ] as any);

      // Existing journal with number JRN-042
      prisma.journal.findFirst.mockResolvedValue({
        journalNumber: 'JRN-042',
      } as any);

      const mockJournal = createMockJournalEntry({
        journalNumber: 'JRN-043',
        lines: [],
      });
      prisma.journal.create.mockResolvedValue(mockJournal as any);

      await service.create(ORG_ID, balancedDto);

      const createCall = prisma.journal.create.mock.calls[0]?.[0];
      expect(createCall?.data).toHaveProperty('journalNumber', 'JRN-043');
    });

    it('should reject entries before the organization lock date', async () => {
      organizationsService.getLockDate.mockResolvedValue(new Date('2024-12-31'));

      const lockedDto = {
        date: '2024-06-15T00:00:00.000Z',
        lines: [
          { accountId: 'acc-1', debit: '100', credit: '0' },
          { accountId: 'acc-2', debit: '0', credit: '100' },
        ],
      };

      await expect(service.create(ORG_ID, lockedDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, lockedDto)).rejects.toThrow(/period is locked/);
    });

    it('should include organizationId in the created journal data', async () => {
      prisma.account.findMany.mockResolvedValue([
        { id: 'acc-1', organizationId: ORG_ID },
        { id: 'acc-2', organizationId: ORG_ID },
      ] as any);
      prisma.journal.findFirst.mockResolvedValue(null);
      prisma.journal.create.mockResolvedValue(
        createMockJournalEntry({ journalNumber: 'JRN-001', lines: [] }) as any,
      );

      await service.create(ORG_ID, balancedDto);

      const createCall = prisma.journal.create.mock.calls[0]?.[0];
      expect(createCall?.data.organizationId).toBe(ORG_ID);
    });
  });

  describe('findAll', () => {
    it('should return paginated journals with totals', async () => {
      const journals = [
        createMockJournalEntry({
          id: 'j1',
          lines: [
            createMockJournalLine({ debit: dec('500'), credit: dec('0') }),
            createMockJournalLine({ debit: dec('0'), credit: dec('500') }),
          ],
        }),
      ];

      prisma.journal.findMany.mockResolvedValue(journals as any);
      prisma.journal.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].totalDebit).toBe('500.0000');
      expect(result.data[0].totalCredit).toBe('500.0000');
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should filter by organizationId and exclude soft-deleted records', async () => {
      prisma.journal.findMany.mockResolvedValue([]);
      prisma.journal.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findManyCall = prisma.journal.findMany.mock.calls[0]![0]!;
      expect(findManyCall.where!.organizationId).toBe(ORG_ID);
      expect(findManyCall.where!.deletedAt).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should return a journal entry by id with computed totals', async () => {
      const journal = createMockJournalEntry({
        id: 'j1',
        lines: [
          createMockJournalLine({ debit: dec('750'), credit: dec('0') }),
          createMockJournalLine({ debit: dec('0'), credit: dec('750') }),
        ],
      });

      prisma.journal.findFirst.mockResolvedValue(journal as any);

      const result = await service.findOne(ORG_ID, 'j1');

      expect(result.totalDebit).toBe('750.0000');
      expect(result.totalCredit).toBe('750.0000');
    });

    it('should throw NotFoundException when journal does not exist', async () => {
      prisma.journal.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should query with organizationId and deletedAt: null', async () => {
      prisma.journal.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'j1');
      } catch {
        // Expected NotFoundException
      }

      const findCall = prisma.journal.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete a journal by setting deletedAt', async () => {
      const journal = createMockJournalEntry({ id: 'j1', date: new Date('2025-06-01') });
      prisma.journal.findFirst.mockResolvedValue(journal as any);
      prisma.journal.update.mockResolvedValue({ ...journal, deletedAt: new Date() } as any);

      const result = await service.remove(ORG_ID, 'j1');

      expect(result.message).toBe('Journal deleted successfully');
      expect(prisma.journal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'j1' },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should NOT hard-delete the record', async () => {
      const journal = createMockJournalEntry({ id: 'j1', date: new Date('2025-06-01') });
      prisma.journal.findFirst.mockResolvedValue(journal as any);
      prisma.journal.update.mockResolvedValue({ ...journal, deletedAt: new Date() } as any);

      await service.remove(ORG_ID, 'j1');

      expect(prisma.journal.delete).not.toHaveBeenCalled();
      expect(prisma.journal.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent journal on remove', async () => {
      prisma.journal.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should reject remove for journals before lock date', async () => {
      const journal = createMockJournalEntry({ id: 'j1', date: new Date('2024-06-01') });
      prisma.journal.findFirst.mockResolvedValue(journal as any);
      organizationsService.getLockDate.mockResolvedValue(new Date('2024-12-31'));

      await expect(service.remove(ORG_ID, 'j1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('reverse', () => {
    it('should create a reversal journal with debits and credits swapped', async () => {
      const originalJournal = createMockJournalEntry({
        id: 'j1',
        journalNumber: 'JRN-001',
        date: new Date('2025-06-01'),
        reversedBy: null,
        reversalOfId: null,
        lines: [
          createMockJournalLine({ accountId: 'acc-1', debit: dec('500'), credit: dec('0') }),
          createMockJournalLine({ accountId: 'acc-2', debit: dec('0'), credit: dec('500') }),
        ],
      });

      prisma.journal.findFirst
        .mockResolvedValueOnce(originalJournal as any) // reverse lookup
        .mockResolvedValueOnce(originalJournal as any); // generateJournalNumberTx

      const reversalJournal = createMockJournalEntry({
        id: 'j2',
        journalNumber: 'JRN-002',
        lines: [
          createMockJournalLine({ accountId: 'acc-1', debit: dec('0'), credit: dec('500') }),
          createMockJournalLine({ accountId: 'acc-2', debit: dec('500'), credit: dec('0') }),
        ],
      });

      prisma.journal.create.mockResolvedValue(reversalJournal as any);

      const result = await service.reverse(ORG_ID, 'j1');

      expect(result).toBeDefined();
      expect(result.totalDebit).toBe('500.0000');
      expect(result.totalCredit).toBe('500.0000');
    });

    it('should reject reversing an already-reversed journal', async () => {
      const journal = createMockJournalEntry({
        id: 'j1',
        reversedBy: { id: 'j2' },
        reversalOfId: null,
        date: new Date('2025-06-01'),
        lines: [],
      });
      prisma.journal.findFirst.mockResolvedValue(journal as any);

      await expect(service.reverse(ORG_ID, 'j1')).rejects.toThrow(
        'This journal has already been reversed',
      );
    });

    it('should reject reversing a reversal journal', async () => {
      const journal = createMockJournalEntry({
        id: 'j2',
        reversedBy: null,
        reversalOfId: 'j1',
        date: new Date('2025-06-01'),
        lines: [],
      });
      prisma.journal.findFirst.mockResolvedValue(journal as any);

      await expect(service.reverse(ORG_ID, 'j2')).rejects.toThrow(
        'Cannot reverse a reversal journal',
      );
    });
  });

  describe('update', () => {
    it('should reject updating lines with unbalanced totals', async () => {
      const journal = createMockJournalEntry({ id: 'j1', date: new Date('2025-06-01') });
      prisma.journal.findFirst.mockResolvedValue(journal as any);

      const unbalancedUpdate = {
        lines: [
          { accountId: 'acc-1', debit: '200', credit: '0' },
          { accountId: 'acc-2', debit: '0', credit: '100' },
        ],
      };

      await expect(service.update(ORG_ID, 'j1', unbalancedUpdate)).rejects.toThrow(
        'Total debits must equal total credits',
      );
    });

    it('should throw NotFoundException when updating non-existent journal', async () => {
      prisma.journal.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'nonexistent', { notes: 'updated' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
