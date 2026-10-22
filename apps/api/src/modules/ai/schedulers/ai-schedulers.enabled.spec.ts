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

  describe('constructor guards: schedulers refuse instantiation when disabled', () => {
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

    it('AiHrOpsScheduler throws in constructor when AI_SCHEDULERS_ENABLED is false', () => {
      expect(
        () =>
          new AiHrOpsScheduler(
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            mockConfigDisabled,
          ),
      ).toThrow('AiHrOpsScheduler cannot be instantiated when AI_SCHEDULERS_ENABLED is not true');
    });

    it('AiHrOpsScheduler instantiates successfully when AI_SCHEDULERS_ENABLED is true', () => {
      expect(
        () =>
          new AiHrOpsScheduler(
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            mockConfigEnabled,
          ),
      ).not.toThrow();
    });

    it('AiSecurityScheduler throws in constructor when AI_SCHEDULERS_ENABLED is false', () => {
      expect(
        () =>
          new AiSecurityScheduler({} as any, {} as any, {} as any, {} as any, mockConfigDisabled),
      ).toThrow(
        'AiSecurityScheduler cannot be instantiated when AI_SCHEDULERS_ENABLED is not true',
      );
    });

    it('AiSecurityScheduler instantiates successfully when AI_SCHEDULERS_ENABLED is true', () => {
      expect(
        () =>
          new AiSecurityScheduler({} as any, {} as any, {} as any, {} as any, mockConfigEnabled),
      ).not.toThrow();
    });

    it('AiOperationsScheduler throws in constructor when AI_SCHEDULERS_ENABLED is false', () => {
      expect(
        () =>
          new AiOperationsScheduler(
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
            mockConfigDisabled,
          ),
      ).toThrow(
        'AiOperationsScheduler cannot be instantiated when AI_SCHEDULERS_ENABLED is not true',
      );
    });

    it('AiNlpChatScheduler throws in constructor when AI_SCHEDULERS_ENABLED is false', () => {
      expect(
        () => new AiNlpChatScheduler({} as any, {} as any, {} as any, mockConfigDisabled),
      ).toThrow('AiNlpChatScheduler cannot be instantiated when AI_SCHEDULERS_ENABLED is not true');
    });

    it('AiSalesCrmScheduler throws in constructor when AI_SCHEDULERS_ENABLED is false', () => {
      expect(
        () =>
          new AiSalesCrmScheduler(
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            mockConfigDisabled,
          ),
      ).toThrow(
        'AiSalesCrmScheduler cannot be instantiated when AI_SCHEDULERS_ENABLED is not true',
      );
    });
  });
});
