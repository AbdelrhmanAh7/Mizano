import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { OllamaTunnelController } from './ollama-tunnel.controller';

const SECRET = 'a-long-random-webhook-secret';
const TUNNEL = 'https://private-host-1234.trycloudflare.com';

function buildController(secret: string | undefined): OllamaTunnelController {
  const config = { get: jest.fn(() => secret) } as unknown as ConfigService;
  return new OllamaTunnelController(config);
}

async function statusOf(promise: Promise<unknown>): Promise<number | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : -1;
  }
}

describe('OllamaTunnelController', () => {
  let fetchMock: jest.Mock;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('POST tunnel-update', () => {
    it('refuses every call when no secret is configured (no fallback secret)', async () => {
      for (const configured of [undefined, '']) {
        const controller = buildController(configured);
        expect(await statusOf(controller.updateTunnel({ secret: '', tunnel_url: TUNNEL }))).toBe(
          HttpStatus.FORBIDDEN,
        );
        expect(
          await statusOf(
            controller.updateTunnel({ secret: undefined as unknown as string, tunnel_url: TUNNEL }),
          ),
        ).toBe(HttpStatus.FORBIDDEN);
        expect(
          await statusOf(controller.updateTunnel({ secret: 'change-me', tunnel_url: TUNNEL })),
        ).toBe(HttpStatus.FORBIDDEN);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a wrong or malformed secret', async () => {
      const controller = buildController(SECRET);
      for (const secret of ['wrong', SECRET + 'x', SECRET.slice(0, -1), '', 12345, null, {}]) {
        expect(
          await statusOf(
            controller.updateTunnel({ secret: secret as unknown as string, tunnel_url: TUNNEL }),
          ),
        ).toBe(HttpStatus.FORBIDDEN);
      }
      expect(await statusOf(controller.updateTunnel(undefined as never))).toBe(
        HttpStatus.FORBIDDEN,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects non-https tunnel URLs', async () => {
      const controller = buildController(SECRET);
      expect(
        await statusOf(controller.updateTunnel({ secret: SECRET, tunnel_url: 'http://x.example' })),
      ).toBe(HttpStatus.BAD_REQUEST);
    });

    it('forwards a valid update to the proxy and never logs the tunnel URL or secret', async () => {
      const controller = buildController(SECRET);
      const result = await controller.updateTunnel({ secret: SECRET, tunnel_url: TUNNEL });

      expect(result).toEqual({ status: 'ok', tunnel_url: TUNNEL });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as [string, { body: string; signal: AbortSignal }];
      expect(JSON.parse(init.body)).toEqual({ tunnel_url: TUNNEL, secret: SECRET });
      expect(init.signal).toBeDefined(); // request timeout

      const logged = JSON.stringify([...logSpy.mock.calls, ...errorSpy.mock.calls]);
      expect(logged).not.toContain('private-host-1234');
      expect(logged).not.toContain(SECRET);
    });

    it('reports a rejecting or unreachable proxy as bad gateway without logging raw errors', async () => {
      const controller = buildController(SECRET);

      fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
      expect(await statusOf(controller.updateTunnel({ secret: SECRET, tunnel_url: TUNNEL }))).toBe(
        HttpStatus.BAD_GATEWAY,
      );

      fetchMock.mockRejectedValueOnce(
        Object.assign(new Error(`connect ECONNREFUSED ${TUNNEL}`), { code: 'ECONNREFUSED' }),
      );
      expect(await statusOf(controller.updateTunnel({ secret: SECRET, tunnel_url: TUNNEL }))).toBe(
        HttpStatus.BAD_GATEWAY,
      );

      for (const call of errorSpy.mock.calls) {
        // a string, not the raw error object (which carries request details)
        expect(typeof call[0]).toBe('string');
        expect(call).toHaveLength(1);
      }
    });

    it('is public (secret-authenticated) and rate limited, not exempt from throttling', () => {
      const handler = OllamaTunnelController.prototype.updateTunnel;
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      const keys = Reflect.getMetadataKeys(handler).map(String);
      expect(keys.some((k) => k.startsWith('THROTTLER:LIMIT'))).toBe(true);
      expect(keys.some((k) => k.startsWith('THROTTLER:SKIP'))).toBe(false);
    });
  });

  describe('GET ollama-status', () => {
    it('requires an admin-level permission', () => {
      expect(
        Reflect.getMetadata(PERMISSIONS_KEY, OllamaTunnelController.prototype.getStatus),
      ).toEqual(['settings.edit']);
      const guards: unknown[] = Reflect.getMetadata(
        '__guards__',
        OllamaTunnelController.prototype.getStatus,
      );
      expect(guards).toHaveLength(2);
    });

    it('never returns the tunnel URL', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          proxy: 'running',
          tunnel_url: TUNNEL,
          ollama_reachable: true,
          timestamp: 't',
        }),
      });
      const status = await buildController(SECRET).getStatus();

      expect(JSON.stringify(status)).not.toContain('private-host-1234');
      expect(status).toEqual({
        proxy: 'running',
        ollama_reachable: true,
        tunnel_configured: true,
        timestamp: 't',
      });
    });

    it('works with the newer proxy health shape and when the proxy is unreachable', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ proxy: 'running', tunnel_configured: false, ollama_reachable: false }),
      });
      expect(await buildController(SECRET).getStatus()).toMatchObject({ tunnel_configured: false });

      fetchMock.mockRejectedValueOnce(new Error('down'));
      expect(await buildController(SECRET).getStatus()).toEqual({
        proxy: 'unreachable',
        ollama_reachable: false,
      });
    });
  });
});
