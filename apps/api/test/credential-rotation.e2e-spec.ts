/**
 * Credential-age check (#104) through the real app: host token rotation dates come from the
 * environment via ConfigService, each organization's SMTP password is stamped server-side by
 * PATCH /organization/settings/email, and every boot logs one line with credential names and
 * classifications only, never a credential value.
 */
import { INestApplication, Logger } from '@nestjs/common';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';

// 2026-10-08 minus 89/90/91 days is 2026-07-11/10/09.
const BOOT_NOW = new Date('2026-10-08T12:00:00.000Z');
const LINE_PREFIX = 'Credential age check';

const suffix = uniqueSuffix();
const TELEGRAM_SECRET = `tg-sentinel-${suffix}`;
const TUNNEL_SECRET = `cf-sentinel-${suffix}`;
const SMTP_SECRET = `smtp-sentinel-${suffix}`;
const SMTP_SECRET_2 = `smtp-sentinel-2-${suffix}`;

/** Every timer API except Date, so only the clock is frozen while the app boots. */
const REAL_TIMERS = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

describe('Credential rotation (e2e) @issue-104', () => {
  let app: INestApplication;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tenantC: TestTenant;
  const captured: string[] = [];
  const credentialLines: Array<{ level: string; text: string }> = [];
  const restorers: Array<() => void> = [];
  const savedEnv: Record<string, string | undefined> = {};

  function setEnv(key: string, value: string): void {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  function capture(): void {
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      const original = Logger.prototype[level];
      const spy = jest
        .spyOn(Logger.prototype, level)
        .mockImplementation(function (this: Logger, message: unknown, ...rest: unknown[]) {
          const text = [message, ...rest].map((part) => String(part)).join(' ');
          captured.push(text);
          if (text.includes(LINE_PREFIX)) credentialLines.push({ level, text });
          return original.call(this, message, ...rest);
        });
      restorers.push(() => spy.mockRestore());
    }
    for (const stream of [process.stdout, process.stderr]) {
      const original = stream.write.bind(stream);
      const spy = jest.spyOn(stream, 'write').mockImplementation(((chunk: unknown, ...rest: []) => {
        captured.push(String(chunk));
        return original(chunk as string, ...rest);
      }) as typeof stream.write);
      restorers.push(() => spy.mockRestore());
    }
  }

  async function rotatedAt(organizationId: string): Promise<Date | null> {
    const rows = await getPrisma(app).$queryRawUnsafe<Array<{ smtpPasswordRotatedAt: Date | null }>>(
      'SELECT "smtpPasswordRotatedAt" FROM "organizations" WHERE "id" = $1',
      organizationId,
    );
    expect(rows).toHaveLength(1);
    return rows[0].smtpPasswordRotatedAt;
  }

  async function setRotatedAt(organizationId: string, value: Date | null): Promise<void> {
    await getPrisma(app).$executeRawUnsafe(
      'UPDATE "organizations" SET "smtpPasswordRotatedAt" = $1 WHERE "id" = $2',
      value,
      organizationId,
    );
  }

  /** Boots a second app with the clock frozen at BOOT_NOW and returns the one line it logged. */
  async function bootAndReadLine(): Promise<{ level: string; entries: Map<string, string> }> {
    credentialLines.length = 0;
    jest.useFakeTimers({ now: BOOT_NOW, doNotFake: [...REAL_TIMERS] });
    let booted: INestApplication;
    try {
      booted = await createTestApp();
    } finally {
      jest.useRealTimers();
    }
    await booted.close();
    expect(credentialLines).toHaveLength(1);
    const { level, text } = credentialLines[0];
    const body = text.slice(text.indexOf(': ') + 2);
    const entries = new Map(
      body.split(', ').map((entry) => {
        const at = entry.lastIndexOf('=');
        return [entry.slice(0, at), entry.slice(at + 1)] as [string, string];
      }),
    );
    return { level, entries };
  }

  beforeAll(async () => {
    capture();
    setEnv('TELEGRAM_BOT_TOKEN', TELEGRAM_SECRET);
    setEnv('CLOUDFLARE_TUNNEL_TOKEN', TUNNEL_SECRET);
    setEnv('TELEGRAM_BOT_CREDENTIAL_ROTATED_AT', '2026-07-11'); // 89 days at BOOT_NOW
    setEnv('CLOUDFLARE_TUNNEL_CREDENTIAL_ROTATED_AT', '2026-07-09'); // 91 days at BOOT_NOW
    app = await createTestApp();
    tenantA = await registerTenant(app, 'RotationA');
    tenantB = await registerTenant(app, 'RotationB');
    tenantC = await registerTenant(app, 'RotationC');
  });

  afterAll(async () => {
    await app.close();
    restorers.forEach((restore) => restore());
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('@e2e @flow:credential-rotation @issue-104 AC3: changing the SMTP password stamps smtpPasswordRotatedAt server-side', async () => {
    expect(await rotatedAt(tenantA.organizationId)).toBeNull();

    const before = Date.now();
    const res = await tenantA.api
      .patch('/organization/settings/email')
      .send({ smtpHost: 'smtp.example.test', smtpUser: 'mailer', smtpPassword: SMTP_SECRET });
    expect(res.status).toBe(200);
    const after = Date.now();

    const stamped = await rotatedAt(tenantA.organizationId);
    expect(stamped).toBeInstanceOf(Date);
    expect(stamped!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(stamped!.getTime()).toBeLessThanOrEqual(after + 1000);
    expect(JSON.stringify(res.body)).not.toContain(SMTP_SECRET);
  });

  it('@e2e @flow:credential-rotation @issue-104 AC3: the stamp moves only when the password actually changes', async () => {
    const marker = new Date('2026-01-15T00:00:00.000Z');
    await setRotatedAt(tenantA.organizationId, marker);

    const otherFields = await tenantA.api
      .patch('/organization/settings/email')
      .send({ smtpHost: 'smtp2.example.test' });
    expect(otherFields.status).toBe(200);
    expect((await rotatedAt(tenantA.organizationId))?.toISOString()).toBe(marker.toISOString());

    const samePassword = await tenantA.api
      .patch('/organization/settings/email')
      .send({ smtpPassword: SMTP_SECRET });
    expect(samePassword.status).toBe(200);
    expect((await rotatedAt(tenantA.organizationId))?.toISOString()).toBe(marker.toISOString());

    const newPassword = await tenantA.api
      .patch('/organization/settings/email')
      .send({ smtpPassword: SMTP_SECRET_2 });
    expect(newPassword.status).toBe(200);
    expect((await rotatedAt(tenantA.organizationId))!.getTime()).toBeGreaterThan(marker.getTime());

    // Another tenant's settings are untouched.
    expect(await rotatedAt(tenantB.organizationId)).toBeNull();
  });

  it('@e2e @flow:credential-rotation @issue-104 AC3: a client cannot supply smtpPasswordRotatedAt', async () => {
    const marker = new Date('2026-02-01T00:00:00.000Z');
    await setRotatedAt(tenantA.organizationId, marker);

    const res = await tenantA.api
      .patch('/organization/settings/email')
      .send({ smtpPasswordRotatedAt: '2030-01-01' });
    expect(res.status).toBe(400);
    expect((await rotatedAt(tenantA.organizationId))?.toISOString()).toBe(marker.toISOString());
  });

  it('@e2e @flow:credential-rotation @issue-104 AC1 AC4: each boot logs one line classifying host tokens (89/91 days) and SMTP passwords (90 days, legacy, none)', async () => {
    // A: password rotated 90 days before the boot date -> due.
    await setRotatedAt(tenantA.organizationId, new Date('2026-07-10T09:30:00.000Z'));
    // B: password set before rotation tracking existed (no stamp) -> unknown.
    const setB = await tenantB.api
      .patch('/organization/settings/email')
      .send({ smtpPassword: SMTP_SECRET });
    expect(setB.status).toBe(200);
    await setRotatedAt(tenantB.organizationId, null);
    // C: no SMTP password at all -> not a credential, not listed.

    const { level, entries } = await bootAndReadLine();

    expect(level).toBe('warn');
    expect(entries.get('TELEGRAM_BOT')).toBe('ok');
    expect(entries.get('CLOUDFLARE_TUNNEL')).toBe('expired');
    expect(entries.get(`SMTP_PASSWORD[org=${tenantA.organizationId}]`)).toBe('due');
    expect(entries.get(`SMTP_PASSWORD[org=${tenantB.organizationId}]`)).toBe('unknown');
    expect(entries.has(`SMTP_PASSWORD[org=${tenantC.organizationId}]`)).toBe(false);
    for (const value of entries.values()) {
      expect(['ok', 'due', 'expired', 'unknown']).toContain(value);
    }
  });

  it('@e2e @flow:credential-rotation @issue-104 AC2: a malformed or missing host rotation date is unknown', async () => {
    setEnv('TELEGRAM_BOT_CREDENTIAL_ROTATED_AT', '2026-7-11');
    setEnv('CLOUDFLARE_TUNNEL_CREDENTIAL_ROTATED_AT', '');

    const { level, entries } = await bootAndReadLine();

    expect(level).toBe('warn');
    expect(entries.get('TELEGRAM_BOT')).toBe('unknown');
    expect(entries.get('CLOUDFLARE_TUNNEL')).toBe('unknown');
  });

  it('@e2e @flow:credential-rotation @issue-104 AC5: no credential value appears in any log output', () => {
    expect(captured.some((text) => text.includes(LINE_PREFIX))).toBe(true);
    const all = captured.join('\n');
    for (const secret of [TELEGRAM_SECRET, TUNNEL_SECRET, SMTP_SECRET, SMTP_SECRET_2]) {
      expect(all).not.toContain(secret);
    }
  });
});
