import Redis from 'ioredis';
import { connectionFromUrl } from '../modules/ai/intake/intake-queue.service';
import { resolveRedisUrl } from './redis-url';

/**
 * #183 / #251: compose cannot percent-encode, so the stacks pass REDIS_PASSWORD next to a
 * credential-free REDIS_URL and the API encodes it here, once, for every consumer.
 */
const config = (env: Record<string, string | undefined>) => ({ get: (key: string) => env[key] });
const SPECIAL = 'p/a+s=s@w:o%r?d#&';

describe('resolveRedisUrl (#183 / #251)', () => {
  it('returns undefined without REDIS_URL, even with a password', () => {
    expect(resolveRedisUrl(config({ REDIS_PASSWORD: 'x' }))).toBeUndefined();
    expect(resolveRedisUrl(config({ REDIS_URL: '' }))).toBeUndefined();
  });

  it('leaves REDIS_URL unchanged when REDIS_PASSWORD is unset or empty', () => {
    const url = 'redis://localhost:6379';
    expect(resolveRedisUrl(config({ REDIS_URL: url }))).toBe(url);
    expect(resolveRedisUrl(config({ REDIS_URL: url, REDIS_PASSWORD: '' }))).toBe(url);
  });

  it('percent-encodes a password with URL-special characters so every consumer decodes it', () => {
    const url = resolveRedisUrl(
      config({ REDIS_URL: 'redis://redis:6379/0', REDIS_PASSWORD: SPECIAL }),
    ) as string;

    expect(connectionFromUrl(url)).toMatchObject({
      host: 'redis',
      port: 6379,
      db: 0,
      password: SPECIAL,
    });
    const ioredis = new Redis(url, { lazyConnect: true });
    expect(ioredis.options).toMatchObject({ host: 'redis', port: 6379, db: 0, password: SPECIAL });
    ioredis.disconnect();
    // node-redis (cache-manager-redis-yet) decodes userinfo with decodeURIComponent.
    expect(decodeURIComponent(new URL(url).password)).toBe(SPECIAL);
  });

  it('preserves credentials already present in REDIS_URL', () => {
    const url = resolveRedisUrl(
      config({
        REDIS_URL: 'redis://:external_pass@redis:6379',
        REDIS_PASSWORD: 'fallback_pg_pass',
      }),
    ) as string;
    expect(connectionFromUrl(url)).toMatchObject({ password: 'external_pass' });
  });

  it('injects REDIS_PASSWORD when REDIS_URL has no credentials', () => {
    const url = resolveRedisUrl(
      config({ REDIS_URL: 'redis://redis:6379/0', REDIS_PASSWORD: 'custom_redis_pass' }),
    ) as string;
    expect(connectionFromUrl(url)).toMatchObject({ password: 'custom_redis_pass' });
  });
});
