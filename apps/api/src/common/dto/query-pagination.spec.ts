import { BadRequestException, Type, ValidationPipe } from '@nestjs/common';
import { TransferQueryDto } from '../../modules/inventory/dto/transfer-query.dto';
import { InventoryMovementQueryDto } from '../../modules/inventory/dto/inventory-movement-query.dto';
import { InventoryMovementCursorQueryDto } from '../../modules/inventory/dto/inventory-movement-cursor-query.dto';
import { BankTransactionQueryDto } from '../../modules/banking/dto/bank-transaction-query.dto';
import { EmployeeQueryDto } from '../../modules/hr/dto/employee-query.dto';

describe('Query pagination transformation', () => {
  // Keep aligned with the global pipe in main.ts, including implicit conversion.
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const transform = (metatype: Type<unknown>, query: Record<string, unknown>) =>
    pipe.transform(query, { type: 'query', metatype });

  describe.each([TransferQueryDto, BankTransactionQueryDto, EmployeeQueryDto])('%s', (dto) => {
    it('transforms page and limit without stripping declared filters', async () => {
      const result = await transform(dto, { limit: '50', page: '2', status: 'X' });
      expect(result).toMatchObject({ limit: 50, page: 2, status: 'X' });
      expect(typeof result.limit).toBe('number');
      expect(typeof result.page).toBe('number');
    });

    it.each(['abc', '0', '501', '1.5'])('rejects invalid limit %s', async (limit) => {
      await expect(transform(dto, { limit })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects undeclared filters', async () => {
      await expect(transform(dto, { unknown: 'value' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  it('accepts existing frontend compatibility filters', async () => {
    expect(await transform(InventoryMovementQueryDto, { source: 'SALE' })).toMatchObject({
      source: 'SALE',
    });
    expect(await transform(InventoryMovementCursorQueryDto, { source: 'SALE' })).toMatchObject({
      source: 'SALE',
    });
    expect(await transform(EmployeeQueryDto, { departmentId: 'dept-1' })).toMatchObject({
      departmentId: 'dept-1',
    });
    expect(await transform(BankTransactionQueryDto, {})).toMatchObject({ limit: 50 });
  });

  it('accepts all banking filters read by the service', async () => {
    const filters = {
      bankAccountId: 'bank-1',
      status: 'PENDING',
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
      amountMin: '-1.25',
      amountMax: '50.00',
    };
    expect(await transform(BankTransactionQueryDto, filters)).toMatchObject(filters);
  });

  it('preserves employee false filtering and existing defaults', async () => {
    expect(
      await transform(EmployeeQueryDto, {
        isActive: 'false',
        department: 'Finance',
        departmentId: 'dept-1',
      }),
    ).toMatchObject({ isActive: false, department: 'Finance', limit: 50, sortOrder: 'asc' });
    expect(await transform(EmployeeQueryDto, { isActive: 'true' })).toMatchObject({
      isActive: true,
    });
    await expect(transform(EmployeeQueryDto, { isActive: 'invalid' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each([InventoryMovementQueryDto, InventoryMovementCursorQueryDto])(
    'transforms movement pagination and accepts date filters for %s',
    async (dto) => {
      const pagination = dto === InventoryMovementQueryDto ? { limit: '50' } : { take: '50' };
      const result = await transform(dto, {
        ...pagination,
        page: '2',
        itemId: 'item-1',
        warehouseId: 'warehouse-1',
        type: 'IN',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
      });
      expect(result.page).toBe(2);
      expect(result.limit ?? result.take).toBe(50);
      await expect(transform(dto, { dateFrom: 'invalid' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
});
