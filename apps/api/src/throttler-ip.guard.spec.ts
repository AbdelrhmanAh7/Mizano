import { Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  Throttle,
  ThrottlerModule,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { Request } from 'express';
import * as request from 'supertest';
import { IpThrottlerGuard, applyTrustProxy, parseTrustedProxies } from './throttler-ip.guard';

class TestableGuard extends IpThrottlerGuard {
  tracker(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req);
  }
}

@Controller()
class IpEchoController {
  @Get('ip')
  ip(@Req() req: Request): { ip: string | undefined } {
    return { ip: req.ip };
  }
}

@Controller('auth')
@Throttle({ short: { ttl: 60_000, limit: 5 } })
class LoginStubController {
  @Post('login')
  @HttpCode(401)
  login(): { message: string } {
    return { message: 'Invalid email or password' };
  }
}

const storage: ThrottlerStorage = { increment: jest.fn() };
const guardArgs = [{ throttlers: [] } as ThrottlerModuleOptions, storage, new Reflector()] as const;
const guard = new TestableGuard(...guardArgs);

/** Guard trusting loopback plus `cidrs`, as TRUSTED_PROXY_CIDRS would configure it. */
function guardTrusting(cidrs: string): TestableGuard {
  return new (class extends TestableGuard {
    protected readonly proxies = parseTrustedProxies(cidrs);
  })(...guardArgs);
}

/** Mocked request; the peer defaults to a local proxy (cloudflared / Tailscale serve). */
function req(
  headers: Record<string, string>,
  remoteAddress = '127.0.0.1',
): Record<string, unknown> {
  return { headers, ip: remoteAddress, socket: { remoteAddress } };
}

describe('IpThrottlerGuard.getTracker', () => {
  it('ignores CF-Connecting-IP and keys on X-Forwarded-For (both Cloudflare and Tailscale append the client)', async () => {
    const tracker = await guard.tracker(
      req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' }, '127.0.0.1'),
    );
    expect(tracker).toBe('198.51.100.9');
  });

  it('cannot be bypassed by rotating a client-supplied CF-Connecting-IP through a trusted proxy', async () => {
    const trackers = await Promise.all(
      ['203.0.113.1', '203.0.113.2', '203.0.113.3'].map((forged) =>
        guard.tracker(
          req({ 'cf-connecting-ip': forged, 'x-forwarded-for': '100.101.102.103' }, '127.0.0.1'),
        ),
      ),
    );
    expect(new Set(trackers)).toEqual(new Set(['100.101.102.103']));
    await expect(guard.tracker(req({ 'cf-connecting-ip': '203.0.113.9' }))).resolves.toBe(
      '127.0.0.1',
    );
  });

  it('takes the client entry of X-Forwarded-For (right-most non-proxy) ', async () => {
    const tracker = await guardTrusting('172.16.0.0/12').tracker(
      req({ 'x-forwarded-for': '198.51.100.9, 172.16.0.1' }, '127.0.0.1'),
    );
    expect(tracker).toBe('198.51.100.9');
  });

  it('cannot be bypassed by a client-supplied X-Forwarded-For prefix', async () => {
    const real = '198.51.100.9';
    const trackers = await Promise.all(
      ['203.0.113.1', '203.0.113.2', '203.0.113.3'].map((forged) =>
        guard.tracker(req({ 'x-forwarded-for': `${forged}, ${real}` }, '127.0.0.1')),
      ),
    );
    expect(new Set(trackers)).toEqual(new Set([real]));
    await expect(
      guard.tracker(req({ 'x-forwarded-for': `${real}, 203.0.113.1, 127.0.0.1` }, '127.0.0.1')),
    ).resolves.toBe('203.0.113.1');
  });

  it('normalizes IPv4-mapped IPv6, whitespace, quotes and brackets', async () => {
    await expect(guard.tracker(req({ 'x-forwarded-for': '::ffff:203.0.113.7' }))).resolves.toBe(
      '203.0.113.7',
    );
    await expect(guard.tracker(req({ 'x-forwarded-for': ' 203.0.113.7 ' }))).resolves.toBe(
      '203.0.113.7',
    );
    await expect(guard.tracker(req({ 'x-forwarded-for': '"[2001:db8::1]"' }))).resolves.toBe(
      '2001:db8::1',
    );
  });

  it('gives two different client IPs two different trackers', async () => {
    const a = await guard.tracker(req({ 'x-forwarded-for': '198.51.100.9' }, '127.0.0.1'));
    const b = await guard.tracker(req({ 'x-forwarded-for': '198.51.100.10' }, '127.0.0.1'));
    expect(a).not.toBe(b);
  });

  it('falls back to the socket address when no proxy header is present', async () => {
    const a = await guard.tracker(req({}, '192.0.2.1'));
    const b = await guard.tracker({ headers: {}, socket: { remoteAddress: '::ffff:192.0.2.2' } });
    expect(a).toBe('192.0.2.1');
    expect(b).toBe('192.0.2.2');
    expect(a).not.toBe(b);
  });

  it('ignores a proxy header that is not an IP address', async () => {
    const tracker = await guard.tracker(
      req({ 'cf-connecting-ip': 'not-an-ip', 'x-forwarded-for': 'unknown' }, '127.0.0.1'),
    );
    expect(tracker).toBe('127.0.0.1');
    await expect(
      guard.tracker(req({ 'x-forwarded-for': '198.51.100.9, not-an-ip' }, '127.0.0.1')),
    ).resolves.toBe('127.0.0.1');
  });

  it.each(['10.0.0.2', '172.17.0.5', '192.168.1.10'])(
    'by default keys a private peer %s on its socket address, ignoring rotated X-Forwarded-For',
    async (peer) => {
      const trackers = await Promise.all(
        ['203.0.113.1', '203.0.113.2', '10.9.9.9'].map((forged) =>
          guard.tracker(req({ 'x-forwarded-for': forged }, peer)),
        ),
      );
      expect(new Set(trackers)).toEqual(new Set([peer]));
    },
  );

  it('with TRUSTED_PROXY_CIDRS=172.18.0.0/16 a peer at 172.18.0.3 gets the right-most untrusted hop', async () => {
    const previous = process.env.TRUSTED_PROXY_CIDRS;
    process.env.TRUSTED_PROXY_CIDRS = '172.18.0.0/16';
    try {
      let fresh: typeof import('./throttler-ip.guard') | undefined;
      jest.isolateModules(() => {
        fresh = jest.requireActual<typeof import('./throttler-ip.guard')>('./throttler-ip.guard');
      });
      const envGuard = new fresh!.IpThrottlerGuard(...guardArgs) as unknown as TestableGuard;
      const tracker = await TestableGuard.prototype.tracker.call(
        envGuard,
        req({ 'x-forwarded-for': '203.0.113.1, 198.51.100.9, 172.18.0.7' }, '172.18.0.3'),
      );
      expect(tracker).toBe('198.51.100.9');
    } finally {
      if (previous === undefined) delete process.env.TRUSTED_PROXY_CIDRS;
      else process.env.TRUSTED_PROXY_CIDRS = previous;
    }
  });

  it('returns the peer, not the client-chosen left-most entry, when every hop is trusted', async () => {
    const tracker = await guardTrusting('10.0.0.0/8').tracker(
      req({ 'x-forwarded-for': '10.0.0.9, 127.0.0.1' }, '127.0.0.1'),
    );
    expect(tracker).toBe('127.0.0.1');
  });

  it('ignores forged proxy headers from a client that is not a local proxy', async () => {
    const tracker = await guard.tracker(
      req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' }, '192.0.2.50'),
    );
    expect(tracker).toBe('192.0.2.50');
  });
});

