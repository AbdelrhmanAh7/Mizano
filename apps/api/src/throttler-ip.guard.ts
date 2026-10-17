import { Injectable } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BlockList, isIP } from 'net';

/**
 * Proxies that may set client-IP headers: the ones every deployment uses (cloudflared on the
 * private Docker network, Tailscale serve on loopback). A client reaching the API directly from
 * any other address cannot forge its IP. Loopback, link-local and unique-local ranges.
 */
const TRUSTED_PROXIES = new BlockList();
TRUSTED_PROXIES.addSubnet('127.0.0.0', 8, 'ipv4');
TRUSTED_PROXIES.addSubnet('10.0.0.0', 8, 'ipv4');
TRUSTED_PROXIES.addSubnet('172.16.0.0', 12, 'ipv4');
TRUSTED_PROXIES.addSubnet('192.168.0.0', 16, 'ipv4');
TRUSTED_PROXIES.addSubnet('169.254.0.0', 16, 'ipv4');
TRUSTED_PROXIES.addAddress('::1', 'ipv6');
TRUSTED_PROXIES.addSubnet('fc00::', 7, 'ipv6');
TRUSTED_PROXIES.addSubnet('fe80::', 10, 'ipv6');

/** Makes Express' req.ip (audit logs) the forwarded client IP, trusting the same proxies. */
export function applyTrustProxy(app: NestExpressApplication): void {
  app.set('trust proxy', (addr: string) => isTrustedProxy(normalizeIp(addr)));
}

/** Trims quotes/brackets, unwraps IPv4-mapped IPv6; undefined when the value is not an IP. */
function normalizeIp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const ip = value
    .trim()
    .replace(/^["'[]+|["'\]]+$/g, '')
    .replace(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i, '$1');
  return isIP(ip) ? ip : undefined;
}

function isTrustedProxy(ip: string | undefined): boolean {
  return ip !== undefined && TRUSTED_PROXIES.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
}

/**
 * Right-most X-Forwarded-For entry that is not a trusted proxy. Proxies append the peer they saw,
 * so everything left of it is client-supplied and forgeable: taking the first entry would let a
 * client pick a fresh bucket per request. Same rule Express applies to req.ip.
 */
function clientFromForwardedFor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const hops = value.split(',').map(normalizeIp);
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i];
    if (hop === undefined) return undefined;
    if (!isTrustedProxy(hop)) return hop;
  }
  return hops[0];
}

function firstHeader(headers: Record<string, unknown> | undefined, name: string): unknown {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Behind Cloudflare / Tailscale serve every request arrives from the proxy, so keying the
 * throttler on the socket address put all users in one bucket (one client locked everyone out).
 * Throttles per client IP instead. From a trusted proxy: CF-Connecting-IP (set by Cloudflare),
 * else the right-most X-Forwarded-For entry that is not a trusted proxy. Otherwise the socket address, so requests without
 * proxy headers never share one bucket.
 */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const socket = req.socket as { remoteAddress?: string } | undefined;
    const peer = normalizeIp(socket?.remoteAddress);
    if (isTrustedProxy(peer)) {
      const headers = req.headers as Record<string, unknown> | undefined;
      const forwardedFor = firstHeader(headers, 'x-forwarded-for');
      const client =
        normalizeIp(firstHeader(headers, 'cf-connecting-ip')) ??
        clientFromForwardedFor(forwardedFor);
      if (client) return client;
    }
    return peer ?? normalizeIp(req.ip) ?? 'unknown';
  }
}
