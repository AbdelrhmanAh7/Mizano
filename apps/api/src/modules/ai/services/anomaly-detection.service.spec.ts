import { Test, TestingModule } from '@nestjs/testing';
import { AnomalyDetectionService } from './anomaly-detection.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('AnomalyDetectionService', () => {
  let service: AnomalyDetectionService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AnomalyDetectionService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AnomalyDetectionService>(AnomalyDetectionService);
  });

  describe('detectAnomaly', () => {
    it('should NOT flag a value within 2 standard deviations as anomaly (z-score method)', () => {
      const historical = [100, 105, 98, 102, 97, 103, 101, 99, 104, 100];
      const result = service.detectAnomaly(101, historical);

      expect(result.isAnomaly).toBe(false);
      expect(result.severity).toBeNull();
    });

    it('should flag a value > 3 standard deviations as anomaly (z-score method)', () => {
      const historical = [100, 105, 98, 102, 97, 103, 101, 99, 104, 100];
      const result = service.detectAnomaly(200, historical);

      expect(result.isAnomaly).toBe(true);
      expect(result.method).toBe('ensemble');
      expect(result.severity).not.toBeNull();
    });

    it('should flag a value outside 1.5*IQR as anomaly (IQR method)', () => {
      // Sorted: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      // Q1=25, Q3=85, IQR=60. Lower=25-90=-65, Upper=85+90=175
      // But let's use a tighter distribution
      const historical = [50, 52, 48, 51, 49, 50, 51, 48, 52, 50];
      // Q1~=49, Q3~=51.5, IQR=2.5, upper = 51.5 + 3.75 = 55.25
      const result = service.detectAnomaly(200, historical);

      expect(result.isAnomaly).toBe(true);
      expect(result.method).toBe('ensemble');
    });

    it('should return LOW severity for outlier with zero variance (IQR only)', () => {
      // stdDev=0 → zScoreWithStats returns 0 (guard), so z-score method does NOT fire
      // IQR: Q1=Q3=10, IQR=0 → any value != 10 is outside bounds → IQR fires
      // isolation forest doesn't run (< 20 points)
      // Only 1 method agrees (IQR), absZScore=0 → severity = LOW
      const historical = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
      const result = service.detectAnomaly(1000, historical);

      expect(result.isAnomaly).toBe(true);
      expect(result.severity).toBe('LOW');
    });

    it('should handle empty historical data gracefully', () => {
      const result = service.detectAnomaly(100, []);

      expect(result.isAnomaly).toBe(false);
      expect(result.severity).toBeNull();
    });

    it('should handle single-value historical data', () => {
      const result = service.detectAnomaly(100, [100]);

      expect(result.isAnomaly).toBe(false);
    });

    it('should return CRITICAL severity for extreme outlier beyond 4 sigma', () => {
      // mean=55, stddev~=30.27, z for 180 = (180-55)/30.27 ≈ 4.13 → > 4 → CRITICAL
      // IQR: value 180 > upper bound → also flags
      // Only 10 points, isolation forest doesn't run
      // 2 methods agree, no boost, base severity = CRITICAL (absZScore > 4)
      const historical = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const result = service.detectAnomaly(180, historical);

      expect(result.isAnomaly).toBe(true);
      expect(result.severity).toBe('CRITICAL');
    });

    it('should detect negative anomalies (unusually low values)', () => {
      const historical = [100, 105, 98, 102, 97, 103, 101, 99, 104, 100];
      const result = service.detectAnomaly(-50, historical);

      expect(result.isAnomaly).toBe(true);
    });
  });

  describe('checkTransactionAnomaly', () => {
    it('should detect anomalous transaction amount for an account', async () => {
      // Service calls prisma.expense.findMany and selects { amount }
      prisma.expense.findMany.mockResolvedValue(
        Array.from({ length: 20 }, () => ({
          amount: mockDecimal(100),
        })) as any,
      );

      const result = await service.checkTransactionAnomaly(TEST_ORG_ID, 10000, 'account-001');

      expect(result).not.toBeNull();
      expect(result.isAnomaly).toBe(true);
    });

    it('should return insufficient_data result when no historical transactions exist', async () => {
      // Service always returns AnomalyResult (never null)
      // With empty history, detectAnomaly returns { isAnomaly: false, reason: 'insufficient_data' }
      prisma.expense.findMany.mockResolvedValue([] as any);

      const result = await service.checkTransactionAnomaly(TEST_ORG_ID, 100, 'account-001');

      expect(result).not.toBeNull();
      expect(result.isAnomaly).toBe(false);
      expect(result.reason).toBe('insufficient_data');
    });

    it('should NOT flag a normal transaction amount', async () => {
      // Use varied amounts so stdDev > 0 and IQR range is realistic
      prisma.expense.findMany.mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => ({
          amount: mockDecimal(90 + i), // 90..109, mean=99.5, stdDev≈5.77
        })) as any,
      );

      const result = await service.checkTransactionAnomaly(
        TEST_ORG_ID,
        102, // well within normal range
        'account-001',
      );

      expect(result).not.toBeNull();
      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('dailyAnomalyScan', () => {
    it('should scan today transactions and return anomaly counts', async () => {
      // Service calls expense.findMany for recentExpenses
      prisma.expense.findMany
        .mockResolvedValueOnce([
          { id: 'exp-1', amount: mockDecimal(100000), accountId: 'acct-1', vendorId: 'v-1' },
        ] as any)
        // Historical expenses for checkTransactionAnomaly
        .mockResolvedValue(
          Array.from({ length: 20 }, (_, i) => ({
            amount: mockDecimal(90 + i),
          })) as any,
        );

      // Service calls bill.findMany for recentBills
      prisma.bill.findMany.mockResolvedValue([] as any);

      // For createAnomalyRecord — check if already exists
      prisma.aiAnomaly.findFirst.mockResolvedValue(null as any);
      prisma.aiAnomaly.create.mockResolvedValue({} as any);
      prisma.user.findMany.mockResolvedValue([] as any);

      const result = await service.dailyAnomalyScan(TEST_ORG_ID);

      expect(result).toHaveProperty('transactionAnomalies');
      expect(result).toHaveProperty('spendingAnomalies');
      expect(result).toHaveProperty('newAnomaliesCreated');
    });

    it('should return zeros when no expenses or bills exist today', async () => {
      prisma.expense.findMany.mockResolvedValue([] as any);
      prisma.bill.findMany.mockResolvedValue([] as any);

      const result = await service.dailyAnomalyScan(TEST_ORG_ID);

      expect(result.transactionAnomalies).toBe(0);
      expect(result.spendingAnomalies).toBe(0);
      expect(result.newAnomaliesCreated).toBe(0);
    });
  });

  describe('getUnresolvedAnomalies', () => {
    it('should return unresolved anomalies sorted by severity', async () => {
      prisma.aiAnomaly.findMany.mockResolvedValue([
        {
          id: 'anom-1',
          severity: 'HIGH',
          description: 'Unusually large debit',
          resolvedAt: null,
          entityType: 'journal',
          entityId: 'j1',
          amount: mockDecimal(100000),
          createdAt: new Date(),
        },
        {
          id: 'anom-2',
          severity: 'MEDIUM',
          description: 'Unusual credit',
          resolvedAt: null,
          entityType: 'journal',
          entityId: 'j2',
          amount: mockDecimal(50000),
          createdAt: new Date(),
        },
      ] as any);

      const anomalies = await service.getUnresolvedAnomalies(TEST_ORG_ID);

      expect(anomalies.data).toHaveLength(2);
      expect(anomalies.data[0].severity).toBe('HIGH');
    });

    it('should return empty array when no unresolved anomalies', async () => {
      prisma.aiAnomaly.findMany.mockResolvedValue([] as any);

      const anomalies = await service.getUnresolvedAnomalies(TEST_ORG_ID);

      expect(anomalies.data).toEqual([]);
    });

    it('should filter by severity when option provided', async () => {
      prisma.aiAnomaly.findMany.mockResolvedValue([
        {
          id: 'anom-high',
          severity: 'HIGH',
          resolvedAt: null,
          createdAt: new Date(),
        },
      ] as any);

      await service.getUnresolvedAnomalies(TEST_ORG_ID, { severity: 'HIGH' });

      expect(prisma.aiAnomaly.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ severity: 'HIGH' }),
        }),
      );
    });
  });

  describe('resolveAnomaly', () => {
    it('should mark anomaly as resolved', async () => {
      prisma.aiAnomaly.update.mockResolvedValue({
        id: 'anom-1',
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: 'user-001',
      } as any);

      await service.resolveAnomaly(TEST_ORG_ID, 'anom-1', 'user-001');

      expect(prisma.aiAnomaly.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'anom-1', organizationId: TEST_ORG_ID },
          data: expect.objectContaining({
            isResolved: true,
            resolvedAt: expect.any(Date),
            resolvedBy: 'user-001',
          }),
        }),
      );
    });

    it('should propagate error when anomaly not found', async () => {
      // Service calls prisma.aiAnomaly.update directly (no findFirst check).
      // If record doesn't exist, Prisma throws P2025 error.
      prisma.aiAnomaly.update.mockRejectedValue(new Error('Record to update not found'));

      await expect(
        service.resolveAnomaly(TEST_ORG_ID, 'nonexistent', 'user-001'),
      ).rejects.toThrow();
    });
  });

  describe('getAnomalyStats', () => {
    it('should return total and unresolved counts', async () => {
      prisma.aiAnomaly.count
        .mockResolvedValueOnce(10 as any) // total
        .mockResolvedValueOnce(4 as any); // unresolved
      prisma.aiAnomaly.groupBy
        .mockResolvedValueOnce([] as any) // byType
        .mockResolvedValueOnce([] as any); // bySeverity

      const stats = await service.getAnomalyStats(TEST_ORG_ID);

      expect(stats.total).toBe(10);
      expect(stats.unresolved).toBe(4);
    });

    it('should return all zeros when no anomalies recorded', async () => {
      prisma.aiAnomaly.count.mockResolvedValue(0 as any);
      prisma.aiAnomaly.groupBy.mockResolvedValue([] as any);

      const stats = await service.getAnomalyStats(TEST_ORG_ID);

      expect(stats.total).toBe(0);
      expect(stats.unresolved).toBe(0);
    });
  });
});
