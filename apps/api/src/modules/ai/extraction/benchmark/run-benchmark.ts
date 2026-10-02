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
import { RulesStrategy } from '../rules-strategy.service';
import {
  buildReport,
  compareFields,
  DocumentScore,
  FieldValues,
  formatMarkdown,
  LabelsFile,
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
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function money(value: number | null): string | null {
  return value === null ? null : value.toFixed(4);
}

export function toFieldValues(e: DocumentExtractionResult | null): FieldValues {
  return {
    invoiceNumber: e?.invoiceNumber ?? null,
    date: e?.date ?? null,
    dueDate: e?.dueDate ?? null,
    vendorTaxId: e?.vendorTaxId ?? null,
    currency: e?.currency ?? null,
    subtotal: money(e?.subtotal ?? null),
    tax: money(e?.tax ?? null),
    total: money(e?.total ?? null),
  };
}

/**
 * `.txt` fixtures stand in for a PDF's native text layer (what pdf-parse returns); real
 * `.pdf`/image files go through the processor's own context builder (pdf-parse / Tesseract).
 */
async function contextFor(
  file: string,
  buffer: Buffer,
  language: string,
): Promise<ExtractionContext> {
  const mimeType = MIME_BY_EXT[extname(file).toLowerCase()];
  if (!mimeType) throw new Error(`Unsupported corpus file type: ${file}`);
  if (mimeType === 'text/plain') {
    return {
      fileBuffer: buffer,
      mimeType: 'application/pdf',
      filename: file,
      language,
      isPdf: true,
      pdfText: buffer.toString('utf8').trim(),
      pdfIsNativeText: true,
      pdfPageCount: 1,
    };
  }
  return (await buildExtractionContext(buffer, mimeType, language, file)).context;
}

async function main(): Promise<void> {
  const corpus = arg('corpus');
  if (!corpus) throw new Error('--corpus <dir> is required');
  const corpusDir = resolve(corpus);
  const labelsPath = resolve(arg('labels') ?? join(corpusDir, 'labels.json'));
  const outDir = arg('out');
  const language = arg('language') ?? 'eng+ara';

  // Strategy logs are metadata-only, but keep the report readable.
  Logger.overrideLogger(['error']);

  const labels = JSON.parse(readFileSync(labelsPath, 'utf8')) as LabelsFile;
  const strategy = new RulesStrategy();
  const rows: Array<{ predicted: FieldValues; label: FieldValues; score: DocumentScore }> = [];
  let peakRss = process.memoryUsage().rss;

  for (const [file, label] of Object.entries(labels.documents)) {
    const buffer = readFileSync(join(corpusDir, file));
    const start = process.hrtime.bigint();
    const context = await contextFor(file, buffer, language);
    const result = await strategy.extract(context);
    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    peakRss = Math.max(peakRss, process.memoryUsage().rss);

    const extraction = result?.extraction ?? null;
    const predicted = toFieldValues(extraction);
    // Classification and duplicate checks need the database; the benchmark assumes an
    // invoice with no duplicate, so only extraction-driven review reasons count.
    const review = needsReview({
      ocrConfidence: extraction?.ocrConfidence ?? 0,
      documentType: 'BILL',
      extractedFields: { total: extraction?.total ?? null, date: extraction?.date ?? null },
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

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (error: unknown) => {
      process.stderr.write(
        `Benchmark failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
      );
      process.exit(1);
    },
  );
}
