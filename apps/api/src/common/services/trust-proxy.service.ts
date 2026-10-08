import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';

/** Default: one proxy (nginx, cloudflared or the Next.js server) sits in front of the API. */
export const DEFAULT_TRUST_PROXY_HOPS = 1;
const MAX_TRUST_PROXY_HOPS = 10;

/**
 * Parses TRUST_PROXY_HOPS: how many proxies in front of the API may set X-Forwarded-For.
 * Express then takes `req.ip` from that many hops back, so the throttler counts each client
 * instead of sharing one limit across everyone behind the proxy. 0 trusts no header.
 */
export function parseTrustProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TRUST_PROXY_HOPS;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > MAX_TRUST_PROXY_HOPS) {
    throw new Error(`TRUST_PROXY_HOPS must be an integer from 0 to ${MAX_TRUST_PROXY_HOPS}`);
  }
  return hops;
}

/**
 * Applies the Express `trust proxy` setting during module init, so every boot path (main.ts
 * and the e2e test app alike) resolves client addresses the same way before any request.
 */
@Injectable()
export class TrustProxyService implements OnModuleInit {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const hops = parseTrustProxyHops(this.config.get<string>('TRUST_PROXY_HOPS'));
    const instance: unknown = this.adapterHost.httpAdapter?.getInstance();
    if (instance && typeof (instance as { set?: unknown }).set === 'function') {
      (instance as { set: (name: string, value: number) => void }).set('trust proxy', hops);
    }
  }
}
