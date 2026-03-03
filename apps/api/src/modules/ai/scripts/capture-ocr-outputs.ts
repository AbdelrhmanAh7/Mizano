/**
 * OCR Capture Script
 *
 * Processes all test-data files through OCR and captures raw text output.
 * Outputs:
 *   1. Human-readable text files in test-data/ocr-captures/
 *   2. TypeScript-ready fixture constants for sample-invoice-text.ts
 *
 * Usage:
 *   cd apps/api && npx ts-node -r tsconfig-paths/register src/modules/ai/scripts/capture-ocr-outputs.ts
 *
 * Options:
 *   --fixtures   Also generate TypeScript fixture file
 *   --file=NAME  Process only a specific file (e.g., --file=IMG_2560.HEIC)
 */

/* eslint-disable no-console */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import * as Tesseract from 'tesseract.js';
import { GROUND_TRUTH } from '../__tests__/fixtures/ground-truth';

const TEST_DATA_DIR = path.resolve(__dirname, '../../../../../../test-data');
const CONVERTED_DIR = path.join(TEST_DATA_DIR, 'converted');
const CAPTURES_DIR = path.join(TEST_DATA_DIR, 'ocr-captures');

interface CaptureResult {
  file: string;
  rawText: string;
  confidence: number;
  passes: Array<{ label: string; confidence: number; textLength: number }>;
}

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
  if (isHeicFile(filename)) {
    const jpgName = filename.replace(/\.heic$/i, '.jpg');
    const convertedPath = path.join(CONVERTED_DIR, jpgName);
    if (fs.existsSync(convertedPath)) {
      return fs.readFileSync(convertedPath);
    }
    throw new Error(`No converted JPEG found for ${filename}. Run sips conversion first.`);
  }

  return fs.readFileSync(path.join(TEST_DATA_DIR, filename));
}

async function preprocessImage(
  imageBuffer: Buffer,
  arabicMode: boolean = false,
  threshold?: number,
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 0;
  const thresholdValue = threshold ?? (arabicMode ? 120 : 140);

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

  pipeline = pipeline.threshold(thresholdValue);
  return pipeline.png().toBuffer();
}

function isArabicText(text: string): boolean {
  const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return arabicChars > latinChars;
}

async function performOcr(
  imageBuffer: Buffer,
  language: string,
  psm: Tesseract.PSM,
): Promise<{ text: string; confidence: number }> {
  const worker = await Tesseract.createWorker(language, Tesseract.OEM.LSTM_ONLY);
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: psm,
      preserve_interword_spaces: '1',
    });
    const result = await worker.recognize(imageBuffer, { rotateAuto: true });
    return { text: result.data.text, confidence: result.data.confidence };
  } finally {
    await worker.terminate();
  }
}

async function processImage(filename: string): Promise<CaptureResult> {
  const buf = await getImageBuffer(filename);
  const rotated = await sharp(buf).rotate().toBuffer();

  const passes: Array<{ label: string; confidence: number; textLength: number; text: string }> = [];

  // Pass 1: Standard preprocessing + PSM6
  try {
    const preprocessed = await preprocessImage(rotated, false);
    const result = await performOcr(preprocessed, 'eng+ara', Tesseract.PSM.SINGLE_BLOCK);
    passes.push({ label: 'standard+PSM6', ...result, textLength: result.text.length });
  } catch (e) {
    console.error(`  Pass 1 failed: ${(e as Error).message}`);
  }

  // Detect Arabic from first pass
  const detectedArabic = passes.length > 0 && isArabicText(passes[0].text);

  // Pass 2: Arabic-optimized preprocessing + PSM6 (if Arabic detected)
  if (detectedArabic) {
    try {
      const arabicPreprocessed = await preprocessImage(rotated, true);
      const result = await performOcr(arabicPreprocessed, 'eng+ara', Tesseract.PSM.SINGLE_BLOCK);
      passes.push({ label: 'arabic+PSM6', ...result, textLength: result.text.length });
    } catch (e) {
      console.error(`  Pass 2 (Arabic) failed: ${(e as Error).message}`);
    }
  }

  // Pass 3: PSM4 (single column)
  try {
    const preprocessed = await preprocessImage(rotated, detectedArabic);
    const result = await performOcr(preprocessed, 'eng+ara', Tesseract.PSM.SINGLE_COLUMN);
    passes.push({
      label: `${detectedArabic ? 'arabic' : 'standard'}+PSM4`,
      ...result,
      textLength: result.text.length,
    });
  } catch (e) {
    console.error(`  Pass 3 failed: ${(e as Error).message}`);
  }

  // Pass 4: PSM AUTO
  try {
    const preprocessed = await preprocessImage(rotated, detectedArabic);
    const result = await performOcr(preprocessed, 'eng+ara', Tesseract.PSM.AUTO);
    passes.push({
      label: `${detectedArabic ? 'arabic' : 'standard'}+PSM_AUTO`,
      ...result,
      textLength: result.text.length,
    });
  } catch (e) {
    console.error(`  Pass 4 failed: ${(e as Error).message}`);
  }

  // Select best pass by confidence
  const best = passes.reduce((a, b) => (a.confidence > b.confidence ? a : b), passes[0]);

  return {
    file: filename,
    rawText: best.text,
    confidence: best.confidence,
    passes: passes.map(({ label, confidence, textLength }) => ({ label, confidence, textLength })),
  };
}

