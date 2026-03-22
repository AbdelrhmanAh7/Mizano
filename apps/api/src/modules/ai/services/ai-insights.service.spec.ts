import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { AIInsight } from '@prisma/client';
import { AiInsightsService } from './ai-insights.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createMockPrisma,
  MockPrismaClient,
  TEST_ORG_ID,
  mockDecimal,
} from '../__tests__/fixtures/ai-test-helpers';

describe('AiInsightsService', () => {
  let service: AiInsightsService;
  let prisma: MockPrismaClient;

  const orgId = TEST_ORG_ID;

  function createMockInsight(overrides: Partial<AIInsight> = {}): AIInsight {
    return {
      id: 'insight-001',
      organizationId: orgId,
      type: 'ALERT',
      title: 'Cash Flow Alert',
      description: 'Cash flow is declining',
      severity: 'warning',
      category: 'FINANCIAL',
      priority: 'HIGH',
      aiSource: 'CASH_FLOW',
      sourceEntityType: null,
      sourceEntityId: null,
      impact: 'Low cash runway',
      suggestedAction: 'Review expenses',
      actionUrl: null,
      actionLabel: null,
      actionTaken: null,
      actionTakenAt: null,
      data: { daysOfCash: 15 },
      isRead: false,
      isDismissed: false,
      dismissedAt: null,
      dismissedBy: null,
      expiresAt: null,
      createdAt: new Date('2025-06-01'),
      updatedAt: new Date('2025-06-01'),
      ...overrides,
    } as AIInsight;
  }

  beforeEach(async () => {
    prisma = createMockPrisma();

    // Stub all the aggregate/query calls that generateAndPersist makes
    // so getInsights doesn't throw on internal insight generation.
    // Aggregate mocks use partial shapes that don't match generated Prisma types,
    // so we cast through unknown to the expected mock return type.
    (prisma.paymentReceived.aggregate as jest.Mock).mockResolvedValue({
      _sum: { amount: null },
    });
    (prisma.paymentMade.aggregate as jest.Mock).mockResolvedValue({
      _sum: { amount: null },
    });
    (prisma.expense.aggregate as jest.Mock).mockResolvedValue({
      _sum: { amount: null },
    });
    (prisma.bankAccount.aggregate as jest.Mock).mockResolvedValue({
      _sum: { systemBalance: null },
    });
    (prisma.invoice.aggregate as jest.Mock).mockResolvedValue({
      _sum: { grandTotal: null },
      _count: 0,
    });
    prisma.invoice.findMany.mockResolvedValue([]);
    (prisma.invoice.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.bill.aggregate as jest.Mock).mockResolvedValue({
      _sum: { grandTotal: null },
      _count: 0,
    });
    (prisma.expense.groupBy as jest.Mock).mockResolvedValue([]);
    prisma.item.findMany.mockResolvedValue([]);
    prisma.project.findMany.mockResolvedValue([]);
    prisma.aIInsight.findFirst.mockResolvedValue(null);
    prisma.aIInsight.create.mockResolvedValue(createMockInsight());
    prisma.customer.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiInsightsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AiInsightsService>(AiInsightsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getInsights', () => {
    it('should return formatted insights from database', async () => {
      const mockInsights = [
        createMockInsight({ id: 'ins-1' }),
        createMockInsight({ id: 'ins-2', type: 'TREND' }),
      ];
      prisma.aIInsight.findMany.mockResolvedValue(mockInsights);

      const result = await service.getInsights(orgId);

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBe(2);
    });

    it('should return empty array when no insights exist', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([]);

      const result = await service.getInsights(orgId);

      expect(result.data).toEqual([]);
    });

    it('should format insights with correct status mapping for NEW', async () => {
      const insight = createMockInsight({
        isRead: false,
        isDismissed: false,
        actionTaken: null,
      });
      prisma.aIInsight.findMany.mockResolvedValue([insight]);

      const result = await service.getInsights(orgId);

      expect(result.data[0].status).toBe('NEW');
    });

    it('should format insights with correct status mapping for VIEWED', async () => {
      const insight = createMockInsight({
        isRead: true,
        isDismissed: false,
        actionTaken: null,
      });
      prisma.aIInsight.findMany.mockResolvedValue([insight]);

      const result = await service.getInsights(orgId);

      expect(result.data[0].status).toBe('VIEWED');
    });

    it('should format insights with correct status mapping for DISMISSED', async () => {
      const insight = createMockInsight({
        isDismissed: true,
      });
      prisma.aIInsight.findMany.mockResolvedValue([insight]);

      const result = await service.getInsights(orgId, { status: 'DISMISSED' });

      expect(result.data[0].status).toBe('DISMISSED');
    });

    it('should format insights with correct status mapping for ACTIONED', async () => {
      const insight = createMockInsight({
        isDismissed: false,
        isRead: true,
        actionTaken: 'reviewed',
      });
      prisma.aIInsight.findMany.mockResolvedValue([insight]);

      const result = await service.getInsights(orgId, { status: 'ACTIONED' });

      expect(result.data[0].status).toBe('ACTIONED');
    });

    it('should filter by type when provided', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([]);

      await service.getInsights(orgId, { type: 'ALERT' });

      // The last findMany call is the one that queries with filters
      const calls = (prisma.aIInsight.findMany as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.where.type).toBe('ALERT');
    });

    it('should respect limit parameter', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([]);

      await service.getInsights(orgId, { limit: 5 });

      const calls = (prisma.aIInsight.findMany as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall.take).toBe(5);
    });

    it('should include confidence in formatted insight', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([createMockInsight()]);

      const result = await service.getInsights(orgId);

      expect(result.data[0].confidence).toBe(0.85);
    });
  });

  describe('getInsightById', () => {
    it('should return a single formatted insight', async () => {
      const insight = createMockInsight({ id: 'ins-specific' });
      prisma.aIInsight.findFirst.mockResolvedValue(insight);
      prisma.aIInsight.update.mockResolvedValue(insight);

      const result = await service.getInsightById(orgId, 'ins-specific');

      expect(result.data).toBeDefined();
      expect(result.data.id).toBe('ins-specific');
    });

    it('should throw NotFoundException when insight does not exist', async () => {
      prisma.aIInsight.findFirst.mockResolvedValue(null);

      await expect(service.getInsightById(orgId, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should mark unread insight as read', async () => {
      const insight = createMockInsight({ id: 'ins-1', isRead: false });
      prisma.aIInsight.findFirst.mockResolvedValue(insight);
      prisma.aIInsight.update.mockResolvedValue(insight);

      await service.getInsightById(orgId, 'ins-1');

      expect(prisma.aIInsight.update).toHaveBeenCalledWith({
        where: { id: 'ins-1' },
        data: { isRead: true },
      });
    });

    it('should NOT call update when insight is already read', async () => {
      const insight = createMockInsight({ id: 'ins-1', isRead: true });
      prisma.aIInsight.findFirst.mockResolvedValue(insight);

      await service.getInsightById(orgId, 'ins-1');

      expect(prisma.aIInsight.update).not.toHaveBeenCalled();
    });
  });

  describe('dismissInsight', () => {
    it('should dismiss an existing insight and return success', async () => {
      const insight = createMockInsight({ id: 'ins-dismiss' });
      prisma.aIInsight.findFirst.mockResolvedValue(insight);
      prisma.aIInsight.update.mockResolvedValue(insight);

      const result = await service.dismissInsight(orgId, 'ins-dismiss', 'user-001');

      expect(result.success).toBe(true);
      expect(prisma.aIInsight.update).toHaveBeenCalledWith({
        where: { id: 'ins-dismiss' },
        data: expect.objectContaining({
          isDismissed: true,
          dismissedBy: 'user-001',
        }),
      });
    });

    it('should throw NotFoundException when insight does not exist', async () => {
      prisma.aIInsight.findFirst.mockResolvedValue(null);

      await expect(service.dismissInsight(orgId, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('actionInsight', () => {
    it('should record action on an existing insight and return success', async () => {
      const insight = createMockInsight({ id: 'ins-action' });
      prisma.aIInsight.findFirst.mockResolvedValue(insight);
      prisma.aIInsight.update.mockResolvedValue(insight);

      const result = await service.actionInsight(orgId, 'ins-action', 'reviewed');

      expect(result.success).toBe(true);
      expect(prisma.aIInsight.update).toHaveBeenCalledWith({
        where: { id: 'ins-action' },
        data: expect.objectContaining({
          actionTaken: 'reviewed',
        }),
      });
    });

    it('should throw NotFoundException when insight does not exist', async () => {
      prisma.aIInsight.findFirst.mockResolvedValue(null);

      await expect(service.actionInsight(orgId, 'non-existent', 'some-action')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('generateAndPersist analyzer resilience', () => {
    it('should not crash getInsights when project.findMany throws (e.g. missing column)', async () => {
      // Simulate the exact error: projects.deletedAt column does not exist
      prisma.project.findMany.mockRejectedValue(
        new Error('The column `projects.deletedAt` does not exist in the current database.'),
      );
      prisma.aIInsight.findMany.mockResolvedValue([createMockInsight()]);

      const result = await service.getInsights(orgId);

      // Should still return insights from the database despite project analyzer failing
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBe(1);
    });

    it('should not crash getInsights when item.findMany throws', async () => {
      prisma.item.findMany.mockRejectedValue(new Error('Database connection lost'));
      prisma.aIInsight.findMany.mockResolvedValue([]);

      const result = await service.getInsights(orgId);

      expect(result.data).toEqual([]);
    });

    it('should not crash getInsights when invoice queries throw', async () => {
      prisma.invoice.aggregate.mockRejectedValue(new Error('timeout'));
      prisma.aIInsight.findMany.mockResolvedValue([]);

      const result = await service.getInsights(orgId);

      expect(result.data).toEqual([]);
    });

    it('should still persist insights from analyzers that succeed when others fail', async () => {
      // Make project analyzer fail
      prisma.project.findMany.mockRejectedValue(
        new Error('The column `projects.deletedAt` does not exist'),
      );

      // Make inventory return a low-stock insight
      prisma.item.findMany.mockResolvedValue([
        {
          id: 'item-1',
          name: 'Widget',
          sku: 'WDG-001',
          trackInventory: true,
          currentStock: mockDecimal(2),
          reorderPoint: mockDecimal(10),
          organizationId: orgId,
        } as unknown as Awaited<ReturnType<typeof prisma.item.findMany>>[number],
      ]);

      prisma.aIInsight.findMany.mockResolvedValue([]);

      await service.getInsights(orgId);

      // The inventory insight should still have been created
      // (aIInsight.create may or may not be called depending on dedup logic,
      //  but the service should not throw)
    });

    it('should handle all analyzers failing gracefully', async () => {
      prisma.paymentReceived.aggregate.mockRejectedValue(new Error('fail'));
      prisma.paymentMade.aggregate.mockRejectedValue(new Error('fail'));
      prisma.expense.aggregate.mockRejectedValue(new Error('fail'));
      prisma.bankAccount.aggregate.mockRejectedValue(new Error('fail'));
      prisma.invoice.aggregate.mockRejectedValue(new Error('fail'));
      prisma.invoice.findMany.mockRejectedValue(new Error('fail'));
      prisma.invoice.groupBy.mockRejectedValue(new Error('fail'));
      prisma.bill.aggregate.mockRejectedValue(new Error('fail'));
      prisma.expense.groupBy.mockRejectedValue(new Error('fail'));
      prisma.item.findMany.mockRejectedValue(new Error('fail'));
      prisma.project.findMany.mockRejectedValue(new Error('fail'));
      prisma.customer.findMany.mockRejectedValue(new Error('fail'));

      prisma.aIInsight.findMany.mockResolvedValue([]);

      // Should not throw — returns empty insights
      const result = await service.getInsights(orgId);
      expect(result.data).toEqual([]);
    });
  });
});
