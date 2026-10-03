import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmIntakeDto } from './document-intake.dto';

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

  // The scan page (apps/web .../bills/scan/page.tsx) sends fixed 4-dp quantity/rate, but a tax
  // PERCENTAGE only up to 2 dp: padding it to '14.0000' is a 400 for every scanned line.
  it('accepts what the scan page sends and rejects a 4-dp tax percentage', async () => {
    expect(
      await invalidLineProps({
        quantity: '1.0000',
        rate: '999999999999999.9999',
        taxRatePercent: '14.5',
      }),
    ).toEqual([]);
    expect(
      await invalidLineProps({ quantity: '1.0000', rate: '10.0000', taxRatePercent: '14.0000' }),
    ).toEqual(['taxRatePercent']);
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
