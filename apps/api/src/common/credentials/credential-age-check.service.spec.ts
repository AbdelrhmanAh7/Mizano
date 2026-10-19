import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CredentialAgeCheckService } from './credential-age-check.service';

const NOW = new Date('2026-10-08T12:00:00.000Z');
const TELEGRAM_SECRET = 'tg-secret-value-123';
const TUNNEL_SECRET = 'tunnel-secret-value-456';

describe('CredentialAgeCheckService (@issue-104)', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  let log: jest.SpyInstance;
  const findMany = jest.fn();

  function build(env: Record<string, string | undefined>): CredentialAgeCheckService {
    const config = { get: (key: string) => env[key] } as unknown as ConfigService;
    const prisma = { organization: { findMany } } as unknown as PrismaService;
    return new CredentialAgeCheckService(config, prisma);
  }

  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('skips a Telegram token that is not configured, even with a stale rotation date', async () => {
    const results = await build({
      TELEGRAM_BOT_TOKEN: '',
      TELEGRAM_BOT_TOKEN_CREDENTIAL_ROTATED_AT: '2026-10-01',
      CLOUDFLARE_TUNNEL_TOKEN_CREDENTIAL_ROTATED_AT: '2026-10-01',
    }).check(NOW);

    expect(results.map((r) => r.name)).toEqual(['CLOUDFLARE_TUNNEL_TOKEN']);
  });

  it('classifies the Telegram token when it is configured, and the tunnel token always', async () => {
    const results = await build({
      TELEGRAM_BOT_TOKEN: TELEGRAM_SECRET,
      TELEGRAM_BOT_TOKEN_CREDENTIAL_ROTATED_AT: '2026-07-11',
    }).check(NOW);

    expect(results.map((r) => `${r.name}=${r.status}`)).toEqual([
      'TELEGRAM_BOT_TOKEN=ok',
      'CLOUDFLARE_TUNNEL_TOKEN=unknown',
    ]);
  });

  it('still logs the host lines once when the SMTP lookup fails (column not migrated yet)', async () => {
    findMany.mockRejectedValue(new Error(`column smtpPasswordRotatedAt missing ${TUNNEL_SECRET}`));

    await build({
      TELEGRAM_BOT_TOKEN: TELEGRAM_SECRET,
      TELEGRAM_BOT_TOKEN_CREDENTIAL_ROTATED_AT: '2026-07-11',
      CLOUDFLARE_TUNNEL_TOKEN_CREDENTIAL_ROTATED_AT: '2026-07-09',
    }).check(NOW);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain(
      'TELEGRAM_BOT_TOKEN=ok, CLOUDFLARE_TUNNEL_TOKEN=expired, SMTP_PASSWORD=unknown',
    );
    expect(error).toHaveBeenCalledTimes(1);
    // The lookup error text (which carries a secret-looking value) must not reach any log call.
    const output = JSON.stringify([...warn.mock.calls, ...error.mock.calls, ...log.mock.calls]);
    expect(output).not.toContain(TUNNEL_SECRET);
    expect(output).not.toContain(TELEGRAM_SECRET);
    expect(output).not.toContain('missing');
  });

  it('logs exactly one warn line and no value, even when every credential is ok', async () => {
    findMany.mockResolvedValue([
      { id: 'org1', smtpPasswordRotatedAt: new Date('2026-10-08T01:00:00.000Z') },
    ]);

    await build({
      TELEGRAM_BOT_TOKEN: TELEGRAM_SECRET,
      CLOUDFLARE_TUNNEL_TOKEN: TUNNEL_SECRET,
      TELEGRAM_BOT_TOKEN_CREDENTIAL_ROTATED_AT: '2026-10-08',
      CLOUDFLARE_TUNNEL_TOKEN_CREDENTIAL_ROTATED_AT: '2026-10-08',
    }).check(NOW);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
    const output = JSON.stringify([...warn.mock.calls, ...error.mock.calls, ...log.mock.calls]);
    expect(output).not.toContain(TELEGRAM_SECRET);
    expect(output).not.toContain(TUNNEL_SECRET);
    expect(warn.mock.calls[0][0]).toContain('SMTP_PASSWORD[org=org1]=ok');
  });
});
