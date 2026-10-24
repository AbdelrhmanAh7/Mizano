import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { DecimalUtils } from './decimal';

describe('DecimalUtils.parseInput', () => {
  it.each(['abc', 'x', '', '1,5', 'NaN', 'Infinity', '-Infinity', NaN, Infinity])(
    'rejects %p with a 400 that names the field',
    (value) => {
      expect(() => DecimalUtils.parseInput(value as string, 'rate')).toThrow(BadRequestException);
      expect(() => DecimalUtils.parseInput(value as string, 'rate')).toThrow(
        'rate must be a valid number',
      );
    },
  );

  it.each([
    ['15', '15'],
    ['12.50', '12.5'],
    [7.25, '7.25'],
    ['-3', '-3'],
    ['1e2', '100'],
  ])('parses %p', (value, expected) => {
    expect(DecimalUtils.parseInput(value, 'rate').toString()).toBe(expected);
  });

  it('passes an existing Decimal through', () => {
    const d = new Decimal('4.2');
    expect(DecimalUtils.parseInput(d, 'rate')).toBe(d);
  });
});
