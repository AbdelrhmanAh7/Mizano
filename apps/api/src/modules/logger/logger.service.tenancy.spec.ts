import { Logger } from '@nestjs/common';
import { LogLevel, LogSource, LogStatus } from '@mizano/shared-types';
import { LoggerService } from './logger.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function captureError(
  service: LoggerService,
  organizationId: string | undefined,
  message = 'Boom',
  extra: Partial<Parameters<LoggerService['capture']>[0]> = {},
): ReturnType<LoggerService['capture']> {
  return service.capture({
    level: LogLevel.ERROR,
    source: LogSource.BACKEND,
    message,
    organizationId,
    ...extra,
  });
}

describe('LoggerService tenant isolation', () => {
  let service: LoggerService;

  beforeEach(() => {
    service = new LoggerService();
  });

  it("never returns another organization's logs", () => {
    captureError(service, ORG_A, 'A secret failure');
    captureError(service, ORG_B, 'B secret failure');

    expect(service.getLogs(ORG_A).map((l) => l.message)).toEqual(['A secret failure']);
    expect(service.getLogs(ORG_B).map((l) => l.message)).toEqual(['B secret failure']);
  });

  it('does not expose entries without an organization to any tenant', () => {
    captureError(service, undefined, 'unauthenticated route failure');

    expect(service.getLogs(ORG_A)).toEqual([]);
    expect(service.getStats(ORG_A).totalErrors).toBe(0);
    expect(service.getLogs('')).toEqual([]);
    expect(service.getLogs(undefined as unknown as string)).toEqual([]);
  });

  it('keeps identical errors from different tenants as separate records', () => {
    const a = captureError(service, ORG_A, 'Connection timeout', { context: { who: 'a' } });
    const b = captureError(service, ORG_B, 'Connection timeout', { context: { who: 'b' } });

    expect(a.id).not.toBe(b.id);
    expect(service.getLogs(ORG_A)[0].context).toEqual({ who: 'a' });
    expect(service.getLogs(ORG_B)[0].context).toEqual({ who: 'b' });

    captureError(service, ORG_A, 'Connection timeout');
    expect(service.getLogs(ORG_A)[0].occurrences).toBe(2);
    expect(service.getLogs(ORG_B)[0].occurrences).toBe(1);
  });

  it('getById only resolves ids that belong to the caller', () => {
    const a = captureError(service, ORG_A);
    expect(service.getById(ORG_A, a.id)).toBeDefined();
    expect(service.getById(ORG_B, a.id)).toBeUndefined();
    expect(service.getById('', a.id)).toBeUndefined();
  });

  it("updateStatus cannot touch another organization's entries", () => {
    const a = captureError(service, ORG_A);

    expect(service.updateStatus(ORG_B, [a.id], LogStatus.FIXED)).toBe(0);
    expect(service.getById(ORG_A, a.id)?.status).toBe(LogStatus.OPEN);
    expect(service.updateStatus(ORG_A, [a.id], LogStatus.FIXED)).toBe(1);
  });

  it("clearLogs only deletes the caller's entries (with and without filters)", () => {
    const a = captureError(service, ORG_A, 'A1');
    captureError(service, ORG_B, 'Bravo failure');
    captureError(service, ORG_B, 'Bravo other failure');

    // by id from the wrong tenant: nothing happens
    expect(service.clearLogs(ORG_B, { ids: [a.id] })).toBe(0);
    expect(service.getLogs(ORG_A)).toHaveLength(1);

    // clear everything for B leaves A untouched
    expect(service.clearLogs(ORG_B)).toBe(2);
    expect(service.getLogs(ORG_B)).toHaveLength(0);
    expect(service.getLogs(ORG_A)).toHaveLength(1);

    // unauthenticated / empty organization can never wipe the store
    expect(service.clearLogs('')).toBe(0);
    expect(service.clearLogs('', {})).toBe(0);
    expect(service.getLogs(ORG_A)).toHaveLength(1);
  });

  it('an empty filter object clears the whole organization (the web "Clear all"), nobody else', () => {
    captureError(service, ORG_A, 'Alpha failure');
    captureError(service, ORG_A, 'Alpha other failure');
    captureError(service, ORG_B, 'Bravo failure');

    expect(service.clearLogs(ORG_A, {})).toBe(2);
    expect(service.getLogs(ORG_A)).toHaveLength(0);
    expect(service.getLogs(ORG_B)).toHaveLength(1);
  });

  it('an explicitly empty id list removes nothing', () => {
    captureError(service, ORG_A, 'Alpha failure');
    expect(service.clearLogs(ORG_A, { ids: [] })).toBe(0);
    expect(service.getLogs(ORG_A)).toHaveLength(1);
  });

  it('generatePrompt ignores ids from other organizations', () => {
    const a = captureError(service, ORG_A, 'Tenant A internal detail');

    const prompt = service.generatePrompt(ORG_B, [a.id]);
    expect(prompt.logCount).toBe(0);
    expect(prompt.prompt).toBe('No errors selected.');
    expect(prompt.prompt).not.toContain('Tenant A');
  });

  it("getStats counts only the caller's entries", () => {
    captureError(service, ORG_A);
    captureError(service, ORG_B, 'other failure one');
    captureError(service, ORG_B, 'other failure two');

    expect(service.getStats(ORG_A).totalErrors).toBe(1);
    expect(service.getStats(ORG_B).totalErrors).toBe(2);
  });

  it("a noisy organization cannot evict another organization's entries", () => {
    (service as unknown as { maxLogsPerOrg: number }).maxLogsPerOrg = 3;

    captureError(service, ORG_A, 'A survivor');
    // digits are normalised in fingerprints, so vary the letters to get distinct records
    for (let i = 0; i < 10; i++) {
      captureError(service, ORG_B, `B flood ${String.fromCharCode(97 + i).repeat(3)}`);
    }

    expect(service.getLogs(ORG_A).map((l) => l.message)).toEqual(['A survivor']);
    expect(service.getLogs(ORG_B)).toHaveLength(3);
  });
});

