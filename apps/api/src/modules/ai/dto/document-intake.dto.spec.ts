import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ConfirmIntakeDto,
  DECIMAL_STRING_PATTERN,
  ListIntakeJobsDto,
  PERCENT_STRING_PATTERN,
} from './document-intake.dto';

async function invalidLineProps(line: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(ConfirmIntakeDto, {
    type: 'BILL',
    vendorId: 'v1',
    date: '2026-09-01',
    dueDate: '2026-10-01',
    lines: [{ description: 'CPU', ...line }],
  });
  const errors = await validate(dto);
  return errors.flatMap((e) =>
    (e.children ?? []).flatMap((lineErr) => (lineErr.children ?? []).map((c) => c.property)),
  );
}

describe('ConfirmIntakeDto', () => {
  it.each(['0', '999999999999999.9999', '0.00001', '1000000000000000', '1e3', '-1'])(
    'keeps bulk quantity and rate bounds aligned with DTO validation for %s',
    async (value) => {
      const props = await invalidLineProps({ quantity: value, rate: value, taxRatePercent: '14' });
      expect(DECIMAL_STRING_PATTERN.test(value)).toBe(!props.includes('quantity'));
      expect(DECIMAL_STRING_PATTERN.test(value)).toBe(!props.includes('rate'));
    },
  );

  it.each(['0', '14.25', '999999999999999.99', '14.125', '1000000000000000', '1e2', '-1'])(
    'keeps bulk percentage bounds aligned with DTO validation for %s',
    async (value) => {
      const props = await invalidLineProps({ quantity: '1', rate: '100', taxRatePercent: value });
      expect(PERCENT_STRING_PATTERN.test(value)).toBe(!props.includes('taxRatePercent'));
    },
  );

  it('accepts decimal strings for quantity, rate and percentages', async () => {
    expect(
      await invalidLineProps({
        quantity: '2',
        rate: '100.50',
        taxRatePercent: '14',
        discountPercent: '0',
      }),
    ).toEqual([]);
  });

  it('rejects JS numbers for money (no float transport)', async () => {
    const props = await invalidLineProps({ quantity: 2, rate: 100, taxRatePercent: 14 });
    expect(props).toEqual(expect.arrayContaining(['quantity', 'rate', 'taxRatePercent']));
  });

  it('rejects negative, exponent and over-precise values', async () => {
    const props = await invalidLineProps({
      quantity: '-1',
      rate: '1e3',
      taxRatePercent: '14.125',
    });
    expect(props).toEqual(expect.arrayContaining(['quantity', 'rate', 'taxRatePercent']));
  });
});

describe('ListIntakeJobsDto', () => {
  it('transforms comma-separated inbox statuses and validates them', async () => {
    const dto = plainToInstance(ListIntakeJobsDto, { status: 'EXTRACTED,NEEDS_REVIEW' });
    expect(dto.status).toEqual(['EXTRACTED', 'NEEDS_REVIEW']);
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects unknown statuses after transformation', async () => {
    const dto = plainToInstance(ListIntakeJobsDto, { status: 'EXTRACTED,UNKNOWN' });
    expect((await validate(dto)).map((error) => error.property)).toEqual(['status']);
  });
});
