import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BankTransactionType, BankAccountType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BankTransactionsService } from './bank-transactions.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { dec } from '../../../test/helpers/decimal.helpers';

const ORG_ID = 'org-test-001';
const OTHER_ORG_ID = 'org-test-002';
const BANK_ACCOUNT_ID = 'bank-test-001';
const FIXED_DATE = new Date('2024-06-15T00:00:00.000Z');

const mockBankAccount = {
  id: BANK_ACCOUNT_ID,
  organizationId: ORG_ID,
  name: 'Test Bank Account',
  accountNumber: '****1234',
  currency: 'USD',
  type: BankAccountType.BANK,
  isActive: true,
  deletedAt: null,
  systemBalance: new Decimal('10000.0000'),
  bankBalance: new Decimal('10000.0000'),
  linkedAccountId: 'acc-bank',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('BankTransactionsService', () => {
  let service: BankTransactionsService;
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new BankTransactionsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    const validDto = {
      bankAccountId: BANK_ACCOUNT_ID,
      date: FIXED_DATE.toISOString(),
      type: BankTransactionType.DEPOSIT,
      amount: '1000.0000',
      description: 'Test deposit',
      reference: 'REF-001',
      payee: 'Test Payee',
    };

    it('should create a bank transaction with correct Decimal amount and organizationId', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount);
      const mockTransaction = {
        id: 'tx-1',
        ...validDto,
        amount: dec('1000.0000'),
        date: FIXED_DATE,
        organizationId: ORG_ID,
      };
      prisma.bankTransaction.create.mockResolvedValue(mockTransaction as any);

      const result = await service.create(ORG_ID, validDto);

      expect(result).toBeDefined();
      expect(result.id).toBe('tx-1');
      expect(result.amount).toEqual(dec('1000.0000'));
      expect(result.organizationId).toBe(ORG_ID);
      expect(result.type).toBe(BankTransactionType.DEPOSIT);

      // Verify the create call includes organizationId
      const createCall = prisma.bankTransaction.create.mock.calls[0]?.[0];
      expect(createCall).toBeDefined();
      expect(createCall!.data.organizationId).toBe(ORG_ID);
      expect(createCall!.data.amount).toEqual(dec('1000.0000'));
    });

    it('should convert string and number amounts to Decimal correctly', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount);

      // Test with string amount
      await service.create(ORG_ID, { ...validDto, amount: '2500.5000' });
      const createCall1 = prisma.bankTransaction.create.mock.calls[0]?.[0];
      expect(createCall1).toBeDefined();
      expect(createCall1!.data.amount).toEqual(dec('2500.5000'));

      // Test with number amount
      await service.create(ORG_ID, { ...validDto, amount: 3000.25 });
      const createCall2 = prisma.bankTransaction.create.mock.calls[1]?.[0];
      expect(createCall2).toBeDefined();
      expect(createCall2!.data.amount).toEqual(dec('3000.2500'));
    });

    it('should create WITHDRAWAL transaction with negative amount logic handled by caller', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount);
      const withdrawalDto = {
        ...validDto,
        type: BankTransactionType.WITHDRAWAL,
        amount: '500.0000',
      };
      const mockTransaction = {
        id: 'tx-2',
        ...withdrawalDto,
        amount: dec('500.0000'),
        date: FIXED_DATE,
        organizationId: ORG_ID,
      };
      prisma.bankTransaction.create.mockResolvedValue(mockTransaction as any);

      const result = await service.create(ORG_ID, withdrawalDto);

      expect(result.type).toBe(BankTransactionType.WITHDRAWAL);
      expect(result.amount).toEqual(dec('500.0000'));
    });

    it('should reject when bank account belongs to another organization', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(service.create(ORG_ID, validDto)).rejects.toThrow(BadRequestException);
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow('Bank account not found');

      // Verify the query includes organizationId
      const findCall = prisma.bankAccount.findFirst.mock.calls[0]?.[0];
      expect(findCall).toBeDefined();
      expect(findCall!.where).toMatchObject({
        id: BANK_ACCOUNT_ID,
        organizationId: ORG_ID,
      });
      expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
    });

    it('should reject when bank account does not exist', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, { ...validDto, bankAccountId: 'non-existent' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('bulkImport', () => {
    const transactions = [
      {
        date: '2024-06-15',
        type: BankTransactionType.DEPOSIT,
        amount: '100.0000',
        description: 'Tx 1',
      },
      {
        date: '2024-06-16',
        type: BankTransactionType.WITHDRAWAL,
        amount: '50.0000',
        description: 'Tx 2',
      },
      {
        date: '2024-06-17',
        type: BankTransactionType.DEPOSIT,
        amount: '200.0000',
        description: 'Tx 3',
      },
    ];

    it('should import multiple transactions with correct Decimal amounts and organizationId', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount);
      prisma.bankTransaction.createMany.mockResolvedValue({ count: 3 });

      const result = await service.bulkImport(ORG_ID, BANK_ACCOUNT_ID, transactions);

      expect(result.imported).toBe(3);
      expect(prisma.bankTransaction.createMany).toHaveBeenCalledTimes(1);

      const createManyCall = prisma.bankTransaction.createMany.mock.calls[0]?.[0];
      expect(createManyCall).toBeDefined();
      const createManyData = createManyCall!.data as any[];
      expect(createManyData).toHaveLength(3);
      expect(createManyData[0]).toMatchObject({
        bankAccountId: BANK_ACCOUNT_ID,
        organizationId: ORG_ID,
        amount: dec('100.0000'),
        type: BankTransactionType.DEPOSIT,
      });
      expect(createManyData[1]).toMatchObject({
        amount: dec('50.0000'),
        type: BankTransactionType.WITHDRAWAL,
      });
      expect(createManyData[2]).toMatchObject({
        amount: dec('200.0000'),
        type: BankTransactionType.DEPOSIT,
      });
    });

    it('should convert all amounts to Decimal with 4 decimal places', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount);
      prisma.bankTransaction.createMany.mockResolvedValue({ count: 2 });

      const mixedAmounts = [
        { date: '2024-06-15', type: BankTransactionType.DEPOSIT, amount: '100.5' },
        { date: '2024-06-16', type: BankTransactionType.DEPOSIT, amount: 200 },
      ];

      await service.bulkImport(ORG_ID, BANK_ACCOUNT_ID, mixedAmounts);

      const createManyCall = prisma.bankTransaction.createMany.mock.calls[0]?.[0];
      expect(createManyCall).toBeDefined();
      const createManyData = createManyCall!.data as any[];
      expect(createManyData[0].amount).toEqual(dec('100.5000'));
      expect(createManyData[1].amount).toEqual(dec('200.0000'));
    });

    it('should reject when bank account belongs to another organization', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(null);

      await expect(service.bulkImport(ORG_ID, BANK_ACCOUNT_ID, transactions)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.bulkImport(ORG_ID, BANK_ACCOUNT_ID, transactions)).rejects.toThrow(
        'Bank account not found',
      );
      expect(prisma.bankTransaction.createMany).not.toHaveBeenCalled();
    });

    it('should return imported count of zero for empty array', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount);
      prisma.bankTransaction.createMany.mockResolvedValue({ count: 0 });

      const result = await service.bulkImport(ORG_ID, BANK_ACCOUNT_ID, []);

      expect(result.imported).toBe(0);
    });
  });

  describe('findAll', () => {
    const mockTransactions = [
      {
        id: 'tx-1',
        bankAccountId: BANK_ACCOUNT_ID,
        date: FIXED_DATE,
        type: BankTransactionType.DEPOSIT,
        amount: dec('1000.0000'),
        description: 'Test 1',
        organizationId: ORG_ID,
        bankAccount: { id: BANK_ACCOUNT_ID, name: 'Test Account' },
      },
      {
        id: 'tx-2',
        bankAccountId: BANK_ACCOUNT_ID,
        date: new Date('2024-06-16'),
        type: BankTransactionType.WITHDRAWAL,
        amount: dec('500.0000'),
        description: 'Test 2',
        organizationId: ORG_ID,
        bankAccount: { id: BANK_ACCOUNT_ID, name: 'Test Account' },
      },
    ];

    it('should return paginated transactions scoped to organizationId', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue(mockTransactions as any);
      prisma.bankTransaction.count.mockResolvedValue(2);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 50 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(50);

      const findManyCall = prisma.bankTransaction.findMany.mock.calls[0]?.[0] as any;
      expect(findManyCall).toBeDefined();
      expect(findManyCall.where.organizationId).toBe(ORG_ID);
      expect(findManyCall.take).toBe(50);
      expect(findManyCall.skip).toBe(0);
    });

    it('should apply filters correctly with organizationId always present', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([]);
      prisma.bankTransaction.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {
        page: 2,
        limit: 10,
        bankAccountId: BANK_ACCOUNT_ID,
        status: 'MATCHED',
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
        amountMin: '100',
        amountMax: '1000',
      });

      const findManyCall = prisma.bankTransaction.findMany.mock.calls[0]?.[0] as any;
      expect(findManyCall).toBeDefined();
      expect(findManyCall.where).toMatchObject({
        organizationId: ORG_ID,
        bankAccountId: BANK_ACCOUNT_ID,
        status: 'MATCHED',
        date: { gte: new Date('2024-01-01'), lte: new Date('2024-12-31') },
        amount: { gte: dec('100'), lte: dec('1000') },
      });
      expect(findManyCall.skip).toBe(10);
      expect(findManyCall.take).toBe(10);
    });

    it('should use default sortBy date desc when not specified', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([]);
      prisma.bankTransaction.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findManyCall = prisma.bankTransaction.findMany.mock.calls[0]?.[0] as any;
      expect(findManyCall).toBeDefined();
      expect(findManyCall.orderBy).toEqual({ date: 'desc' });
    });
  });

  describe('findAllCursor', () => {
    const mockTransactions = [
      {
        id: 'tx-1',
        bankAccountId: BANK_ACCOUNT_ID,
        date: FIXED_DATE,
        type: BankTransactionType.DEPOSIT,
        amount: dec('1000.0000'),
        organizationId: ORG_ID,
        bankAccount: { id: BANK_ACCOUNT_ID, name: 'Test Account' },
      },
    ];

    it('should return cursor-paginated transactions scoped to organizationId', async () => {
      // cursorPaginate fetches take+1 to determine hasMore
      // With take=1 and 2 items, hasMore=true and nextCursor=last item id
      const multipleTransactions = [
        mockTransactions[0],
        { ...mockTransactions[0], id: 'tx-2', description: 'Test 2' },
      ];
      prisma.bankTransaction.findMany.mockResolvedValue(multipleTransactions as any);
      prisma.bankTransaction.count.mockResolvedValue(2);

      const result = await service.findAllCursor(ORG_ID, { take: 1 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.nextCursor).toBe('tx-1'); // last item of first page
      expect(result.meta.hasMore).toBe(true);
      expect(result.meta.total).toBe(2);

      const findManyCall = prisma.bankTransaction.findMany.mock.calls[0]?.[0] as any;
      expect(findManyCall).toBeDefined();
      expect(findManyCall.where.organizationId).toBe(ORG_ID);
      expect(findManyCall.take).toBe(2); // cursorPaginate takes +1
    });

    it('should return null nextCursor when no more pages', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([mockTransactions[0]] as any);
      prisma.bankTransaction.count.mockResolvedValue(1);

      const result = await service.findAllCursor(ORG_ID, { take: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.nextCursor).toBeNull();
      expect(result.meta.hasMore).toBe(false);
    });

    it('should apply all filters with organizationId always present', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([]);
      prisma.bankTransaction.count.mockResolvedValue(0);

      await service.findAllCursor(ORG_ID, {
        cursor: 'tx-1',
        take: 20,
        bankAccountId: BANK_ACCOUNT_ID,
        status: 'PENDING',
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
        amountMin: '50',
        amountMax: '5000',
        sortBy: 'amount',
        sortOrder: 'asc',
      });

      const findManyCall = prisma.bankTransaction.findMany.mock.calls[0]?.[0] as any;
      expect(findManyCall).toBeDefined();
      expect(findManyCall.where).toMatchObject({
        organizationId: ORG_ID,
        bankAccountId: BANK_ACCOUNT_ID,
        status: 'PENDING',
        date: { gte: new Date('2024-01-01'), lte: new Date('2024-12-31') },
        amount: { gte: dec('50'), lte: dec('5000') },
      });
      expect(findManyCall.orderBy).toEqual({ amount: 'asc' });
      expect(findManyCall.cursor).toEqual({ id: 'tx-1' });
    });
  });

  describe('findOne', () => {
    const mockTransaction = {
      id: 'tx-1',
      bankAccountId: BANK_ACCOUNT_ID,
      date: FIXED_DATE,
      type: BankTransactionType.DEPOSIT,
      amount: dec('1000.0000'),
      description: 'Test transaction',
      organizationId: ORG_ID,
      bankAccount: { id: BANK_ACCOUNT_ID, name: 'Test Account' },
    };

    it('should return a transaction scoped to organizationId', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(mockTransaction as any);

      const result = await service.findOne(ORG_ID, 'tx-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('tx-1');
      expect(result.amount).toEqual(dec('1000.0000'));

      const findCall = prisma.bankTransaction.findFirst.mock.calls[0]?.[0] as any;
      expect(findCall).toBeDefined();
      expect(findCall.where).toMatchObject({
        id: 'tx-1',
        organizationId: ORG_ID,
      });
    });

    it('should throw NotFoundException when transaction does not exist', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'non-existent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'non-existent')).rejects.toThrow(
        'Transaction not found',
      );
    });

    it('should not return transaction from another organization', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'other-org-tx');
      } catch {
        // Expected
      }

      const findCall = prisma.bankTransaction.findFirst.mock.calls[0]?.[0] as any;
      expect(findCall).toBeDefined();
      expect(findCall.where).toMatchObject({
        id: 'other-org-tx',
        organizationId: ORG_ID,
      });
    });
  });

  describe('tenant isolation', () => {
    it('should never read or write transactions for another organization', async () => {
      // All queries should include organizationId
      prisma.bankTransaction.findMany.mockResolvedValue([]);
      prisma.bankTransaction.count.mockResolvedValue(0);
      prisma.bankTransaction.findFirst.mockResolvedValue(null);

      await service.findAll(ORG_ID, {});
      await service.findAllCursor(ORG_ID, {});

      // findOne throws NotFoundException for non-existent, but we can still verify the query
      try {
        await service.findOne(ORG_ID, 'tx-1');
      } catch {
        // Expected NotFoundException
      }

      // Verify all calls include organizationId
      const allCalls = [
        ...prisma.bankTransaction.findMany.mock.calls,
        ...prisma.bankTransaction.findFirst.mock.calls,
      ];

      for (const call of allCalls) {
        const callArgs = call[0] as any;
        const where = callArgs?.where;
        expect(where).toBeDefined();
        expect(where!.organizationId).toBe(ORG_ID);
      }
    });

    it('should never create transactions for another organization', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount);
      prisma.bankTransaction.create.mockResolvedValue({} as any);

      await service.create(ORG_ID, {
        bankAccountId: BANK_ACCOUNT_ID,
        date: FIXED_DATE.toISOString(),
        type: BankTransactionType.DEPOSIT,
        amount: '100.0000',
      });

      const createCall = prisma.bankTransaction.create.mock.calls[0]?.[0] as any;
      expect(createCall).toBeDefined();
      expect(createCall.data.organizationId).toBe(ORG_ID);
      expect(createCall.data.organizationId).not.toBe(OTHER_ORG_ID);
    });
  });

  describe('Decimal precision', () => {
    it('should preserve exact Decimal precision for all amounts', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount);

      const testAmounts = [
        '0.0001',
        '0.0010',
        '0.0100',
        '0.1000',
        '1.0000',
        '10.0000',
        '100.0000',
        '1000.0000',
        '10000.0000',
        '100000.0000',
        '999999999.9999',
      ];

      for (const amount of testAmounts) {
        prisma.bankTransaction.create.mockResolvedValue({
          id: `tx-${amount}`,
          amount: dec(amount),
          organizationId: ORG_ID,
        } as any);

        await service.create(ORG_ID, {
          bankAccountId: BANK_ACCOUNT_ID,
          date: FIXED_DATE.toISOString(),
          type: BankTransactionType.DEPOSIT,
          amount,
        });

        const createCall = prisma.bankTransaction.create.mock.calls[
          prisma.bankTransaction.create.mock.calls.length - 1
        ]?.[0] as any;
        expect(createCall).toBeDefined();
        expect(createCall.data.amount).toEqual(dec(amount));
      }
    });
  });
});
