import { validate } from 'class-validator';
import { IsDecimalString } from './decimal-string';

class Probe {
  @IsDecimalString()
  amount!: string;

  @IsDecimalString(2)
  percent!: string;
}

async function errorsFor(amount: string, percent = '1'): Promise<string[]> {
  const probe = Object.assign(new Probe(), { amount, percent });
  return (await validate(probe)).map((e) => e.property);
}

describe('IsDecimalString', () => {
  it.each(['0', '100', '12.5', '12.5000', '999999999999999', '999999999999999.9999'])(
    'accepts %s',
    async (value) => {
      expect(await errorsFor(value)).toEqual([]);
    },
  );

  it('rejects more than 15 integer digits (Decimal(19, 4) overflow)', async () => {
    expect(await errorsFor('1000000000000000')).toEqual(['amount']);
  });

  it('rejects more than 4 fraction digits', async () => {
    expect(await errorsFor('1.00001')).toEqual(['amount']);
  });

  it('honours a tighter maxDecimals but never exceeds 4', async () => {
    expect(await errorsFor('1', '1.234')).toEqual(['percent']);
    expect(await errorsFor('1', '1.23')).toEqual([]);
  });

  it('rejects negatives, exponents and blanks', async () => {
    for (const bad of ['-1', '1e3', '', '1.', '.5', 'abc']) {
      expect(await errorsFor(bad)).toEqual(['amount']);
    }
  });
});
