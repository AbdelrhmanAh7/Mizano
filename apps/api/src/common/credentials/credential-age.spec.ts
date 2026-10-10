import { classifyCredentialAge } from './credential-age';

// 2026-10-08 minus 89/90/91 days is 2026-07-11/10/09.
const NOW = new Date('2026-10-08T12:00:00.000Z');

describe('classifyCredentialAge (@issue-104)', () => {
  const status = (rotatedAt: string | null | undefined, now = NOW, maxAgeDays?: number): string =>
    classifyCredentialAge('TELEGRAM_BOT_TOKEN', rotatedAt, now, maxAgeDays).status;

  it('AC1: 89 days old is ok, 90 days is due, 91 days is expired', () => {
    expect(status('2026-07-11')).toBe('ok');
    expect(status('2026-07-10')).toBe('due');
    expect(status('2026-07-09')).toBe('expired');
  });

  it('AC1: rotated today is ok', () => {
    expect(status('2026-10-08')).toBe('ok');
  });

  it('AC1: counts whole UTC days, whatever the time of day', () => {
    expect(status('2026-07-10', new Date('2026-10-08T00:00:00.000Z'))).toBe('due');
    expect(status('2026-07-10', new Date('2026-10-08T23:59:59.999Z'))).toBe('due');
    // 23:30 in Cairo (UTC+3) on 2026-10-08 is still 2026-10-08 in UTC.
    expect(status('2026-07-11', new Date('2026-10-08T23:30:00.000+03:00'))).toBe('ok');
  });

  it('AC1: honours a custom maximum age', () => {
    expect(status('2026-09-08', NOW, 30)).toBe('due');
    expect(status('2026-09-07', NOW, 30)).toBe('expired');
    expect(status('2026-09-09', NOW, 30)).toBe('ok');
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['unpadded month', '2026-7-10'],
    ['timestamp, not a date', '2026-07-10T00:00:00Z'],
    ['day-first', '10/07/2026'],
    ['leading space', ' 2026-07-10'],
    ['trailing newline', '2026-07-10\n'],
    ['impossible day', '2026-02-30'],
    ['impossible month', '2026-13-01'],
    ['words', 'last spring'],
    ['in the future', '2026-10-09'],
  ])('AC2: a %s date gives unknown', (_label, rotatedAt) => {
    expect(status(rotatedAt)).toBe('unknown');
  });

  it('AC2: an invalid clock gives unknown', () => {
    expect(status('2026-07-10', new Date(Number.NaN))).toBe('unknown');
  });

  it('returns the credential name with its classification', () => {
    expect(classifyCredentialAge('CLOUDFLARE_TUNNEL_TOKEN', '2026-07-09', NOW)).toEqual({
      name: 'CLOUDFLARE_TUNNEL_TOKEN',
      status: 'expired',
    });
  });
});
