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
import { IpThrottlerGuard, applyTrustProxy } from './throttler-ip.guard';

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
const guard = new TestableGuard(
  { throttlers: [] } as ThrottlerModuleOptions,
  storage,
  new Reflector(),
);

/** Mocked request; the peer defaults to a local proxy (cloudflared / Tailscale serve). */
function req(
  headers: Record<string, string>,
  remoteAddress = '127.0.0.1',
): Record<string, unknown> {
  return { headers, ip: remoteAddress, socket: { remoteAddress } };
}

describe('IpThrottlerGuard.getTracker', () => {
  it('prefers CF-Connecting-IP over X-Forwarded-For', async () => {
    const tracker = await guard.tracker(
      req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' }, '10.0.0.2'),
    );
    expect(tracker).toBe('203.0.113.7');
  });

  it('takes the client-most X-Forwarded-For entry when there is no CF-Connecting-IP', async () => {
    const tracker = await guard.tracker(
      req({ 'x-forwarded-for': '198.51.100.9, 172.16.0.1' }, '127.0.0.1'),
    );
    expect(tracker).toBe('198.51.100.9');
  });

  it('normalizes IPv4-mapped IPv6, whitespace, quotes and brackets', async () => {
    await expect(guard.tracker(req({ 'cf-connecting-ip': '::ffff:203.0.113.7' }))).resolves.toBe(
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
      req({ 'cf-connecting-ip': 'not-an-ip', 'x-forwarded-for': 'unknown' }, '10.0.0.2'),
    );
    expect(tracker).toBe('10.0.0.2');
  });

  it('ignores forged proxy headers from a client that is not a local proxy', async () => {
    const tracker = await guard.tracker(
      req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.9' }, '192.0.2.50'),
    );
    expect(tracker).toBe('192.0.2.50');
  });
});

describe('applyTrustProxy', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [IpEchoController] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    applyTrustProxy(app);
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
