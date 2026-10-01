import { runBulk } from './run-bulk';

describe('runBulk', () => {
  it('reports per-record outcomes and de-duplicates ids', async () => {
    const seen: string[] = [];
    const result = await runBulk(['a', 'b', 'a', 'c'], async (id) => {
      seen.push(id);
      if (id === 'b') throw new Error('locked period');
    });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({
      processed: 2,
      total: 3,
      failures: [{ id: 'b', reason: 'locked period' }],
    });
  });
});
