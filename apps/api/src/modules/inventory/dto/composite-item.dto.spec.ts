import { pipeErrors, pipeTransform } from '../../../test/helpers/validation-pipe';
import {
  AssembleCompositeItemDto,
  CompositeAvailabilityQueryDto,
  CreateCompositeItemDto,
  UpdateCompositeItemDto,
} from './composite-item.dto';

const fields = (messages: string[]): string[] => messages.map((m) => m.split(' ')[0]);

describe('Composite item DTOs (through the app ValidationPipe)', () => {
  const valid = {
    name: 'Desktop bundle',
    sku: 'BNDL-001',
    sellingPrice: '1500.00',
    description: 'PC with screen',
    components: [
      { itemId: 'item-1', quantity: 1 },
      { itemId: 'item-2', quantity: 2 },
    ],
  };

  it('accepts a bundle with whole-unit components', async () => {
    expect(await pipeErrors(CreateCompositeItemDto, valid)).toEqual([]);
  });

  it('rejects a missing SKU, no components and a float or over-precise price', async () => {
    const { sku: _sku, ...noSku } = valid;
    expect(fields(await pipeErrors(CreateCompositeItemDto, noSku))).toContain('sku');
    expect(
      fields(await pipeErrors(CreateCompositeItemDto, { ...valid, components: [] })),
    ).toContain('components');
    for (const sellingPrice of ['-1', -1, '1.23456', 1.23456]) {
      expect(
        fields(await pipeErrors(CreateCompositeItemDto, { ...valid, sellingPrice })),
      ).toContain('sellingPrice');
    }
  });

  it('rejects fractional, zero or missing component quantities and missing item ids', async () => {
    for (const quantity of [0.5, 0, -1, undefined]) {
      expect(
        fields(
          await pipeErrors(CreateCompositeItemDto, {
            ...valid,
            components: [{ itemId: 'item-1', quantity }],
          }),
        ),
      ).toContain('components.0.quantity');
    }
    expect(
      fields(await pipeErrors(CreateCompositeItemDto, { ...valid, components: [{ quantity: 1 }] })),
    ).toContain('components.0.itemId');
  });

  it('rejects tenant and unknown fields, including inside a component', async () => {
    expect(await pipeErrors(CreateCompositeItemDto, { ...valid, organizationId: 'org-2' })).toEqual(
      ['property organizationId should not exist'],
    );
    expect(
      await pipeErrors(UpdateCompositeItemDto, {
        components: [{ itemId: 'item-1', quantity: 1, compositeItemId: 'other' }],
      }),
    ).toEqual(['components.0.property compositeItemId should not exist']);
  });

  it('allows partial updates and still validates sent components', async () => {
    expect(await pipeErrors(UpdateCompositeItemDto, { name: 'Renamed' })).toEqual([]);
    expect(fields(await pipeErrors(UpdateCompositeItemDto, { components: [] }))).toContain(
      'components',
    );
  });

  it('validates the assemble body and the availability query', async () => {
    expect(
      await pipeErrors(AssembleCompositeItemDto, { quantity: 3, warehouseId: 'wh-1' }),
    ).toEqual([]);
    expect(fields(await pipeErrors(AssembleCompositeItemDto, { quantity: 1.5 }))).toEqual(
      expect.arrayContaining(['quantity', 'warehouseId']),
    );
    expect(await pipeTransform(CompositeAvailabilityQueryDto, { quantity: '4' }, 'query')).toEqual({
      quantity: 4,
    });
    expect(
      fields(await pipeErrors(CompositeAvailabilityQueryDto, { quantity: 'many' }, 'query')),
    ).toContain('quantity');
  });
});
