import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTaxRateDto } from './create-tax-rate.dto';
import { UpdateTaxRateDto } from './update-tax-rate.dto';

const base = { name: 'VAT', linkedAccountId: 'acc-1' };

async function createErrors(rate: string): Promise<string[]> {
  const dto = plainToInstance(CreateTaxRateDto, { ...base, rate });
  return (await validate(dto)).map((e) => e.property);
}

async function updateErrors(rate: string): Promise<string[]> {
  const dto = plainToInstance(UpdateTaxRateDto, { rate });
  return (await validate(dto)).map((e) => e.property);
}

describe('Tax rate DTOs: rate', () => {
  it.each(['0', '14', '15.5', '100'])('create accepts %s', async (rate) => {
    expect(await createErrors(rate)).toEqual([]);
  });

  it.each(['abc', '-5', '1e3', '14.123', ''])(
    'create rejects %p with a validation error',
    async (rate) => {
      expect(await createErrors(rate)).toContain('rate');
    },
  );

  it.each(['abc', '-5', '15.555'])('update rejects %p with a validation error', async (rate) => {
    expect(await updateErrors(rate)).toContain('rate');
  });

  it('update accepts a valid rate and an omitted rate', async () => {
    expect(await updateErrors('15')).toEqual([]);
    const dto = plainToInstance(UpdateTaxRateDto, { isDefault: true });
    expect(await validate(dto)).toEqual([]);
  });
});
