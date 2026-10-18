import { assertWorkerQueueConfigured } from './worker-config';

describe('assertWorkerQueueConfigured', () => {
  const config = (value?: string): { get: (key: string) => string | undefined } => ({
    get: (key) => (key === 'REDIS_URL' ? value : undefined),
  });

  it.each([undefined, '', '   '])('throws when REDIS_URL is %p', (value) => {
    expect(() => assertWorkerQueueConfigured(config(value))).toThrow(/REDIS_URL/);
  });

  it('accepts a Redis URL', () => {
    expect(() => assertWorkerQueueConfigured(config('redis://redis:6379'))).not.toThrow();
  });
});
