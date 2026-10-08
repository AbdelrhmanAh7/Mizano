import { readFileSync } from 'fs';
import { resolve } from 'path';
import { BadRequestException, Logger } from '@nestjs/common';
import { CacheService } from '../../../cache/cache.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from './email.service';
import { PdfService } from './pdf.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const XSS = '<script>alert(1)</script>';

interface WhereClause {
  id?: string;
  payrollRun?: { organizationId?: string };
}

/** Tenant-aware fake: payslip-1 belongs to ORG_A; lookups must be scoped to find it. */
function buildPrisma(): Record<string, Record<string, jest.Mock>> {
  const payslipRow = {
    id: 'payslip-1',
    netPay: { toString: () => '1000' },
    netSalary: { toString: () => '1000' },
    employee: { name: 'Sara', email: 'sara@org-a.example' },
    payrollRun: { month: 9, year: 2026, periodStart: null, periodEnd: null, payDate: null },
  };
  return {
    payslip: {
      findFirst: jest.fn(({ where }: { where: WhereClause }) =>
        Promise.resolve(
          where.id === 'payslip-1' && where.payrollRun?.organizationId === ORG_A
            ? payslipRow
            : null,
        ),
      ),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: ORG_A, name: 'Org A', primaryColor: null }),
    },
    emailLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    payrollRun: {
      findFirst: jest.fn().mockResolvedValue({
        payslips: [{ id: 'payslip-1', employeeId: 'emp-1', employee: {} }],
      }),
    },
    invoice: { findFirst: jest.fn() },
  };
}

