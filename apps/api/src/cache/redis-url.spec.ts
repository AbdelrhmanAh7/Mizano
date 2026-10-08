import { ConfigService } from '@nestjs/config';
import { connectionFromUrl } from '../modules/ai/intake/intake-queue.service';
import { redisUrlFromConfig } from './redis-url';

function config(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('redisUrlFromConfig', () => {
  it('returns undefined without REDIS_URL, even when a password is set', () => {
    expect(redisUrlFromConfig(config({}))).toBeUndefined();
    expect(redisUrlFromConfig(config({ REDIS_URL: '', REDIS_PASSWORD: 'x' }))).toBeUndefined();
  });

  it('returns REDIS_URL unchanged without REDIS_PASSWORD', () => {
    expect(redisUrlFromConfig(config({ REDIS_URL: 'redis://redis:6379' }))).toBe(
      'redis://redis:6379',
    );
    expect(redisUrlFromConfig(config({ REDIS_URL: 'redis://:inline@redis:6379' }))).toBe(
      'redis://:inline@redis:6379',
    );
  });

  it('adds REDIS_PASSWORD to the URL, keeping host, port and database', () => {
    expect(
      redisUrlFromConfig(config({ REDIS_URL: 'redis://redis:6379/2', REDIS_PASSWORD: 'hex123' })),
    ).toBe('redis://:hex123@redis:6379/2');
  });

  it('encodes a password with URL characters so Redis clients decode it back exactly', () => {
    // The deploy workflow's POSTGRES_PASSWORD (the fallback) may hold any of these (issue #132).
    const password = 'p/@:%x y#?+=$';
    const url = redisUrlFromConfig(
      config({ REDIS_URL: 'redis://redis:6379', REDIS_PASSWORD: password }),
    );
    expect(url).toBeDefined();
    expect(connectionFromUrl(url as string)).toMatchObject({
      host: 'redis',
      port: 6379,
      password,
    });
  });
});
