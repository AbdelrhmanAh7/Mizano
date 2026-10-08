import { ConfigService } from '@nestjs/config';

/**
 * The Redis URL the API connects with: REDIS_URL, with REDIS_PASSWORD (when set) as its password.
 * Compose passes the password on its own so it may hold any character; it is percent-encoded
 * here, and every Redis client decodes it again.
 */
export function redisUrlFromConfig(config: ConfigService): string | undefined {
  const url = config.get<string>('REDIS_URL') || undefined;
  const password = config.get<string>('REDIS_PASSWORD');
  if (!url || !password) return url;
  const parsed = new URL(url);
  parsed.password = encodeURIComponent(password);
  return parsed.toString();
}