describe('EmailService.sendPayslip tenant scoping', () => {
  let prisma: Record<string, Record<string, jest.Mock>>;
  let pdf: { generatePayslipPdf: jest.Mock };
  let service: EmailService;
  let sendEmail: jest.SpyInstance;

  beforeEach(() => {
    prisma = buildPrisma();
    pdf = { generatePayslipPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')) };
    service = new EmailService(
      prisma as unknown as PrismaService,
      pdf as unknown as PdfService,
      { get: jest.fn(), set: jest.fn() } as unknown as CacheService,
    );
    sendEmail = jest
      .spyOn(service as unknown as { sendEmail: () => Promise<void> }, 'sendEmail')
      .mockResolvedValue(undefined);
  });

  it('requires an organization id and touches nothing without it', async () => {
    await expect(service.sendPayslip('', 'payslip-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.sendPayslip(undefined as unknown as string, 'payslip-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payslip.findFirst).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('looks the payslip up through its payroll run organization', async () => {
    const result = await service.sendPayslip(ORG_A, 'payslip-1');

    expect(result.success).toBe(true);
    expect(prisma.payslip.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payslip-1', payrollRun: { organizationId: ORG_A } },
      }),
    );
    expect(pdf.generatePayslipPdf).toHaveBeenCalledWith(ORG_A, 'payslip-1');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("cannot send, or even see, another organization's payslip", async () => {
    const result = await service.sendPayslip(ORG_B, 'payslip-1');

    expect(result).toEqual({ success: false, error: 'Payslip not found' });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(pdf.generatePayslipPdf).not.toHaveBeenCalled();
  });

  it("the failure path is scoped too: another tenant's employee e-mail is never read or logged", async () => {
    await service.sendPayslip(ORG_B, 'payslip-1');

    // every payslip lookup (main + failure path) carried the caller's organization
    for (const [arg] of prisma.payslip.findFirst.mock.calls as Array<[{ where: WhereClause }]>) {
      expect(arg.where.payrollRun).toEqual({ organizationId: ORG_B });
    }
    const log = (prisma.emailLog.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(log).toMatchObject({
      to: 'unknown',
      entityType: 'payslip',
      entityId: 'payslip-1',
      status: 'failed',
      organizationId: ORG_B,
    });
    expect(JSON.stringify(log)).not.toContain('sara@org-a.example');
  });

  it('sendAllPayslips forwards the organization to every payslip send', async () => {
    const spy = jest.spyOn(service, 'sendPayslip').mockResolvedValue({ success: true });
    const result = await service.sendAllPayslips(ORG_A, 'run-1');

    expect(prisma.payrollRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'run-1', organizationId: ORG_A } }),
    );
    expect(spy).toHaveBeenCalledWith(ORG_A, 'payslip-1', expect.any(Object));
    expect(result).toMatchObject({ total: 1, sent: 1, failed: 0 });
  });
});

describe('EmailService HTML safety', () => {
  it('escapes organization, customer and document fields in the e-mail body', async () => {
    const prisma = buildPrisma();
    prisma.invoice.findFirst.mockResolvedValue({
      invoiceNumber: `INV-${XSS}`,
      date: new Date('2026-09-01'),
      dueDate: new Date('2026-10-01'),
      grandTotal: { toString: () => '10' },
      currencyCode: 'SAR',
      customer: { name: `Cust ${XSS}`, email: 'c@example.com' },
    });
    prisma.organization.findUnique.mockResolvedValue({
      id: ORG_A,
      name: `Org ${XSS}`,
      primaryColor: 'red;} body{background:url(http://evil.example)}',
    });
    const service = new EmailService(
      prisma as unknown as PrismaService,
      {
        generateInvoicePdf: jest.fn(),
      } as unknown as PdfService,
      { get: jest.fn(), set: jest.fn() } as unknown as CacheService,
    );
    const sendEmail = jest
      .spyOn(
        service as unknown as {
          sendEmail: (org: string, options: { html: string }) => Promise<void>;
        },
        'sendEmail',
      )
      .mockResolvedValue(undefined);

    await service.sendInvoice(ORG_A, 'inv-1', { to: 'c@example.com', attachPdf: false } as never);

    const html = sendEmail.mock.calls[0][1].html;
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('evil.example');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('EmailService.checkVolumeAnomaly', () => {
  const orgId = 'org-123';
  const stateKey = `notify-volume-${orgId}`;
  const origEnv = process.env;
  let prisma: { emailLog: { count: jest.Mock; findFirst: jest.Mock } };
  let cache: Map<string, unknown>;
  let cacheSet: jest.Mock;
  let service: EmailService;
  let fetchSpy: jest.SpyInstance;

  /** Midnight UTC, `days` full days before today. */
  function utcDaysAgo(days: number): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - days);
    return d;
  }

  /** `today`: attempts so far today; `history`: attempts in the 30 full days before today. */
  function mockCounts(today: number, history = 0): void {
    prisma.emailLog.count.mockImplementation(({ where }: { where: { sentAt: { lt?: Date } } }) =>
      Promise.resolve(where.sentAt.lt ? history : today),
    );
  }

  function telegramText(call = 0): string {
    const body = JSON.parse(fetchSpy.mock.calls[call][1].body as string) as { text: string };
    return body.text;
  }

  beforeEach(() => {
    process.env = {
      ...origEnv,
      NOTIFY_ANOMALY_MIN_DAILY: '50',
      TELEGRAM_BOT_TOKEN: 'token',
      TELEGRAM_ALERT_CHAT_ID: '123',
    };
    prisma = { emailLog: { count: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) } };
    cache = new Map();
    cacheSet = jest.fn((key: string, value: unknown) => {
      cache.set(key, value);
      return Promise.resolve();
    });
    service = new EmailService(
      prisma as unknown as PrismaService,
      {} as PdfService,
      {
        get: jest.fn((key: string) => Promise.resolve(cache.get(key) ?? null)),
        set: cacheSet,
      } as unknown as CacheService,
    );
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
  });

  afterEach(() => {
    process.env = origEnv;
    jest.restoreAllMocks();
  });

  it('@issue-105 AC1: cold start: with no history only the floor applies and the first attempt over it alerts', async () => {
    mockCounts(51);

    await service.checkVolumeAnomaly(orgId);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(telegramText()).toContain('ALERT');
    expect(telegramText()).toContain('Count: 51');
    expect(telegramText()).toContain('Threshold: 50');
  });

  it('@issue-105 AC1: cold start: reaching the floor exactly is not an anomaly', async () => {
    mockCounts(50);

    await service.checkVolumeAnomaly(orgId);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('@issue-105 AC1: zero baseline inside the warm-up (5 full days) keeps the floor', async () => {
    prisma.emailLog.findFirst.mockResolvedValue({ sentAt: utcDaysAgo(5) });
    mockCounts(60, 1); // 0.2/day, so 2 x baseline rounds to 0: the floor must win

    await service.checkVolumeAnomaly(orgId);

    expect(telegramText()).toContain('Threshold: 50');
  });

  it('@issue-105 AC1: warm-up boundary: 7 full days of history still use the floor', async () => {
    prisma.emailLog.findFirst.mockResolvedValue({ sentAt: utcDaysAgo(7) });
    mockCounts(85, 280); // 40/day: the ratio would give 80

    await service.checkVolumeAnomaly(orgId);

    expect(telegramText()).toContain('Threshold: 50');
  });

  it('@issue-105 AC1: warm-up boundary: 8 full days of history switch to 2 x baseline', async () => {
    prisma.emailLog.findFirst.mockResolvedValue({ sentAt: utcDaysAgo(8) });
    mockCounts(85, 320); // 40/day: max(50, 80) = 80

    await service.checkVolumeAnomaly(orgId);

    expect(telegramText()).toContain('Threshold: 80');
  });

  it('@issue-105 AC1: after the warm-up a low baseline falls back to the floor (floor versus ratio)', async () => {
    prisma.emailLog.findFirst.mockResolvedValue({ sentAt: utcDaysAgo(20) });
    mockCounts(55, 100); // 5/day: 2 x baseline = 10 < floor 50

    await service.checkVolumeAnomaly(orgId);

    expect(telegramText()).toContain('Threshold: 50');
  });

  it('@issue-105 AC1: the baseline never averages over more than 30 full days', async () => {
    prisma.emailLog.findFirst.mockResolvedValue({ sentAt: utcDaysAgo(400) });
    mockCounts(130, 1800); // 1800 / 30 days = 60/day: threshold 120, not 1800 / 400

    await service.checkVolumeAnomaly(orgId);

    expect(telegramText()).toContain('Threshold: 120');
  });

  it('@issue-105 AC2: alert text carries the count and threshold only: no invoice data or addresses', async () => {
    mockCounts(100);

    await service.checkVolumeAnomaly(orgId);

    expect(telegramText()).not.toMatch(/@|INV-|\.com/);
    expect(telegramText()).toBe(
      '[Mizano] ALERT: Outbound invoice email volume anomaly. Count: 100, Threshold: 50',
    );

    mockCounts(10);
    await service.checkVolumeAnomaly(orgId);

    expect(telegramText(1)).toBe(
      '[Mizano] RECOVERED: Outbound invoice email volume back to normal. Count: 10, Threshold: 50',
    );
  });

  it('@issue-105 AC1: an invalid NOTIFY_ANOMALY_MIN_DAILY falls back to the default floor of 50', async () => {
    process.env.NOTIFY_ANOMALY_MIN_DAILY = 'lots';
    mockCounts(51);

    await service.checkVolumeAnomaly(orgId);

    expect(telegramText()).toContain('Threshold: 50');
  });

  it('@issue-105 AC1: a zero floor is rejected so a quiet tenant never alerts on its first send', async () => {
    process.env.NOTIFY_ANOMALY_MIN_DAILY = '0';
    mockCounts(1);

    await service.checkVolumeAnomaly(orgId);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('@issue-105 AC1: alerts once while failing and once on recovery', async () => {
    mockCounts(60);
    await service.checkVolumeAnomaly(orgId);
    await service.checkVolumeAnomaly(orgId);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    mockCounts(40);
    await service.checkVolumeAnomaly(orgId);
    await service.checkVolumeAnomaly(orgId);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(telegramText(1)).toContain('RECOVERED');
  });

  it('@issue-105 AC1: keeps the dedupe state well past the 5-minute cache default', async () => {
    mockCounts(60);

    await service.checkVolumeAnomaly(orgId);

    expect(cacheSet).toHaveBeenCalledWith(
      stateKey,
      true,
      expect.objectContaining({ ttl: expect.any(Number) }),
    );
    const { ttl } = cacheSet.mock.calls[0][2] as { ttl: number };
    expect(ttl).toBeGreaterThanOrEqual(24 * 60 * 60);
  });

  it('@issue-105 AC1: bounds the Telegram call with a timeout signal', async () => {
    mockCounts(60);

    await service.checkVolumeAnomaly(orgId);

    const init = fetchSpy.mock.calls[0][1] as { signal?: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('@issue-105 AC1: does not record the alert when Telegram rejects it, so the next check retries', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 502 } as unknown as Response);
    mockCounts(60);

    await service.checkVolumeAnomaly(orgId);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(cacheSet).not.toHaveBeenCalled();

    await service.checkVolumeAnomaly(orgId); // delivered this time
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(cacheSet).toHaveBeenCalledTimes(1);

    await service.checkVolumeAnomaly(orgId); // now deduped
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('@issue-105 AC1: a timed-out Telegram call neither throws nor records the alert', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('This operation was aborted'));
    mockCounts(60);

    await expect(service.checkVolumeAnomaly(orgId)).resolves.toBeUndefined();

    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('@issue-105 AC1: retries the recovery message until Telegram accepts it', async () => {
    mockCounts(60);
    await service.checkVolumeAnomaly(orgId); // ALERT delivered

    mockCounts(40);
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 } as unknown as Response);
    await service.checkVolumeAnomaly(orgId); // RECOVERED rejected
    expect(cache.get(stateKey)).toBe(true);

    await service.checkVolumeAnomaly(orgId); // RECOVERED delivered
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(telegramText(2)).toContain('RECOVERED');
    expect(cache.get(stateKey)).toBe(false);
  });

  it('@issue-105 AC1: without a Telegram chat id nothing is sent or recorded', async () => {
    delete process.env.TELEGRAM_ALERT_CHAT_ID;
    mockCounts(60);

    await service.checkVolumeAnomaly(orgId);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cacheSet).not.toHaveBeenCalled();
  });
});

describe('Pi deployment wiring for the volume anomaly alert', () => {
  const repoRoot = resolve(__dirname, '../../../../../..');
  const read = (relative: string): string => readFileSync(resolve(repoRoot, relative), 'utf8');

  it('@issue-105 AC1: the api service receives the threshold, bot token and alert chat id', () => {
    const compose = read('deploy/pi/docker-compose.pi.yml');
    const api = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  web:'));
    for (const name of [
      'NOTIFY_ANOMALY_MIN_DAILY',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_ALERT_CHAT_ID',
    ]) {
      expect(api).toContain(`${name}: \${${name}`);
    }
  });

  it('@issue-105 AC1: the example env file documents the threshold with the default of 50', () => {
    expect(read('deploy/pi/.env.pi.example')).toMatch(/^NOTIFY_ANOMALY_MIN_DAILY=50\r?$/m);
  });
});

describe('EmailService.sendInvoice anomaly check isolation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('a failing check is logged without the raw error and the send still succeeds', async () => {
    const prisma = buildPrisma();
    prisma.invoice.findFirst.mockResolvedValue({
      invoiceNumber: 'INV-001',
      date: new Date('2026-09-01'),
      dueDate: new Date('2026-10-01'),
      grandTotal: { toString: () => '10' },
      currencyCode: 'SAR',
      customer: { name: 'Cust', email: 'c@example.com' },
    });
    const rawError = new Error('query failed for to = c@example.com');
    prisma.emailLog.count.mockRejectedValue(rawError);
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new EmailService(
      prisma as unknown as PrismaService,
      {} as PdfService,
      { get: jest.fn(), set: jest.fn() } as unknown as CacheService,
    );
    jest
      .spyOn(service as unknown as { sendEmail: () => Promise<void> }, 'sendEmail')
      .mockResolvedValue(undefined);

    const result = await service.sendInvoice(ORG_A, 'inv-1', {
      to: 'c@example.com',
      attachPdf: false,
    } as never);

    expect(result.success).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith('Volume anomaly check failed: Error');
    for (const call of errorSpy.mock.calls) {
      for (const arg of call) {
        expect(typeof arg).toBe('string');
        expect(arg).not.toContain(rawError.message);
      }
    }
  });
});
