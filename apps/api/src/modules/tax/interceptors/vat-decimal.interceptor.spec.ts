import { ExecutionContext } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { firstValueFrom, of } from 'rxjs';
import { VatDecimalInterceptor } from './vat-decimal.interceptor';

describe('VatDecimalInterceptor', () => {
  const interceptor = new VatDecimalInterceptor();
  const context = {} as ExecutionContext;

  it('serializes return lists and nested payment money to exact four-place strings', async () => {
    const date = new Date('2026-03-31T00:00:00Z');
    const data = [
      {
        totalPurchases: new Decimal('999999999999999.1234'),
        inputVAT: new Decimal('-28.04'),
        outputVAT: new Decimal('0'),
        payment: { amount: new Decimal('10.2') },
        date,
        id: 'vr-1',
      },
    ];
    expect(
      await firstValueFrom(interceptor.intercept(context, { handle: () => of(data) })),
    ).toEqual([
      {
        totalPurchases: '999999999999999.1234',
        inputVAT: '-28.0400',
        outputVAT: '0.0000',
        payment: { amount: '10.2000' },
        date,
        id: 'vr-1',
      },
    ]);
    expect(data[0].totalPurchases).toBeInstanceOf(Decimal);
  });

  it.each([null, undefined, '0.0000', 3, false])(
    'preserves non-Decimal values (%s)',
    async (data) => {
      expect(await firstValueFrom(interceptor.intercept(context, { handle: () => of(data) }))).toBe(
        data,
      );
    },
  );
});
