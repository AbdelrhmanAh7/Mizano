import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StatementQueryDto, resolveStatementPeriod } from './documents.dto';

// Same options as the global pipe in main.ts
const check = (query: Record<string, unknown>) =>
  validate(plainToInstance(StatementQueryDto, query, { enableImplicitConversion: true }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('StatementQueryDto', () => {
  it('accepts a request without a period (was a 400 on every bare statement download)', async () => {
    expect(await check({})).toEqual([]);
  });

  it('accepts a full period', async () => {
    expect(await check({ dateFrom: '2026-01-01', dateTo: '2026-03-31' })).toEqual([]);
  });

  it('still rejects malformed dates', async () => {
    expect((await check({ dateFrom: 'yesterday' })).map((e) => e.property)).toEqual(['dateFrom']);
    expect((await check({ dateTo: '31/12/2026' })).map((e) => e.property)).toEqual(['dateTo']);
  });
});

describe('resolveStatementPeriod', () => {
  const now = new Date('2026-10-24T12:00:00Z');

  it('defaults to year to date', () => {
    expect(resolveStatementPeriod({}, now)).toEqual({
      dateFrom: new Date('2026-01-01T00:00:00Z'),
      dateTo: now,
    });
  });

  it('starts the default period in the year of a given end date', () => {
    expect(resolveStatementPeriod({ dateTo: '2025-06-30' }, now)).toEqual({
      dateFrom: new Date('2025-01-01T00:00:00Z'),
      dateTo: new Date('2025-06-30'),
    });
  });

  it('keeps explicit dates untouched', () => {
    expect(resolveStatementPeriod({ dateFrom: '2026-02-01', dateTo: '2026-02-28' }, now)).toEqual({
      dateFrom: new Date('2026-02-01'),
      dateTo: new Date('2026-02-28'),
    });
  });

  it('defaults only the missing end', () => {
    expect(resolveStatementPeriod({ dateFrom: '2026-02-01' }, now)).toEqual({
      dateFrom: new Date('2026-02-01'),
      dateTo: now,
    });
  });
});
