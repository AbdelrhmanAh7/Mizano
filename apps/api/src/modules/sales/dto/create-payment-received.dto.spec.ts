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
  it('accepts whole cents', async () => {
    expect(await errorsOf(payment('1140.50'))).not.toContain('amount');
  });

  it('refuses amounts with more than two decimals, on the payment and on its allocations', async () => {
    expect(await errorsOf(payment('1.005', '1.00'))).toContain('amount');
    expect(await errorsOf(payment('1.00', '1.005'))).toContain('amount');
  });
});
