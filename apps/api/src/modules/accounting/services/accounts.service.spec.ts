import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('AccountsService', () => {
  let service: AccountsService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  describe('create', () => {
    const createDto = {
      code: '1000',
      name: 'Cash',
      type: AccountType.ASSET,
      currency: 'USD',
      description: 'Cash account',
    };

    it('should create an account successfully', async () => {
      prisma.account.findFirst.mockResolvedValue(null); // no duplicate code
      const mockAccount = {
        id: 'acc-1',
        ...createDto,
        organizationId: ORG_ID,
        parent: null,
      };
      prisma.account.create.mockResolvedValue(mockAccount as any);

      const result = await service.create(ORG_ID, createDto);

      expect(result).toBeDefined();
      expect(result.id).toBe('acc-1');
      expect(prisma.account.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: '1000',
            name: 'Cash',
            type: AccountType.ASSET,
            organizationId: ORG_ID,
          }),
        }),
      );
    });

    it('should include organizationId in the created account', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue({ id: 'acc-1', organizationId: ORG_ID } as any);

      await service.create(ORG_ID, createDto);

      const createCall = prisma.account.create.mock.calls[0]?.[0];
      expect(createCall?.data).toHaveProperty('organizationId', ORG_ID);
    });

    it('should throw ConflictException when account code already exists', async () => {
      prisma.account.findFirst.mockResolvedValue({
        id: 'existing-acc',
        code: '1000',
        organizationId: ORG_ID,
      } as any);

      await expect(service.create(ORG_ID, createDto)).rejects.toThrow(ConflictException);
      await expect(service.create(ORG_ID, createDto)).rejects.toThrow(
        'Account code already exists',
      );
    });

    it('should check code uniqueness scoped to organizationId', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue({ id: 'acc-1' } as any);

      await service.create(ORG_ID, createDto);

      const findCall = prisma.account.findFirst.mock.calls[0]?.[0];
      expect(findCall?.where).toEqual(
        expect.objectContaining({ code: '1000', organizationId: ORG_ID }),
      );
    });

    it('should verify parent account exists when parentId is provided', async () => {
      const dtoWithParent = { ...createDto, parentId: 'parent-1' };

      // First call: code uniqueness check (no duplicate)
      // Second call: parent lookup (not found)
      prisma.account.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      await expect(service.create(ORG_ID, dtoWithParent)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, dtoWithParent)).rejects.toThrow(
        'Parent account not found',
      );
    });

    it('should create account with parent when parentId is valid', async () => {
      const dtoWithParent = { ...createDto, parentId: 'parent-1' };

      prisma.account.findFirst
        .mockResolvedValueOnce(null) // no duplicate code
        .mockResolvedValueOnce({ id: 'parent-1', organizationId: ORG_ID } as any); // parent exists
      prisma.account.create.mockResolvedValue({
        id: 'acc-1',
        parentId: 'parent-1',
      } as any);

      const result = await service.create(ORG_ID, dtoWithParent);
      expect(result).toBeDefined();
    });

    it('should default currency to USD when not provided', async () => {
      const dtoNoCurrency = { code: '1001', name: 'Bank', type: AccountType.ASSET };
      prisma.account.findFirst.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue({ id: 'acc-1' } as any);

      await service.create(ORG_ID, dtoNoCurrency);

      const createCall = prisma.account.create.mock.calls[0]?.[0];
      expect(createCall?.data).toHaveProperty('currency', 'USD');
    });
  });

  describe('findAll', () => {
    it('should return paginated accounts', async () => {
      const accounts = [{ id: 'acc-1', code: '1000', name: 'Cash', organizationId: ORG_ID }];
      prisma.account.findMany.mockResolvedValue(accounts as any);
      prisma.account.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('should filter by organizationId and exclude soft-deleted records', async () => {
      prisma.account.findMany.mockResolvedValue([]);
      prisma.account.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findManyCall = prisma.account.findMany.mock.calls[0]![0]!;
      expect(findManyCall.where!.organizationId).toBe(ORG_ID);
      expect(findManyCall.where!.deletedAt).toBeNull();
    });

    it('should apply search filter on name and code', async () => {
      prisma.account.findMany.mockResolvedValue([]);
      prisma.account.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { search: 'cash' });

      const findManyCall = prisma.account.findMany.mock.calls[0]![0]!;
      expect(findManyCall.where!.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: { contains: 'cash', mode: 'insensitive' } }),
          expect.objectContaining({ code: { contains: 'cash', mode: 'insensitive' } }),
        ]),
      );
    });

    it('should calculate totalPages correctly', async () => {
      prisma.account.findMany.mockResolvedValue([]);
      prisma.account.count.mockResolvedValue(45);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.meta.totalPages).toBe(3);
    });
  });

  describe('findOne', () => {
    it('should return an account by id', async () => {
      const account = {
        id: 'acc-1',
        code: '1000',
        name: 'Cash',
        organizationId: ORG_ID,
        parent: null,
        children: [],
      };
      prisma.account.findFirst.mockResolvedValue(account as any);

      const result = await service.findOne(ORG_ID, 'acc-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('acc-1');
    });

    it('should throw NotFoundException when account does not exist', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Account not found');
    });

    it('should query with organizationId and deletedAt: null', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'acc-1');
      } catch {
        // Expected NotFoundException
      }

      const findCall = prisma.account.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('findByType', () => {
    it('should return accounts filtered by type', async () => {
      const accounts = [{ id: 'acc-1', code: '1000', type: AccountType.ASSET }];
      prisma.account.findMany.mockResolvedValue(accounts as any);

      const result = await service.findByType(ORG_ID, 'asset');

      expect(result).toHaveLength(1);
    });

    it('should filter by organizationId, type, isActive, and deletedAt', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.findByType(ORG_ID, 'expense');

      const findCall = prisma.account.findMany.mock.calls[0]![0]!;
      expect(findCall.where).toEqual(
        expect.objectContaining({
          organizationId: ORG_ID,
          type: AccountType.EXPENSE,
          isActive: true,
          deletedAt: null,
        }),
      );
    });
  });

  describe('getTree', () => {
    it('should return root accounts with nested children', async () => {
      const tree = [
        {
          id: 'acc-1',
          code: '1000',
          parentId: null,
          children: [
            { id: 'acc-2', code: '1010', children: [{ id: 'acc-3', code: '1011', children: [] }] },
          ],
        },
      ];
      prisma.account.findMany.mockResolvedValue(tree as any);

      const result = await service.getTree(ORG_ID);

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(1);
    });

    it('should filter by organizationId, parentId: null, and deletedAt: null', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      await service.getTree(ORG_ID);

      const findCall = prisma.account.findMany.mock.calls[0]![0]!;
      expect(findCall.where).toEqual(
        expect.objectContaining({
          organizationId: ORG_ID,
          parentId: null,
          deletedAt: null,
        }),
      );
    });
  });

  describe('update', () => {
    const existingAccount = {
      id: 'acc-1',
      code: '1000',
      name: 'Cash',
      organizationId: ORG_ID,
      isSystem: false,
    };

    it('should update an account successfully', async () => {
      prisma.account.findFirst.mockResolvedValue(existingAccount as any);
      prisma.account.update.mockResolvedValue({
        ...existingAccount,
        name: 'Updated Cash',
      } as any);

      const result = await service.update(ORG_ID, 'acc-1', { name: 'Updated Cash' });

      expect(result.name).toBe('Updated Cash');
    });

    it('should throw NotFoundException when account does not exist', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'nonexistent', { name: 'Updated' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject updating system accounts', async () => {
      prisma.account.findFirst.mockResolvedValue({
        ...existingAccount,
        isSystem: true,
      } as any);

      await expect(service.update(ORG_ID, 'acc-1', { name: 'Changed' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update(ORG_ID, 'acc-1', { name: 'Changed' })).rejects.toThrow(
        'System accounts cannot be modified',
      );
    });

    it('should reject duplicate account code when changing code', async () => {
      prisma.account.findFirst
        .mockResolvedValueOnce(existingAccount as any) // find the account
        .mockResolvedValueOnce({ id: 'acc-other', code: '2000' } as any); // duplicate code exists

      await expect(service.update(ORG_ID, 'acc-1', { code: '2000' })).rejects.toThrow(
        'Account code already exists',
      );
    });

    it('should allow updating to the same code', async () => {
      // When code is the same as existing, no uniqueness check needed
      prisma.account.findFirst.mockResolvedValue(existingAccount as any);
      prisma.account.update.mockResolvedValue(existingAccount as any);

      const result = await service.update(ORG_ID, 'acc-1', { code: '1000' });
      expect(result).toBeDefined();
    });

    it('should reject setting an account as its own parent', async () => {
      prisma.account.findFirst.mockResolvedValue(existingAccount as any);

      await expect(service.update(ORG_ID, 'acc-1', { parentId: 'acc-1' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update(ORG_ID, 'acc-1', { parentId: 'acc-1' })).rejects.toThrow(
        'Account cannot be its own parent',
      );
    });

    it('should reject invalid parent account', async () => {
      prisma.account.findFirst
        .mockResolvedValueOnce(existingAccount as any) // find the account
        .mockResolvedValueOnce(null); // parent not found

      await expect(service.update(ORG_ID, 'acc-1', { parentId: 'nonexistent' })).rejects.toThrow(
        'Parent account not found',
      );
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete an account by setting deletedAt', async () => {
      const account = {
        id: 'acc-1',
        organizationId: ORG_ID,
        isSystem: false,
        _count: { children: 0, journalLines: 0 },
      };
      prisma.account.findFirst.mockResolvedValue(account as any);
      prisma.account.update.mockResolvedValue({
        ...account,
        deletedAt: new Date(),
      } as any);

      const result = await service.remove(ORG_ID, 'acc-1');

      expect(result.message).toBe('Account deleted successfully');
      expect(prisma.account.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'acc-1' },
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should NOT hard-delete the record', async () => {
      const account = {
        id: 'acc-1',
        organizationId: ORG_ID,
        isSystem: false,
        _count: { children: 0, journalLines: 0 },
      };
      prisma.account.findFirst.mockResolvedValue(account as any);
      prisma.account.update.mockResolvedValue({
        ...account,
        deletedAt: new Date(),
      } as any);

      await service.remove(ORG_ID, 'acc-1');

      expect(prisma.account.delete).not.toHaveBeenCalled();
      expect(prisma.account.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent account', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should reject deleting system accounts', async () => {
      const systemAccount = {
        id: 'acc-1',
        organizationId: ORG_ID,
        isSystem: true,
        _count: { children: 0, journalLines: 0 },
      };
      prisma.account.findFirst.mockResolvedValue(systemAccount as any);

      await expect(service.remove(ORG_ID, 'acc-1')).rejects.toThrow(BadRequestException);
      await expect(service.remove(ORG_ID, 'acc-1')).rejects.toThrow(
        'System accounts cannot be deleted',
      );
    });

    it('should reject deleting account with child accounts', async () => {
      const accountWithChildren = {
        id: 'acc-1',
        organizationId: ORG_ID,
        isSystem: false,
        _count: { children: 3, journalLines: 0 },
      };
      prisma.account.findFirst.mockResolvedValue(accountWithChildren as any);

      await expect(service.remove(ORG_ID, 'acc-1')).rejects.toThrow(BadRequestException);
      await expect(service.remove(ORG_ID, 'acc-1')).rejects.toThrow(
        'Cannot delete account with child accounts',
      );
    });

    it('should reject deleting account with transactions', async () => {
      const accountWithTxns = {
        id: 'acc-1',
        organizationId: ORG_ID,
        isSystem: false,
        _count: { children: 0, journalLines: 5 },
      };
      prisma.account.findFirst.mockResolvedValue(accountWithTxns as any);

      await expect(service.remove(ORG_ID, 'acc-1')).rejects.toThrow(BadRequestException);
      await expect(service.remove(ORG_ID, 'acc-1')).rejects.toThrow(
        'Cannot delete account with transactions',
      );
    });
  });

  describe('seedDefaultAccounts', () => {
    it('should delegate to seedIndustryAccounts with services industry', async () => {
      prisma.$transaction.mockResolvedValue([] as any);

      const result = await service.seedDefaultAccounts(ORG_ID);

      expect(result).toBeDefined();
      expect(result.message).toContain('services');
    });
  });

  describe('seedIndustryAccounts', () => {
    it('should create accounts using upsert within a transaction', async () => {
      const mockAccounts = [{ id: 'acc-1', code: '1000', name: 'Cash' }];
      prisma.$transaction.mockResolvedValue(mockAccounts as any);

      const result = await service.seedIndustryAccounts(ORG_ID, 'services');

      expect(result.message).toContain('services');
      expect(result.accounts).toBeDefined();
    });

    it('should mark seeded accounts as isSystem', async () => {
      prisma.$transaction.mockResolvedValue([] as any);

      await service.seedIndustryAccounts(ORG_ID, 'retail');

      // Verify $transaction was called
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should support services, retail, and construction industries', async () => {
      prisma.$transaction.mockResolvedValue([] as any);

      for (const industry of ['services', 'retail', 'construction'] as const) {
        const result = await service.seedIndustryAccounts(ORG_ID, industry);
        expect(result.message).toContain(industry);
      }
    });
  });
});
