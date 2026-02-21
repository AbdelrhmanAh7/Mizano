import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import * as Tesseract from 'tesseract.js';
import * as sharp from 'sharp';
import { execFile } from 'child_process';
import { promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { levenshteinSimilarity } from '../utils/text-similarity.util';
import { PaddleOcrService } from './paddle-ocr.service';

export interface ExtractedInvoiceData {
  date: string | null;
  dueDate: string | null;
  paymentTerms: string | null;
  currency: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  invoiceNumber: string | null;
  vendorName: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  ocrConfidence: number;
  rawText: string;
  fieldConfidence: Record<string, number>;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingBillId: string | null;
  similarity: number;
  matchType: 'exact_number' | 'amount_date' | 'none';
}

export interface VendorLayoutHint {
  dateRegion?: { x: number; y: number; width: number; height: number };
  totalRegion?: { x: number; y: number; width: number; height: number };
  lineItemsRegion?: { x: number; y: number; width: number; height: number };
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  // Document header text to skip when looking for vendor name
  private readonly HEADER_SKIP_PATTERNS = [
    /^tax\s*invoice$/i,
    /^invoice$/i,
    /^receipt$/i,
    /^proforma/i,
    /^credit\s*note$/i,
    /^debit\s*note$/i,
    /^bill\s*of\s*supply$/i,
    /^delivery\s*note$/i,
    /^purchase\s*order$/i,
    /^quotation$/i,
    /^estimate$/i,
    /^statement/i,
    /^فاتورة\s*ضريبية/i,
    /^فاتورة$/i,
    /^إشعار/i,
  ];

  // Company suffixes that indicate a company name
  private readonly COMPANY_SUFFIXES = [
    /\b(LLC|L\.?L\.?C\.?)\b/i,
    /\b(Ltd|Limited|L\.?t\.?d\.?)\b/i,
    /\b(Inc|Incorporated)\b/i,
    /\b(Corp|Corporation)\b/i,
    /\b(Co\.?|Company)\b/i,
    /\b(GmbH|AG|S\.?A\.?|SARL|SRL|BV|NV|PLC)\b/i,
    /\bPvt\b/i,
    /\b(FZE|FZC|FZCO|FZ-LLC)\b/i,
    /\b(Est\.?|Establishment)\b/i,
    /\bGroup\b/i,
    /\bTrading\b/i,
    /\bEnterprises?\b/i,
    // Arabic company suffixes
    /ذ\.?م\.?م/, // ذ.م.م (LLC)
    /ش\.?م\.?م/, // ش.م.م (Joint-stock)
    /مؤسسة/, // مؤسسة (Establishment)
    /شركة/, // شركة (Company)
    /للتجارة/, // للتجارة (Trading)
    /للتكنولوجيا/, // للتكنولوجيا (Technology)
    /للمقاولات/, // للمقاولات (Contracting)
    /للخدمات/, // للخدمات (Services)
  ];

  // Labels that precede vendor names
  private readonly VENDOR_LABEL_PATTERNS = [
    /(?:bill\s*from|sold\s*by|vendor|supplier|billed\s*by|company)\s*[:;]?\s*(.+)/i,
    /(?:المورد|البائع|من)\s*[:;]?\s*(.+)/i,
  ];

  // Lines that look like addresses (skip for vendor name)
  private readonly ADDRESS_PATTERNS = [
    /\bP\.?\s*O\.?\s*Box\b/i,
    /\b\d{4,6}\b.*\b(street|st|road|rd|avenue|ave|blvd|drive|dr|lane|ln)\b/i,
    /\b(floor|suite|unit|building|block)\s*\d/i,
    /\b\d{5}(-\d{4})?\b/,
    /\btel\b|\bfax\b|\bphone\b|\bmobile\b/i,
    /\bwww\.|\.com\b|@/i,
  ];

  constructor(
    private prisma: PrismaService,
    private paddleOcrService: PaddleOcrService,
  ) {}

  // ─── HEIC Conversion ───────────────────────────────────────────────

  /**
   * Convert HEIC/HEIF image to JPEG buffer using macOS sips (fallback).
   * Sharp's libvips may not have libheif codec compiled in.
   */
  private async convertHeicToJpeg(imageBuffer: Buffer): Promise<Buffer> {
    // First try sharp (works if libheif codec is available)
    try {
      return await sharp(imageBuffer).jpeg({ quality: 95 }).toBuffer();
    } catch {
      // Fallback: use macOS sips command
      this.logger.debug('Sharp cannot decode HEIC, falling back to macOS sips');
    }

    const tmpIn = join(tmpdir(), `ocr-heic-${Date.now()}.heic`);
    const tmpOut = join(tmpdir(), `ocr-heic-${Date.now()}.jpg`);

    try {
      await fsPromises.writeFile(tmpIn, imageBuffer);
      await new Promise<void>((resolve, reject) => {
        execFile('sips', ['-s', 'format', 'jpeg', tmpIn, '--out', tmpOut], (err) => {
          if (err) reject(new Error(`sips conversion failed: ${err.message}`));
          else resolve();
        });
      });
      return await fsPromises.readFile(tmpOut);
    } finally {
      await fsPromises.unlink(tmpIn).catch(() => {});
      await fsPromises.unlink(tmpOut).catch(() => {});
    }
  }

  /**
   * Detect if a buffer is HEIC/HEIF format by checking magic bytes.
   */
  private isHeicFormat(buffer: Buffer): boolean {
    // HEIF/HEIC files have 'ftyp' at offset 4 and 'heic'/'heix'/'hevc'/'mif1' after
    if (buffer.length < 12) return false;
    const ftyp = buffer.toString('ascii', 4, 8);
    if (ftyp !== 'ftyp') return false;
    const brand = buffer.toString('ascii', 8, 12);
    return ['heic', 'heix', 'hevc', 'mif1'].includes(brand);
  }

  /**
   * Ensure image buffer is in a format sharp can process (convert HEIC if needed).
   * Also applies EXIF auto-rotation for phone photos.
   */
  private async ensureProcessableImage(imageBuffer: Buffer): Promise<Buffer> {
    let buf = imageBuffer;

    // Convert HEIC to JPEG if needed
    if (this.isHeicFormat(buf)) {
      this.logger.debug('HEIC format detected, converting to JPEG');
      buf = await this.convertHeicToJpeg(buf);
    }

    // Auto-rotate based on EXIF orientation (critical for phone photos)
    buf = await sharp(buf).rotate().toBuffer();

    return buf;
  }

  // ─── Image Preprocessing ───────────────────────────────────────────

  /**
   * Detect if text is primarily Arabic script.
   */
  private isArabicText(text: string): boolean {
    const arabicChars = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g) || []).length;
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
    return arabicChars > latinChars;
  }

  /**
   * Preprocess image to maximize OCR accuracy.
   * Pipeline: grayscale -> normalize contrast -> noise reduction -> sharpen -> resize -> binarize
   */
  private async preprocessImage(
    imageBuffer: Buffer,
    options?: { arabicMode?: boolean; threshold?: number },
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const arabicMode = options?.arabicMode ?? false;
    const thresholdValue = options?.threshold ?? (arabicMode ? 120 : 140);

    let pipeline = sharp(imageBuffer).grayscale().normalize();

    // Arabic text: skip median filter (blurs thin Arabic strokes)
    if (!arabicMode) {
      pipeline = pipeline.median(3);
    }

    pipeline = pipeline.sharpen({ sigma: arabicMode ? 0.8 : 1.0 });

    // Upscale small images (Tesseract works best at ~300 DPI / 2000-3000px wide)
    // Arabic needs larger target for fine detail
    const targetWidth = arabicMode ? 3000 : 2000;
    if (width > 0 && width < 1500) {
      pipeline = pipeline.resize({ width: targetWidth, withoutEnlargement: false });
    } else if (width > 4000) {
      pipeline = pipeline.resize({ width: 3000 });
    }

    // Binarize: pure black & white. Most impactful step for OCR.
    // Arabic needs lower threshold to preserve diacritics
    pipeline = pipeline.threshold(thresholdValue);

    return pipeline.png().toBuffer();
  }

  /**
   * More aggressive preprocessing for retry passes on difficult images.
   */
  private async preprocessImageAggressive(
    imageBuffer: Buffer,
    options?: { arabicMode?: boolean },
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const arabicMode = options?.arabicMode ?? false;

    let pipeline = sharp(imageBuffer).grayscale().normalize();

    if (!arabicMode) {
      pipeline = pipeline.median(5);
    } else {
      pipeline = pipeline.median(1);
    }

    pipeline = pipeline.sharpen({ sigma: 1.5 });

    if (width > 0 && width < 1500) {
      pipeline = pipeline.resize({ width: 2500, withoutEnlargement: false });
    } else if (width > 4000) {
      pipeline = pipeline.resize({ width: 3000 });
    }

    // Lower threshold: more text survives binarization (better for faded documents)
    pipeline = pipeline.threshold(arabicMode ? 100 : 110);

    return pipeline.png().toBuffer();
  }

  // ─── OCR Text Normalization ─────────────────────────────────────────

  /**
   * Normalize OCR text to fix common recognition errors.
   * Applied between raw OCR output and field extraction.
   */
  private normalizeOcrText(text: string): string {
    let normalized = text;

    // Remove stray Unicode directional marks that confuse regex
    normalized = normalized.replace(
      /[\u200E\u200F\u200B\u200C\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g,
      '',
    );

    // Normalize Arabic numerals to Western
    const arabicNumerals: Record<string, string> = {
      '\u0660': '0',
      '\u0661': '1',
      '\u0662': '2',
      '\u0663': '3',
      '\u0664': '4',
      '\u0665': '5',
      '\u0666': '6',
      '\u0667': '7',
      '\u0668': '8',
      '\u0669': '9',
    };
    for (const [arabic, western] of Object.entries(arabicNumerals)) {
      normalized = normalized.replace(new RegExp(arabic, 'g'), western);
    }

    // Fix OCR letter→digit confusion in numeric contexts (amounts, totals, etc.)
    // General O→0 replacement in number-like contexts: replace O with 0 when surrounded by digits/commas
    // e.g., "6,6OO.OO" → "6,600.00", "5,5OO.OO" → "5,500.00", "4,OOO.OO" → "4,000.00"
    normalized = normalized.replace(/(\d[\d,]*(?:[O0][\d,O]*)*)\.((?:[O0]){2})/g, (match) =>
      match.replace(/O/g, '0'),
    );
    // Also handle O mixed with digits before decimal: "6,6OO" → "6,600"
    normalized = normalized.replace(/(\d,[\dO]{3})/g, (match) => match.replace(/O/g, '0'));
    // Fix O→0 within amount-like contexts: digit followed by O in number patterns
    normalized = normalized.replace(/(\d[\d,]*)[oO]([\d,]*\.\d{2})/g, '$10$2');
    // Fix `l` or `I` as `1` in amounts: l,500.00 → 1,500.00
    normalized = normalized.replace(/(?<![a-zA-Z])[lI]([\d,]+\.\d{2})/g, '1$1');

    // Fix garbled "INVOICE" variants
    normalized = normalized.replace(/lNV[O0]lCE/gi, 'INVOICE');
    normalized = normalized.replace(/1NV[O0]1CE/gi, 'INVOICE');
    normalized = normalized.replace(/lNVOICE/gi, 'INVOICE');
    normalized = normalized.replace(/INV0ICE/gi, 'INVOICE');

    // Fix garbled "TOTAL" variants
    normalized = normalized.replace(/T[O0]TAL/gi, 'TOTAL');
    normalized = normalized.replace(/TOTA[l1]/gi, 'TOTAL');
    normalized = normalized.replace(/T0TA1/gi, 'TOTAL');

    // Fix OCR garbling of / as | or \ in dates
    normalized = normalized.replace(/(\d{1,2})[|\\](\d{1,2})[|\\](\d{2,4})/g, '$1/$2/$3');

    // Fix split words (common in OCR): rejoin words broken by single space in middle
    // e.g., "Consult ing" → "Consulting", "Desc ription" → "Description"
    normalized = normalized.replace(/\b([A-Z][a-z]{2,})\s([a-z]{2,})\b/g, (match, p1, p2) => {
      const combined = p1 + p2;
      // Only rejoin if the combined word is commonly known
      const commonWords = [
        'consulting',
        'description',
        'services',
        'software',
        'development',
        'maintenance',
        'shipping',
        'delivery',
        'handling',
        'processing',
        'certificate',
        'subscription',
        'installation',
        'international',
        'management',
        'engineering',
        'construction',
        'transportation',
      ];
      if (commonWords.includes(combined.toLowerCase())) {
        return combined;
      }
      return match;
    });

    // Arabic comma as decimal separator: ،  (U+060C)
    normalized = normalized.replace(/(\d)\u060C(\d{2})\b/g, '$1.$2');

    // Fix space-as-decimal in amount contexts (e.g., "24 95" → "24.95")
    // Only apply on lines that contain total/tax/vat/amount/subtotal keywords
    normalized = normalized
      .split('\n')
      .map((line) => {
        if (/total|tax|vat|amount|subtotal|aed|sar|usd|eur/i.test(line)) {
          // Replace space-as-decimal but NOT when preceded by a decimal point
          // e.g., "24 95" → "24.95" but "499.00 24" should NOT become "499.00.24"
          return line.replace(/(?<!\.\d*)(?<=\s|^)(\d{1,6}) (\d{2})(?=\s|$)/g, '$1.$2');
        }
        return line;
      })
      .join('\n');

    // Collapse multiple spaces
    normalized = normalized.replace(/ {2,}/g, ' ');

    return normalized;
  }

  // ─── OCR Engine ────────────────────────────────────────────────────

  /**
   * Perform OCR using worker API with configurable PSM and OEM.
   */
  private async performOcr(
    imageBuffer: Buffer,
    language: string,
    psm: Tesseract.PSM = Tesseract.PSM.SINGLE_BLOCK,
  ): Promise<{ text: string; confidence: number }> {
    const worker = await Tesseract.createWorker(language, Tesseract.OEM.LSTM_ONLY, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          this.logger.debug(`OCR progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: '1',
      });

      const result = await worker.recognize(imageBuffer, {
        rotateAuto: true,
      });

      return {
        text: result.data.text,
        confidence: result.data.confidence,
      };
    } finally {
      await worker.terminate();
    }
  }

  /**
   * Extract data from an invoice image using hybrid OCR approach.
   * Strategy: Try Tesseract.js first (fast), fall back to PaddleOCR (accurate) if needed.
   * Handles HEIC/HEIF format conversion and EXIF auto-rotation.
   */
  async extractFromImage(
    imageBuffer: Buffer,
    language: string = 'eng+ara',
  ): Promise<ExtractedInvoiceData> {
    this.logger.log('Starting OCR extraction with hybrid Tesseract → PaddleOCR pipeline');

    try {
      // ─── Phase 0: Ensure processable format (HEIC→JPEG, EXIF rotate) ─
      const processableBuffer = await this.ensureProcessableImage(imageBuffer);

      // ─── Phase 1: Fast Tesseract.js Passes ─────────────────────────

      interface OcrAttempt {
        text: string;
        confidence: number;
        label: string;
      }

      const attempts: OcrAttempt[] = [];
      let detectedArabic = false;

      // Pass 1: Standard preprocessed image + PSM SINGLE_BLOCK
      try {
        const preprocessed = await this.preprocessImage(processableBuffer);
        const result = await this.performOcr(preprocessed, language, Tesseract.PSM.SINGLE_BLOCK);
        this.logger.log(
          `[Tesseract] Pass 1 (preprocessed+PSM6): confidence=${result.confidence.toFixed(1)}%`,
        );
        attempts.push({ ...result, label: 'Tesseract:preprocessed+PSM6' });

        // Detect if content is primarily Arabic for subsequent passes
        detectedArabic = this.isArabicText(result.text);

        if (result.confidence >= 85) {
          this.logger.log(`✓ High confidence result from Tesseract, using it directly`);
          return this.buildExtractionResult(result.text, result.confidence);
        }
      } catch (error) {
        this.logger.warn(`[Tesseract] Pass 1 failed: ${error}`);
      }

      // Pass 1b: If Arabic detected, try Arabic-optimized preprocessing
      if (detectedArabic) {
        try {
          const arabicPreprocessed = await this.preprocessImage(processableBuffer, {
            arabicMode: true,
          });
          const result = await this.performOcr(
            arabicPreprocessed,
            language,
            Tesseract.PSM.SINGLE_BLOCK,
          );
          this.logger.log(
            `[Tesseract] Pass 1b (arabic+PSM6): confidence=${result.confidence.toFixed(1)}%`,
          );
          attempts.push({ ...result, label: 'Tesseract:arabic+PSM6' });

          if (result.confidence >= 85) {
            this.logger.log(`✓ High confidence Arabic-optimized result`);
            const normalized = this.normalizeOcrText(result.text);
            return this.buildExtractionResult(normalized, result.confidence);
          }
        } catch (error) {
          this.logger.warn(`[Tesseract] Pass 1b (arabic) failed: ${error}`);
        }
      }

      // Pass 2: Preprocessed image + PSM SINGLE_COLUMN
      try {
        const preprocessed = await this.preprocessImage(processableBuffer, {
          arabicMode: detectedArabic,
        });
        const result = await this.performOcr(preprocessed, language, Tesseract.PSM.SINGLE_COLUMN);
        this.logger.log(
          `[Tesseract] Pass 2 (preprocessed+PSM4): confidence=${result.confidence.toFixed(1)}%`,
        );
        attempts.push({ ...result, label: 'Tesseract:preprocessed+PSM4' });

        if (result.confidence >= 85) {
          this.logger.log(`✓ High confidence result from Tesseract, using it directly`);
          return this.buildExtractionResult(result.text, result.confidence);
        }
      } catch (error) {
        this.logger.warn(`[Tesseract] Pass 2 failed: ${error}`);
      }

      // Get best Tesseract result so far
      const bestTesseract =
        attempts.length > 0
          ? attempts.reduce((a, b) => (a.confidence > b.confidence ? a : b))
          : null;

      // ─── Phase 2: PaddleOCR Fallback (if available and needed) ─────

      if (this.paddleOcrService.available() && (!bestTesseract || bestTesseract.confidence < 85)) {
        this.logger.log(
          `[PaddleOCR] Tesseract confidence low (${bestTesseract?.confidence.toFixed(1) || 0}%), trying PaddleOCR...`,
        );

        try {
          const paddleLanguage = language.includes('ara') ? 'arabic' : 'en';
          const paddleResult = await this.paddleOcrService.extractText(
            processableBuffer,
            paddleLanguage,
          );

          const paddleConfidencePercent = paddleResult.confidence * 100;
          this.logger.log(
            `[PaddleOCR] Extraction complete: confidence=${paddleConfidencePercent.toFixed(1)}%`,
          );

          attempts.push({
            text: paddleResult.text,
            confidence: paddleConfidencePercent,
            label: 'PaddleOCR',
          });

          // Use PaddleOCR if it's better than Tesseract
          if (!bestTesseract || paddleConfidencePercent > bestTesseract.confidence) {
            this.logger.log(`✓ PaddleOCR produced better result, using it`);
            return this.buildExtractionResult(paddleResult.text, paddleConfidencePercent);
          }
        } catch (error) {
          this.logger.warn(`[PaddleOCR] Extraction failed: ${error.message}`);
          // Fall through to use best Tesseract result
        }
      } else if (!this.paddleOcrService.available()) {
        this.logger.debug(`PaddleOCR models not available, using Tesseract-only mode`);
      }

      // ─── Phase 3: Additional Tesseract Passes (if still needed) ────

      if (!bestTesseract || bestTesseract.confidence < 70) {
        // Pass 3: Aggressive preprocessing + PSM AUTO
        try {
          const aggressivePreprocessed = await this.preprocessImageAggressive(processableBuffer, {
            arabicMode: detectedArabic,
          });
          const result = await this.performOcr(
            aggressivePreprocessed,
            language,
            Tesseract.PSM.AUTO,
          );
          this.logger.log(
            `[Tesseract] Pass 3 (aggressive+PSM3): confidence=${result.confidence.toFixed(1)}%`,
          );
          attempts.push({ ...result, label: 'Tesseract:aggressive+PSM3' });
        } catch (error) {
          this.logger.warn(`[Tesseract] Pass 3 failed: ${error}`);
        }

        // Pass 4: Original image (no preprocessing) + PSM AUTO (fallback)
        try {
          const result = await this.performOcr(processableBuffer, language, Tesseract.PSM.AUTO);
          this.logger.log(
            `[Tesseract] Pass 4 (original+PSM3): confidence=${result.confidence.toFixed(1)}%`,
          );
          attempts.push({ ...result, label: 'Tesseract:original+PSM3' });
        } catch (error) {
          this.logger.warn(`[Tesseract] Pass 4 failed: ${error}`);
        }

        // Pass 5: Try different thresholds if Arabic mode
        if (detectedArabic) {
          for (const threshold of [100, 160]) {
            try {
              const threshPreprocessed = await this.preprocessImage(processableBuffer, {
                arabicMode: true,
                threshold,
              });
              const result = await this.performOcr(
                threshPreprocessed,
                language,
                Tesseract.PSM.SINGLE_BLOCK,
              );
              this.logger.log(
                `[Tesseract] Pass 5 (arabic-thresh${threshold}+PSM6): confidence=${result.confidence.toFixed(1)}%`,
              );
              attempts.push({
                ...result,
                label: `Tesseract:arabic-thresh${threshold}+PSM6`,
              });
            } catch (error) {
              this.logger.warn(`[Tesseract] Pass 5 (threshold=${threshold}) failed: ${error}`);
            }
          }
        }
      }

      // ─── Final: Return Best Result ─────────────────────────────────

      if (attempts.length === 0) {
        throw new Error('All OCR passes failed');
      }

      const best = attempts.reduce((a, b) => (a.confidence > b.confidence ? a : b));
      this.logger.log(
        `Best OCR result: ${best.label} with confidence ${best.confidence.toFixed(1)}%`,
      );

      return this.buildExtractionResult(best.text, best.confidence);
    } catch (error) {
      this.logger.error(`OCR extraction failed: ${error}`);
      throw error;
    }
  }

  /**
   * Build extraction result from raw OCR text. Public so DocumentIntakeService
   * can reuse it for native PDF text (avoids duplicating regex logic).
   */
  buildExtractionResult(rawText: string, ocrConfidencePercent: number): ExtractedInvoiceData {
    const ocrConfidence = ocrConfidencePercent / 100;
    // Normalize OCR text before field extraction
    const normalizedText = this.normalizeOcrText(rawText);
    const lines = normalizedText.split('\n').filter((l) => l.trim());
    const fieldConfidence: Record<string, number> = {};

    const date = this.extractDate(normalizedText);
    fieldConfidence['date'] = date ? 0.8 : 0;

    const dueDate = this.extractDueDate(normalizedText, date);
    fieldConfidence['dueDate'] = dueDate ? 0.8 : 0;

    const paymentTerms = this.extractPaymentTerms(normalizedText);
    fieldConfidence['paymentTerms'] = paymentTerms ? 0.85 : 0;

    const currency = this.extractCurrency(normalizedText);
    fieldConfidence['currency'] = currency ? 0.9 : 0;

    const total = this.extractTotal(normalizedText);
    fieldConfidence['total'] = total !== null ? 0.85 : 0;

    const subtotal = this.extractSubtotal(normalizedText);
    fieldConfidence['subtotal'] = subtotal !== null ? 0.75 : 0;

    const tax = this.extractTax(normalizedText);
    fieldConfidence['tax'] = tax !== null ? 0.7 : 0;

    const invoiceNumber = this.extractInvoiceNumber(normalizedText);
    fieldConfidence['invoiceNumber'] = invoiceNumber ? 0.9 : 0;

    const vendorName = this.extractVendorName(lines);
    fieldConfidence['vendorName'] = vendorName ? 0.7 : 0;

    const lineItems = this.extractLineItems(lines);
    fieldConfidence['lineItems'] = lineItems.length > 0 ? 0.65 : 0;

    // If we have due date from payment terms but no explicit due date
    if (!dueDate && paymentTerms && date) {
      const calculatedDue = this.calculateDueDateFromTerms(date, paymentTerms);
      if (calculatedDue) {
        fieldConfidence['dueDate'] = 0.7; // slightly lower confidence for calculated
      }
    }

    return {
      date,
      dueDate:
        dueDate ||
        (paymentTerms && date ? this.calculateDueDateFromTerms(date, paymentTerms) : null),
      paymentTerms,
      currency,
      total,
      subtotal,
      tax,
      invoiceNumber,
      vendorName,
      lineItems,
      ocrConfidence,
      rawText,
      fieldConfidence,
    };
  }

  // ─── Field Extraction ──────────────────────────────────────────────

  /**
   * Extract date from text, prioritizing labeled date fields.
   */
  private extractDate(text: string): string | null {
    // Strategy 1: Labeled date fields (most reliable)
    const labeledPatterns = [
      /(?:invoice\s*date|date\s*of\s*issue|bill\s*date|tax\s*invoice\s*date)[\s:]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /(?:invoice\s*date|date\s*of\s*issue|bill\s*date)[\s:]+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i,
      /(?:invoice\s*date|date\s*of\s*issue|bill\s*date)[\s:]+(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i,
      /(?:invoice\s*date|date\s*of\s*issue|bill\s*date)[\s:]+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4})/i,
      /(?:تاريخ\s*الفاتورة|التاريخ)[\s:]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /(?:تاريخ\s*الفاتورة|التاريخ)[\s:]+(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i,
      // Arabic date label: تاريخ followed by a date (common in Saudi invoices)
      /تاريخ[\s:]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
    ];

    for (const pattern of labeledPatterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          return this.parseDate(match[1]);
        } catch {
          continue;
        }
      }
    }

    // Strategy 2: Look for "Date" label followed by date value
    const simpleDateLabel = /\bdate\b[\s:]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;
    const simpleLabelMatch = text.match(simpleDateLabel);
    if (simpleLabelMatch) {
      try {
        return this.parseDate(simpleLabelMatch[1]);
      } catch {
        // continue to generic patterns
      }
    }

    // Strategy 3: Generic date patterns
    const genericPatterns = [
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/,
      /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,
      /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i,
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i,
      /(\d{1,2})[\/\-](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-](\d{4})/i,
      // Spaced date: DD MM YYYY (e.g., "03 12 2025" from garbled OCR)
      /\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b/,
    ];

    for (const pattern of genericPatterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          return this.parseDate(match[0]);
        } catch {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Extract due date from text, separate from invoice date.
   */
  private extractDueDate(text: string, invoiceDate: string | null): string | null {
    const dueDatePatterns = [
      /(?:due\s*date|payment\s*due|payable\s*by|pay\s*before|date\s*due)[\s:]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      /(?:due\s*date|payment\s*due|payable\s*by)[\s:]+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})/i,
      /(?:due\s*date|payment\s*due|payable\s*by)[\s:]+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4})/i,
      /(?:due\s*date|payment\s*due|payable\s*by)[\s:]+(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i,
      /(?:تاريخ\s*الاستحقاق|موعد\s*السداد)[\s:]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    ];

    for (const pattern of dueDatePatterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          const parsed = this.parseDate(match[1]);
          // Ensure due date is different from invoice date
          if (parsed !== invoiceDate) {
            return parsed;
          }
        } catch {
          continue;
        }
      }
    }

    // Check for "Due in X days" relative format
    const relativeMatch = text.match(/due\s*(?:in|within)\s*(\d+)\s*days?/i);
    if (relativeMatch && invoiceDate) {
      const days = parseInt(relativeMatch[1], 10);
      return this.addDaysToDate(invoiceDate, days);
    }

    return null;
  }

  /**
   * Extract payment terms from text (Net 30, Net 60, etc.)
   */
  private extractPaymentTerms(text: string): string | null {
    const termsPatterns = [
      /(?:payment\s*terms?|terms?)[\s:]+\s*(net\s*\d+)/i,
      /(?:payment\s*terms?|terms?)[\s:]+\s*(\d+\s*days?\s*net)/i,
      /(?:payment\s*terms?|terms?)[\s:]+\s*(due\s*(?:on|upon)\s*receipt)/i,
      /(?:payment\s*terms?|terms?)[\s:]+\s*(cod|cash\s*on\s*delivery)/i,
      /(?:payment\s*terms?|terms?)[\s:]+\s*(eia|end\s*of\s*month)/i,
      /\b(net\s*(?:7|10|14|15|20|21|30|45|60|90|120))\b/i,
      /\b(due\s*(?:on|upon)\s*receipt)\b/i,
      /(?:شروط\s*الدفع)[\s:]+(.+?)(?:\n|$)/i,
    ];

    for (const pattern of termsPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim().toUpperCase().replace(/\s+/g, ' ');
      }
    }

    return null;
  }

  /**
   * Extract currency from text (symbol or code).
   */
  private extractCurrency(text: string): string | null {
    // Check for explicit currency codes near amounts
    const currencyCodePattern = /(?:currency|عملة)[\s:]+\s*([A-Z]{3})/i;
    const codeMatch = text.match(currencyCodePattern);
    if (codeMatch) {
      return codeMatch[1].toUpperCase();
    }

    // Count currency symbol/code occurrences to determine dominant currency
    const currencyMap: Record<string, string> = {
      $: 'USD',
      '€': 'EUR',
      '£': 'GBP',
      '¥': 'JPY',
      '﷼': 'SAR',
      '₹': 'INR',
      '₽': 'RUB',
      '₩': 'KRW',
    };

    const codePatterns: Record<string, RegExp> = {
      USD: /\bUSD\b|\bUS\$/gi,
      EUR: /\bEUR\b/gi,
      GBP: /\bGBP\b/gi,
      SAR: /\bSAR\b|\bSR\b/gi,
      AED: /\bAED\b|\bAED(?=\d)/gi,
      EGP: /\bEGP\b/gi,
      QAR: /\bQAR\b/gi,
      BHD: /\bBHD\b/gi,
      KWD: /\bKWD\b/gi,
      OMR: /\bOMR\b/gi,
      JPY: /\bJPY\b/gi,
      INR: /\bINR\b/gi,
    };

    const counts: Record<string, number> = {};

    // Count symbol occurrences
    for (const [symbol, code] of Object.entries(currencyMap)) {
      const count = (text.match(new RegExp(`\\${symbol}`, 'g')) || []).length;
      if (count > 0) {
        counts[code] = (counts[code] || 0) + count;
      }
    }

    // Count code occurrences
    for (const [code, pattern] of Object.entries(codePatterns)) {
      const count = (text.match(pattern) || []).length;
      if (count > 0) {
        counts[code] = (counts[code] || 0) + count;
      }
    }

    // Arabic currency name detection
    const arabicCurrencyMap: Record<string, RegExp> = {
      SAR: /ريال|سعودي/gi,
      AED: /درهم|إماراتي/gi,
      EGP: /جنيه|مصري/gi,
      KWD: /دينار\s*كويتي/gi,
      BHD: /دينار\s*بحريني/gi,
      QAR: /ريال\s*قطري/gi,
      OMR: /ريال\s*عماني/gi,
    };

    for (const [code, pattern] of Object.entries(arabicCurrencyMap)) {
      const count = (text.match(pattern) || []).length;
      if (count > 0) {
        counts[code] = (counts[code] || 0) + count;
      }
    }

    // Contextual detection: known bank names imply currency
    if (/\bRAK\s*BANK\b|\bRAKBANK\b/i.test(text)) {
      counts['AED'] = (counts['AED'] || 0) + 5; // Strong signal
    }
    if (/\bالراجحي\b|\bالأهلي\b|\bSABB\b|\bAlRajhi\b/i.test(text)) {
      counts['SAR'] = (counts['SAR'] || 0) + 5;
    }

    // Return the most frequent currency
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
  }

  /**
   * Calculate due date from invoice date and payment terms.
   */
  private calculateDueDateFromTerms(invoiceDate: string, terms: string): string | null {
    const netMatch = terms.match(/NET\s*(\d+)/i);
    if (netMatch) {
      return this.addDaysToDate(invoiceDate, parseInt(netMatch[1], 10));
    }

    if (/DUE\s*(ON|UPON)\s*RECEIPT/i.test(terms)) {
      return invoiceDate;
    }

    if (/COD|CASH\s*ON\s*DELIVERY/i.test(terms)) {
      return invoiceDate;
    }

    if (/END\s*OF\s*MONTH|EOM/i.test(terms)) {
      const d = new Date(invoiceDate);
      d.setMonth(d.getMonth() + 1, 0); // last day of current month
      return d.toISOString().split('T')[0];
    }

    return null;
  }

  /**
   * Add days to an ISO date string, returning ISO date.
   */
  private addDaysToDate(isoDate: string, days: number): string {
    const d = new Date(isoDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  /**
   * Parse date string to ISO format (YYYY-MM-DD).
   */
  private parseDate(dateStr: string): string {
    const monthMap: Record<string, string> = {
      jan: '01',
      feb: '02',
      mar: '03',
      apr: '04',
      may: '05',
      jun: '06',
      jul: '07',
      aug: '08',
      sep: '09',
      oct: '10',
      nov: '11',
      dec: '12',
    };

    // Try YYYY/MM/DD format first (more specific, avoids misinterpreting as DD/MM/YY)
    let match = dateStr.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Try DD/MM/YYYY format
    match = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (match) {
      let [, day, month, year] = match;
      if (year.length === 2) {
        year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
      }
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Try DD Month YYYY format
    match = dateStr.match(
      /(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i,
    );
    if (match) {
      const [, day, monthName, year] = match;
      const month = monthMap[monthName.toLowerCase().slice(0, 3)];
      return `${year}-${month}-${day.padStart(2, '0')}`;
    }

    // Try Month DD, YYYY format (e.g. "Jan 15, 2024")
    match = dateStr.match(
      /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})/i,
    );
    if (match) {
      const [, monthName, day, year] = match;
      const month = monthMap[monthName.toLowerCase().slice(0, 3)];
      return `${year}-${month}-${day.padStart(2, '0')}`;
    }

    // Try DD MM YYYY (space-separated, from garbled OCR)
    match = dateStr.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    throw new Error('Could not parse date');
  }

  /**
   * Extract total amount from text (keyword-only, no dangerous largest-number fallback).
   */
  private extractTotal(text: string): number | null {
    // Strategy 1: Labeled total patterns (highest priority)
    const totalPatterns = [
      /grand\s*total(?:\s*\([^)]*\))?[\s:$€£¥]*(\d[\d,]*\.?\d*)/i,
      /(?:total|amount|balance)\s*(?:due|payable|outstanding)[\s:$€£¥]*?(\d[\d,]*\.?\d*)/i,
      /total\s*amount[\s:$€£¥]*?(\d[\d,]*\.?\d*)/i,
      /net\s*(?:amount|total)[\s:$€£¥]*?(\d[\d,]*\.?\d*)/i,
      /total\s*\(?aed\)?[\s:]*(\d[\d,]*\.?\d*)/i,
      /total\s*\(?sar\)?[\s:]*(\d[\d,]*\.?\d*)/i,
      /(?:المبلغ\s*الإجمالي|المجموع\s*الكلي|الإجمالي|المجموع)[\s:]*(\d[\d,]*\.?\d*)/i,
      /(?:الاجمالي\s*النهائي|الاجمالي\s*\(?شامل|الإجمالي\s*\(?شامل)[\s:)]*(\d[\d,]*\.?\d*)/i,
      /(?:الاجمالي)[\s:]*(\d[\d,]*\.?\d*)/i,
      /(?:المبلغ\s*المستحق|صافي\s*الفاتورة)[\s:]*(\d[\d,]*\.?\d*)/i,
      /total\s*amt\s*inclusive[\s\w]*[\s:]*(\d[\d,]*\.?\d*)/i,
      /net\s*amt\s*to\s*pay[\s:]*(\d[\d,]*\.?\d*)/i,
      // Garbled OCR variants (must NOT match sub-total)
      /(?:^|[^b])(?:t[o0]tal|tota[l1])\s+amount[\s:$€£¥]*?(\d[\d,]*\.?\d*)/im,
    ];

    for (const pattern of totalPatterns) {
      const match = text.match(pattern);
      if (match) {
        const amount = this.parseAmount(match[1]);
        if (amount > 0 && amount < 100_000_000) {
          return amount;
        }
      }
    }

    // Strategy 2: Simple "Total" (but NOT "Subtotal") on a line with numbers
    const lines = text.split('\n');
    let lastTotalAmount: number | null = null;

    for (const line of lines) {
      // Must contain "total" but NOT "subtotal"
      if (/total/i.test(line) && !/sub.?total/i.test(line)) {
        // Collect all amounts: explicit decimals AND decimal-inferred
        const candidateAmounts: number[] = [];

        // Amounts with explicit decimal point
        const decimalAmounts = line.match(/(\d[\d,]*\.\d{2})/g);
        if (decimalAmounts) {
          for (const a of decimalAmounts) {
            const val = this.parseAmount(a);
            if (val > 0 && val < 100_000_000) candidateAmounts.push(val);
          }
        }

        // Also check for decimal-less numbers and infer decimal from context
        const hasDecimalAmounts = decimalAmounts && decimalAmounts.length > 0;
        if (hasDecimalAmounts) {
          const rawNumbers = line.match(/\b(\d{4,})\b/g);
          if (rawNumbers) {
            for (const raw of rawNumbers) {
              // Skip if this number is already captured as a decimal amount
              if (decimalAmounts?.some((d) => d.replace(/[.,]/g, '').includes(raw))) continue;
              const inferred = this.inferDecimalFromContext(raw, line);
              if (inferred > 0 && inferred < 100_000_000) {
                candidateAmounts.push(inferred);
              }
            }
          }
        } else {
          // No decimal amounts on line at all — try raw numbers
          const rawNumbers = line.match(/\b(\d{3,})\b/g);
          if (rawNumbers) {
            for (const raw of rawNumbers) {
              candidateAmounts.push(parseFloat(raw.replace(/,/g, '')));
            }
          }
        }

        // Pick the largest candidate as the total
        if (candidateAmounts.length > 0) {
          const maxAmount = Math.max(...candidateAmounts);
          if (maxAmount > 0 && maxAmount < 100_000_000) {
            lastTotalAmount = maxAmount;
          }
        }
      }
    }

    if (lastTotalAmount !== null) {
      return lastTotalAmount;
    }

    // Strategy 3: If we have subtotal and tax, compute total
    const subtotal = this.extractSubtotal(text);
    const tax = this.extractTax(text);
    if (subtotal !== null && tax !== null) {
      return subtotal + tax;
    }

    // Strategy 4: For minimal/receipt-like text (<10 non-empty lines),
    // find a triplet where a = b + c (total = subtotal + tax)
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
    if (nonEmptyLines.length < 10) {
      const tripletTotal = this.extractTotalFromTriplet(text);
      if (tripletTotal !== null) {
        return tripletTotal;
      }
    }

    return null;
  }

  /**
   * Extract subtotal from text.
   */
  private extractSubtotal(text: string): number | null {
    const patterns = [
      /sub[\s-]?total[\s:$€£¥]*(\d[\d,]*\.?\d*)/i,
      /amount\s*(?:before\s*(?:tax|vat))[\s:$€£¥]*(\d[\d,]*\.?\d*)/i,
      /taxable\s*amount[\s:$€£¥]*(\d[\d,]*\.?\d*)/i,
      /المبلغ\s*(?:قبل\s*الضريبة|الخاضع)[\s:]*(\d[\d,]*\.?\d*)/i,
      /المجموع\s*(?:الفرعي|قبل\s*الضريبة)[\s:]*(\d[\d,]*\.?\d*)/i,
      /(?:الاجمالي|الإجمالي)\s*(?:قبل\s*الضريبة|الفرعي|المستحق)[\s:]*(\d[\d,]*\.?\d*)/i,
      /total\s*(?:before|without|excl\.?|subject\s*to)\s*(?:tax|vat)[\s:]*(\d[\d,]*\.?\d*)/i,
      /total\s*(?:w\/o|wo)\s*vat[\s:]*(\d[\d,]*\.?\d*)/i,
      /total\s*amount\s*\(?pre[\s-]*tax\)?[\s:]*(\d[\d,]*\.?\d*)/i,
      /net\s*amount[\s:]*(\d[\d,]*\.?\d*)/i,
      /gross\s*amt[\s:]*(\d[\d,]*\.?\d*)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const amount = this.parseAmount(match[1]);
        if (amount > 0) return amount;
      }
    }

    // Strategy 2: On "Total" summary lines with 2+ amounts, the first is often subtotal
    // E.g., "Total  499.00  24.95  523.95" → subtotal=499.00
    // Or:   "Total  499.00  24.95  52395" (decimal-less total) → subtotal=499.00
    const lines = text.split('\n');
    for (const line of lines) {
      if (/^total\b/i.test(line.trim()) && !/sub.?total/i.test(line)) {
        const amounts = line.match(/(\d[\d,]*\.\d{2})/g);
        if (amounts && amounts.length >= 2) {
          const first = this.parseAmount(amounts[0]);
          const second = this.parseAmount(amounts[1]);
          // First is subtotal if it's larger than second (second is tax)
          // and first + second makes a reasonable total
          if (first > 0 && first > second && first + second > 0) {
            return first;
          }
        }
      }
    }

    // Fallback: triplet detection for minimal invoices
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
    if (nonEmptyLines.length < 10) {
      const tripletSubtotal = this.extractSubtotalFromTriplet(text);
      if (tripletSubtotal !== null) return tripletSubtotal;
    }

    return null;
  }

  /**
   * Extract tax amount from text.
   */
  private extractTax(text: string): number | null {
    // Use line-level matching to avoid crossing line boundaries
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      // Skip header-only lines (column titles like "Tax Amount")
      if (/^(tax|vat)\s*(amount|details|summary)\s*$/i.test(trimmedLine)) continue;

      // Skip total/subtotal lines to avoid misextracting subtotal as tax
      // e.g., "Total Before Tax: 19.13", "Total Excl. VAT: 260.88"
      if (/^(?:sub[\s-]?total|grand\s*total|net\s*total)/i.test(trimmedLine)) continue;
      if (/^total\b/i.test(trimmedLine) && !/^total\s+(?:vat|tax)\b/i.test(trimmedLine)) continue;
      if (/^(?:الاجمالي|الإجمالي|المجموع|صافي)(?:\s|$)/.test(trimmedLine)) continue;

      const patterns = [
        /vat[^\S\n]*(?:amount)?[^\S\n:$€£¥]*[:$€£¥]+[^\S\n]*(\d[\d,]*\.?\d*)/i,
        /(?:vat|tax)[^\S\n]*\(?\s*\d+\.?\d*\s*%\s*\)?[^\S\n:$€£¥]*[:$€£¥]*[^\S\n]*(\d[\d,]*\.?\d*)/i,
        // "Tax (CURRENCY): amount" format (e.g., "Tax (SAR): 4.44")
        /(?:vat|tax)\s*\([^)]*\)\s*[:]\s*(\d[\d,]*\.?\d*)/i,
        /tax[^\S\n]*(?:amount)?[^\S\n:$€£¥]*[:$€£¥]*[^\S\n]*(\d[\d,]*\.?\d+)/i,
        /vat[^\S\n]*amount[^\S\n]*(?:@[^\S\n]*\d+%[^\S\n]*)?\(?(?:aed|sar)\)?[^\S\n:]*(\d[\d,]*\.?\d*)/i,
        // "Standard Rate (5%)" format from tax summaries: last number is the tax amount
        /standard\s*rate\s*\(\d+\.?\d*%\)\s+[\d,.]+\s+(\d[\d,]*\.\d{2})/i,
        /gst[^\S\n:$€£¥]*[:$€£¥]*[^\S\n]*(\d[\d,]*\.?\d*)/i,
        /hst[^\S\n:$€£¥]*[:$€£¥]*[^\S\n]*(\d[\d,]*\.?\d*)/i,
        /ضريبة\s*القيمة\s*المضافة[^:\n]*[:]\s*(\d[\d,]*\.?\d*)/i,
        /ضريبة[\s:]*(\d[\d,]*\.?\d+)/i,
        /ضريبة\s*مبلغ[\s:]*(\d[\d,]*\.?\d*)/i,
      ];

      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const amount = this.parseAmount(match[1]);
          if (amount > 0 && amount < 10_000_000) return amount;
        }
      }
    }

    // Strategy 2: On "Total" summary lines with 2+ amounts, the second is often tax
    // E.g., "Total  499.00  24.95  523.95" → tax=24.95
    // Or:   "Total  499.00  24.95  52395" (decimal-less total) → tax=24.95
    for (const line of lines) {
      if (/^total\b/i.test(line.trim()) && !/sub.?total/i.test(line)) {
        const amounts = line.match(/(\d[\d,]*\.\d{2})/g);
        if (amounts && amounts.length >= 2) {
          const first = this.parseAmount(amounts[0]);
          const second = this.parseAmount(amounts[1]);
          // Second is tax if it's smaller than first (subtotal > tax)
          if (second > 0 && second < first) {
            return second;
          }
        }
      }
    }

    // Fallback: triplet detection for minimal invoices
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
    if (nonEmptyLines.length < 10) {
      const tripletTax = this.extractTaxFromTriplet(text);
      if (tripletTax !== null) return tripletTax;
    }

    return null;
  }

  /**
   * Extract invoice number from text with multi-strategy approach.
   */
  private extractInvoiceNumber(text: string): string | null {
    // Strategy 1: Keyword-labeled patterns (highest priority)
    const labeledPatterns = [
      /invoice\s*(?:no|number|#|num|id)\.?\s*[:;]?\s*([A-Z0-9][\w\-\/]{2,30})/i,
      /\binv\.?\s*(?:no|#)\.?\s*[:;]?\s*([A-Z0-9][\w\-\/]{2,30})/i,
      /bill\s*(?:no|number|#)\.?\s*[:;]?\s*([A-Z0-9][\w\-\/]{2,30})/i,
      /document\s*(?:no|number|#)\.?\s*[:;]?\s*([A-Z0-9][\w\-\/]{2,30})/i,
      /reference\s*(?:no|number|#)?\.?\s*[:;]?\s*([A-Z0-9][\w\-\/]{2,30})/i,
      /ref\.?\s*[:;#]\s*([A-Z0-9][\w\-\/]{2,30})/i,
      /فاتورة\s*(?:رقم|#)\s*[:;]?\s*([A-Z0-9][\w\-\/]{2,30})/i,
      /رقم\s*(?:الفاتورة|المرجع)\s*[:;]?\s*([A-Z0-9][\w\-\/]{2,30})/i,
    ];

    for (const pattern of labeledPatterns) {
      const match = text.match(pattern);
      if (match) {
        const num = match[1].trim();
        // Reject pure-digit numbers that also appear as TRN/VAT/tax registration
        if (/^\d{10,}$/.test(num)) {
          const escaped = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const isTrn = new RegExp(
            `(?:TRN|TIN|VAT\\s*(?:No|Number|Reg)|tax\\s*(?:reg|registration)|الرقم\\s*الضريبي)\\s*[:;.]?\\s*${escaped}`,
            'i',
          ).test(text);
          if (isTrn) continue;
        }
        // Reject phone numbers (7-9 digits with optional +) only if also labeled as phone
        if (/^\+?\d{7,9}$/.test(num)) {
          const escapedNum = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const isPhone = new RegExp(
            `(?:tel|phone|mobile|fax|هاتف|جوال)\\s*[:;.]?\\s*${escapedNum}`,
            'i',
          ).test(text);
          if (isPhone) continue;
        }
        if (num.length >= 3 && num.length <= 30) {
          return num;
        }
      }
    }

    // Strategy 2: # followed by alphanumeric
    const hashMatch = text.match(/#\s*([A-Z0-9][\w\-]{2,20})/i);
    if (hashMatch) {
      const num = hashMatch[1].trim();
      if (!/^\d{10,}$/.test(num) && num.length >= 3) {
        return num;
      }
    }

    // Strategy 3: Standalone PREFIX-DIGITS patterns (e.g., INV-001, NETA-001234)
    const standaloneMatch = text.match(/\b([A-Z]{2,5}[-\/]\d{3,10})\b/i);
    if (standaloneMatch) {
      return standaloneMatch[1];
    }

    // Strategy 4: Single-letter prefix with digits-dash-digits (e.g., S20251018-9014)
    const singleLetterMatch = text.match(/\b([A-Z]\d{6,}[-\/]\d{3,})\b/i);
    if (singleLetterMatch) {
      return singleLetterMatch[1];
    }

    return null;
  }

  /**
   * Extract vendor name using a scored approach with header filtering.
   */
  private extractVendorName(lines: string[]): string | null {
    const fullText = lines.join('\n');

    // Strategy 1: Look for labeled vendor lines
    for (const pattern of this.VENDOR_LABEL_PATTERNS) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (name.length >= 3 && /[a-zA-Z\u0600-\u06FF]{2,}/.test(name)) {
          return name;
        }
      }
    }

    // Strategy 2: Score the first 8 lines
    // Scan up to 12 lines (Arabic invoices often have more header content)
    const headerLines = lines.slice(0, 12);
    let bestCandidate: { text: string; score: number } | null = null;

    for (let i = 0; i < headerLines.length; i++) {
      const line = headerLines[i].trim();
      if (line.length < 3) continue;

      // Skip purely numeric lines
      if (/^[\d\s,.$€£¥%]+$/.test(line)) continue;

      // Skip date-only lines
      if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(line)) continue;

      // Must contain at least 2 letter chars
      if (!/[a-zA-Z\u0600-\u06FF]{2,}/.test(line)) continue;

      // Skip common document headers
      if (this.HEADER_SKIP_PATTERNS.some((p) => p.test(line.trim()))) continue;

      // Skip TRN/TIN lines
      if (/\b(TRN|TIN|VAT\s*(?:No|#|Reg))\b/i.test(line)) continue;

      let score = 0;

      // Penalty: address-like lines
      if (this.ADDRESS_PATTERNS.some((p) => p.test(line))) {
        score -= 5;
      }

      // Bonus: position (earlier is better)
      score += Math.max(0, 5 - i);

      // Bonus: company suffix
      if (this.COMPANY_SUFFIXES.some((p) => p.test(line))) {
        score += 10;
      }

      // Bonus: ALL CAPS (common for company names)
      if (line === line.toUpperCase() && /[A-Z]{3,}/.test(line)) {
        score += 3;
      }

      // Bonus: reasonable company name length
      if (line.length >= 5 && line.length <= 60) {
        score += 2;
      }

      // Penalty: too long (probably a paragraph)
      if (line.length > 80) {
        score -= 3;
      }

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { text: line, score };
      }
    }

    if (bestCandidate && bestCandidate.score >= 0) {
      return this.cleanVendorName(bestCandidate.text);
    }
    return null;
  }

  /**
   * Clean vendor name by trimming date fragments, phone numbers, and other noise.
   */
  private cleanVendorName(name: string): string {
    let cleaned = name;

    // Remove trailing date patterns like "Date: 12/2023" or "Date: 01/01/2024"
    cleaned = cleaned.replace(/\s*\bDate\b\s*[:;]?\s*\d{1,2}\/\d{2,4}.*/i, '');

    // Remove trailing phone/fax numbers
    cleaned = cleaned.replace(/\s*\b(?:Tel|Fax|Phone|Mobile)\b\s*[:;]?\s*[\d\s\-+()]+$/i, '');

    // Remove trailing email addresses
    cleaned = cleaned.replace(/\s*\S+@\S+\.\S+\s*$/i, '');

    // Remove trailing TRN/TIN numbers
    cleaned = cleaned.replace(/\s*\b(?:TRN|TIN)\b\s*[:;]?\s*\d+$/i, '');

    return cleaned.trim();
  }

  /**
   * Extract line items from invoice.
   */
  private extractLineItems(lines: string[]): Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }> {
    const items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }> = [];

    // Strategy 1: Find table header and extract column-aligned data
    const headerIndex = this.findTableHeaderIndex(lines);
    if (headerIndex >= 0) {
      const headerItems = this.extractFromTableStructure(lines, headerIndex);
      if (headerItems.length > 0) {
        return this.validateLineItems(headerItems);
      }
    }

    // Strategy 2: Pattern-based extraction (qty×price format)
    const lineItemPattern = /(.+?)\s+(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i;
    // Strategy 3: 4-column pattern (description qty price total)
    const simplePattern =
      /(.+?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)/;
    // Strategy 4: Tab-separated columns
    const tabPattern =
      /^(.+?)\t(\d+(?:\.\d+)?)\t(\d+(?:,\d{3})*(?:\.\d+)?)\t(\d+(?:,\d{3})*(?:\.\d+)?)$/;

    // Stop keywords: skip lines that are summary rows, not line items
    const summaryPattern =
      /\b(subtotal|sub[\s-]*total|grand\s*total|net\s*(?:amount|total)|balance\s*due|amount\s*due|tax\s*summary)\b/i;

    for (const line of lines) {
      // Skip summary/total lines
      if (summaryPattern.test(line)) continue;

      let match = line.match(tabPattern);
      if (match) {
        const [, description, qty, price, total] = match;
        items.push({
          description: description.trim(),
          quantity: parseFloat(qty.replace(/,/g, '')),
          unitPrice: this.parseAmount(price),
          total: this.parseAmount(total),
        });
        continue;
      }

      match = line.match(lineItemPattern);
      if (match) {
        const [, description, qty, price] = match;
        const quantity = parseFloat(qty);
        const unitPrice = this.parseAmount(price);
        items.push({
          description: description.trim(),
          quantity,
          unitPrice,
          total: quantity * unitPrice,
        });
        continue;
      }

      match = line.match(simplePattern);
      if (match) {
        const [, description, qty, price, total] = match;
        // Skip if description looks like a summary line
        if (/\b(total|tax|vat|gst)\b/i.test(description)) continue;
        items.push({
          description: description.trim(),
          quantity: parseFloat(qty.replace(/,/g, '')),
          unitPrice: this.parseAmount(price),
          total: this.parseAmount(total),
        });
      }
    }

    return this.validateLineItems(items);
  }

  /**
   * Find the index of the table header row containing column labels.
   */
  private findTableHeaderIndex(lines: string[]): number {
    const headerKeywords = [
      /\bdescription\b/i,
      /\bitem\b/i,
      /\bparticular/i,
      /\bqty\b/i,
      /\bquantity\b/i,
      /\bunit\s*price\b/i,
      /\brate\b/i,
      /\bprice\b/i,
      /\btotal\b/i,
      /\bamount\b/i,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // A header row should contain at least 3 of these keywords
      const matchCount = headerKeywords.filter((kw) => kw.test(line)).length;
      if (matchCount >= 3) {
        return i;
      }

      // Multi-line header: merge with next line and check again
      // (e.g., Transit Hub: "# Item & Description Qty Rate Taxable" + "Amount Tax Amount")
      if (i + 1 < lines.length) {
        const merged = line + ' ' + lines[i + 1];
        const mergedCount = headerKeywords.filter((kw) => kw.test(merged)).length;
        if (mergedCount >= 3) {
          return i + 1; // Return the second line so extraction starts after both header lines
        }
      }
    }
    return -1;
  }

  /**
   * Extract line items using table structure detection from header position.
   */
  private extractFromTableStructure(
    lines: string[],
    headerIndex: number,
  ): Array<{ description: string; quantity: number; unitPrice: number; total: number }> {
    const items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }> = [];
    const headerLine = lines[headerIndex];

    // Detect column positions from header keywords
    const descCol = this.findColumnPosition(headerLine, /description|item|particular/i);
    const qtyCol = this.findColumnPosition(headerLine, /qty|quantity/i);
    const priceCol = this.findColumnPosition(headerLine, /unit\s*price|rate|price/i);
    const totalCol = this.findColumnPosition(headerLine, /total|amount/i);

    // Stop keywords that indicate end of line items
    const stopKeywords =
      /\b(subtotal|sub[\s-]*total|total|tax|vat|gst|discount|shipping|grand\s*total|net\s*amount|balance)\b/i;

    // Process rows after header
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.length < 3) continue;

      // Stop if we hit summary rows
      if (stopKeywords.test(line)) break;

      // Skip separator lines (dashes, equals, etc.)
      if (/^[\-=_]{3,}$/.test(line)) continue;

      // Try to extract numbers from the line
      const numbers = this.extractNumbersFromLine(line);
      if (numbers.length >= 2) {
        // Assume last number is total, second-to-last is price, etc.
        const total = numbers[numbers.length - 1];
        const unitPrice = numbers.length >= 3 ? numbers[numbers.length - 2] : total;
        const quantity = numbers.length >= 3 ? numbers[numbers.length - 3] : 1;

        // Description is everything before the first number
        const firstNumMatch = line.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
        const description = firstNumMatch ? line.substring(0, firstNumMatch.index).trim() : line;

        if (description && total > 0) {
          items.push({
            description: description.replace(/[\|│]$/g, '').trim(),
            quantity: quantity,
            unitPrice: unitPrice,
            total: total,
          });
        }
      }
    }

    return items;
  }

  /**
   * Find approximate column start position for a keyword in the header.
   */
  private findColumnPosition(headerLine: string, keyword: RegExp): number {
    const match = headerLine.match(keyword);
    return match ? headerLine.indexOf(match[0]) : -1;
  }

  /**
   * Extract all numeric values from a line.
   */
  private extractNumbersFromLine(line: string): number[] {
    const numbers: number[] = [];
    const numPattern = /\d+(?:,\d{3})*(?:\.\d+)?/g;
    let match: RegExpExecArray | null;
    while ((match = numPattern.exec(line)) !== null) {
      const val = this.parseAmount(match[0]);
      if (val > 0) {
        numbers.push(val);
      }
    }
    return numbers;
  }

  /**
   * Validate extracted line items: qty × unitPrice ≈ total (within 2% tolerance).
   */
  private validateLineItems(
    items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>,
  ): Array<{ description: string; quantity: number; unitPrice: number; total: number }> {
    return items.map((item) => {
      const computed = item.quantity * item.unitPrice;
      const tolerance = Math.max(0.02 * item.total, 0.01); // 2% or 1 cent

      if (Math.abs(computed - item.total) > tolerance && computed > 0) {
        // If qty × price doesn't match total, trust total and recalculate unitPrice
        return {
          ...item,
          unitPrice: item.quantity > 0 ? item.total / item.quantity : item.unitPrice,
        };
      }
      return item;
    });
  }

  /**
   * Parse amount string to number, handling both standard and European formats.
   */
  private parseAmount(amountStr: string): number {
    let cleaned = amountStr
      .replace(/[\$€£¥]/g, '')
      .replace(/\b(AED|SAR|USD|EUR|GBP|EGP|QAR|BHD|KWD|OMR)\b/gi, '')
      .trim();

    // European format: 7.700,00 (period as thousand sep, comma as decimal)
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Standard format or no separator
      cleaned = cleaned.replace(/,/g, '');
    }

    return parseFloat(cleaned) || 0;
  }

  /**
   * Infer decimal point in a raw number when context suggests it's missing.
   * E.g., "52395" on a line with "499.00" → 523.95 (insert decimal 2 from right).
   */
  private inferDecimalFromContext(rawNumber: string, contextLine: string): number {
    const parsed = parseFloat(rawNumber.replace(/,/g, ''));
    // Only infer if the raw number has no decimal point and is at least 4 digits
    if (!rawNumber.includes('.') && rawNumber.replace(/,/g, '').length >= 4) {
      // Check if other numbers on the same line have .XX format
      const otherAmounts = contextLine.match(/\d[\d,]*\.\d{2}/g);
      if (otherAmounts && otherAmounts.length > 0) {
        return parsed / 100;
      }
    }
    return parsed;
  }

  /**
   * Extract all numeric amounts from text (for triplet detection).
   */
  private extractAllAmounts(text: string): number[] {
    const amounts: number[] = [];
    const pattern = /\b(\d[\d,]*(?:\.\d{1,2})?)\b/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const val = this.parseAmount(match[1]);
      if (val > 0 && val < 100_000_000) {
        // Deduplicate exact values
        if (!amounts.includes(val)) {
          amounts.push(val);
        }
      }
    }
    return amounts;
  }

  /**
   * For minimal invoices: find triplet where a = b + c (total = subtotal + tax).
   * Returns the largest value (total) or null.
   */
  private extractTotalFromTriplet(text: string): number | null {
    const amounts = this.extractAllAmounts(text);
    if (amounts.length < 3) return null;

    // Sort descending so we try the largest value first as "total"
    const sorted = [...amounts].sort((a, b) => b - a);

    for (const candidate of sorted) {
      // Try to find two other amounts that sum to this candidate
      for (let i = 0; i < amounts.length; i++) {
        for (let j = i + 1; j < amounts.length; j++) {
          if (amounts[i] !== candidate && amounts[j] !== candidate) {
            if (Math.abs(candidate - (amounts[i] + amounts[j])) < 0.02) {
              if (candidate > 0 && candidate < 100_000_000) {
                return candidate;
              }
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * For minimal invoices: extract subtotal from triplet detection.
   * Returns the middle value (subtotal) from a triplet where a = b + c.
   */
  private extractSubtotalFromTriplet(text: string): number | null {
    const amounts = this.extractAllAmounts(text);
    if (amounts.length < 3) return null;

    const sorted = [...amounts].sort((a, b) => b - a);

    for (const candidate of sorted) {
      for (let i = 0; i < amounts.length; i++) {
        for (let j = i + 1; j < amounts.length; j++) {
          if (amounts[i] !== candidate && amounts[j] !== candidate) {
            if (Math.abs(candidate - (amounts[i] + amounts[j])) < 0.02) {
              // Return the larger of the two addends (subtotal > tax)
              return Math.max(amounts[i], amounts[j]);
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * For minimal invoices: extract tax from triplet detection.
   * Returns the smallest value (tax) from a triplet where a = b + c.
   */
  private extractTaxFromTriplet(text: string): number | null {
    const amounts = this.extractAllAmounts(text);
    if (amounts.length < 3) return null;

    const sorted = [...amounts].sort((a, b) => b - a);

    for (const candidate of sorted) {
      for (let i = 0; i < amounts.length; i++) {
        for (let j = i + 1; j < amounts.length; j++) {
          if (amounts[i] !== candidate && amounts[j] !== candidate) {
            if (Math.abs(candidate - (amounts[i] + amounts[j])) < 0.02) {
              // Return the smaller of the two addends (tax < subtotal)
              return Math.min(amounts[i], amounts[j]);
            }
          }
        }
      }
    }

    return null;
  }

  // ─── Duplicate Detection ───────────────────────────────────────────

  /**
   * Check for duplicate bills.
   */
  async checkDuplicate(
    organizationId: string,
    vendorId: string | null,
    invoiceNumber: string | null,
    amount: number | null,
  ): Promise<DuplicateCheckResult> {
    if (!vendorId || (!invoiceNumber && !amount)) {
      return {
        isDuplicate: false,
        existingBillId: null,
        similarity: 0,
        matchType: 'none',
      };
    }

    // Check for exact invoice number match
    if (invoiceNumber) {
      const exactMatch = await this.prisma.bill.findFirst({
        where: {
          organizationId,
          vendorId,
          billNumber: invoiceNumber,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (exactMatch) {
        return {
          isDuplicate: true,
          existingBillId: exactMatch.id,
          similarity: 1.0,
          matchType: 'exact_number',
        };
      }
    }

    // Check for same vendor + amount within 3 days
    if (amount) {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const amountMatch = await this.prisma.bill.findFirst({
        where: {
          organizationId,
          vendorId,
          grandTotal: new Decimal(amount),
          createdAt: { gte: threeDaysAgo },
          deletedAt: null,
        },
        select: { id: true },
      });

      if (amountMatch) {
        return {
          isDuplicate: true,
          existingBillId: amountMatch.id,
          similarity: 0.9,
          matchType: 'amount_date',
        };
      }
    }

    return {
      isDuplicate: false,
      existingBillId: null,
      similarity: 0,
      matchType: 'none',
    };
  }

  // ─── Vendor Layout Learning ────────────────────────────────────────

  /**
   * Learn vendor layout from corrections.
   */
  async learnLayout(
    organizationId: string,
    vendorId: string,
    corrections: Partial<ExtractedInvoiceData>,
  ): Promise<void> {
    const existing = await this.prisma.vendorOcrLayout.findUnique({
      where: {
        organizationId_vendorId: {
          organizationId,
          vendorId,
        },
      },
    });

    const fieldPositions = (existing?.fieldPositions as any) || {};

    // Store all corrected fields
    const fieldsToLearn = [
      'date',
      'total',
      'subtotal',
      'tax',
      'invoiceNumber',
      'vendorName',
    ] as const;
    for (const field of fieldsToLearn) {
      if (
        corrections[field] !== undefined &&
        corrections[field] !== null &&
        corrections[field] !== ''
      ) {
        fieldPositions[field] = {
          value: corrections[field],
          pattern:
            typeof corrections[field] === 'string'
              ? corrections[field]
              : String(corrections[field]),
          learned: true,
        };
      }
    }

    await this.prisma.vendorOcrLayout.upsert({
      where: {
        organizationId_vendorId: {
          organizationId,
          vendorId,
        },
      },
      update: {
        fieldPositions,
        sampleCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
      create: {
        organizationId,
        vendorId,
        fieldPositions,
        sampleCount: 1,
      },
    });

    this.logger.debug(`Updated OCR layout for vendor ${vendorId}`);
  }

  /**
   * Get vendor layout hints.
   */
  async getVendorLayoutHints(organizationId: string, vendorId: string): Promise<any | null> {
    const layout = await this.prisma.vendorOcrLayout.findUnique({
      where: {
        organizationId_vendorId: {
          organizationId,
          vendorId,
        },
      },
    });

    if (!layout || layout.sampleCount < 3) {
      return null;
    }

    return layout.fieldPositions;
  }

  /**
   * Enhanced layout learning with context-aware pattern storage.
   */
  async learnLayoutEnhanced(
    organizationId: string,
    vendorId: string,
    rawText: string,
    extractedFields: Record<string, any>,
    correctedFields: Record<string, any>,
  ): Promise<void> {
    const existing = await this.prisma.vendorOcrLayout.findUnique({
      where: {
        organizationId_vendorId: { organizationId, vendorId },
      },
    });

    const fieldPositions = (existing?.fieldPositions as any) || {};

    for (const [field, correctedValue] of Object.entries(correctedFields)) {
      if (correctedValue === null || correctedValue === undefined) continue;

      const correctedStr = String(correctedValue);
      const extractedStr = extractedFields[field] != null ? String(extractedFields[field]) : '';

      // First try to find the corrected value in raw text
      let position = rawText.indexOf(correctedStr);

      // If corrected value not found in garbled OCR text, find the extracted
      // (wrong) value's position instead — it came FROM the raw text so it
      // should be there.  This lets us capture the surrounding context.
      let anchorValue = correctedStr;
      if (position < 0 && extractedStr) {
        position = rawText.indexOf(extractedStr);
        anchorValue = extractedStr;
      }

      const contextBefore =
        position > 0 ? rawText.slice(Math.max(0, position - 40), position).trim() : '';
      const contextAfter =
        position >= 0
          ? rawText.slice(position + anchorValue.length, position + anchorValue.length + 40).trim()
          : '';

      if (!fieldPositions[field]) {
        fieldPositions[field] = { patterns: [], learned: true };
      }

      const patterns = fieldPositions[field].patterns || [];
      patterns.push({
        value: correctedStr,
        contextBefore,
        contextAfter,
        extractedValue: extractedFields[field],
        timestamp: new Date().toISOString(),
      });

      // Keep last 5 patterns per field (bounded)
      fieldPositions[field].patterns = patterns.slice(-5);
      fieldPositions[field].learned = true;
      fieldPositions[field].lastCorrectedValue = correctedStr;
    }

    await this.prisma.vendorOcrLayout.upsert({
      where: {
        organizationId_vendorId: { organizationId, vendorId },
      },
      update: {
        fieldPositions,
        sampleCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
      create: {
        organizationId,
        vendorId,
        fieldPositions,
        sampleCount: 1,
      },
    });

    this.logger.debug(
      `Updated enhanced OCR layout for vendor ${vendorId} (${Object.keys(correctedFields).length} fields)`,
    );
  }

  /**
   * Extract a value from raw text using learned context patterns.
   * When context matches, returns the stored corrected value rather than
   * re-extracting from potentially garbled OCR text.
   */
  private extractWithContext(
    rawText: string,
    patterns: Array<{
      value: string;
      contextBefore: string;
      contextAfter: string;
    }>,
    lastCorrectedValue?: string,
  ): { value: string; confidence: number } | null {
    for (const pattern of patterns) {
      if (!pattern.contextBefore && !pattern.contextAfter) continue;

      if (pattern.contextBefore) {
        const searchTerm = pattern.contextBefore.slice(-20);
        let bestPos = -1;
        let bestSim = 0;

        for (let i = 0; i <= rawText.length - searchTerm.length; i++) {
          const candidate = rawText.slice(i, i + searchTerm.length);
          const sim = levenshteinSimilarity(searchTerm.toLowerCase(), candidate.toLowerCase());
          if (sim > bestSim && sim >= 0.7) {
            bestSim = sim;
            bestPos = i + searchTerm.length;
          }
        }

        if (bestPos >= 0) {
          // Context matched! Return the stored corrected value directly
          // instead of re-extracting from garbled OCR text.
          if (lastCorrectedValue) {
            return {
              value: lastCorrectedValue,
              confidence: Math.min(0.9, 0.7 + bestSim * 0.2),
            };
          }

          // Fallback: try to re-extract from raw text
          const afterContext = rawText.slice(bestPos, bestPos + 50).trim();
          const numberMatch = afterContext.match(/^[\s:$€£¥]*([0-9,]+\.?\d*)/);
          if (numberMatch) {
            return {
              value: numberMatch[1].replace(/,/g, ''),
              confidence: 0.85,
            };
          }
          const dateMatch = afterContext.match(/^[\s:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
          if (dateMatch) {
            return { value: dateMatch[1], confidence: 0.85 };
          }
          const textMatch = afterContext.match(/^[\s:#]*([A-Z0-9\-]{3,20})/i);
          if (textMatch) {
            return { value: textMatch[1], confidence: 0.8 };
          }
        }
      }
    }

    return null;
  }

  /**
   * Apply vendor-specific learned hints to an already-extracted result.
   * This avoids re-running OCR when the vendor is known after initial extraction.
   */
  async applyVendorHints(
    organizationId: string,
    vendorId: string,
    result: ExtractedInvoiceData,
  ): Promise<ExtractedInvoiceData> {
    const hints = await this.getVendorLayoutHints(organizationId, vendorId);

    if (!hints) {
      return result;
    }

    this.logger.debug(
      `Applying vendor hints for ${vendorId}: ${Object.keys(hints)
        .filter((k) => (hints as any)[k]?.learned)
        .join(', ')}`,
    );

    for (const [field, hint] of Object.entries(hints)) {
      const hintData = hint as any;
      if (!hintData?.learned || !hintData?.patterns?.length) continue;

      const contextResult = this.extractWithContext(
        result.rawText,
        hintData.patterns,
        hintData.lastCorrectedValue,
      );

      // If context matching failed but we have a lastCorrectedValue and the
      // base OCR confidence is low, use the stored correction as a fallback.
      // This handles existing corrections stored with empty context (legacy data).
      const hintValue = contextResult
        ? contextResult
        : hintData.lastCorrectedValue && result.ocrConfidence < 85
          ? { value: hintData.lastCorrectedValue, confidence: 0.75 }
          : null;

      if (hintValue) {
        const existingConf = result.fieldConfidence[field] ?? 0;
        const shouldOverride = hintValue.confidence > existingConf;

        if (field === 'total' && (shouldOverride || !result.total)) {
          const parsed = parseFloat(hintValue.value);
          if (!isNaN(parsed)) {
            result.total = parsed;
            result.fieldConfidence['total'] = hintValue.confidence;
          }
        } else if (field === 'subtotal' && (shouldOverride || !result.subtotal)) {
          const parsed = parseFloat(hintValue.value);
          if (!isNaN(parsed)) {
            result.subtotal = parsed;
            result.fieldConfidence['subtotal'] = hintValue.confidence;
          }
        } else if (field === 'tax' && (shouldOverride || !result.tax)) {
          const parsed = parseFloat(hintValue.value);
          if (!isNaN(parsed)) {
            result.tax = parsed;
            result.fieldConfidence['tax'] = hintValue.confidence;
          }
        } else if (field === 'date' && (shouldOverride || !result.date)) {
          try {
            result.date = this.parseDate(hintValue.value);
            result.fieldConfidence['date'] = hintValue.confidence;
          } catch {
            // ignore parse failure
          }
        } else if (field === 'invoiceNumber' && (shouldOverride || !result.invoiceNumber)) {
          result.invoiceNumber = hintValue.value;
          result.fieldConfidence['invoiceNumber'] = hintValue.confidence;
        } else if (field === 'vendorName' && (shouldOverride || !result.vendorName)) {
          result.vendorName = hintValue.value;
          result.fieldConfidence['vendorName'] = hintValue.confidence;
        }
      }
    }

    return result;
  }

  /**
   * Extract with vendor-specific hints (runs OCR + applies hints).
   */
  async extractWithVendorHints(
    organizationId: string,
    vendorId: string,
    imageBuffer: Buffer,
    language: string = 'eng+ara',
  ): Promise<ExtractedInvoiceData> {
    const result = await this.extractFromImage(imageBuffer, language);
    return this.applyVendorHints(organizationId, vendorId, result);
  }
}
