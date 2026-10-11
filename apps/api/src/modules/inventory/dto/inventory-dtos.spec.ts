import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateItemDto } from './create-item.dto';
import { CreateWarehouseDto } from './create-warehouse.dto';
import { InventoryMovementQueryDto } from './inventory-movement-query.dto';
import { CreatePriceListDto, UpdatePriceListDto } from './price-list.dto';
import { TransferQueryDto } from './transfer-query.dto';
import { UpdateItemDto } from './update-item.dto';

/** The exact pipe options of main.ts, so these specs see what the API sees. */
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  transformOptions: { enableImplicitConversion: true },
});
const body = <T>(metatype: new () => T, value: unknown): Promise<T> =>
  pipe.transform(value, { type: 'body', metatype }) as Promise<T>;
const query = <T>(metatype: new () => T, value: unknown): Promise<T> =>
  pipe.transform(value, { type: 'query', metatype }) as Promise<T>;

describe('inventory list query DTOs', () => {
  it('converts page and limit of the movements list to numbers (Prisma rejects a string take)', async () => {
    const dto = await query(InventoryMovementQueryDto, {
      itemId: 'item-1',
      type: 'transfer',
      page: '2',
      limit: '50',
    });
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
    expect(dto.itemId).toBe('item-1');
  });

  it('converts page and limit of the transfers list to numbers', async () => {
    const dto = await query(TransferQueryDto, { status: 'PENDING', limit: '100' });
    expect(dto.limit).toBe(100);
    expect(dto.status).toBe('PENDING');
  });

  it('rejects a non-numeric limit and unknown filters with 400 instead of reaching Prisma', async () => {
    await expect(query(TransferQueryDto, { limit: 'abc' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(query(InventoryMovementQueryDto, { bogus: '1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('item DTOs', () => {
  const valid = { name: 'Widget', sku: 'W-1', type: 'GOODS', sellingPrice: '100.00' };

  it('accepts decimal-string prices', async () => {
    await expect(body(CreateItemDto, { ...valid, costPrice: '60.25' })).resolves.toMatchObject({
      sellingPrice: '100.00',
      costPrice: '60.25',
    });
    await expect(body(UpdateItemDto, { sellingPrice: '120.50' })).resolves.toBeDefined();
  });

  it.each(['abc', '1,5', '-1', '1.23456', ''])(
    'rejects the price %p with 400 (it used to crash in new Decimal() as a 500)',
    async (price) => {
      await expect(body(CreateItemDto, { ...valid, sellingPrice: price })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(body(CreateItemDto, { ...valid, costPrice: price })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(body(UpdateItemDto, { sellingPrice: price })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
});

describe('warehouse DTO', () => {
  it('accepts the address fields of the warehouse form', async () => {
    await expect(
      body(CreateWarehouseDto, {
        code: 'WH-1',
        name: 'Main',
        address: '1 Nile Street',
        city: 'Cairo',
        state: 'Cairo',
        postalCode: '11511',
        country: 'EG',
      }),
    ).resolves.toMatchObject({ address: '1 Nile Street', city: 'Cairo' });
  });
});

describe('price list DTOs', () => {
  const valid = { name: 'VIP', type: 'PERCENTAGE', adjustment: '-10' };

  it('accepts a negative adjustment, numeric input and priced items', async () => {
    const dto = await body(CreatePriceListDto, {
      ...valid,
      adjustment: 12.5,
      items: [{ itemId: 'item-1', customPrice: '90' }],
    });
    expect(dto.adjustment).toBe('12.5');
    expect(dto.items).toHaveLength(1);
    await expect(body(CreatePriceListDto, valid)).resolves.toMatchObject({ adjustment: '-10' });
  });

  it.each([
    ['a missing name', { type: 'PERCENTAGE', adjustment: '1' }],
    ['an unknown type', { ...valid, type: 'WEIRD' }],
    ['a missing adjustment', { name: 'VIP', type: 'FIXED' }],
    ['a non-numeric adjustment', { ...valid, adjustment: 'abc' }],
    ['a priced item without id', { ...valid, items: [{ customPrice: '1' }] }],
    ['a non-numeric custom price', { ...valid, items: [{ itemId: 'i', customPrice: 'x' }] }],
    ['an unknown field', { ...valid, organizationId: 'other-org' }],
  ])('rejects %s with 400', async (_label, payload) => {
    await expect(body(CreatePriceListDto, payload)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates updates and cannot be used to move a list to another organization', async () => {
    await expect(
      body(UpdatePriceListDto, { name: 'v2', adjustment: '12.5', isActive: false }),
    ).resolves.toMatchObject({ isActive: false });
    await expect(body(UpdatePriceListDto, { type: 'WEIRD' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      body(UpdatePriceListDto, { organization: { connect: { id: 'x' } } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
