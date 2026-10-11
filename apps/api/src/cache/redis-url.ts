/**
 * The Redis URL every API consumer connects with (cache store, direct ioredis
 * client, BullMQ). Docker Compose cannot percent-encode, so the production
 * stacks pass a credential-free REDIS_URL plus a raw REDIS_PASSWORD (#183);
 * the password is encoded into the URL here so any character is safe.
 */
export function resolveRedisUrl(config: {
  get(key: string): string | undefined;
}): string | undefined {
  const raw = config.get('REDIS_URL');
  if (!raw) return undefined;
  const password = config.get('REDIS_PASSWORD');
  if (!password) return raw;
  const url = new URL(raw);
  // The setter leaves '%' alone, so pre-encoding yields an exact round trip.
  url.password = encodeURIComponent(password);
  return url.toString();
}