async function processPdf(filename: string): Promise<CaptureResult | null> {
  const fullPath = path.join(TEST_DATA_DIR, filename);
  const buf = fs.readFileSync(fullPath);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
      // Try v1 API
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

  const isNativeText = text.length > pageCount * 50;

  return {
    file: filename,
    rawText: text,
    confidence: isNativeText ? 100 : 0,
    passes: [
      {
        label: isNativeText ? 'native-pdf' : 'scanned-pdf',
        confidence: isNativeText ? 100 : 0,
        textLength: text.length,
      },
    ],
  };
}

function sanitizeConstName(filename: string): string {
  return (
    'REAL_' +
    filename
      .replace(/\.(heic|jpg|jpeg|png|pdf)$/i, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toUpperCase() +
    '_OCR'
  );
}

function escapeForTemplate(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

async function main() {
  const args = process.argv.slice(2);
  const generateFixtures = args.includes('--fixtures');
  const fileFilter = args.find((a) => a.startsWith('--file='))?.split('=')[1];

  // Ensure captures directory exists
  if (!fs.existsSync(CAPTURES_DIR)) {
    fs.mkdirSync(CAPTURES_DIR, { recursive: true });
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  OCR Capture Script — Mizano ERP');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Get all test files
  let testFiles = fs
    .readdirSync(TEST_DATA_DIR)
    .filter((f) => !fs.statSync(path.join(TEST_DATA_DIR, f)).isDirectory());

  if (fileFilter) {
    testFiles = testFiles.filter((f) => f === fileFilter);
    if (testFiles.length === 0) {
      console.error(`File not found: ${fileFilter}`);
      process.exit(1);
    }
  }

  console.log(`Found ${testFiles.length} test files`);
  console.log('');

  const results: CaptureResult[] = [];
  const fixtureLines: string[] = [];
  const confidenceMap: Record<string, number> = {};

  for (const file of testFiles) {
    console.log(`Processing: ${file}`);

    let result: CaptureResult | null = null;

    if (isPdfFile(file)) {
      result = await processPdf(file);
    } else if (isHeicFile(file) || isImageFile(file)) {
      result = await processImage(file);
    } else {
      console.log(`  Skipping (unsupported format)`);
      continue;
    }

    if (!result) {
      console.log(`  Failed to process`);
      continue;
    }

    results.push(result);

    // Print summary
    console.log(`  Best confidence: ${result.confidence.toFixed(1)}%`);
    console.log(`  Text length: ${result.rawText.length} chars`);
    console.log(`  Passes tried: ${result.passes.length}`);
    for (const pass of result.passes) {
      console.log(`    ${pass.label}: ${pass.confidence.toFixed(1)}% (${pass.textLength} chars)`);
    }

    // Find ground truth
    const gt = GROUND_TRUTH.find((g) => g.file === file);
    if (gt) {
      console.log(`  Ground truth: ${gt.description}`);
    } else {
      console.log(`  Ground truth: NOT FOUND`);
    }

    // Save capture file
    const capturePath = path.join(CAPTURES_DIR, file.replace(/\.[^.]+$/, '.txt'));
    const captureContent = [
      `File: ${file}`,
      `Confidence: ${result.confidence.toFixed(1)}%`,
      `Text Length: ${result.rawText.length} chars`,
      `Ground Truth: ${gt?.description || 'N/A'}`,
      '',
      'Passes:',
      ...result.passes.map(
        (p) => `  ${p.label}: ${p.confidence.toFixed(1)}% (${p.textLength} chars)`,
      ),
      '',
      '═══ RAW OCR TEXT ═══',
      '',
      result.rawText,
      '',
      '═══ END ═══',
    ].join('\n');
    fs.writeFileSync(capturePath, captureContent, 'utf-8');

    // Generate fixture constant
    if (generateFixtures && result.rawText.trim().length > 0) {
      const constName = sanitizeConstName(file);
      confidenceMap[constName] = Math.round(result.confidence * 10) / 10;
      fixtureLines.push(
        `/** Real OCR output from ${file} (${result.confidence.toFixed(1)}% confidence) */`,
      );
      fixtureLines.push(`export const ${constName} = \`${escapeForTemplate(result.rawText)}\`;`);
      fixtureLines.push('');
    }

    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total files processed: ${results.length}`);
  console.log(`Captures saved to: ${CAPTURES_DIR}`);

  const avgConf = results.reduce((s, r) => s + r.confidence, 0) / results.length;
  console.log(`Average OCR confidence: ${avgConf.toFixed(1)}%`);

  // Confidence tiers
  const high = results.filter((r) => r.confidence >= 80).length;
  const medium = results.filter((r) => r.confidence >= 50 && r.confidence < 80).length;
  const low = results.filter((r) => r.confidence < 50).length;
  console.log(`  High (>=80%): ${high} files`);
  console.log(`  Medium (50-80%): ${medium} files`);
  console.log(`  Low (<50%): ${low} files`);

  // Write fixture file if requested
  if (generateFixtures && fixtureLines.length > 0) {
    const fixtureContent = [
      '// Auto-generated OCR output fixtures',
      `// Generated: ${new Date().toISOString()}`,
      '// Run: cd apps/api && npx ts-node -r tsconfig-paths/register src/modules/ai/scripts/capture-ocr-outputs.ts --fixtures',
      '',
      ...fixtureLines,
      `/** OCR confidence map: fixture constant name → confidence % */`,
      `export const OCR_CONFIDENCE_MAP: Record<string, number> = ${JSON.stringify(confidenceMap, null, 2)};`,
      '',
    ].join('\n');

    const fixtureOutputPath = path.join(CAPTURES_DIR, 'generated-fixtures.ts');
    fs.writeFileSync(fixtureOutputPath, fixtureContent, 'utf-8');
    console.log(`\nFixture file written to: ${fixtureOutputPath}`);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
