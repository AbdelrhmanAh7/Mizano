import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AiAlertsService } from './ai-alerts.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  createMockPrisma,
  MockPrismaClient,
  createMockEventEmitter,
  TEST_ORG_ID,
} from '../__tests__/fixtures/ai-test-helpers';

describe('AiAlertsService', () => {
  let service: AiAlertsService;
  let prisma: MockPrismaClient;
  let eventEmitter: ReturnType<typeof createMockEventEmitter>;

  const orgId = TEST_ORG_ID;

  function createMockInsight(overrides: Record<string, any> = {}) {
    return {
      id: 'insight-001',
      organizationId: orgId,
      type: 'ALERT',
      title: 'Test Alert',
      description: 'Test alert description',
      severity: 'warning',
      category: 'FINANCIAL',
      priority: 'HIGH',
      aiSource: 'CASH_FLOW',
      sourceEntityType: null,
      sourceEntityId: null,
      impact: null,
      suggestedAction: null,
      actionUrl: null,
      actionLabel: null,
      actionTaken: null,
      actionTakenAt: null,
      data: null,
      isRead: false,
      isDismissed: false,
      dismissedAt: null,
      dismissedBy: null,
      expiresAt: null,
      createdAt: new Date('2025-06-01'),
      updatedAt: new Date('2025-06-01'),
      ...overrides,
    };
  }

  beforeEach(async () => {
    prisma = createMockPrisma();
    eventEmitter = createMockEventEmitter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAlertsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<AiAlertsService>(AiAlertsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAlerts', () => {
    it('should return alerts and total count', async () => {
      const mockAlerts = [
        createMockInsight({ id: 'alert-1' }),
        createMockInsight({ id: 'alert-2' }),
      ];
      prisma.aIInsight.findMany.mockResolvedValue(mockAlerts as any);
      prisma.aIInsight.count.mockResolvedValue(2 as any);

      const result = await service.getAlerts(orgId);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty data for organization with no alerts', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([] as any);
      prisma.aIInsight.count.mockResolvedValue(0 as any);

      const result = await service.getAlerts(orgId);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should filter by category when provided', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([] as any);
      prisma.aIInsight.count.mockResolvedValue(0 as any);

      await service.getAlerts(orgId, { category: 'FINANCIAL' as any });

      expect(prisma.aIInsight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'FINANCIAL',
          }),
        }),
      );
    });

    it('should filter by priority when provided', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([] as any);
      prisma.aIInsight.count.mockResolvedValue(0 as any);

      await service.getAlerts(orgId, { priority: 'CRITICAL' as any });

      expect(prisma.aIInsight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: 'CRITICAL',
          }),
        }),
      );
    });

    it('should exclude dismissed alerts by default', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([] as any);
      prisma.aIInsight.count.mockResolvedValue(0 as any);

      await service.getAlerts(orgId);

      expect(prisma.aIInsight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDismissed: false,
          }),
        }),
      );
    });

    it('should include dismissed alerts when option is set', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([] as any);
      prisma.aIInsight.count.mockResolvedValue(0 as any);

      await service.getAlerts(orgId, { includeDismissed: true });

      // When includeDismissed is true, isDismissed should NOT be in the where clause
      const call = (prisma.aIInsight.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.isDismissed).toBeUndefined();
    });

    it('should respect limit and offset', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([] as any);
      prisma.aIInsight.count.mockResolvedValue(0 as any);

      await service.getAlerts(orgId, { limit: 10, offset: 20 });

      expect(prisma.aIInsight.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });

    it('should map database records to UnifiedAlert format', async () => {
      const insight = createMockInsight({
        sourceEntityId: 'entity-1',
        sourceEntityType: 'invoice',
        impact: 'High impact',
        suggestedAction: 'Take action',
        data: { key: 'value' },
      });
      prisma.aIInsight.findMany.mockResolvedValue([insight] as any);
      prisma.aIInsight.count.mockResolvedValue(1 as any);

      const result = await service.getAlerts(orgId);
      const alert = result.data[0];

      expect(alert.id).toBe('insight-001');
      expect(alert.title).toBe('Test Alert');
      expect(alert.category).toBe('FINANCIAL');
      expect(alert.priority).toBe('HIGH');
      expect(alert.isRead).toBe(false);
      expect(alert.isDismissed).toBe(false);
    });
  });

  describe('getAlertSummary', () => {
    it('should return summary with zero counts for empty organization', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([] as any);

      const result = await service.getAlertSummary(orgId);

      expect(result.total).toBe(0);
      expect(result.unread).toBe(0);
      expect(result.critical).toHaveLength(0);
      expect(result.byCategory.FINANCIAL).toBe(0);
      expect(result.byPriority.CRITICAL).toBe(0);
    });

    it('should count alerts by category and priority', async () => {
      const alerts = [
        createMockInsight({ id: '1', category: 'FINANCIAL', priority: 'CRITICAL', isRead: false }),
        createMockInsight({ id: '2', category: 'FINANCIAL', priority: 'HIGH', isRead: true }),
        createMockInsight({ id: '3', category: 'COLLECTION', priority: 'MEDIUM', isRead: false }),
        createMockInsight({ id: '4', category: 'INVENTORY', priority: 'CRITICAL', isRead: false }),
      ];
      prisma.aIInsight.findMany.mockResolvedValue(alerts as any);

      const result = await service.getAlertSummary(orgId);

      expect(result.total).toBe(4);
      expect(result.unread).toBe(3);
      expect(result.byCategory.FINANCIAL).toBe(2);
      expect(result.byCategory.COLLECTION).toBe(1);
      expect(result.byCategory.INVENTORY).toBe(1);
      expect(result.byPriority.CRITICAL).toBe(2);
      expect(result.byPriority.HIGH).toBe(1);
    });

    it('should return up to 5 critical alerts', async () => {
      const criticalAlerts = Array.from({ length: 8 }, (_, i) =>
        createMockInsight({ id: `crit-${i}`, priority: 'CRITICAL' }),
      );
      prisma.aIInsight.findMany.mockResolvedValue(criticalAlerts as any);

      const result = await service.getAlertSummary(orgId);

      expect(result.critical.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getCriticalAlerts', () => {
    it('should return only critical priority alerts', async () => {
      const critAlerts = [
        createMockInsight({ id: 'c1', priority: 'CRITICAL' }),
        createMockInsight({ id: 'c2', priority: 'CRITICAL' }),
      ];
      prisma.aIInsight.findMany.mockResolvedValue(critAlerts as any);

      const result = await service.getCriticalAlerts(orgId);

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no critical alerts exist', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([] as any);

      const result = await service.getCriticalAlerts(orgId);

      expect(result).toHaveLength(0);
    });

    it('should respect the limit parameter', async () => {
      prisma.aIInsight.findMany.mockResolvedValue([] as any);

      await service.getCriticalAlerts(orgId, 3);

      expect(prisma.aIInsight.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
    });
  });

  describe('markAsRead', () => {
    it('should mark an existing alert as read', async () => {
      prisma.aIInsight.findFirst.mockResolvedValue(
        createMockInsight({ id: 'alert-1', isRead: false }) as any,
      );
      prisma.aIInsight.update.mockResolvedValue({} as any);

      await service.markAsRead(orgId, 'alert-1');

      expect(prisma.aIInsight.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: { isRead: true },
      });
    });

    it('should throw NotFoundException when alert does not exist', async () => {
      prisma.aIInsight.findFirst.mockResolvedValue(null as any);

      await expect(service.markAsRead(orgId, 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('dismissAlert', () => {
    it('should dismiss an existing alert with userId', async () => {
      prisma.aIInsight.findFirst.mockResolvedValue(createMockInsight({ id: 'alert-1' }) as any);
      prisma.aIInsight.update.mockResolvedValue({} as any);

      await service.dismissAlert(orgId, 'alert-1', 'user-001');

      expect(prisma.aIInsight.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: expect.objectContaining({
          isDismissed: true,
          dismissedBy: 'user-001',
        }),
      });
    });

    it('should throw NotFoundException when alert does not exist', async () => {
      prisma.aIInsight.findFirst.mockResolvedValue(null as any);

      await expect(service.dismissAlert(orgId, 'non-existent', 'user-001')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('cleanupExpiredAlerts', () => {
    it('should mark expired alerts as dismissed and return count', async () => {
      prisma.aIInsight.updateMany.mockResolvedValue({ count: 3 } as any);
      prisma.aIInsight.deleteMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.cleanupExpiredAlerts(orgId);

      expect(result).toBe(3);
      // Verify updateMany was called for expiring alerts
      expect(prisma.aIInsight.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
            type: 'ALERT',
            isDismissed: false,
            expiresAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
          data: expect.objectContaining({
            isDismissed: true,
          }),
        }),
      );
    });

    it('should also delete very old dismissed alerts (90+ days)', async () => {
      prisma.aIInsight.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.aIInsight.deleteMany.mockResolvedValue({ count: 5 } as any);

      await service.cleanupExpiredAlerts(orgId);

      expect(prisma.aIInsight.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: orgId,
            type: 'ALERT',
            isDismissed: true,
            dismissedAt: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );
    });

    it('should return 0 when no alerts are expired', async () => {
      prisma.aIInsight.updateMany.mockResolvedValue({ count: 0 } as any);
      prisma.aIInsight.deleteMany.mockResolvedValue({ count: 0 } as any);

      const result = await service.cleanupExpiredAlerts(orgId);

      expect(result).toBe(0);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread alerts as read', async () => {
      prisma.aIInsight.updateMany.mockResolvedValue({ count: 5 } as any);

      const result = await service.markAllAsRead(orgId);

      expect(result).toBe(5);
      expect(prisma.aIInsight.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isRead: true },
        }),
      );
    });

    it('should filter by category when provided', async () => {
      prisma.aIInsight.updateMany.mockResolvedValue({ count: 2 } as any);

      await service.markAllAsRead(orgId, 'FINANCIAL' as any);

      expect(prisma.aIInsight.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'FINANCIAL',
          }),
        }),
      );
    });
  });

  describe('recordAction', () => {
    it('should record action on an existing alert', async () => {
      prisma.aIInsight.findFirst.mockResolvedValue(createMockInsight({ id: 'alert-1' }) as any);
      prisma.aIInsight.update.mockResolvedValue({} as any);

      await service.recordAction(orgId, 'alert-1', 'reviewed');

      expect(prisma.aIInsight.update).toHaveBeenCalledWith({
        where: { id: 'alert-1' },
        data: expect.objectContaining({
          actionTaken: 'reviewed',
          isRead: true,
        }),
      });
    });

    it('should throw NotFoundException when alert does not exist', async () => {
      prisma.aIInsight.findFirst.mockResolvedValue(null as any);

      await expect(service.recordAction(orgId, 'non-existent', 'action')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
