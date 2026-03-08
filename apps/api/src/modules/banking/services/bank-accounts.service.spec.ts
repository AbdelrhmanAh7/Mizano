import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { BankAccountsService } from './bank-accounts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockBankAccount } from '../../../test/helpers/test-utils';
import { expectDecimalEqual } from '../../../test/helpers/decimal.helpers';

describe('BankAccountsService', () => {
  let service: BankAccountsService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  const mockBankAccount = {
    ...createMockBankAccount(),
    linkedAccountId: 'acc-bank-1',
    linkedAccount: { id: 'acc-bank-1', code: '1010', name: 'Bank Account' },
    isActive: true,
    deletedAt: null,
    systemBalance: new Decimal('10000.0000'),
    bankBalance: new Decimal('10000.0000'),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [BankAccountsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<BankAccountsService>(BankAccountsService);
  });

  describe('create', () => {
    const createDto = {
      name: 'Main Business Account',
      accountNumber: '****1234',
      currency: 'USD',
      type: 'BANK' as const,
      openingBalance: '5000.0000',
      linkedAccountId: 'acc-bank-1',
    };

    it('should create a bank account successfully', async () => {
      prisma.bankAccount.create.mockResolvedValue(mockBankAccount as any);

      const result = await service.create(ORG_ID, createDto as any);

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Bank Account');
    });

    it('should include organizationId in the created bank account', async () => {
      prisma.bankAccount.create.mockResolvedValue(mockBankAccount as any);

      await service.create(ORG_ID, createDto as any);

      const createCall = prisma.bankAccount.create.mock.calls[0]?.[0];
      expect(createCall?.data.organizationId).toBe(ORG_ID);
    });

    it('should set systemBalance and bankBalance from openingBalance', async () => {
      prisma.bankAccount.create.mockResolvedValue(mockBankAccount as any);

      await service.create(ORG_ID, createDto as any);

      const createCall = prisma.bankAccount.create.mock.calls[0]?.[0];
      const systemBalance = createCall?.data.systemBalance as Decimal;
      const bankBalance = createCall?.data.bankBalance as Decimal;
      expectDecimalEqual(systemBalance, '5000.0000');
      expectDecimalEqual(bankBalance, '5000.0000');
    });

    it('should default openingBalance to 0 when not provided', async () => {
      const dtoNoBalance = {
        name: 'Account',
        accountNumber: '****5678',
        type: 'BANK' as const,
        linkedAccountId: 'acc-1',
      };
      prisma.bankAccount.create.mockResolvedValue(mockBankAccount as any);

      await service.create(ORG_ID, dtoNoBalance as any);

      const createCall = prisma.bankAccount.create.mock.calls[0]?.[0];
      const systemBalance = createCall?.data.systemBalance as Decimal;
      expectDecimalEqual(systemBalance, '0');
    });

    it('should default currency to USD when not provided', async () => {
      const dtoNoCurrency = {
        name: 'Account',
        accountNumber: '****5678',
        type: 'BANK' as const,
        linkedAccountId: 'acc-1',
      };
      prisma.bankAccount.create.mockResolvedValue(mockBankAccount as any);

      await service.create(ORG_ID, dtoNoCurrency as any);

      const createCall = prisma.bankAccount.create.mock.calls[0]?.[0];
      expect(createCall?.data.currency).toBe('USD');
    });

    it('should use Decimal for monetary values, not floating point', async () => {
      prisma.bankAccount.create.mockResolvedValue(mockBankAccount as any);

      await service.create(ORG_ID, createDto as any);

      const createCall = prisma.bankAccount.create.mock.calls[0]?.[0];
      expect(createCall?.data.systemBalance).toBeInstanceOf(Decimal);
      expect(createCall?.data.bankBalance).toBeInstanceOf(Decimal);
    });
  });

  describe('findAll', () => {
    it('should return all active bank accounts for the organization', async () => {
      prisma.bankAccount.findMany.mockResolvedValue([mockBankAccount] as any);

      const result = await service.findAll(ORG_ID);

      expect(result).toHaveLength(1);
    });

    it('should filter by organizationId, isActive, and deletedAt: null', async () => {
      prisma.bankAccount.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      const findCall = prisma.bankAccount.findMany.mock.calls[0]![0]!;
      expect(findCall.where).toEqual(
        expect.objectContaining({
          organizationId: ORG_ID,
          isActive: true,
          deletedAt: null,
        }),
      );
    });

    it('should include linked account details', async () => {
      prisma.bankAccount.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      const findCall = prisma.bankAccount.findMany.mock.calls[0]![0]!;
      expect(findCall.include).toEqual(
        expect.objectContaining({
          linkedAccount: expect.objectContaining({
            select: { id: true, code: true, name: true },
          }),
        }),
      );
    });

    it('should order by name ascending', async () => {
      prisma.bankAccount.findMany.mockResolvedValue([]);

      await service.findAll(ORG_ID);

      const findCall = prisma.bankAccount.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ name: 'asc' });
    });
  });

  describe('findOne', () => {
    it('should return a bank account by id', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount as any);

      const result = await service.findOne(ORG_ID, 'bank-test-001');

      expect(result).toBeDefined();
      expect(result.id).toBe('bank-test-001');
    });

    it('should throw NotFoundException when bank account does not exist', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(
        'Bank account not found',
      );
    });

    it('should query with organizationId and deletedAt: null', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'bank-1');
      } catch {
        // Expected NotFoundException
      }

      const findCall = prisma.bankAccount.findFirst.mock.calls[0]![0]!;
      expect(findCall.where).toEqual(
        expect.objectContaining({
          id: 'bank-1',
          organizationId: ORG_ID,
          deletedAt: null,
        }),
      );
    });

    it('should include linked account in the result', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount as any);

      await service.findOne(ORG_ID, 'bank-test-001');

      const findCall = prisma.bankAccount.findFirst.mock.calls[0]![0]!;
      expect(findCall.include).toEqual(expect.objectContaining({ linkedAccount: true }));
    });
  });

  describe('update', () => {
    it('should update a bank account successfully', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount as any);
      prisma.bankAccount.update.mockResolvedValue({
        ...mockBankAccount,
        name: 'Updated Account',
      } as any);

      const result = await service.update(ORG_ID, 'bank-test-001', {
        name: 'Updated Account',
      } as any);

      expect(result.name).toBe('Updated Account');
    });

    it('should throw NotFoundException when account does not exist', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(service.update(ORG_ID, 'nonexistent', { name: 'test' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should verify account exists before updating (via findOne)', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount as any);
      prisma.bankAccount.update.mockResolvedValue(mockBankAccount as any);

      await service.update(ORG_ID, 'bank-test-001', { name: 'test' } as any);

      expect(prisma.bankAccount.findFirst).toHaveBeenCalled();
    });
  });

  describe('remove (soft delete)', () => {
    it('should soft-delete a bank account by setting deletedAt', async () => {
      const accountNoTxns = {
        ...mockBankAccount,
        _count: { transactions: 0 },
      };
      prisma.bankAccount.findFirst.mockResolvedValue(accountNoTxns as any);
      prisma.bankAccount.update.mockResolvedValue({
        ...mockBankAccount,
        deletedAt: new Date(),
      } as any);

      const result = await service.remove(ORG_ID, 'bank-test-001');

      expect(result.message).toBe('Bank account deleted');
      expect(prisma.bankAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'bank-test-001' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it('should NOT hard-delete the record', async () => {
      const accountNoTxns = {
        ...mockBankAccount,
        _count: { transactions: 0 },
      };
      prisma.bankAccount.findFirst.mockResolvedValue(accountNoTxns as any);
      prisma.bankAccount.update.mockResolvedValue({} as any);

      await service.remove(ORG_ID, 'bank-test-001');

      expect(prisma.bankAccount.delete).not.toHaveBeenCalled();
      expect(prisma.bankAccount.deleteMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent bank account', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(service.remove(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should reject deletion of account with existing transactions', async () => {
      const accountWithTxns = {
        ...mockBankAccount,
        _count: { transactions: 5 },
      };
      prisma.bankAccount.findFirst.mockResolvedValue(accountWithTxns as any);

      await expect(service.remove(ORG_ID, 'bank-test-001')).rejects.toThrow(BadRequestException);
      await expect(service.remove(ORG_ID, 'bank-test-001')).rejects.toThrow(
        'Account has transactions',
      );
    });

    it('should check transaction count scoped to the bank account', async () => {
      const accountNoTxns = {
        ...mockBankAccount,
        _count: { transactions: 0 },
      };
      prisma.bankAccount.findFirst.mockResolvedValue(accountNoTxns as any);
      prisma.bankAccount.update.mockResolvedValue({} as any);

      await service.remove(ORG_ID, 'bank-test-001');

      const findCall = prisma.bankAccount.findFirst.mock.calls[0]![0]!;
      expect(findCall.include).toEqual(
        expect.objectContaining({
          _count: { select: { transactions: true } },
        }),
      );
    });
  });

  describe('updateBalance', () => {
    it('should add to the system balance', async () => {
      const account = {
        id: 'bank-1',
        systemBalance: new Decimal('1000.0000'),
      };
      prisma.bankAccount.findUnique.mockResolvedValue(account as any);
      prisma.bankAccount.update.mockResolvedValue({} as any);

      await service.updateBalance('bank-1', 500, 'add');

      const updateCall = prisma.bankAccount.update.mock.calls[0]?.[0];
      const newBalance = updateCall?.data?.systemBalance as Decimal;
      expectDecimalEqual(newBalance, '1500');
    });

    it('should subtract from the system balance', async () => {
      const account = {
        id: 'bank-1',
        systemBalance: new Decimal('1000.0000'),
      };
      prisma.bankAccount.findUnique.mockResolvedValue(account as any);
      prisma.bankAccount.update.mockResolvedValue({} as any);

      await service.updateBalance('bank-1', 300, 'subtract');

      const updateCall = prisma.bankAccount.update.mock.calls[0]?.[0];
      const newBalance = updateCall?.data?.systemBalance as Decimal;
      expectDecimalEqual(newBalance, '700');
    });

    it('should throw NotFoundException when bank account does not exist', async () => {
      prisma.bankAccount.findUnique.mockResolvedValue(null);

      await expect(service.updateBalance('nonexistent', 100, 'add')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should use Decimal for the updated balance value', async () => {
      const account = {
        id: 'bank-1',
        systemBalance: new Decimal('1000.0000'),
      };
      prisma.bankAccount.findUnique.mockResolvedValue(account as any);
      prisma.bankAccount.update.mockResolvedValue({} as any);

      await service.updateBalance('bank-1', 250, 'add');

      const updateCall = prisma.bankAccount.update.mock.calls[0]?.[0];
      expect(updateCall?.data?.systemBalance).toBeInstanceOf(Decimal);
    });

    it('should allow balance to go negative on subtract', async () => {
      const account = {
        id: 'bank-1',
        systemBalance: new Decimal('100.0000'),
      };
      prisma.bankAccount.findUnique.mockResolvedValue(account as any);
      prisma.bankAccount.update.mockResolvedValue({} as any);

      await service.updateBalance('bank-1', 500, 'subtract');

      const updateCall = prisma.bankAccount.update.mock.calls[0]?.[0];
      const newBalance = updateCall?.data?.systemBalance as Decimal;
      expectDecimalEqual(newBalance, '-400');
    });
  });
});
