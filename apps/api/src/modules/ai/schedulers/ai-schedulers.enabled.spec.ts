import { aiSchedulerProviders, aiSchedulersEnabled } from './ai-schedulers.enabled';

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
});
