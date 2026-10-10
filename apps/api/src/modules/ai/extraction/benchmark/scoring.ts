import Decimal from 'decimal.js';

/** Fields the benchmark scores. Money fields are compared as exact decimals. */
export const BENCHMARK_FIELDS = [
  'invoiceNumber',
  'date',
  'dueDate',
  'vendorTaxId',
  'currency',
  'subtotal',
  'tax',
  'total',
] as const;

export type BenchmarkField = (typeof BENCHMARK_FIELDS)[number];

const MONEY_FIELDS: ReadonlySet<BenchmarkField> = new Set(['subtotal', 'tax', 'total']);

/** Ground truth for one document: decimal strings for money, ISO dates, null when absent. */
export type FieldValues = Record<BenchmarkField, string | null>;

export interface LabelsFile {
  /** true when the corpus is synthetic; the report then says so in its header. */
  synthetic: boolean;
  note?: string;
  documents: Record<string, FieldValues>;
}

/** Reject malformed ground truth before any document is opened or scored. */
export function validateLabels(value: unknown): LabelsFile {
  if (!isRecord(value) || typeof value.synthetic !== 'boolean' || !isRecord(value.documents)) {
    throw new Error('Invalid benchmark labels structure');
  }
  if (value.note !== undefined && typeof value.note !== 'string') {
    throw new Error('Invalid benchmark labels note');
  }
  const documents: Record<string, FieldValues> = {};
  for (const [file, fields] of Object.entries(value.documents)) {
    if (!isRecord(fields)) throw new Error('Invalid benchmark document label');
    const label = {} as FieldValues;
    for (const field of BENCHMARK_FIELDS) {
      const entry = fields[field];
      if (entry !== null && typeof entry !== 'string') {
        throw new Error(`Invalid benchmark label field: ${field}`);
      }
      if (MONEY_FIELDS.has(field) && entry !== null && !validMoney(entry)) {
        throw new Error(`Invalid benchmark money label: ${field}`);
      }
      label[field] = entry;
    }
    Object.defineProperty(documents, file, { value: label, enumerable: true });
  }
  return {
    synthetic: value.synthetic,
    ...(value.note === undefined ? {} : { note: value.note }),
    documents,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validMoney(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.includes(',')) {
    if (!/^(0|[1-9]\d{0,2}(,\d{3})*)(\.\d+)?$/.test(trimmed)) return false;
  } else {
    if (!/^\d*(\.\d+)?$/.test(trimmed) || trimmed === '' || trimmed === '.') return false;
  }
  try {
    const decimal = new Decimal(trimmed.replace(/,/g, ''));
    return (
      decimal.isFinite() && decimal.gte(0) && decimal.lt('1000000000000000') && decimal.dp() <= 4
    );
  } catch {
    return false;
  }
}

export interface DocumentScore {
  file: string;
  latencyMs: number;
  needsReview: boolean;
  /** Per field: did the normalized prediction equal the normalized label (null == null)? */
  matches: Record<BenchmarkField, boolean>;
}

export interface FieldMetrics {
  /** null when the extractor predicted nothing for this field. */
  precision: number | null;
  /** null when no document labels this field. */
  recall: number | null;
  exactMatch: number;
}

export interface BenchmarkReport {
  strategy: string;
  synthetic: boolean;
  documents: number;
  fields: Record<BenchmarkField, FieldMetrics>;
  allFieldsExact: number;
  needsReviewShare: number;
  latencyMs: { p50: number; p95: number; max: number };
  peakRssMb: number;
}

/** Normalizes a value for comparison; never trusts formatting differences in money or tax ids. */
export function normalizeField(field: BenchmarkField, value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (MONEY_FIELDS.has(field)) {
    try {
      const decimal = new Decimal(trimmed.replace(/,/g, ''));
      // Bound before expanding exponents: unsupported inputs must not allocate huge strings.
      return validMoney(trimmed) ? decimal.toFixed(4) : decimal.toString();
    } catch {
      return trimmed;
    }
  }
  if (field === 'vendorTaxId') return trimmed.replace(/[\s-]/g, '');
  if (field === 'currency') return trimmed.toUpperCase();
  return trimmed;
}

export function compareFields(
  predicted: FieldValues,
  label: FieldValues,
): Record<BenchmarkField, boolean> {
  const out = {} as Record<BenchmarkField, boolean>;
  for (const field of BENCHMARK_FIELDS) {
    const p = normalizeField(field, predicted[field]);
    const l = normalizeField(field, label[field]);
    out[field] =
      p === l &&
      (!MONEY_FIELDS.has(field) ||
        ((p === null || validMoney(p)) && (l === null || validMoney(l))));
  }
  return out;
}

/** Nearest-rank percentile over raw samples. */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

/**
 * precision = correct non-null predictions / non-null predictions
 * recall    = correct predictions of labelled values / labelled values
 * exactMatch = documents where prediction equals label, absence included / documents
 */
export function computeFieldMetrics(
  rows: Array<{ predicted: FieldValues; label: FieldValues }>,
): Record<BenchmarkField, FieldMetrics> {
  const out = {} as Record<BenchmarkField, FieldMetrics>;
  for (const field of BENCHMARK_FIELDS) {
    let predictedCount = 0;
    let labelledCount = 0;
    let correctPredicted = 0;
    let exact = 0;
    for (const { predicted, label } of rows) {
      const p = normalizeField(field, predicted[field]);
      const l = normalizeField(field, label[field]);
      const matches = compareFields(predicted, label)[field];
      if (matches) exact += 1;
      if (p !== null) predictedCount += 1;
      if (l !== null) labelledCount += 1;
      if (p !== null && matches) correctPredicted += 1;
    }
    out[field] = {
      precision: ratio(correctPredicted, predictedCount),
      recall: ratio(correctPredicted, labelledCount),
      exactMatch: rows.length === 0 ? 0 : exact / rows.length,
    };
  }
  return out;
}

export function buildReport(input: {
  strategy: string;
  synthetic: boolean;
  rows: Array<{ predicted: FieldValues; label: FieldValues; score: DocumentScore }>;
  peakRssMb: number;
}): BenchmarkReport {
  const { rows } = input;
  const latencies = rows.map((r) => r.score.latencyMs);
  const n = rows.length;
  return {
    strategy: input.strategy,
    synthetic: input.synthetic,
    documents: n,
    fields: computeFieldMetrics(rows),
    allFieldsExact:
      n === 0 ? 0 : rows.filter((r) => Object.values(r.score.matches).every(Boolean)).length / n,
    needsReviewShare: n === 0 ? 0 : rows.filter((r) => r.score.needsReview).length / n,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? Math.max(...latencies) : 0,
    },
    peakRssMb: input.peakRssMb,
  };
}

