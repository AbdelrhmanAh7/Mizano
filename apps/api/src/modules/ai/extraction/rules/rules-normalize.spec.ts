import { mapSpanToOriginal, normalizeDigits, normalizeWithOffsets } from './rules-normalize';

describe('normalizeWithOffsets', () => {
  it.each(['total 4200 USD', 'total ٤٢٠٠ USD', 'total ４２００', '‏xًé😀١', ''])(
    'matches normalizeDigits and keeps a bounded non-decreasing map for %j',
    (input) => {
      const { normalized, toOriginal } = normalizeWithOffsets(input);
      expect(normalized).toBe(normalizeDigits(input));
      expect(toOriginal).toHaveLength(normalized.length);
      toOriginal.forEach((src, i) => {
        expect(src).toBeGreaterThanOrEqual(0);
        expect(src).toBeLessThan(input.length);
        if (i > 0) expect(src).toBeGreaterThanOrEqual(toOriginal[i - 1]);
      });
    },
  );

  it('is the identity for ASCII', () => {
    const { toOriginal } = normalizeWithOffsets('abc 123');
    expect(toOriginal).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(mapSpanToOriginal(4, 7, toOriginal, 7)).toEqual({ start: 4, end: 7 });
  });

  it('skips dropped characters so later indexes shift', () => {
    const { normalized, toOriginal } = normalizeWithOffsets('‏١٢');
    expect(normalized).toBe('12');
    expect(toOriginal).toEqual([1, 2]);
    expect(mapSpanToOriginal(0, 2, toOriginal, 3)).toEqual({ start: 1, end: 3 });
  });

  it('maps a surrogate pair to one source cluster of 2 UTF-16 units', () => {
    const { normalized, toOriginal } = normalizeWithOffsets('😀١');
    expect(normalized).toBe('😀1');
    expect(toOriginal).toEqual([0, 0, 2]);
  });

  it('expands a span ending inside a cluster to the whole source cluster', () => {
    const { toOriginal } = normalizeWithOffsets('a😀b');
    expect(mapSpanToOriginal(0, 2, toOriginal, 4)).toEqual({ start: 0, end: 3 });
  });

  it('clamps out-of-range spans and keeps start <= end', () => {
    const { toOriginal } = normalizeWithOffsets('ab');
    expect(mapSpanToOriginal(-5, 99, toOriginal, 2)).toEqual({ start: 0, end: 2 });
    expect(mapSpanToOriginal(2, 1, toOriginal, 2)).toEqual({ start: 2, end: 2 });
  });
});
