import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckPossibleDuplicateBillsDto } from './check-possible-duplicate-bills.dto';

/** Same transform options as the global ValidationPipe in main.ts. */
async function invalidProps(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CheckPossibleDuplicateBillsDto, body, {
    enableImplicitConversion: true,
  });
  return (await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).map(
    (e) => e.property,
  );
}

describe('CheckPossibleDuplicateBillsDto', () => {
  it('accepts a decimal-string draft with a calendar date and currency', async () => {
    expect(
      await invalidProps({
        vendorName: 'شركة الأمل',
        amount: '100.10',
        date: '2026-10-06',
        currency: 'EGP',
      }),
    ).toEqual([]);
  });

  it('rejects JSON numbers for the amount despite implicit conversion', async () => {
    expect(await invalidProps({ amount: 100.1 })).toEqual(['amount']);
  });

  it('rejects exponent, negative and over-precise amounts', async () => {
    for (const amount of ['1e2', '-1', '1.12345', 'Infinity']) {
      expect(await invalidProps({ amount })).toEqual(['amount']);
    }
  });

  it('accepts only date-only values, not timestamps', async () => {
    for (const date of ['2026-10-06T23:30:00-02:00', '2026-10-06Tgarbage', '06/10/2026']) {
      expect(await invalidProps({ date })).toEqual(['date']);
    }
  });

  it('requires a three-letter currency code', async () => {
    expect(await invalidProps({ currency: 'EGPX' })).toEqual(['currency']);
  });
});
