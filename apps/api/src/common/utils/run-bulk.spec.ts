import { BadRequestException, Logger } from '@nestjs/common';
import { runBulk } from './run-bulk';

describe('runBulk', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports per-record outcomes and de-duplicates ids', async () => {
    const seen: string[] = [];
    const result = await runBulk(['a', 'b', 'a', 'c'], async (id) => {
      seen.push(id);
      if (id === 'b') throw new BadRequestException('locked period');
    });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({
      processed: 2,
      total: 3,
      failures: [{ id: 'b', reason: 'locked period' }],
    });
  });

  it('keeps the message and code of HTTP exceptions', async () => {
    const result = await runBulk(['a'], async () => {
      throw new BadRequestException({ message: 'Period is locked', code: 'PERIOD_LOCKED' });
    });
    expect(result.failures).toEqual([
      { id: 'a', reason: 'Period is locked', code: 'PERIOD_LOCKED' },
    ]);
  });

  it('never returns the message or code of a non-HTTP error, and logs only the redacted summary', async () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const prismaLike = Object.assign(
      new Error('Invalid `prisma.bill.update()` invocation: Unique constraint on (organizationId)'),
      { code: 'P2002' },
    );
    const result = await runBulk(['a', 'b'], async (id) => {
      if (id === 'a') throw prismaLike;
      throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
    });
    expect(result.failures).toEqual([
      { id: 'a', reason: 'Unexpected error' },
      { id: 'b', reason: 'Unexpected error' },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/prisma|P2002|ECONNREFUSED|10\.0\.0\.5/);
    expect(logged).toHaveBeenCalledTimes(2);
    const text = logged.mock.calls.map((c) => String(c[0])).join('\n');
    expect(text).toContain('P2002');
    expect(text).not.toMatch(/organizationId|ECONNREFUSED|10\.0\.0\.5/);
  });
});
