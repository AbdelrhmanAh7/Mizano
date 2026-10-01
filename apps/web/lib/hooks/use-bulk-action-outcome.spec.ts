import { readBulkOutcome } from './use-bulk-action';

describe('readBulkOutcome', () => {
  it('reads per-record outcomes from the API', () => {
    expect(
      readBulkOutcome({ processed: 1, total: 2, failures: [{ id: 'b', reason: 'locked' }] }, 2),
    ).toEqual({ processed: 1, failures: [{ id: 'b', reason: 'locked' }] });
  });

  it('unwraps { data } envelopes', () => {
    expect(readBulkOutcome({ data: { processed: 3, total: 3, failures: [] } }, 3)).toEqual({
      processed: 3,
      failures: [],
    });
  });

  it('falls back to the requested count for legacy responses', () => {
    expect(readBulkOutcome({ deleted: 2, total: 2 }, 2)).toEqual({ processed: 2, failures: [] });
  });
});
