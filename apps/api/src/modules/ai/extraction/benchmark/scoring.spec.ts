import {
  buildReport,
  compareFields,
  computeFieldMetrics,
  DocumentScore,
  FieldValues,
  formatMarkdown,
  normalizeField,
  percentile,
  validateLabels,
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

  it.each([
    '1.23454',
    '1.23455',
    'NaN',
    'Infinity',
    '-1',
    '1000000000000000',
    '1e1000000',
    '1e-1000000',
  ])('never counts unsupported money %s as correct', (total) => {
    expect(compareFields(label({ total }), label({ total: '1.2345' })).total).toBe(false);
    expect(compareFields(label({ total }), label({ total })).total).toBe(false);
    const metrics = computeFieldMetrics([
      { predicted: label({ total }), label: label({ total }) },
    ]).total;
    expect(metrics).toEqual({ precision: 0, recall: 0, exactMatch: 0 });
  });
  it('rejects malformed money strings in grouping or format at the label boundary', () => {
    const invalidFormats = ['1,2', '1,00,000', '1,000,00', '1,000.5.5', '1,', ',100', '.'];
    for (const total of invalidFormats) {
      expect(() => {
        validateLabels({ synthetic: false, documents: { 'doc.pdf': label({ total }) } });
      }).toThrow(`Invalid benchmark money label: total`);
    }
  });

  it('accepts well-formed money strings at the label boundary', () => {
    const validFormats = ['1,000', '1,000.5', '1,000,000', '0.5', '1000', '1000.5'];
    for (const total of validFormats) {
      const result = validateLabels({
        synthetic: false,
        documents: { 'doc.pdf': label({ total }) },
      });
      expect(result.documents['doc.pdf'].total).toBe(total);
    }
  });

  it('retains extra digits rather than rounding them during normalization', () => {
    expect(normalizeField('total', '1.23454')).toBe('1.23454');
    expect(compareFields(label({ total: '1.234500' }), label({ total: '1.2345' })).total).toBe(
      true,
    );
  });

  it('validates complete labels including explicit nulls', () => {
    const input = { synthetic: true, note: 'Synthetic fixture', documents: { 'a.txt': label() } };
    expect(validateLabels(input)).toEqual(input);
  });

  it('keeps unsupported exponents compact before scoring', () => {
    expect(normalizeField('total', '1e1000000')).toBe('1e+1000000');
    expect(normalizeField('total', '1e-1000000')).toBe('1e-1000000');
  });

  it.each([
    null,
    [],
    {},
    { synthetic: 'true', documents: {} },
    { synthetic: true, documents: [] },
    { synthetic: true, documents: { 'a.txt': null } },
    { synthetic: true, documents: { 'a.txt': [] } },
    { synthetic: true, note: 42, documents: {} },
  ])('rejects malformed label structure %#', (input) => {
    expect(() => validateLabels(input)).toThrow('Invalid benchmark');
  });

  it.each(Object.keys(label()))('rejects missing or non-string/non-null %s', (field) => {
    const missing: Record<string, unknown> = { ...label() };
    delete missing[field];
    for (const fields of [missing, { ...label(), [field]: 42 }, { ...label(), [field]: {} }]) {
      expect(() => validateLabels({ synthetic: true, documents: { 'a.txt': fields } })).toThrow(
        'Invalid benchmark label field',
      );
    }
  });

  it('rejects unsupported precision in ground truth', () => {
    expect(() =>
      validateLabels({ synthetic: true, documents: { 'a.txt': label({ total: '1.23454' }) } }),
    ).toThrow('Invalid benchmark money label');
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
