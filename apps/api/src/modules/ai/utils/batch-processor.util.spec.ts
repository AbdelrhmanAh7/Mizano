import { batchProcessWithRiskAggregation } from './batch-processor.util';

type Scored = { riskLevel: string };

const scored = (riskLevel: string): Promise<Scored> => Promise.resolve({ riskLevel });

/** Promise whose settlement the test controls, to observe batch boundaries. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Lets pending microtasks (awaits inside the util) run. */
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('batchProcessWithRiskAggregation', () => {
  it('returns all-zero counts for empty input without calling the processor', async () => {
    const processFn = jest.fn((_item: string) => scored('LOW'));

    await expect(batchProcessWithRiskAggregation([], processFn)).resolves.toEqual({
      processed: 0,
      highRisk: 0,
      mediumRisk: 0,
      lowRisk: 0,
      failed: 0,
    });
    expect(processFn).not.toHaveBeenCalled();
  });

  it.each([
    { total: 3, batchSize: 5, batches: [[0, 1, 2]] },
    { total: 5, batchSize: 5, batches: [[0, 1, 2, 3, 4]] },
    {
      total: 10,
      batchSize: 5,
      batches: [
        [0, 1, 2, 3, 4],
        [5, 6, 7, 8, 9],
      ],
    },
    {
      total: 11,
      batchSize: 5,
      batches: [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10]],
    },
    { total: 4, batchSize: 1, batches: [[0], [1], [2], [3]] },
  ])(
    'splits $total items with batchSize $batchSize into Math.ceil(total / batchSize) ordered batches',
    async ({ total, batchSize, batches }) => {
      const items = Array.from({ length: total }, (_, i) => i);
      const gates = items.map(() => deferred<Scored>());
      const processFn = jest.fn((item: number) => gates[item].promise);

      const run = batchProcessWithRiskAggregation(items, processFn, batchSize);

      // A batch is exactly the set of items started while every gate is still closed;
      // releasing that set is the only thing that lets the next batch start.
      const observed: number[][] = [];
      let started = 0;
      while (started < total) {
        await flush();
        const batch = processFn.mock.calls.slice(started).map((call) => call[0]);
        expect(batch.length).toBeGreaterThan(0);
        observed.push(batch);
        started += batch.length;
        batch.forEach((item) => gates[item].resolve({ riskLevel: 'LOW' }));
      }

      expect(observed).toEqual(batches);
      expect(observed).toHaveLength(Math.ceil(total / batchSize));
      await expect(run).resolves.toEqual({
        processed: total,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: total,
        failed: 0,
      });
    },
  );

  it('uses a default batchSize of 10', async () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const gates = items.map(() => deferred<Scored>());
    const processFn = jest.fn((item: number) => gates[item].promise);

    const run = batchProcessWithRiskAggregation(items, processFn);
    await flush();
    expect(processFn).toHaveBeenCalledTimes(10);

    gates.slice(0, 10).forEach((g) => g.resolve({ riskLevel: 'LOW' }));
    await flush();
    expect(processFn).toHaveBeenCalledTimes(12);

    gates.slice(10).forEach((g) => g.resolve({ riskLevel: 'LOW' }));
    await expect(run).resolves.toMatchObject({ processed: 12, lowRisk: 12 });
  });

  it('does not start the next batch until every item of the current batch has settled', async () => {
    const gates = [0, 1, 2, 3].map(() => deferred<Scored>());
    const processFn = jest.fn((item: number) => gates[item].promise);

    const run = batchProcessWithRiskAggregation([0, 1, 2, 3], processFn, 2);
    await flush();
    expect(processFn.mock.calls.map((call) => call[0])).toEqual([0, 1]);

    gates[0].resolve({ riskLevel: 'LOW' });
    await flush();
    expect(processFn).toHaveBeenCalledTimes(2);

    gates[1].resolve({ riskLevel: 'LOW' });
    await flush();
    expect(processFn.mock.calls.map((call) => call[0])).toEqual([0, 1, 2, 3]);

    gates[2].resolve({ riskLevel: 'LOW' });
    gates[3].resolve({ riskLevel: 'LOW' });
    await expect(run).resolves.toMatchObject({ processed: 4, lowRisk: 4 });
  });

  it('counts HIGH and CRITICAL as highRisk, MEDIUM as mediumRisk and LOW as lowRisk', async () => {
    const levels = ['HIGH', 'CRITICAL', 'MEDIUM', 'LOW', 'CRITICAL', 'MEDIUM', 'LOW', 'LOW'];

    const result = await batchProcessWithRiskAggregation(levels, scored, 3);

    expect(result).toEqual({ processed: 8, highRisk: 3, mediumRisk: 2, lowRisk: 3, failed: 0 });
  });

  it('counts rejections as failed and keeps processing the rest of the batch and later batches', async () => {
    const items = ['HIGH', 'fail', 'MEDIUM', 'LOW', 'fail', 'CRITICAL', 'fail'];
    const processFn = jest.fn((level: string) =>
      level === 'fail' ? Promise.reject(new Error(`boom-${level}`)) : scored(level),
    );

    const result = await batchProcessWithRiskAggregation(items, processFn, 3);

    expect(processFn).toHaveBeenCalledTimes(items.length);
    expect(result).toEqual({ processed: 7, highRisk: 2, mediumRisk: 1, lowRisk: 1, failed: 3 });
  });

  it('resolves rather than rejects when every item fails', async () => {
    const processFn = jest.fn((_item: number) => Promise.reject(new Error('down')));

    await expect(batchProcessWithRiskAggregation([1, 2, 3], processFn, 2)).resolves.toEqual({
      processed: 3,
      highRisk: 0,
      mediumRisk: 0,
      lowRisk: 0,
      failed: 3,
    });
  });

  it('reports processed as the input length, so processed = high + medium + low + failed', async () => {
    const items = ['LOW', 'fail', 'HIGH', 'MEDIUM', 'fail'];
    const processFn = (level: string): Promise<Scored> =>
      level === 'fail' ? Promise.reject(new Error('x')) : scored(level);

    const r = await batchProcessWithRiskAggregation(items, processFn, 2);

    expect(r.processed).toBe(items.length);
    expect(r.highRisk + r.mediumRisk + r.lowRisk + r.failed).toBe(r.processed);
  });

  // Not run live: batchSize <= 0 never advances the loop (`i += batchSize`), so the util
  // awaits empty batches forever. Flagged to the reviewer as a util defect; fixing it is
  // out of scope for this test-only issue.
  it.todo(
    'rejects or clamps batchSize <= 0 instead of looping forever (util defect, not fixed here)',
  );
});
