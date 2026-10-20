/**
 * The Redis URL every API consumer connects with (cache store, direct ioredis
 * client, BullMQ). Docker Compose cannot percent-encode, so the production
 * stacks pass a credential-free REDIS_URL plus a raw REDIS_PASSWORD (#183/#251);
 * the password is encoded into the URL here so any character is safe.
 *
 * If REDIS_URL already carries credentials (e.g. an external/managed Redis URL
 * with embedded password), those credentials are preserved so that compose's
 * fallback REDIS_PASSWORD (from POSTGRES_PASSWORD) does not overwrite them.
 */
export function resolveRedisUrl(config: {
  get(key: string): string | undefined;
}): string | undefined {
  const raw = config.get('REDIS_URL');
  if (!raw) return undefined;
  const url = new URL(raw);
  if (url.password) return raw;
  const password = config.get('REDIS_PASSWORD');
  if (!password) return raw;
  // The setter leaves '%' alone, so pre-encoding yields an exact round trip.
  url.password = encodeURIComponent(password);
  return url.toString();
}