describe('LoggerService stores and prints only redacted data', () => {
  let service: LoggerService;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new LoggerService();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('masks credentials in message, stack and context before storing', () => {
    const entry = captureError(
      service,
      ORG_A,
      'Request failed: Authorization: Bearer abcdef123456 password=hunter2',
      {
        stack: 'Error: x\n    at fn (token=sk-secret-value)',
        context: {
          password: 'hunter2',
          apiKey: 'key-1',
          nested: { refreshToken: 'r-1', ok: 'fine' },
        },
      },
    );

    const stored = JSON.stringify(entry);
    for (const leaked of ['abcdef123456', 'hunter2', 'sk-secret-value', 'key-1', 'r-1']) {
      expect(stored).not.toContain(leaked);
    }
    expect(stored).toContain('"ok":"fine"');
  });

  it('truncates oversized client-supplied fields', () => {
    const entry = captureError(service, ORG_A, 'm'.repeat(10_000), {
      stack: 's'.repeat(50_000),
      url: '/x?' + 'u'.repeat(5000),
      userAgent: 'ua'.repeat(1000),
      method: 'POST'.repeat(20),
      filePaths: Array.from({ length: 100 }, () => 'f'.repeat(1000)),
    });

    expect(entry.message.length).toBeLessThan(2100);
    expect((entry.stack ?? '').length).toBeLessThan(8100);
    expect((entry.url ?? '').length).toBeLessThan(600);
    expect((entry.userAgent ?? '').length).toBeLessThanOrEqual(255);
    expect((entry.method ?? '').length).toBeLessThanOrEqual(16);
    expect(entry.filePaths).toHaveLength(20);
    expect(entry.filePaths?.[0].length).toBeLessThanOrEqual(300);
  });

  it('does not print client-supplied (frontend/AI) messages to the server log', () => {
    service.capture({
      level: LogLevel.ERROR,
      source: LogSource.FRONTEND,
      message: 'Invoice INV-77 for ACME total 12,500.00 failed to render',
      stack: 'Error: Invoice INV-77\n    at render',
      organizationId: ORG_A,
    });
    service.capture({
      level: LogLevel.WARN,
      source: LogSource.AI_MODEL,
      message: 'Model echoed vendor tax id 300-123-456',
      organizationId: ORG_A,
    });

    const printed = JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls]);
    expect(printed).not.toContain('INV-77');
    expect(printed).not.toContain('12,500.00');
    expect(printed).not.toContain('300-123-456');
    expect(printed).toContain('fingerprint=');
  });

  it('captureException redacts credentials in the message and the rebuilt stack', () => {
    const error = new Error('Login failed password=hunter2');
    const entry = service.captureException(error, LogSource.BACKEND, undefined, {
      organizationId: ORG_A,
    });

    expect(entry.organizationId).toBe(ORG_A);
    expect(entry.stack).toBeDefined();
    expect(entry.message).not.toContain('hunter2');
    expect(entry.stack?.split('\n')[0]).not.toContain('hunter2');
  });
});