describe('parseTrustedProxies', () => {
  it('trusts loopback only by default', () => {
    const proxies = parseTrustedProxies(undefined);
    expect(proxies.cidrs).toEqual(['127.0.0.0/8', '::1/128']);
    expect(['127.0.0.1', '::1'].map((ip) => proxies.isTrusted(ip))).toEqual([true, true]);
    expect(['10.0.0.2', '172.17.0.5', '192.168.1.10', 'fd00::1'].some(proxies.isTrusted)).toBe(
      false,
    );
  });

  it('adds comma-separated CIDRs and bare addresses', () => {
    const proxies = parseTrustedProxies(' 172.18.0.0/16 , 192.168.5.7,fd00::/8');
    expect(proxies.cidrs).toEqual([
      '127.0.0.0/8',
      '::1/128',
      '172.18.0.0/16',
      '192.168.5.7',
      'fd00::/8',
    ]);
    expect(['172.18.200.1', '192.168.5.7', 'fd00::1'].every(proxies.isTrusted)).toBe(true);
    expect(['172.19.0.1', '192.168.5.8'].some(proxies.isTrusted)).toBe(false);
  });

  it.each([
    '10.0.0.0/33',
    '10.0.0.0/',
    '10.0.0/8',
    'not-a-cidr',
    '::/129',
    '10.0.0.0/8/1',
    '10.0.0.0/-1',
  ])('rejects the invalid CIDR %s', (cidr) => {
    expect(() => parseTrustedProxies(cidr)).toThrow(`TRUSTED_PROXY_CIDRS: invalid CIDR "${cidr}"`);
  });
});

describe('applyTrustProxy', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [IpEchoController] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    applyTrustProxy(app, parseTrustedProxies('172.16.0.0/12'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('makes req.ip the forwarded client IP instead of the proxy address', async () => {
    const res = await request(app.getHttpServer())
      .get('/ip')
      .set('X-Forwarded-For', '198.51.100.9, 172.16.0.1');
    expect(res.body.ip).toBe('198.51.100.9');
  });
});

describe('IpThrottlerGuard as the global guard', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'short', ttl: 1000, limit: 30 }])],
      controllers: [LoginStubController],
      providers: [{ provide: APP_GUARD, useClass: IpThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const loginFrom = async (ip: string): Promise<number> =>
    (await request(app.getHttpServer()).post('/auth/login').set('X-Forwarded-For', ip)).status;

  it('throttles login per forwarded client IP, with no global lockout', async () => {
    const burst: number[] = [];
    for (let i = 0; i < 6; i++) burst.push(await loginFrom('198.51.100.1'));
    expect(burst).toEqual([401, 401, 401, 401, 401, 429]);

    expect(await loginFrom('198.51.100.2')).toBe(401);
    expect(await loginFrom('198.51.100.1')).toBe(429);
    expect(await loginFrom('198.51.100.2')).toBe(401);
  });
});
