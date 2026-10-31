import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkImportTransactionsDto, CreateBankTransactionDto } from './create-bank-transaction.dto';

const errorsOf = async (cls: new () => object, body: object): Promise<string[]> =>
  (await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true })).map(
    (e) => e.property,
  );

const line = { date: '2026-10-31', type: 'DEPOSIT', amount: '250.50' };

/** Manual QA: the body was an interface, so "-50" was stored as a deposit and "abc" was a 500. */
describe('bank transaction DTOs', () => {
  it('accepts a dated deposit with a decimal-string amount', async () => {
    expect(await errorsOf(CreateBankTransactionDto, { ...line, bankAccountId: 'ba-1' })).toEqual(
      [],
    );
  });

  it.each([['-50'], ['abc'], [12.5], ['1.23456']])('rejects amount %p', async (amount) => {
    expect(
      await errorsOf(CreateBankTransactionDto, { ...line, amount, bankAccountId: 'ba-1' }),
    ).toEqual(['amount']);
  });

  it('rejects a bad date, an unknown type and unknown fields', async () => {
    expect(
      await errorsOf(CreateBankTransactionDto, {
        ...line,
        date: 'nope',
        type: 'GIFT',
        bankAccountId: 'ba-1',
        organizationId: 'org-2',
      }),
    ).toEqual(expect.arrayContaining(['date', 'type', 'organizationId']));
  });

  it('validates every imported line', async () => {
    expect(
      await errorsOf(BulkImportTransactionsDto, {
        bankAccountId: 'ba-1',
        transactions: [line, { ...line, amount: '-1' }],
      }),
    ).toEqual(['transactions']);
  });
});
