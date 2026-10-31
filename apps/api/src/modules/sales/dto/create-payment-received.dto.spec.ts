import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePaymentReceivedDto } from './create-payment-received.dto';

const payment = (amount: string, allocation = amount) =>
  plainToInstance(CreatePaymentReceivedDto, {
    customerId: 'c1',
    date: '2026-10-31',
    amount,
    paymentMode: 'CASH',
    depositToAccountId: 'a1',
    allocations: [{ invoiceId: 'i1', amount: allocation }],
  });

const errorsOf = async (dto: CreatePaymentReceivedDto): Promise<string[]> => {
  const flat = (errs: Awaited<ReturnType<typeof validate>>): string[] =>
    errs.flatMap((e) => [e.property, ...flat(e.children ?? [])]);
  return flat(await validate(dto, { whitelist: true }));
};

describe('CreatePaymentReceivedDto money scale (PR #560 review)', () => {
  it('accepts a balance left by a four-decimal credit note, so it can still be settled', async () => {
    expect(await errorsOf(payment('99.9999'))).not.toContain('amount');
  });

  it('refuses more decimals than the Decimal(19, 4) columns hold, on the payment and its allocations', async () => {
    expect(await errorsOf(payment('1.00005', '1.0000'))).toContain('amount');
    expect(await errorsOf(payment('1.0000', '1.00005'))).toContain('amount');
  });
});
