/**
 * OCR Benchmark Script
 *
 * Processes all test-data files through the OCR pipeline and compares
 * extracted fields against ground truth annotations.
 *
 * Uses the real OcrService.buildExtractionResult() so extraction logic
 * is always in sync with the production code.
 *
 * Usage: cd apps/api && npx ts-node -r tsconfig-paths/register src/modules/ai/scripts/ocr-benchmark.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import { execFileSync } from 'child_process';
import * as Tesseract from 'tesseract.js';
import { getVerifiableEntries, GroundTruthEntry } from '../__tests__/fixtures/ground-truth';
import { OcrService, ExtractedInvoiceData } from '../services/ocr.service';

const TEST_DATA_DIR = path.resolve(__dirname, '../../../../../../test-data');
const CONVERTED_DIR = path.join(TEST_DATA_DIR, 'converted');

interface BenchmarkResult {
  file: string;
  ocrConfidence: number;
  fields: Record<string, { extracted: any; expected: any; match: boolean }>;
  overallAccuracy: number;
}

// Instantiate OcrService with null deps — only buildExtractionResult() is used,
// which calls private extraction methods with no DB or PaddleOCR interaction.
const ocrService = new (OcrService as any)(null, null) as OcrService;

function isHeicFile(filename: string): boolean {
  return /\.heic$/i.test(filename);
}

function isPdfFile(filename: string): boolean {
  return /\.pdf$/i.test(filename);
}

function isImageFile(filename: string): boolean {
  return /\.(jpg|jpeg|png|bmp|tiff?)$/i.test(filename);
}

async function getImageBuffer(filename: string): Promise<Buffer> {
  const fullPath = path.join(TEST_DATA_DIR, filename);

  if (isHeicFile(filename)) {
    const jpgName = filename.replace(/\.heic$/i, '.jpg');
    const convertedPath = path.join(CONVERTED_DIR, jpgName);

    if (fs.existsSync(convertedPath)) {
      return fs.readFileSync(convertedPath);
    }

    console.log(`  Converting ${filename} to JPEG via sips...`);
    const tmpOut = path.join(CONVERTED_DIR, jpgName);
    execFileSync('sips', ['-s', 'format', 'jpeg', fullPath, '--out', tmpOut]);
    return fs.readFileSync(tmpOut);
  }

  return fs.readFileSync(fullPath);
}

async function preprocessImage(imageBuffer: Buffer, arabicMode: boolean = false): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 0;
  const threshold = arabicMode ? 120 : 140;

  let pipeline = sharp(imageBuffer).rotate().grayscale().normalize();

  if (!arabicMode) {
    pipeline = pipeline.median(3);
  }

  pipeline = pipeline.sharpen({ sigma: arabicMode ? 0.8 : 1.0 });

  const targetWidth = arabicMode ? 3000 : 2000;
  if (width > 0 && width < 1500) {
    pipeline = pipeline.resize({ width: targetWidth, withoutEnlargement: false });
  } else if (width > 4000) {
    pipeline = pipeline.resize({ width: 3000 });
  }

  pipeline = pipeline.threshold(threshold);
  return pipeline.png().toBuffer();
}

function compareField(extracted: any, expected: any, fieldName: string): boolean {
  if (expected === null || expected === undefined) return true;
  if (extracted === null || extracted === undefined) return false;

  if (fieldName === 'total' || fieldName === 'subtotal' || fieldName === 'tax') {
    return Math.abs(Number(extracted) - Number(expected)) < 0.1;
  }

  if (fieldName === 'vendorName') {
    const e = String(extracted).toLowerCase();
    const x = String(expected).toLowerCase();
    return e.includes(x) || x.includes(e) || e === x;
  }

  if (fieldName === 'lineItemCount') {
    return Number(extracted) >= Number(expected);
  }

  return String(extracted).toLowerCase() === String(expected).toLowerCase();
}

function buildBenchmarkResult(
  entry: GroundTruthEntry,
  extraction: ExtractedInvoiceData,
  ocrConfidence: number,
): BenchmarkResult {
  const fields: Record<string, { extracted: any; expected: any; match: boolean }> = {};
  let matches = 0;
  let comparisons = 0;

  // Core fields
  const fieldMap: Array<[string, any, any]> = [
    ['total', extraction.total, entry.total],
    ['subtotal', extraction.subtotal, entry.subtotal],
    ['tax', extraction.tax, entry.tax],
    ['invoiceNumber', extraction.invoiceNumber, entry.invoiceNumber],
    ['date', extraction.date, entry.date],
    ['dueDate', extraction.dueDate, entry.dueDate],
    ['vendorName', extraction.vendorName, entry.vendorName],
    ['currency', extraction.currency, entry.currency],
    ['paymentTerms', extraction.paymentTerms, entry.paymentTerms],
  ];

  for (const [key, extractedVal, expectedVal] of fieldMap) {
    if (expectedVal === null || expectedVal === undefined) continue;
    comparisons++;
    const match = compareField(extractedVal, expectedVal, key);
    if (match) matches++;
    fields[key] = { extracted: extractedVal, expected: expectedVal, match };
  }

  // Line items comparison (count)
  if (entry.lineItems && entry.lineItems.length > 0) {
    comparisons++;
    const countMatch = extraction.lineItems.length >= entry.lineItems.length;
    if (countMatch) matches++;
    fields['lineItemCount'] = {
      extracted: extraction.lineItems.length,
      expected: entry.lineItems.length,
      match: countMatch,
    };

    // Per-line-item total comparison
    for (let i = 0; i < entry.lineItems.length; i++) {
      const expectedItem = entry.lineItems[i];
      const foundItem = extraction.lineItems.find(
        (li) => Math.abs(li.total - expectedItem.total) < 0.1,
      );
      comparisons++;
      const itemMatch = !!foundItem;
      if (itemMatch) matches++;
      fields[`lineItem[${i}].total`] = {
        extracted: foundItem ? foundItem.total : null,
        expected: expectedItem.total,
        match: itemMatch,
      };
    }
  }

  return {
    file: entry.file,
    ocrConfidence,
    fields,
    overallAccuracy: comparisons > 0 ? matches / comparisons : 1,
  };
}

async function processImage(entry: GroundTruthEntry): Promise<BenchmarkResult | null> {
  try {
    const buf = await getImageBuffer(entry.file);
    const rotated = await sharp(buf).rotate().toBuffer();
    const preprocessed = await preprocessImage(rotated, true);

    const worker = await Tesseract.createWorker('eng+ara', Tesseract.OEM.LSTM_ONLY);
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });
    const result = await worker.recognize(preprocessed, { rotateAuto: true });
    await worker.terminate();

    const rawText = result.data.text;
    const confidence = result.data.confidence;

    // Use the real OcrService extraction pipeline
    const extraction = ocrService.buildExtractionResult(rawText, confidence);

    return buildBenchmarkResult(entry, extraction, confidence);
  } catch (error) {
    console.error(`  ERROR processing ${entry.file}: ${(error as Error).message}`);
    return null;
  }
}

async function processPdf(entry: GroundTruthEntry): Promise<BenchmarkResult | null> {
  try {
    const fullPath = path.join(TEST_DATA_DIR, entry.file);
    const buf = fs.readFileSync(fullPath);

    const pdfModule = require('pdf-parse');
    const PDFParse = pdfModule.PDFParse || pdfModule.default || pdfModule;

    let text = '';
    let pageCount = 1;

    if (typeof PDFParse === 'function') {
      try {
        const uint8 = new Uint8Array(buf);
        const parser = new PDFParse(uint8);
        const result = await parser.getText();
        text = (result.text || '').trim();
        pageCount = result.total || 1;
      } catch {
        try {
          const result = await PDFParse(buf);
          text = (result.text || '').trim();
          pageCount = result.numpages || 1;
        } catch (e2) {
          console.error(`  PDF parse failed: ${(e2 as Error).message}`);
          return null;
        }
      }
    }

    if (text.length < pageCount * 50) {
      console.log(`  ${entry.file}: Scanned PDF (no text), skipping`);
      return null;
    }

    // Use the real OcrService extraction pipeline
    const extraction = ocrService.buildExtractionResult(text, 100);

    return buildBenchmarkResult(entry, extraction, 100);
  } catch (error) {
    console.error(`  ERROR processing ${entry.file}: ${(error as Error).message}`);
    return null;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  OCR Benchmark — Mizano ERP');
  console.log('  Using real OcrService.buildExtractionResult()');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const entries = getVerifiableEntries();
  console.log(`Found ${entries.length} verifiable entries in ground truth`);
  console.log('');

  const results: BenchmarkResult[] = [];

  for (const entry of entries) {
    console.log(`Processing: ${entry.file} (${entry.description})`);

    let result: BenchmarkResult | null = null;

    if (isPdfFile(entry.file)) {
      result = await processPdf(entry);
    } else if (isHeicFile(entry.file) || isImageFile(entry.file)) {
      result = await processImage(entry);
    } else {
      console.log('  Skipping (unsupported format)');
      continue;
    }

    if (result) {
      results.push(result);
      const status = result.overallAccuracy >= 0.8 ? '✓' : '✗';
      console.log(
        `  ${status} Confidence: ${result.ocrConfidence.toFixed(1)}% | Accuracy: ${(result.overallAccuracy * 100).toFixed(0)}%`,
      );

      for (const [field, data] of Object.entries(result.fields)) {
        const mark = data.match ? '✓' : '✗';
        console.log(
          `    ${mark} ${field}: extracted="${data.extracted}" expected="${data.expected}"`,
        );
      }
    }
    console.log('');
  }

  // ─── Summary ─────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');

  if (results.length === 0) {
    console.log('No results to summarize.');
    return;
  }

  const avgConfidence = results.reduce((sum, r) => sum + r.ocrConfidence, 0) / results.length;
  const avgAccuracy = results.reduce((sum, r) => sum + r.overallAccuracy, 0) / results.length;

  console.log(`Files processed: ${results.length}`);
  console.log(`Average OCR confidence: ${avgConfidence.toFixed(1)}%`);
  console.log(`Average field accuracy: ${(avgAccuracy * 100).toFixed(1)}%`);

  // Per-field accuracy
  const fieldStats: Record<string, { total: number; correct: number }> = {};
  for (const result of results) {
    for (const [field, data] of Object.entries(result.fields)) {
      // Group lineItem[N].total under "lineItemTotals"
      const key = field.startsWith('lineItem[') ? 'lineItemTotals' : field;
      if (!fieldStats[key]) fieldStats[key] = { total: 0, correct: 0 };
      fieldStats[key].total++;
      if (data.match) fieldStats[key].correct++;
    }
  }

  console.log('');
  console.log('Per-field accuracy:');
  for (const [field, stats] of Object.entries(fieldStats)) {
    const pct = ((stats.correct / stats.total) * 100).toFixed(0);
    const bar = '█'.repeat(Math.round((stats.correct / stats.total) * 20));
    console.log(`  ${field.padEnd(20)} ${stats.correct}/${stats.total} (${pct}%) ${bar}`);
  }

  // ─── Confidence Tier Breakdown ───────────────────────────────────
  console.log('');
  console.log('OCR Confidence Tiers:');
  const tiers = [
    { label: 'High (≥80%)', filter: (r: BenchmarkResult) => r.ocrConfidence >= 80 },
    {
      label: 'Medium (50-80%)',
      filter: (r: BenchmarkResult) => r.ocrConfidence >= 50 && r.ocrConfidence < 80,
    },
    { label: 'Low (<50%)', filter: (r: BenchmarkResult) => r.ocrConfidence < 50 },
  ];

  for (const tier of tiers) {
    const tierResults = results.filter(tier.filter);
    if (tierResults.length === 0) {
      console.log(`  ${tier.label}: 0 files`);
      continue;
    }
    const tierAvg = tierResults.reduce((sum, r) => sum + r.overallAccuracy, 0) / tierResults.length;
    console.log(
      `  ${tier.label}: ${tierResults.length} files, avg accuracy ${(tierAvg * 100).toFixed(1)}%`,
    );
    for (const r of tierResults) {
      console.log(`    ${r.file}: ${(r.overallAccuracy * 100).toFixed(0)}%`);
    }
  }

  // ─── Pass/Fail Summary ───────────────────────────────────────────
  console.log('');
  const passed = results.filter((r) => r.overallAccuracy >= 0.8).length;
  const failed = results.filter((r) => r.overallAccuracy < 0.8).length;
  console.log(`Pass (≥80% accuracy): ${passed}/${results.length}`);
  console.log(`Fail (<80% accuracy): ${failed}/${results.length}`);

  if (failed > 0) {
    console.log('');
    console.log('Failing files:');
    for (const r of results.filter((r) => r.overallAccuracy < 0.8)) {
      console.log(`  ✗ ${r.file}: ${(r.overallAccuracy * 100).toFixed(0)}%`);
      for (const [field, data] of Object.entries(r.fields)) {
        if (!data.match) {
          console.log(`      ${field}: got "${data.extracted}" expected "${data.expected}"`);
        }
      }
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
