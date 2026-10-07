/**
 * Offline extraction benchmark: runs the intake processor's CPU-only rules path over a labelled
 * corpus and reports per-field precision/recall/exact match, NEEDS_REVIEW share, latency and
 * peak RSS. Prints metrics and file names only, never document text or extracted values.
 *
 *   pnpm exec ts-node --transpile-only -r tsconfig-paths/register \
 *     src/modules/ai/extraction/benchmark/run-benchmark.ts --corpus <dir> [--labels <file>] [--out <dir>]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { extname, join, resolve } from 'path';
import { Logger } from '@nestjs/common';
import { needsReview } from '../../intake/intake-processor.service';
import { buildExtractionContext } from '../../services/document-intake.service';
import { DocumentExtractionResult } from '../../services/ollama.service';
import { ExtractionContext } from '../extraction-strategy.interface';
import { ExactMoney, requireLocalOcrAssets, RulesStrategy } from '../rules-strategy.service';
import { describeError } from '../../../../common/utils/redact';
import Decimal from 'decimal.js';
import {
  buildReport,
  compareFields,
  DocumentScore,
  FieldValues,
  formatMarkdown,
  validateLabels,
} from './scoring';

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain',
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) {
    const val = process.argv[i + 1];
    return val.startsWith('--') ? undefined : val;
  }
  return undefined;
}

function money(value: number | null): string | null {
  return value === null ? null : new Decimal(value.toString()).toFixed();
}

export function toFieldValues(
  e: DocumentExtractionResult | null,
  exactMoney?: ExactMoney,
): FieldValues {
  return {
    invoiceNumber: e?.invoiceNumber ?? null,
    date: e?.date ?? null,
    dueDate: e?.dueDate ?? null,
    vendorTaxId: e?.vendorTaxId ?? null,
    currency: e?.currency ?? null,
    subtotal: exactMoney ? exactMoney.subtotal : money(e?.subtotal ?? null),
    tax: exactMoney ? exactMoney.tax : money(e?.tax ?? null),
    total: exactMoney ? exactMoney.total : money(e?.total ?? null),
  };
}

/**
 * `.txt` fixtures stand in for a PDF's native text layer (what pdf-parse returns); real
 * `.pdf`/image files go through the processor's own context builder (pdf-parse / Tesseract).
 */
import { extractCpuDocument } from '../../intake/cpu-extraction';
import { NATIVE_TEXT_CONFIDENCE, structuredCpuResult } from '../../intake/cpu-structured';
import { withSecureTempDir } from '../../utils/secure-temp.util';
import { DocumentIntakeResult } from '../../services/document-intake.service';

export async function main(): Promise<void> {
  const corpus = arg('corpus');
  if (!corpus) throw new Error('--corpus <dir> is required');
  const corpusDir = resolve(corpus);
  const labelsPath = resolve(arg('labels') ?? join(corpusDir, 'labels.json'));

  const outDirIndex = process.argv.indexOf('--out');
  const outDir = arg('out');
  if (outDirIndex >= 0 && !outDir) throw new Error('--out requires a directory path');

  const language = arg('language') ?? 'eng+ara';

  // Strategy logs are metadata-only, but keep the report readable.
  Logger.overrideLogger(['error']);

  const labels = validateLabels(JSON.parse(readFileSync(labelsPath, 'utf8')));
  if (
    Object.keys(labels.documents).some((file) =>
      MIME_BY_EXT[extname(file).toLowerCase()]?.startsWith('image/'),
    )
  ) {
    requireLocalOcrAssets(language);
  }

  const rows: Array<{ predicted: FieldValues; label: FieldValues; score: DocumentScore }> = [];
  let peakRss = process.memoryUsage().rss;

  for (const [file, label] of Object.entries(labels.documents)) {
    const buffer = readFileSync(join(corpusDir, file));
    const mimeType = MIME_BY_EXT[extname(file).toLowerCase()];
    if (!mimeType) throw new Error(`Unsupported corpus file type: ${file}`);

    const start = process.hrtime.bigint();

    let result: DocumentIntakeResult;
    if (mimeType === 'text/plain') {
      result = structuredCpuResult(buffer.toString('utf8').trim(), NATIVE_TEXT_CONFIDENCE);
    } else {
      result = await withSecureTempDir('benchmark-', (dir) =>
        extractCpuDocument(buffer, mimeType, dir),
      );
    }

    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    peakRss = Math.max(peakRss, process.memoryUsage().rss);

    const predicted: FieldValues = {
      invoiceNumber: result.extractedFields.documentNumber,
      date: result.extractedFields.date,
      dueDate: result.extractedFields.dueDate,
      vendorTaxId: result.extractedFields.vendorTaxId,
      currency: result.extractedFields.currency,
      subtotal: result.extractedFields.subtotal,
      tax: result.extractedFields.tax,
      total: result.extractedFields.total,
    };

    const review = needsReview({
      ocrConfidence: result.ocrConfidence ?? 0,
      classificationConfidence: result.classificationConfidence ?? 0,
      documentType: result.documentType,
      extractedFields: result.extractedFields,
    });

    rows.push({
      predicted,
      label,
      score: { file, latencyMs, needsReview: review, matches: compareFields(predicted, label) },
    });
  }

  // maxRSS is the OS-reported process peak (KiB); fall back to sampled RSS.
  const osPeak = process.resourceUsage().maxRSS * 1024;
  const peakRssMb = Math.max(osPeak, peakRss) / (1024 * 1024);
  const report = buildReport({ strategy: 'rules', synthetic: labels.synthetic, rows, peakRssMb });
  const markdown = formatMarkdown(
    report,
    rows.map((r) => r.score),
  );
  process.stdout.write(markdown);

  if (outDir) {
    const dir = resolve(outDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'benchmark.md'), markdown);
    writeFileSync(
      join(dir, 'benchmark.json'),
      JSON.stringify({ report, documents: rows.map((r) => r.score) }, null, 2) + '\n',
    );
  }
}

export function benchmarkError(error: unknown): string {
  return `Benchmark failed: ${describeError(error, { includeMessage: false })}\n`;
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (error: unknown) => {
      process.stderr.write(benchmarkError(error));
      process.exit(1);
    },
  );
}
