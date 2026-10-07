import { createJournalSchema } from '@mizano/validators';

// @mizano/validators has no test runner of its own; the API jest config maps it to its source.
const ACCOUNTS = ['cka1b2c3d4e5f6g7h8i9j0k1l', 'ckz9y8x7w6v5u4t3s2r1q0p9o'];

function parse(lines: Array<{ debit?: string; credit?: string }>) {
  return createJournalSchema.safeParse({
    date: '2026-10-01',
    lines: lines.map((line, i) => ({ accountId: ACCOUNTS[i % 2], ...line })),
  });
}

describe('createJournalSchema balance (@mizano/validators, @issue-94 AC2)', () => {
  it('accepts exactly balanced decimals (0.1 + 0.2 = 0.3)', () => {
    expect(parse([{ debit: '0.1' }, { debit: '0.2' }, { credit: '0.3' }]).success).toBe(true);
  });

  it.each([
    ['1000000.0001', '1000000'],
    ['100000000000000.01', '100000000000000.02'],
  ])('rejects debit %s against credit %s, which a float sum calls balanced', (debit, credit) => {
    const result = parse([{ debit }, { credit }]);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'Total debits must equal total credits',
    ]);
  });

  it('treats 1234.10 and 1234.1 as the same amount without parsing a float', () => {
    expect(parse([{ debit: '1234.10' }, { credit: '1234.1' }]).success).toBe(true);
  });

  it('reports invalid amounts as validation errors instead of throwing', () => {
    expect(parse([{ debit: 'abc' }, { credit: '1' }]).success).toBe(false);
  });
});
