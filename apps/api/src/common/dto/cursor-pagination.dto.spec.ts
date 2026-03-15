import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CursorPaginationDto } from './cursor-pagination.dto';

describe('CursorPaginationDto', () => {
  describe('type field', () => {
    it('accepts a valid type string', async () => {
      const dto = plainToInstance(CursorPaginationDto, { type: 'GOODS' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.type).toBe('GOODS');
    });

    it('is optional', async () => {
      const dto = plainToInstance(CursorPaginationDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.type).toBeUndefined();
    });

    it('rejects non-string type values', async () => {
      const dto = plainToInstance(CursorPaginationDto, { type: 42 });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'type')).toBe(true);
    });
  });

  describe('cursor pagination fields', () => {
    it('applies defaults', async () => {
      const dto = plainToInstance(CursorPaginationDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.take).toBe(50);
      expect(dto.sortOrder).toBe('desc');
    });

    it('rejects take greater than 200', async () => {
      const dto = plainToInstance(CursorPaginationDto, { take: '201' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'take')).toBe(true);
    });

    it('accepts cursor string', async () => {
      const dto = plainToInstance(CursorPaginationDto, { cursor: 'cuid123', type: 'ASSET' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.cursor).toBe('cuid123');
      expect(dto.type).toBe('ASSET');
    });
  });
});
