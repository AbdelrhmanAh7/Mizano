import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePriceListDto, UpdatePriceListDto } from './price-list.dto';

const errorsOf = async (cls: new () => object, body: object): Promise<string[]> =>
  (await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true })).map(
    (e) => e.property,
  );

describe('price list DTOs', () => {
  it('accepts a percentage markdown with custom item prices', async () => {
    expect(
      await errorsOf(CreatePriceListDto, {
        name: 'Wholesale',
        type: 'PERCENTAGE',
        adjustment: '-10',
        items: [{ itemId: 'item-1', customPrice: '95.50' }],
      }),
    ).toEqual([]);
  });

  it('rejects the old web payload (no adjustment, unknown type) instead of a 500', async () => {
    expect(await errorsOf(CreatePriceListDto, { name: 'Wholesale', type: 'SALES' })).toEqual(
      expect.arrayContaining(['type', 'adjustment']),
    );
  });

  it('rejects float or over-precise amounts', async () => {
    expect(
      await errorsOf(CreatePriceListDto, {
        name: 'x',
        type: 'FIXED',
        adjustment: 5,
        items: [{ itemId: 'item-1', customPrice: '1.23456' }],
      }),
    ).toEqual(expect.arrayContaining(['adjustment', 'items']));
  });

  it('forbids tenant and relation fields on update', async () => {
    expect(await errorsOf(UpdatePriceListDto, { organizationId: 'org-2' })).toEqual([
      'organizationId',
    ]);
  });
});
