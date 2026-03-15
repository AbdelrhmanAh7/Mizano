import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationDto } from './pagination.dto';

describe('PaginationDto', () => {
  describe('type field (regression for VALIDATION_ERROR on ?type=ASSET)', () => {
    it('accepts a valid type string', async () => {
      const dto = plainToInstance(PaginationDto, { type: 'ASSET' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.type).toBe('ASSET');
    });

    it('accepts GOODS type for items endpoint', async () => {
      const dto = plainToInstance(PaginationDto, { type: 'GOODS' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.type).toBe('GOODS');
    });

    it('is optional — omitting type passes validation', async () => {
      const dto = plainToInstance(PaginationDto, { page: '1', limit: '20' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.type).toBeUndefined();
    });

    it('rejects non-string type values', async () => {
      const dto = plainToInstance(PaginationDto, { type: 123 });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'type')).toBe(true);
    });
  });

  describe('pagination fields', () => {
    it('applies defaults when no params provided', async () => {
      const dto = plainToInstance(PaginationDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(1);
      expect(dto.limit).toBe(20);
      expect(dto.sortOrder).toBe('desc');
    });

    it('rejects page less than 1', async () => {
      const dto = plainToInstance(PaginationDto, { page: '0' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'page')).toBe(true);
    });

    it('rejects limit greater than 500', async () => {
      const dto = plainToInstance(PaginationDto, { limit: '501' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });

    it('rejects invalid sortOrder', async () => {
      const dto = plainToInstance(PaginationDto, { sortOrder: 'random' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'sortOrder')).toBe(true);
    });

    it('accepts all valid fields together including type', async () => {
      const dto = plainToInstance(PaginationDto, {
        page: '2',
        limit: '50',
        search: 'cash',
        sortBy: 'name',
        sortOrder: 'asc',
        type: 'ASSET',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(2);
      expect(dto.limit).toBe(50);
      expect(dto.type).toBe('ASSET');
    });
  });
});
