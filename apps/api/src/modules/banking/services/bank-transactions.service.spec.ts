import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BankTransactionType } from '@prisma/client';
import { BankTransactionsService } from './bank-transactions.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { dec } from '../../../test/helpers/decimal.helpers';

const ORG_ID = 'org-test-001';
const OTHER_ORG_ID = 'org-test-002';
const BANK_ACCOUNT_ID = 'bank-test-001';
const FIXED_DATE = new Date('2024-06-15T00:00:00.000Z');

const mockBankAccount = { id: BANK_ACCOUNT_ID, organizationId: ORG_ID };
const mockTx = {
  id: 'tx-1',
  bankAccountId: BANK_ACCOUNT_ID,
  date: FIXED_DATE,
  type: BankTransactionType.DEPOSIT,
  amount: dec('1000.0000'),
  organizationId: ORG_ID,
  bankAccount: { id: BANK_ACCOUNT_ID, name: 'Operating Account' },
};

describe('BankTransactionsService', () => {
  let service: BankTransactionsService;
  let prisma: MockPrismaClient;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_DATE);
    prisma = createMockPrisma();
    service = new BankTransactionsService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('create', () => {
    const validDto = {
      bankAccountId: BANK_ACCOUNT_ID,
      date: FIXED_DATE.toISOString(),
      type: BankTransactionType.DEPOSIT,
      amount: '1250.5000',
    };

    it('creates a transaction with exact Decimal amount, date and organizationId, writing no journals', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount as any);
      prisma.bankTransaction.create.mockResolvedValue({
        id: 'tx-1',
        ...validDto,
        amount: dec('1250.5000'),
        date: FIXED_DATE,
        organizationId: ORG_ID,
      } as any);

      const result = await service.create(ORG_ID, validDto);

      expect(result.id).toBe('tx-1');
      expect(result.amount).toEqual(dec('1250.5000'));
      expect(result.organizationId).toBe(ORG_ID);

      const createCall = prisma.bankTransaction.create.mock.calls[0]?.[0];
      expect(createCall?.data).toMatchObject({
        bankAccountId: BANK_ACCOUNT_ID,
        organizationId: ORG_ID,
        amount: dec('1250.5000'),
        date: FIXED_DATE,
      });

      // BankTransactionsService handles statement records only; ledger journal writes are 0
      expect(prisma.journal.create).not.toHaveBeenCalled();
      expect(prisma.journalLine.create).not.toHaveBeenCalled();
    });

    it('rejects when bank account belongs to another organization', async () => {
      const otherOrgAccount = { ...mockBankAccount, organizationId: OTHER_ORG_ID };
      (prisma.bankAccount.findFirst as any).mockImplementation(async ({ where }: any) => {
        return where?.organizationId === otherOrgAccount.organizationId ? otherOrgAccount : null;
      });

      await expect(service.create(ORG_ID, validDto)).rejects.toThrow(BadRequestException);

      const findCall = prisma.bankAccount.findFirst.mock.calls[0]?.[0];
      expect(findCall?.where).toMatchObject({ id: BANK_ACCOUNT_ID, organizationId: ORG_ID });
      expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('bulkImport', () => {
    const transactions = [
      { date: '2024-06-15', type: BankTransactionType.DEPOSIT, amount: '1500.2500' },
      { date: '2024-06-16', type: BankTransactionType.WITHDRAWAL, amount: '350.7500' },
    ];

    it('imports multiple transactions with Decimal amounts and organizationId', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount as any);
      prisma.bankTransaction.createMany.mockResolvedValue({ count: 2 });

      const result = await service.bulkImport(ORG_ID, BANK_ACCOUNT_ID, transactions);

      expect(result.imported).toBe(2);
      const createManyCall = prisma.bankTransaction.createMany.mock.calls[0]?.[0];
      const data = createManyCall?.data as any[];
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({
        bankAccountId: BANK_ACCOUNT_ID,
        organizationId: ORG_ID,
        amount: dec('1500.2500'),
        type: BankTransactionType.DEPOSIT,
      });
      expect(data[1]).toMatchObject({
        bankAccountId: BANK_ACCOUNT_ID,
        organizationId: ORG_ID,
        amount: dec('350.7500'),
        type: BankTransactionType.WITHDRAWAL,
      });
    });

    it('rejects when bank account belongs to another organization', async () => {
      const otherOrgAccount = { ...mockBankAccount, organizationId: OTHER_ORG_ID };
      (prisma.bankAccount.findFirst as any).mockImplementation(async ({ where }: any) => {
        return where?.organizationId === otherOrgAccount.organizationId ? otherOrgAccount : null;
      });

      await expect(service.bulkImport(ORG_ID, BANK_ACCOUNT_ID, transactions)).rejects.toThrow(
        BadRequestException,
      );

      const findCall = prisma.bankAccount.findFirst.mock.calls[0]?.[0];
      expect(findCall?.where).toMatchObject({ id: BANK_ACCOUNT_ID, organizationId: ORG_ID });
      expect(prisma.bankTransaction.createMany).not.toHaveBeenCalled();
    });

    it('returns imported count of zero for empty array', async () => {
      prisma.bankAccount.findFirst.mockResolvedValue(mockBankAccount as any);
      prisma.bankTransaction.createMany.mockResolvedValue({ count: 0 });

      const result = await service.bulkImport(ORG_ID, BANK_ACCOUNT_ID, []);
      expect(result.imported).toBe(0);
    });
  });

  describe('findAll', () => {
    it('returns paginated transactions scoped to organizationId with default sort', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([mockTx] as any);
      prisma.bankTransaction.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, { page: 1, limit: 50 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, limit: 50, total: 1, totalPages: 1 });

      const findManyCall = prisma.bankTransaction.findMany.mock.calls[0]?.[0];
      expect(findManyCall?.where).toMatchObject({ organizationId: ORG_ID });
      expect(findManyCall?.orderBy).toEqual({ date: 'desc' });
      expect(findManyCall?.skip).toBe(0);
      expect(findManyCall?.take).toBe(50);
    });

    it('applies query filters with organizationId strictly enforced', async () => {
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

      const findManyCall = prisma.bankTransaction.findMany.mock.calls[0]?.[0];
      expect(findManyCall?.where).toMatchObject({
        organizationId: ORG_ID,
        bankAccountId: BANK_ACCOUNT_ID,
        status: 'MATCHED',
        date: { gte: new Date('2024-01-01'), lte: new Date('2024-12-31') },
        amount: { gte: dec('100'), lte: dec('1000') },
      });
      expect(findManyCall?.skip).toBe(10);
      expect(findManyCall?.take).toBe(10);
    });
  });

  describe('findAllCursor', () => {
    it('returns cursor-paginated transactions scoped to organizationId', async () => {
      // cursorPaginate queries take + 1 to determine hasMore
      prisma.bankTransaction.findMany.mockResolvedValue([mockTx, { ...mockTx, id: 'tx-2' }] as any);
      prisma.bankTransaction.count.mockResolvedValue(2);

      const result = await service.findAllCursor(ORG_ID, { take: 1 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.nextCursor).toBe('tx-1');
      expect(result.meta.hasMore).toBe(true);

      const findManyCall = prisma.bankTransaction.findMany.mock.calls[0]?.[0];
      expect(findManyCall?.where).toMatchObject({ organizationId: ORG_ID });
    });

    it('returns null nextCursor when on the last page', async () => {
      prisma.bankTransaction.findMany.mockResolvedValue([mockTx] as any);
      prisma.bankTransaction.count.mockResolvedValue(1);

      const result = await service.findAllCursor(ORG_ID, { take: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.nextCursor).toBeNull();
      expect(result.meta.hasMore).toBe(false);
    });
  });

  describe('findOne', () => {
    it('returns transaction scoped to organizationId', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(mockTx as any);

      const result = await service.findOne(ORG_ID, 'tx-1');

      expect(result.id).toBe('tx-1');
      expect(result.amount).toEqual(dec('1000.0000'));

      const findCall = prisma.bankTransaction.findFirst.mock.calls[0]?.[0];
      expect(findCall?.where).toMatchObject({ id: 'tx-1', organizationId: ORG_ID });
    });

    it('throws NotFoundException when transaction does not exist', async () => {
      prisma.bankTransaction.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'missing-tx')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when transaction belongs to another organization', async () => {
      const otherOrgTx = { ...mockTx, id: 'tx-other', organizationId: OTHER_ORG_ID };
      (prisma.bankTransaction.findFirst as any).mockImplementation(async ({ where }: any) => {
        return where?.organizationId === otherOrgTx.organizationId ? otherOrgTx : null;
      });

      await expect(service.findOne(ORG_ID, 'tx-other')).rejects.toThrow(NotFoundException);

      const findCall = prisma.bankTransaction.findFirst.mock.calls[0]?.[0];
      expect(findCall?.where).toMatchObject({ id: 'tx-other', organizationId: ORG_ID });
    });
  });
});