const pct = (v: number | null): string => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

export function formatMarkdown(report: BenchmarkReport, scores: DocumentScore[]): string {
  const lines: string[] = [];
  lines.push(`# Extraction benchmark (${report.strategy})`, '');
  if (report.synthetic) {
    lines.push(
      '> SYNTHETIC CORPUS. These numbers exercise the harness and the rule extractor on',
      '> hand-written fixtures. They are not an accuracy measurement on real invoices.',
      '',
    );
  }
  lines.push('| Field | Precision | Recall | Exact match |', '| --- | --- | --- | --- |');
  for (const field of BENCHMARK_FIELDS) {
    const m = report.fields[field];
    lines.push(`| ${field} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.exactMatch)} |`);
  }
  lines.push(
    '',
    `Documents: ${report.documents} | all fields exact: ${pct(report.allFieldsExact)} | ` +
      `NEEDS_REVIEW: ${pct(report.needsReviewShare)}`,
    `Latency p50 ${report.latencyMs.p50.toFixed(1)} ms | p95 ${report.latencyMs.p95.toFixed(1)} ms | ` +
      `max ${report.latencyMs.max.toFixed(1)} ms | peak RSS ${report.peakRssMb.toFixed(0)} MB`,
    '',
    '| Document | Latency (ms) | NEEDS_REVIEW | Fields matched | Mismatched fields |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const s of scores) {
    const missed = BENCHMARK_FIELDS.filter((f) => !s.matches[f]);
    lines.push(
      `| ${s.file} | ${s.latencyMs.toFixed(1)} | ${s.needsReview ? 'yes' : 'no'} | ` +
        `${BENCHMARK_FIELDS.length - missed.length}/${BENCHMARK_FIELDS.length} | ${missed.join(', ') || '-'} |`,
    );
  }
  return lines.join('\n') + '\n';
}
