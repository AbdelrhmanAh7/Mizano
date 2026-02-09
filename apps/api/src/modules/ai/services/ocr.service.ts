import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import * as Tesseract from 'tesseract.js';
import * as sharp from 'sharp';
import { levenshteinSimilarity } from '../utils/text-similarity.util';
import { PaddleOcrService } from './paddle-ocr.service';

export interface ExtractedInvoiceData {
  date: string | null;
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

  // ─── Image Preprocessing ───────────────────────────────────────────

  /**
   * Preprocess image to maximize OCR accuracy.
   * Pipeline: grayscale -> normalize contrast -> noise reduction -> sharpen -> resize -> binarize
   */
  private async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;

    let pipeline = sharp(imageBuffer)
      .grayscale()
      .normalize()
      .median(3)
      .sharpen({ sigma: 1.0 });

    // Upscale small images (Tesseract works best at ~300 DPI / 2000-3000px wide)
    if (width > 0 && width < 1500) {
      pipeline = pipeline.resize({ width: 2000, withoutEnlargement: false });
    } else if (width > 4000) {
      pipeline = pipeline.resize({ width: 3000 });
    }

    // Binarize: pure black & white. Most impactful step for OCR.
    pipeline = pipeline.threshold(140);

    return pipeline.png().toBuffer();
  }

  /**
   * More aggressive preprocessing for retry passes on difficult images.
   */
  private async preprocessImageAggressive(
    imageBuffer: Buffer,
  ): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;

    let pipeline = sharp(imageBuffer)
      .grayscale()
      .normalize()
      .median(5)
      .sharpen({ sigma: 1.5 });

    if (width > 0 && width < 1500) {
      pipeline = pipeline.resize({ width: 2500, withoutEnlargement: false });
    } else if (width > 4000) {
      pipeline = pipeline.resize({ width: 3000 });
    }

    // Lower threshold: more text survives binarization (better for faded documents)
    pipeline = pipeline.threshold(110);

    return pipeline.png().toBuffer();
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
    const worker = await Tesseract.createWorker(
      language,
      Tesseract.OEM.LSTM_ONLY,
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            this.logger.debug(
              `OCR progress: ${Math.round(m.progress * 100)}%`,
            );
          }
        },
      },
    );

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
   */
  async extractFromImage(
    imageBuffer: Buffer,
    language: string = 'eng+ara',
  ): Promise<ExtractedInvoiceData> {
    this.logger.log(
      'Starting OCR extraction with hybrid Tesseract → PaddleOCR pipeline',
    );

    try {
      // ─── Phase 1: Fast Tesseract.js Passes ─────────────────────────

      interface OcrAttempt {
        text: string;
        confidence: number;
        label: string;
      }

      const attempts: OcrAttempt[] = [];

      // Pass 1: Preprocessed image + PSM SINGLE_BLOCK (best for structured invoices)
      try {
        const preprocessed = await this.preprocessImage(imageBuffer);
        const result = await this.performOcr(
          preprocessed,
          language,
          Tesseract.PSM.SINGLE_BLOCK,
        );
        this.logger.log(
          `[Tesseract] Pass 1 (preprocessed+PSM6): confidence=${result.confidence.toFixed(1)}%`,
        );
        attempts.push({ ...result, label: 'Tesseract:preprocessed+PSM6' });

        if (result.confidence >= 85) {
          this.logger.log(
            `✓ High confidence result from Tesseract, using it directly`,
          );
          return this.buildExtractionResult(result.text, result.confidence);
        }
      } catch (error) {
        this.logger.warn(`[Tesseract] Pass 1 failed: ${error}`);
      }

      // Pass 2: Preprocessed image + PSM SINGLE_COLUMN
      try {
        const preprocessed = await this.preprocessImage(imageBuffer);
        const result = await this.performOcr(
          preprocessed,
          language,
          Tesseract.PSM.SINGLE_COLUMN,
        );
        this.logger.log(
          `[Tesseract] Pass 2 (preprocessed+PSM4): confidence=${result.confidence.toFixed(1)}%`,
        );
        attempts.push({ ...result, label: 'Tesseract:preprocessed+PSM4' });

        if (result.confidence >= 85) {
          this.logger.log(
            `✓ High confidence result from Tesseract, using it directly`,
          );
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

      if (
        this.paddleOcrService.available() &&
        (!bestTesseract || bestTesseract.confidence < 85)
      ) {
        this.logger.log(
          `[PaddleOCR] Tesseract confidence low (${bestTesseract?.confidence.toFixed(1) || 0}%), trying PaddleOCR...`,
        );

        try {
          const paddleLanguage = language.includes('ara') ? 'arabic' : 'en';
          const paddleResult = await this.paddleOcrService.extractText(
            imageBuffer,
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
          if (
            !bestTesseract ||
            paddleConfidencePercent > bestTesseract.confidence
          ) {
            this.logger.log(
              `✓ PaddleOCR produced better result, using it`,
            );
            return this.buildExtractionResult(
              paddleResult.text,
              paddleConfidencePercent,
            );
          }
        } catch (error) {
          this.logger.warn(`[PaddleOCR] Extraction failed: ${error.message}`);
          // Fall through to use best Tesseract result
        }
      } else if (!this.paddleOcrService.available()) {
        this.logger.debug(
          `PaddleOCR models not available, using Tesseract-only mode`,
        );
      }

      // ─── Phase 3: Additional Tesseract Passes (if still needed) ────

      if (!bestTesseract || bestTesseract.confidence < 70) {
        // Pass 3: Aggressive preprocessing + PSM AUTO
        try {
          const aggressivePreprocessed =
            await this.preprocessImageAggressive(imageBuffer);
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
          const result = await this.performOcr(
            imageBuffer,
            language,
            Tesseract.PSM.AUTO,
          );
          this.logger.log(
            `[Tesseract] Pass 4 (original+PSM3): confidence=${result.confidence.toFixed(1)}%`,
          );
          attempts.push({ ...result, label: 'Tesseract:original+PSM3' });
        } catch (error) {
          this.logger.warn(`[Tesseract] Pass 4 failed: ${error}`);
        }
      }

      // ─── Final: Return Best Result ─────────────────────────────────

      if (attempts.length === 0) {
        throw new Error('All OCR passes failed');
      }

      const best = attempts.reduce((a, b) =>
        a.confidence > b.confidence ? a : b,
      );
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
  buildExtractionResult(
    rawText: string,
    ocrConfidencePercent: number,
  ): ExtractedInvoiceData {
    const ocrConfidence = ocrConfidencePercent / 100;
    const lines = rawText.split('\n').filter((l) => l.trim());
    const fieldConfidence: Record<string, number> = {};

    const date = this.extractDate(rawText);
    fieldConfidence['date'] = date ? 0.8 : 0;

    const total = this.extractTotal(rawText);
    fieldConfidence['total'] = total !== null ? 0.85 : 0;

    const subtotal = this.extractSubtotal(rawText);
    fieldConfidence['subtotal'] = subtotal !== null ? 0.75 : 0;

    const tax = this.extractTax(rawText);
    fieldConfidence['tax'] = tax !== null ? 0.7 : 0;

    const invoiceNumber = this.extractInvoiceNumber(rawText);
    fieldConfidence['invoiceNumber'] = invoiceNumber ? 0.9 : 0;

    const vendorName = this.extractVendorName(lines);
    fieldConfidence['vendorName'] = vendorName ? 0.7 : 0;

    const lineItems = this.extractLineItems(lines);
    fieldConfidence['lineItems'] = lineItems.length > 0 ? 0.65 : 0;

    return {
      date,
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
    const simpleDateLabel =
      /\bdate\b[\s:]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;
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

    // Try DD/MM/YYYY format
    let match = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (match) {
      let [, day, month, year] = match;
      if (year.length === 2) {
        year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
      }
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Try YYYY/MM/DD format
    match = dateStr.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (match) {
      const [, year, month, day] = match;
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

    throw new Error('Could not parse date');
  }

  /**
   * Extract total amount from text (keyword-only, no dangerous largest-number fallback).
   */
  private extractTotal(text: string): number | null {
    // Strategy 1: Labeled total patterns (highest priority)
    const totalPatterns = [
      /grand\s*total[\s:$€£¥]*?(\d[\d,]*\.?\d*)/i,
      /(?:total|amount|balance)\s*(?:due|payable|outstanding)[\s:$€£¥]*?(\d[\d,]*\.?\d*)/i,
      /total\s*amount[\s:$€£¥]*?(\d[\d,]*\.?\d*)/i,
      /net\s*(?:amount|total)[\s:$€£¥]*?(\d[\d,]*\.?\d*)/i,
      /(?:المبلغ\s*الإجمالي|المجموع\s*الكلي|الإجمالي|المجموع)[\s:]*(\d[\d,]*\.?\d*)/i,
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
        const amounts = line.match(/(\d[\d,]*\.\d{2})/g);
        if (amounts && amounts.length > 0) {
          // Take the last amount on the line (invoices list subtotal first, then total)
          const lastAmount = this.parseAmount(amounts[amounts.length - 1]);
          if (lastAmount > 0 && lastAmount < 100_000_000) {
            lastTotalAmount = lastAmount;
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
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const amount = this.parseAmount(match[1]);
        if (amount > 0) return amount;
      }
    }

    return null;
  }

  /**
   * Extract tax amount from text.
   */
  private extractTax(text: string): number | null {
    const patterns = [
      /vat\s*(?:amount)?[\s:$€£¥]*(\d[\d,]*\.?\d*)/i,
      /(?:vat|tax)\s*\(?\s*\d+\.?\d*\s*%\s*\)?\s*[:$€£¥]*\s*(\d[\d,]*\.?\d*)/i,
      /tax\s*(?:amount)?[\s:$€£¥]*(\d[\d,]*\.?\d*)/i,
      /gst[\s:$€£¥]*(\d[\d,]*\.?\d*)/i,
      /hst[\s:$€£¥]*(\d[\d,]*\.?\d*)/i,
      /ضريبة\s*القيمة\s*المضافة[\s:]*(\d[\d,]*\.?\d*)/i,
      /ضريبة[\s:]*(\d[\d,]*\.?\d*)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const amount = this.parseAmount(match[1]);
        if (amount > 0 && amount < 10_000_000) return amount;
      }
    }

    return null;
  }

  /**
   * Extract invoice number from text with multi-strategy approach.
   */
  private extractInvoiceNumber(text: string): string | null {
    // Strategy 1: Keyword-labeled patterns (highest priority)
    const labeledPatterns = [
      /invoice\s*(?:no|number|#|num)\.?\s*[:;]?\s*([A-Z0-9][\w\-\/]{2,30})/i,
      /inv\.?\s*(?:no|#)?\.?\s*[:;]?\s*([A-Z0-9][\w\-\/]{2,30})/i,
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
        // Reject TRN/TIN/VAT registration numbers (10+ pure digits)
        if (/^\d{10,}$/.test(num)) continue;
        // Reject phone numbers
        if (/^\+?\d{7,}$/.test(num)) continue;
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
    const headerLines = lines.slice(0, 8);
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

    return bestCandidate && bestCandidate.score >= 0
      ? bestCandidate.text
      : null;
  }

  /**
   * Extract line items from invoice.
   */
  private extractLineItems(
    lines: string[],
  ): Array<{
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

    const lineItemPattern =
      /(.+?)\s+(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i;
    const simplePattern =
      /(.+?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)\s+(\d+(?:,\d{3})*(?:\.\d+)?)/;

    for (const line of lines) {
      let match = line.match(lineItemPattern);
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
        items.push({
          description: description.trim(),
          quantity: parseFloat(qty.replace(/,/g, '')),
          unitPrice: this.parseAmount(price),
          total: this.parseAmount(total),
        });
      }
    }

    return items;
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
    const fieldsToLearn = ['date', 'total', 'subtotal', 'tax', 'invoiceNumber', 'vendorName'] as const;
    for (const field of fieldsToLearn) {
      if (corrections[field] !== undefined && corrections[field] !== null && corrections[field] !== '') {
        fieldPositions[field] = {
          value: corrections[field],
          pattern: typeof corrections[field] === 'string' ? corrections[field] : String(corrections[field]),
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
  async getVendorLayoutHints(
    organizationId: string,
    vendorId: string,
  ): Promise<any | null> {
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
        position > 0
          ? rawText.slice(Math.max(0, position - 40), position).trim()
          : '';
      const contextAfter =
        position >= 0
          ? rawText
              .slice(
                position + anchorValue.length,
                position + anchorValue.length + 40,
              )
              .trim()
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
          const sim = levenshteinSimilarity(
            searchTerm.toLowerCase(),
            candidate.toLowerCase(),
          );
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
          const numberMatch = afterContext.match(
            /^[\s:$€£¥]*([0-9,]+\.?\d*)/,
          );
          if (numberMatch) {
            return {
              value: numberMatch[1].replace(/,/g, ''),
              confidence: 0.85,
            };
          }
          const dateMatch = afterContext.match(
            /^[\s:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
          );
          if (dateMatch) {
            return { value: dateMatch[1], confidence: 0.85 };
          }
          const textMatch = afterContext.match(
            /^[\s:#]*([A-Z0-9\-]{3,20})/i,
          );
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
      `Applying vendor hints for ${vendorId}: ${Object.keys(hints).filter((k) => (hints as any)[k]?.learned).join(', ')}`,
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
