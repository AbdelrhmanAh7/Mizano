import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import {
  DEFAULT_TRUST_PROXY_HOPS,
  parseTrustProxyHops,
  TrustProxyService,
} from './trust-proxy.service';

describe('parseTrustProxyHops', () => {
  it('defaults to one proxy hop when unset or blank', () => {
    expect(parseTrustProxyHops(undefined)).toBe(DEFAULT_TRUST_PROXY_HOPS);
    expect(parseTrustProxyHops('  ')).toBe(1);
  });

  it('accepts 0 (trust no forwarded header) up to 10 hops', () => {
    expect(parseTrustProxyHops('0')).toBe(0);
    expect(parseTrustProxyHops('2')).toBe(2);
    expect(parseTrustProxyHops('10')).toBe(10);
  });

  it.each(['-1', '11', '1.5', 'true', 'loopback'])('rejects %s', (raw) => {
    expect(() => parseTrustProxyHops(raw)).toThrow('TRUST_PROXY_HOPS');
  });
});

describe('TrustProxyService', () => {
  function serviceWith(hops: string | undefined, instance: unknown): TrustProxyService {
    const adapterHost = {
      httpAdapter: { getInstance: () => instance },
    } as unknown as HttpAdapterHost;
    const config = { get: () => hops } as unknown as ConfigService;
    return new TrustProxyService(adapterHost, config);
  }

  it('sets the Express trust proxy hop count on init', () => {
    const set = jest.fn();
    serviceWith('2', { set }).onModuleInit();
    expect(set).toHaveBeenCalledWith('trust proxy', 2);
  });

  it('fails startup on an invalid TRUST_PROXY_HOPS instead of guessing', () => {
    expect(() => serviceWith('all', { set: jest.fn() }).onModuleInit()).toThrow('TRUST_PROXY_HOPS');
  });

  it('does nothing when there is no Express instance (e.g. a standalone context)', () => {
    expect(() => serviceWith('1', undefined).onModuleInit()).not.toThrow();
  });
});
