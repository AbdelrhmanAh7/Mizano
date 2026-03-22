import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AccountingReportsService } from './accounting-reports.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { Decimal } from '@prisma/client/runtime/library';

describe('AccountingReportsService', () => {
  let service: AccountingReportsService;
  let prisma: MockPrismaClient;

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountingReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AccountingReportsService>(AccountingReportsService);
  });

  describe('getTrialBalance', () => {
    it('should return accounts array, totals object, and asOfDate', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'acc-1',
          code: '1000',
          name: 'Cash',
          type: 'ASSET',
          openingBalance: new Decimal('0'),
          isActive: true,
          deletedAt: null,
          organizationId: ORG_ID,
        },
      ] as any);

      prisma.journalLine.aggregate.mockResolvedValue({
        _sum: { debit: new Decimal('1000'), credit: new Decimal('200') },
      } as any);

      const result = await service.getTrialBalance(ORG_ID, '2024-12-31');

      expect(result).toHaveProperty('accounts');
      expect(result).toHaveProperty('totals');
      expect(result).toHaveProperty('asOfDate');
      expect(Array.isArray(result.accounts)).toBe(true);
      expect(result.accounts[0]).toHaveProperty('id');
      expect(result.accounts[0]).toHaveProperty('code');
      expect(result.accounts[0]).toHaveProperty('name');
      expect(result.accounts[0]).toHaveProperty('type');
      expect(result.accounts[0]).toHaveProperty('debit');
      expect(result.accounts[0]).toHaveProperty('credit');
    });

    it('should filter out zero-balance accounts', async () => {
      prisma.account.findMany.mockResolvedValue([
        {
          id: 'acc-1',
          code: '1000',
          name: 'Cash',
          type: 'ASSET',
          openingBalance: new Decimal('0'),
        },
        {
          id: 'acc-2',
          code: '2000',
          name: 'Unused',
          type: 'LIABILITY',
          openingBalance: new Decimal('0'),
        },
      ] as any);

      // First account has activity, second has zero
      prisma.journalLine.aggregate
        .mockResolvedValueOnce({
          _sum: { debit: new Decimal('500'), credit: new Decimal('0') },
        } as any)
        .mockResolvedValueOnce({
          _sum: { debit: new Decimal('0'), credit: new Decimal('0') },
        } as any);

      const result = await service.getTrialBalance(ORG_ID);

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].code).toBe('1000');
    });

    it('should return empty accounts array when no accounts exist', async () => {
      prisma.account.findMany.mockResolvedValue([]);

      const result = await service.getTrialBalance(ORG_ID);

      expect(result.accounts).toEqual([]);
      expect(result.asOfDate).toBeNull();
    });
  });

  describe('getGeneralLedger', () => {
    it('should throw NotFoundException when account does not exist', async () => {
      prisma.account.findFirst.mockResolvedValue(null);

      await expect(service.getGeneralLedger(ORG_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return account, entries, and balances', async () => {
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc-1',
        code: '1000',
        name: 'Cash',
        type: 'ASSET',
        openingBalance: new Decimal('0'),
      } as any);

      prisma.journalLine.findMany.mockResolvedValue([]);

      const result = await service.getGeneralLedger(ORG_ID, 'acc-1');

      expect(result).toHaveProperty('account');
      expect(result).toHaveProperty('openingBalance');
      expect(result).toHaveProperty('entries');
      expect(result).toHaveProperty('closingBalance');
      expect(Array.isArray(result.entries)).toBe(true);
    });
  });
});
