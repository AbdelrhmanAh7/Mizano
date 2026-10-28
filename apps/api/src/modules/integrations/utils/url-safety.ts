import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { BlockList, isIP } from 'net';

/**
 * Webhook destinations are customer-supplied, so they are an SSRF vector into the Pi's own
 * network. Outside explicit local testing (INTEGRATIONS_ALLOW_PRIVATE_WEBHOOKS=true) a
 * destination must be HTTPS and must not resolve to loopback, link-local, private or CGNAT
 * addresses. The check runs when the endpoint is saved and again before every attempt (DNS can
 * change), and redirects are never followed.
 */
const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

export function privateWebhooksAllowed(): boolean {
  return process.env.INTEGRATIONS_ALLOW_PRIVATE_WEBHOOKS === 'true';
}

export function isPrivateAddress(ip: string): boolean {
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) is judged by its IPv4 part. (A ::ffff:0:0/96 subnet in
  // BlockList would also match every plain IPv4 address, so it is unwrapped here instead.)
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (/^::ffff:/i.test(ip)) return true;
  const family = isIP(ip);
  if (family === 0) return false;
  return blocked.check(ip, family === 6 ? 'ipv6' : 'ipv4');
}

/** Syntax and scheme only (no DNS); throws 400 with a reason. */
export function parseWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('Webhook URL is not a valid URL');
  }
  const allowPrivate = privateWebhooksAllowed();
  if (url.protocol !== 'https:' && !(allowPrivate && url.protocol === 'http:')) {
    throw new BadRequestException('Webhook URL must use https');
  }
  if (url.username || url.password) {
    throw new BadRequestException('Webhook URL must not contain credentials');
  }
  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || isPrivateAddress(host)) {
      throw new BadRequestException('Webhook URL must be a public address');
    }
  }
  return url;
}

/** Full check including DNS resolution of the host. */
export async function assertPublicWebhookUrl(
  raw: string,
  resolve: (host: string) => Promise<{ address: string }[]> = (host) =>
    lookup(host, { all: true, verbatim: true }),
): Promise<URL> {
  const url = parseWebhookUrl(raw);
  if (privateWebhooksAllowed()) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return url;
  let addresses: { address: string }[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new BadRequestException('Webhook host does not resolve');
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new BadRequestException('Webhook URL must resolve to a public address');
  }
  return url;
}
