import { ConfigService } from '@nestjs/config';
import { aiSchedulerProviders, aiSchedulersEnabled } from './ai-schedulers.enabled';
import { AiHrOpsScheduler } from './ai-hr-ops.scheduler';
import { AiSecurityScheduler } from './ai-security.scheduler';
import { AiOperationsScheduler } from './ai-operations.scheduler';
import { AiNlpChatScheduler } from './ai-nlp-chat.scheduler';
import { AiSalesCrmScheduler } from './ai-sales-crm.scheduler';

describe('AI scheduler gate (issue #133)', () => {
  const original = process.env.AI_SCHEDULERS_ENABLED;
  class FakeScheduler {}
  class OtherScheduler {}

  afterEach(() => {
    if (original === undefined) delete process.env.AI_SCHEDULERS_ENABLED;
    else process.env.AI_SCHEDULERS_ENABLED = original;
  });

  it.each([undefined, '', 'false', 'FALSE', '1', 'yes'])(
    'AI_SCHEDULERS_ENABLED=%p registers no scheduler providers',
    (value) => {
      if (value === undefined) delete process.env.AI_SCHEDULERS_ENABLED;
      else process.env.AI_SCHEDULERS_ENABLED = value;
      expect(aiSchedulersEnabled()).toBe(false);
      expect(aiSchedulerProviders([FakeScheduler, OtherScheduler])).toEqual([]);
    },
  );

  it('AI_SCHEDULERS_ENABLED=true registers the scheduler providers', () => {
    process.env.AI_SCHEDULERS_ENABLED = 'true';
    expect(aiSchedulersEnabled()).toBe(true);
    expect(aiSchedulerProviders([FakeScheduler, OtherScheduler])).toEqual([
      FakeScheduler,
      OtherScheduler,
    ]);
  });

  describe('scheduler gating: schedulers instantiate cleanly with isEnabled=false and guard execution when disabled', () => {
    const mockConfigDisabled = {
      get: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'AI_SCHEDULERS_ENABLED' ? 'false' : undefined,
        ),
    } as unknown as ConfigService;

    const mockConfigEnabled = {
      get: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'AI_SCHEDULERS_ENABLED' ? 'true' : undefined,
        ),
    } as unknown as ConfigService;

    beforeEach(() => {
      delete process.env.AI_SCHEDULERS_ENABLED;
    });

    it('AiHrOpsScheduler instantiates with isEnabled=false and skips cron execution when disabled', async () => {
      const mockPrisma = { organization: { findMany: jest.fn() } };
      const scheduler = new AiHrOpsScheduler(
        mockPrisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockConfigDisabled,
      );
      expect(scheduler.isEnabled()).toBe(false);
      await scheduler.runMonthlyAttritionPrediction();
      expect(mockPrisma.organization.findMany).not.toHaveBeenCalled();
    });

    it('AiHrOpsScheduler instantiates with isEnabled=true when AI_SCHEDULERS_ENABLED is true', () => {
      const scheduler = new AiHrOpsScheduler(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockConfigEnabled,
      );
      expect(scheduler.isEnabled()).toBe(true);
    });

    it('AiSecurityScheduler instantiates with isEnabled=false and skips cron execution when disabled', async () => {
      const mockPrisma = { organization: { findMany: jest.fn() } };
      const scheduler = new AiSecurityScheduler(
        mockPrisma as any,
        {} as any,
        {} as any,
        {} as any,
        mockConfigDisabled,
      );
      expect(scheduler.isEnabled()).toBe(false);
      await scheduler.runDailyFraudScan();
      expect(mockPrisma.organization.findMany).not.toHaveBeenCalled();
    });

    it('AiSecurityScheduler instantiates with isEnabled=true when AI_SCHEDULERS_ENABLED is true', () => {
      const scheduler = new AiSecurityScheduler(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockConfigEnabled,
      );
      expect(scheduler.isEnabled()).toBe(true);
    });

    it('AiOperationsScheduler instantiates with isEnabled=false and skips cron execution when disabled', async () => {
      const mockPrisma = { organization: { findMany: jest.fn() } };
      const scheduler = new AiOperationsScheduler(
        mockPrisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockConfigDisabled,
      );
      expect(scheduler.isEnabled()).toBe(false);
      await scheduler.runDailyAnomalyScan();
      expect(mockPrisma.organization.findMany).not.toHaveBeenCalled();
    });

    it('AiOperationsScheduler instantiates with isEnabled=true when AI_SCHEDULERS_ENABLED is true', () => {
      const scheduler = new AiOperationsScheduler(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockConfigEnabled,
      );
      expect(scheduler.isEnabled()).toBe(true);
    });

    it('AiNlpChatScheduler instantiates with isEnabled=false and skips cron execution when disabled', async () => {
      const mockDocService = { checkRetrainingNeeded: jest.fn() };
      const scheduler = new AiNlpChatScheduler(
        {} as any,
        mockDocService as any,
        {} as any,
        mockConfigDisabled,
      );
      expect(scheduler.isEnabled()).toBe(false);
      await scheduler.checkDocClassificationRetraining();
      expect(mockDocService.checkRetrainingNeeded).not.toHaveBeenCalled();
    });

    it('AiNlpChatScheduler instantiates with isEnabled=true when AI_SCHEDULERS_ENABLED is true', () => {
      const scheduler = new AiNlpChatScheduler({} as any, {} as any, {} as any, mockConfigEnabled);
      expect(scheduler.isEnabled()).toBe(true);
    });

    it('AiSalesCrmScheduler instantiates with isEnabled=false and skips cron execution when disabled', async () => {
      const mockPrisma = { organization: { findMany: jest.fn() } };
      const scheduler = new AiSalesCrmScheduler(
        mockPrisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockConfigDisabled,
      );
      expect(scheduler.isEnabled()).toBe(false);
      await scheduler.runWeeklyChurnPrediction();
      expect(mockPrisma.organization.findMany).not.toHaveBeenCalled();
    });

    it('AiSalesCrmScheduler instantiates with isEnabled=true when AI_SCHEDULERS_ENABLED is true', () => {
      const scheduler = new AiSalesCrmScheduler(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockConfigEnabled,
      );
      expect(scheduler.isEnabled()).toBe(true);
    });
  });
});
