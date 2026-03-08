import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { BankTransactionType } from '@prisma/client';
import { BankTransactionsService } from './bank-transactions.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { expectDecimalEqual } from '../../../test/helpers/decimal.helpers';

describe('BankTransactionsService', () => {
  let service: BankTransactionsService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  const mockTransaction = {
    id: 'txn-1',
    bankAccountId: 'bank-1',
    date: new Date('2024-06-15'),
    type: BankTransactionType.DEPOSIT,
    amount: new Decimal('1500.0000'),
    description: 'Client payment',
    reference: 'REF-001',
    payee: 'Acme Corp',
    status: 'PENDING',
    organizationId: ORG_ID,
    createdAt: new Date('2024-06-15'),
    updatedAt: new Date('2024-06-15'),
    bankAccount: { id: 'bank-1', name: 'Main Account' },
  };

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [BankTransactionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<BankTransactionsService>(BankTransactionsService);
  });

  describe('create', () => {
    const createDto = {
      bankAccountId: 'bank-1',
      date: '2024-06-15T00:00:00.000Z',
      type: BankTransactionType.DEPOSIT,
      amount: '1500.0000',
      description: 'Client payment',
      reference: 'REF-001',
      payee: 'Acme Corp',
    };

    it('should create a bank transaction successfully', async () => {
      prisma.bankTransaction.create.mockResolvedValue(mockTransaction as any);

      const result = await service.create(ORG_ID, createDto);

      expect(result).toBeDefined();
      expect(result.id).toBe('txn-1');
    });

    it('should include organizationId in the created transaction', async () => {
      prisma.bankTransaction.create.mockResolvedValue(mockTransaction as any);

      await service.create(ORG_ID, createDto);

      const createCall = prisma.bankTransaction.create.mock.calls[0]?.[0];
      expect(createCall?.data.organizationId).toBe(ORG_ID);
    });

    it('should use Decimal for the amount', async () => {
      prisma.bankTransaction.create.mockResolvedValue(mockTransaction as any);

      await service.create(ORG_ID, createDto);

      const createCall = prisma.bankTransaction.create.mock.calls[0]?.[0];
      expect(createCall?.data.amount).toBeInstanceOf(Decimal);
      expectDecimalEqual(createCall?.data.amount as Decimal, '1500.0000');
    });

    it('should convert date string to Date object', async () => {
      prisma.bankTransaction.create.mockResolvedValue(mockTransaction as any);

      await service.create(ORG_ID, createDto);

      const createCall = prisma.bankTransaction.create.mock.calls[0]?.[0];
      expect(createCall?.data.date).toBeInstanceOf(Date);
    });

    it('should pass optional fields correctly', async () => {
      prisma.bankTransaction.create.mockResolvedValue(mockTransaction as any);

      await service.create(ORG_ID, createDto);

      const createCall = prisma.bankTransaction.create.mock.calls[0]?.[0];
      expect(createCall?.data.description).toBe('Client payment');
      expect(createCall?.data.reference).toBe('REF-001');
      expect(createCall?.data.payee).toBe('Acme Corp');
    });

    it('should support both DEPOSIT and WITHDRAWAL types', async () => {
      prisma.bankTransaction.create.mockResolvedValue(mockTransaction as any);

      const withdrawalDto = {
        ...createDto,
        type: BankTransactionType.WITHDRAWAL,
        amount: '250.00',
      };
      await service.create(ORG_ID, withdrawalDto);

      const createCall = prisma.bankTransaction.create.mock.calls[0]?.[0];
      expect(createCall?.data.type).toBe(BankTransactionType.WITHDRAWAL);
    });
  });

  describe('bulkImport', () => {
    const bulkTransactions = [
      {
        date: '2024-06-01T00:00:00.000Z',
        type: BankTransactionType.DEPOSIT,
        amount: '1000.00',
        description: 'Payment 1',
        reference: 'REF-001',
      },
      {
        date: '2024-06-02T00:00:00.000Z',
        type: BankTransactionType.WITHDRAWAL,
        amount: '250.00',
        description: 'Expense 1',
        reference: 'REF-002',
      },
      {
        date: '2024-06-03T00:00:00.000Z',
        type: BankTransactionType.DEPOSIT,
        amount: '2000.00',
        description: 'Payment 2',
      },
    ];

    it('should bulk import transactions and return count', async () => {
      prisma.bankTransaction.createMany.mockResolvedValue({ count: 3 } as any);

      const result = await service.bulkImport(ORG_ID, 'bank-1', bulkTransactions);

      expect(result.imported).toBe(3);
    });

    it('should include organizationId for all imported transactions', async () => {
      prisma.bankTransaction.createMany.mockResolvedValue({ count: 3 } as any);

      await service.bulkImport(ORG_ID, 'bank-1', bulkTransactions);

      const createManyCall = prisma.bankTransaction.createMany.mock.calls[0]?.[0];
      const data = createManyCall?.data as Array<Record<string, unknown>>;
      for (const txn of data) {
        expect(txn.organizationId).toBe(ORG_ID);
      }
    });

    it('should set the bankAccountId for all transactions', async () => {
      prisma.bankTransaction.createMany.mockResolvedValue({ count: 3 } as any);

      await service.bulkImport(ORG_ID, 'bank-1', bulkTransactions);

      const createManyCall = prisma.bankTransaction.createMany.mock.calls[0]?.[0];
      const data = createManyCall?.data as Array<Record<string, unknown>>;
      for (const txn of data) {
        expect(txn.bankAccountId).toBe('bank-1');
      }
    });

    it('should use Decimal for all amounts', async () => {
      prisma.bankTransaction.createMany.mockResolvedValue({ count: 3 } as any);

      await service.bulkImport(ORG_ID, 'bank-1', bulkTransactions);

      const createManyCall = prisma.bankTransaction.createMany.mock.calls[0]?.[0];
      const data = createManyCall?.data as Array<Record<string, unknown>>;
      for (const txn of data) {
        expect(txn.amount).toBeInstanceOf(Decimal);
      }
    });

    it('should convert date strings to Date objects', async () => {
      prisma.bankTransaction.createMany.mockResolvedValue({ count: 3 } as any);

      await service.bulkImport(ORG_ID, 'bank-1', bulkTransactions);

      const createManyCall = prisma.bankTransaction.createMany.mock.calls[0]?.[0];
      const data = createManyCall?.data as Array<Record<string, unknown>>;
      for (const txn of data) {
        expect(txn.date).toBeInstanceOf(Date);
      }
    });
  });

  describe('findAll', () => {
    it('should return paginated transactions', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([mockTransaction] as any);
      prisma.bankTransaction.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should filter by organizationId', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([]);
      prisma.bankTransaction.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.bankTransaction.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
    });

    it('should filter by bankAccountId when provided', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([]);
      prisma.bankTransaction.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { bankAccountId: 'bank-1' });

      const findCall = prisma.bankTransaction.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.bankAccountId).toBe('bank-1');
    });

    it('should filter by reconciliation status when provided', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([]);
      prisma.bankTransaction.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { status: 'PENDING' });

      const findCall = prisma.bankTransaction.findMany.mock.calls[0]![0]!;
      expect(findCall.where!.status).toBe('PENDING');
    });

    it('should use default sort by date descending', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([]);
      prisma.bankTransaction.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.bankTransaction.findMany.mock.calls[0]![0]!;
      expect(findCall.orderBy).toEqual({ date: 'desc' });
    });

    it('should calculate pagination correctly', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([]);
      prisma.bankTransaction.count.mockResolvedValue(100);

      const result = await service.findAll(ORG_ID, { page: 2, limit: 25 });

      expect(result.meta.totalPages).toBe(4);
      expect(result.meta.page).toBe(2);

      const findCall = prisma.bankTransaction.findMany.mock.calls[0]![0]!;
      expect(findCall.skip).toBe(25); // (2-1) * 25
      expect(findCall.take).toBe(25);
    });

    it('should include bank account details in results', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([]);
      prisma.bankTransaction.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.bankTransaction.findMany.mock.calls[0]![0]!;
      expect(findCall.include).toEqual(
        expect.objectContaining({
          bankAccount: { select: { id: true, name: true } },
        }),
      );
    });

    it('should not include bankAccountId filter when not provided', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([]);
      prisma.bankTransaction.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findCall = prisma.bankTransaction.findMany.mock.calls[0]![0]!;
      expect(findCall.where).not.toHaveProperty('bankAccountId');
    });
  });

  describe('findOne', () => {
    it('should return a transaction by id', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(mockTransaction as any);

      const result = await service.findOne(ORG_ID, 'txn-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('txn-1');
    });

    it('should throw NotFoundException when transaction does not exist', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow('Transaction not found');
    });

    it('should query with organizationId', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'txn-1');
      } catch {
        // Expected NotFoundException
      }

      const findCall = prisma.bankTransaction.findFirst.mock.calls[0]![0]!;
      expect(findCall.where).toEqual(
        expect.objectContaining({
          id: 'txn-1',
          organizationId: ORG_ID,
        }),
      );
    });

    it('should include bank account in the result', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(mockTransaction as any);

      await service.findOne(ORG_ID, 'txn-1');

      const findCall = prisma.bankTransaction.findFirst.mock.calls[0]![0]!;
      expect(findCall.include).toEqual(expect.objectContaining({ bankAccount: true }));
    });
  });
});
