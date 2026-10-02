import { Decimal } from '@prisma/client/runtime/library';
import { signedMovementQuantity } from './movement-sign';

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
