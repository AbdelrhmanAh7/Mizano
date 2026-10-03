import { Decimal } from '@prisma/client/runtime/library';
import { signedMovementQuantity, signedMovementQuantityDecimal } from './movement-sign';

describe('signedMovementQuantity', () => {
  describe.each(['number', 'Decimal'])('%s quantities', (kind) => {
    it.each([
      ['IN', 3, 3],
      ['IN', -3, 3],
      ['OUT', 3, -3],
      ['OUT', -3, -3],
      [null, 5, 5],
      [null, -3, -3],
      ['other', 5, 5],
      ['other', -3, -3],
      [undefined, 5, 5],
      [undefined, -3, -3],
      ['IN', 0, 0],
      ['OUT', 0, -0],
      [null, 0, 0],
      ['OUT', 1.25, -1.25],
    ] as const)('%s %s -> %s', (type, value, expected) => {
      expect(signedMovementQuantity(kind === 'number' ? value : new Decimal(value), type)).toBe(
        expected,
      );
    });
  });
});

describe('signedMovementQuantityDecimal', () => {
  it.each([
    ['IN', '-999999999999999.1251', '999999999999999.1251'],
    ['OUT', '999999999999999.1251', '-999999999999999.1251'],
    ['OUT', '-999999999999999.1251', '-999999999999999.1251'],
    [null, '-999999999999999.1251', '-999999999999999.1251'],
    [undefined, '0.0001', '0.0001'],
    ['other', '0.0001', '0.0001'],
  ] as const)('keeps %s %s exact as %s', (type, quantity, expected) => {
    const stored = new Decimal(quantity);
    const result = signedMovementQuantityDecimal(stored, type);
    expect(result).toBeInstanceOf(Decimal);
    expect(result.toString()).toBe(expected);
    expect(stored.toString()).toBe(quantity);
  });

  it('accepts numeric quantities without changing direction rules', () => {
    expect(signedMovementQuantityDecimal(-1.25, 'IN').toString()).toBe('1.25');
    expect(signedMovementQuantityDecimal(1.25, 'OUT').toString()).toBe('-1.25');
  });
});
