import { Injectable } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BlockList, isIP } from 'net';

/** Loopback only (Tailscale serve). Other proxies, e.g. cloudflared, come from TRUSTED_PROXY_CIDRS. */
const DEFAULT_TRUSTED_CIDRS = ['127.0.0.0/8', '::1/128'];

/** Proxies allowed to set X-Forwarded-For; any other peer is keyed on its own socket address. */
export interface TrustedProxies {
  readonly cidrs: readonly string[];
  isTrusted(ip: string | undefined): boolean;
}

/** Loopback plus the comma-separated CIDRs in `raw`; throws on an invalid entry. */
export function parseTrustedProxies(raw: string | undefined): TrustedProxies {
  const extra = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const cidrs = [...DEFAULT_TRUSTED_CIDRS, ...extra];
  const list = new BlockList();
  for (const cidr of cidrs) {
    const [addr, prefixText, ...rest] = cidr.split('/');
    const family = isIP(addr);
    const max = family === 6 ? 128 : 32;
    const prefix =
      prefixText === undefined ? max : /^\d{1,3}$/.test(prefixText) ? +prefixText : NaN;
    if (!family || rest.length || !(prefix <= max)) {
      throw new Error(`TRUSTED_PROXY_CIDRS: invalid CIDR "${cidr}"`);
    }
    list.addSubnet(addr, prefix, family === 6 ? 'ipv6' : 'ipv4');
  }
  return {
    cidrs,
    isTrusted: (ip) => ip !== undefined && list.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4'),
  };
}

let fromEnv: TrustedProxies | undefined;

/** The process-wide list, parsed once from TRUSTED_PROXY_CIDRS. */
export function trustedProxies(): TrustedProxies {
  fromEnv ??= parseTrustedProxies(process.env.TRUSTED_PROXY_CIDRS);
  return fromEnv;
}

/** Makes Express' req.ip (audit logs) the forwarded client IP, trusting the same proxies. */
export function applyTrustProxy(
  app: NestExpressApplication,
  proxies: TrustedProxies = trustedProxies(),
): void {
  app.set('trust proxy', (addr: string) => proxies.isTrusted(normalizeIp(addr)));
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

/**
 * Right-most X-Forwarded-For entry that is not a trusted proxy. Proxies append the peer they saw,
 * so everything left of it is client-supplied and forgeable. Undefined when any hop is not an IP
 * or every hop is trusted: the left-most entry is then client-chosen, so the caller uses the peer.
 */
function clientFromForwardedFor(value: unknown, proxies: TrustedProxies): string | undefined {
  if (typeof value !== 'string') return undefined;
  const hops = value.split(',').map(normalizeIp);
  if (hops.includes(undefined)) return undefined;
  for (let i = hops.length - 1; i >= 0; i--) {
    if (!proxies.isTrusted(hops[i])) return hops[i];
  }
  return undefined;
}

function firstHeader(headers: Record<string, unknown> | undefined, name: string): unknown {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Behind Cloudflare / Tailscale serve every request arrives from the proxy, so keying the
 * throttler on the socket address put all users in one bucket (one client locked everyone out).
 * Throttles per client IP instead. From a trusted proxy: the right-most X-Forwarded-For entry
 * that is not a trusted proxy (Cloudflare's edge and Tailscale serve both append the client).
 * CF-Connecting-IP is ignored: only Cloudflare overwrites it, so via Tailscale serve it is
 * client-supplied and rotating it would give a fresh bucket per attempt. Otherwise the socket
 * address, so requests without proxy headers never share one bucket.
 */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected readonly proxies: TrustedProxies = trustedProxies();

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const socket = req.socket as { remoteAddress?: string } | undefined;
    const peer = normalizeIp(socket?.remoteAddress);
    if (this.proxies.isTrusted(peer)) {
      const headers = req.headers as Record<string, unknown> | undefined;
      const client = clientFromForwardedFor(firstHeader(headers, 'x-forwarded-for'), this.proxies);
      if (client) return client;
    }
    return peer ?? normalizeIp(req.ip) ?? 'unknown';
  }
}
