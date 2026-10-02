import {
  buildReport,
  compareFields,
  computeFieldMetrics,
  DocumentScore,
  FieldValues,
  formatMarkdown,
  normalizeField,
  percentile,
} from './scoring';

const label = (overrides: Partial<FieldValues> = {}): FieldValues => ({
  invoiceNumber: 'INV-1',
  date: '2024-03-15',
  dueDate: null,
  vendorTaxId: '300123456700003',
  currency: 'SAR',
  subtotal: '100.00',
  tax: '15.00',
  total: '115.00',
  ...overrides,
});

function score(
  file: string,
  matches: Partial<Record<keyof FieldValues, boolean>>,
  extra: Partial<DocumentScore> = {},
): DocumentScore {
  const all = compareFields(label(), label());
  return { file, latencyMs: 1, needsReview: false, matches: { ...all, ...matches }, ...extra };
}

describe('benchmark scoring', () => {
  it('compares money as exact decimals, not floats or strings', () => {
    expect(normalizeField('total', '1,140.0')).toBe('1140.0000');
    expect(normalizeField('total', '1140.0000')).toBe('1140.0000');
    expect(normalizeField('total', '1140.01')).not.toBe(normalizeField('total', '1140.00'));
    expect(normalizeField('tax', '0.1')).toBe(normalizeField('tax', '0.1000'));
  });

  it('normalizes tax ids, currencies and blanks', () => {
    expect(normalizeField('vendorTaxId', '123-456 789')).toBe('123456789');
    expect(normalizeField('currency', 'sar')).toBe('SAR');
    expect(normalizeField('invoiceNumber', '  ')).toBeNull();
    expect(normalizeField('date', null)).toBeNull();
  });

  it('treats a correctly absent field as a match', () => {
    const m = compareFields(label({ dueDate: null }), label({ dueDate: null }));
    expect(m.dueDate).toBe(true);
    expect(compareFields(label({ dueDate: '2024-04-01' }), label()).dueDate).toBe(false);
  });

  it('computes precision over predictions and recall over labels', () => {
    const rows = [
      // correct
      { predicted: label(), label: label() },
      // wrong value: counts against precision and recall
      { predicted: label({ total: '116.00' }), label: label() },
      // missed value: counts against recall only
      { predicted: label({ total: null }), label: label() },
      // hallucinated value where the label is absent: counts against precision only
      { predicted: label({ total: '50.00' }), label: label({ total: null }) },
    ];
    const m = computeFieldMetrics(rows).total;
    expect(m.precision).toBeCloseTo(1 / 3);
    expect(m.recall).toBeCloseTo(1 / 3);
    expect(m.exactMatch).toBeCloseTo(1 / 4);
  });

  it('reports n/a precision when nothing was predicted', () => {
    const m = computeFieldMetrics([
      { predicted: label({ dueDate: null }), label: label({ dueDate: '2024-04-01' }) },
    ]);
    expect(m.dueDate.precision).toBeNull();
    expect(m.dueDate.recall).toBe(0);
  });

  it('uses nearest-rank percentiles on real samples', () => {
    const samples = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    expect(percentile(samples, 50)).toBe(5);
    expect(percentile(samples, 95)).toBe(10);
    expect(percentile([], 50)).toBe(0);
    expect(percentile([42], 95)).toBe(42);
  });

  it('builds a report with review share, all-field exactness and latency', () => {
    const rows = [
      { predicted: label(), label: label(), score: score('a.txt', {}, { latencyMs: 2 }) },
      {
        predicted: label({ total: null }),
        label: label(),
        score: score('b.txt', { total: false }, { latencyMs: 8, needsReview: true }),
      },
    ];
    const report = buildReport({ strategy: 'rules', synthetic: true, rows, peakRssMb: 120 });
    expect(report.documents).toBe(2);
    expect(report.needsReviewShare).toBe(0.5);
    expect(report.allFieldsExact).toBe(0.5);
    expect(report.latencyMs).toEqual({ p50: 2, p95: 8, max: 8 });
  });

  it('marks synthetic reports and never prints field values', () => {
    const rows = [
      {
        predicted: label({ total: '999.00' }),
        label: label(),
        score: score('doc.pdf', { total: false }),
      },
    ];
    const md = formatMarkdown(
      buildReport({ strategy: 'rules', synthetic: true, rows, peakRssMb: 1 }),
      rows.map((r) => r.score),
    );
    expect(md).toContain('SYNTHETIC CORPUS');
    expect(md).toContain('not an accuracy measurement');
    expect(md).toContain('| doc.pdf |');
    expect(md).toContain('total');
    expect(md).not.toContain('999');
    expect(md).not.toContain('INV-1');
    expect(md).not.toContain('300123456700003');

    const real = formatMarkdown(
      buildReport({ strategy: 'rules', synthetic: false, rows, peakRssMb: 1 }),
      [],
    );
    expect(real).not.toContain('SYNTHETIC');
  });
});
