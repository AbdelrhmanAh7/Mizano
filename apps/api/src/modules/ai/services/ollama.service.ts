import { Injectable, Logger } from '@nestjs/common';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  OLLAMA_EXTRACTION_SYSTEM_PROMPT,
  OLLAMA_VISION_PROMPT,
  buildTextExtractionPrompt,
  buildOcrTextExtractionPrompt,
} from '../prompts/ollama-extraction.prompts';
import { preprocessForVlm } from '../utils/image-preprocessor.util';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  total: number;
}

export interface DocumentExtractionResult {
  vendorName: string | null;
  vendorAddress: string | null;
  vendorPhone: string | null;
  vendorEmail: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  date: string | null;
  dueDate: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  currency: string | null;
  paymentTerms: string | null;
  notes: string | null;
  lineItems: ExtractedLineItem[];
  rawText: string;
  ocrConfidence: number;
  fieldConfidence: Record<string, number>;
  documentCategory: string | null;
  accountingEntry: {
    debitAccount: string | null;
    creditAccount: string | null;
    taxAccount: string | null;
  } | null;
  processingTimeMs: number;
}

// Raw shape returned by Ollama (matches the prompt JSON schema)
interface OllamaExtractionRaw {
  vendorName?: string | null;
  vendorAddress?: string | null;
  vendorPhone?: string | null;
  vendorEmail?: string | null;
  vendorTaxId?: string | null;
  invoiceNumber?: string | null;
  date?: string | null;
  dueDate?: string | null;
  total?: number | null;
  subtotal?: number | null;
  tax?: number | null;
  discount?: number | null;
  currency?: string | null;
  paymentTerms?: string | null;
  notes?: string | null;
  lineItems?: Array<{
    description?: string;
    quantity?: number;
    unitPrice?: number;
    taxAmount?: number;
    total?: number;
  }>;
  confidence?: {
    overall?: number;
    [field: string]: number | undefined;
  };
  documentCategory?: string | null;
  accountingEntry?: {
    debitAccount?: string | null;
    creditAccount?: string | null;
    taxAccount?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Document extraction service powered by Ollama.
 *
 * Uses the OllamaInferenceGateway to extract structured invoice/bill data
 * from images (vision model) or raw text (text model).
 */
@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);

  constructor(private readonly gateway: OllamaInferenceGateway) {}

  /**
   * Extract document data from an image using Ollama's vision model.
   *
   * Uses shared ImagePreprocessor for VLM-optimized preprocessing.
   * Returns null if Ollama is unavailable or extraction fails.
   */
  async extractFromImageVision(
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<DocumentExtractionResult | null> {
    let processed: Buffer;
    try {
      processed = await preprocessForVlm(fileBuffer, mimeType);
    } catch (err) {
      this.logger.error(`Image preprocessing failed: ${err instanceof Error ? err.message : err}`);
      return null;
    }
    const base64 = processed.toString('base64');

    this.logger.log(
      `Ollama vision extraction: mimeType=${mimeType}, original=${fileBuffer.length}b, ` +
        `processed=${processed.length}b, base64=${(base64.length / 1024).toFixed(0)}KB`,
    );

    const result = await this.gateway.inferWithImages<OllamaExtractionRaw>(
      OLLAMA_VISION_PROMPT,
      [base64],
      {
        systemPrompt: OLLAMA_EXTRACTION_SYSTEM_PROMPT,
        timeoutMs: 300_000,
        maxTokens: 16384,
      },
    );

    if (!result) {
      this.logger.warn('Ollama vision extraction returned null');
      return null;
    }

    return this.toDocumentExtractionResult(result.data, '', result.processingTimeMs);
  }

  /**
   * Extract document data from raw text using Ollama's text model.
   * Returns null if Ollama is unavailable or extraction fails.
   */
  async extractFromText(rawText: string): Promise<DocumentExtractionResult | null> {
    this.logger.log(`Ollama text extraction: textLen=${rawText.length}`);

    const prompt = buildTextExtractionPrompt(rawText);

    const result = await this.gateway.infer<OllamaExtractionRaw>(prompt, {
      systemPrompt: OLLAMA_EXTRACTION_SYSTEM_PROMPT,
    });

    if (!result) {
      this.logger.warn('Ollama text extraction returned null');
      return null;
    }

    return this.toDocumentExtractionResult(result.data, rawText, result.processingTimeMs);
  }

  /**
   * Extract document data from OCR-produced text.
   * Uses an OCR-aware prompt that handles recognition errors.
   */
  async extractFromOcrText(
    ocrText: string,
    ocrConfidence: number,
  ): Promise<DocumentExtractionResult | null> {
    this.logger.log(
      `[LLM INPUT] OCR text (${ocrText.length} chars, conf=${ocrConfidence}%) → sending to ${this.gateway.textModel}`,
    );

    const prompt = buildOcrTextExtractionPrompt(ocrText, ocrConfidence);

    const result = await this.gateway.infer<OllamaExtractionRaw>(prompt, {
      systemPrompt: OLLAMA_EXTRACTION_SYSTEM_PROMPT,
    });

    if (!result) {
      this.logger.warn('[LLM OUTPUT] Ollama returned null');
      return null;
    }

    // Log the raw LLM JSON response
    this.logger.log(`[LLM OUTPUT] Raw JSON from ${result.model} (${result.processingTimeMs}ms):`);
    this.logger.log(JSON.stringify(result.data, null, 2));

    return this.toDocumentExtractionResult(result.data, ocrText, result.processingTimeMs);
  }

  /**
   * Build an empty extraction result (when Ollama is unavailable).
   */
  buildEmptyResult(rawText: string = ''): DocumentExtractionResult {
    return {
      vendorName: null,
      vendorAddress: null,
      vendorPhone: null,
      vendorEmail: null,
      vendorTaxId: null,
      invoiceNumber: null,
      date: null,
      dueDate: null,
      total: null,
      subtotal: null,
      tax: null,
      discount: null,
      currency: null,
      paymentTerms: null,
      notes: null,
      lineItems: [],
      rawText,
      ocrConfidence: 0,
      fieldConfidence: {},
      documentCategory: null,
      accountingEntry: null,
      processingTimeMs: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toDocumentExtractionResult(
    raw: OllamaExtractionRaw,
    rawText: string,
    processingTimeMs: number,
  ): DocumentExtractionResult {
    const lineItems: ExtractedLineItem[] = (raw.lineItems || []).map((item) => ({
      description: item.description || '',
      quantity: item.quantity || 0,
      unitPrice: item.unitPrice || 0,
      taxAmount: item.taxAmount || 0,
      total: item.total || 0,
    }));

    // Compute confidence from field presence (more reliable than model self-assessment)
    const fieldConfidence = this.computeFieldConfidence(raw, lineItems);
    const confidenceValues = Object.values(fieldConfidence);
    const overallConfidence =
      confidenceValues.length > 0
        ? confidenceValues.reduce((sum, v) => sum + v, 0) / confidenceValues.length
        : 0;

    // Derive accounting entry from document category (no model guessing)
    const accountingEntry = this.deriveAccountingEntry(raw.documentCategory ?? null);

    // Validate and auto-fix numbers (decimal point corrections)
    let total = raw.total ?? null;
    let subtotal = raw.subtotal ?? null;
    let tax = raw.tax ?? null;
    const discount = raw.discount ?? null;
    const fixedLineItems = this.validateAndFixNumbers(total, subtotal, tax, discount, lineItems);
    total = fixedLineItems.total;
    subtotal = fixedLineItems.subtotal;
    tax = fixedLineItems.tax;

    return {
      vendorName: raw.vendorName ?? null,
      vendorAddress: raw.vendorAddress ?? null,
      vendorPhone: raw.vendorPhone ?? null,
      vendorEmail: raw.vendorEmail ?? null,
      vendorTaxId: raw.vendorTaxId ?? null,
      invoiceNumber: raw.invoiceNumber ?? null,
      date: raw.date ?? null,
      dueDate: raw.dueDate ?? null,
      total,
      subtotal,
      tax,
      discount,
      currency: raw.currency ?? null,
      paymentTerms: raw.paymentTerms ?? null,
      notes: raw.notes ?? null,
      lineItems: fixedLineItems.lineItems,
      rawText,
      ocrConfidence: overallConfidence,
      fieldConfidence,
      documentCategory: raw.documentCategory ?? null,
      accountingEntry,
      processingTimeMs,
    };
  }

  /**
   * Validate and auto-fix numbers with obvious decimal errors.
   * If total = 135.45 but subtotal = 12800, tries dividing by 100 → 128.00.
   */
  private validateAndFixNumbers(
    total: number | null,
    subtotal: number | null,
    tax: number | null,
    discount: number | null,
    lineItems: ExtractedLineItem[],
  ): {
    total: number | null;
    subtotal: number | null;
    tax: number | null;
    lineItems: ExtractedLineItem[];
  } {
    if (total == null || total <= 0) return { total, subtotal, tax, lineItems };

    const disc = discount ?? 0;

    // Check if subtotal + tax ≈ total (within 2%)
    if (subtotal != null && tax != null) {
      const sum = subtotal + tax - disc;
      const diff = Math.abs(sum - total);
      if (diff / total < 0.02) {
        // Numbers are already consistent
        return { total, subtotal, tax, lineItems };
      }

      this.logger.warn(
        `[NumberFix] Mismatch: subtotal(${subtotal}) + tax(${tax}) - discount(${disc}) = ${sum} ≠ total(${total})`,
      );

      // Try decimal corrections: divide each by 10, 100, 1000
      for (const divisor of [10, 100, 1000]) {
        const fixedSub = subtotal / divisor;
        const fixedTax = tax / divisor;
        const fixedSum = fixedSub + fixedTax - disc;
        if (Math.abs(fixedSum - total) / total < 0.02) {
          this.logger.warn(
            `[NumberFix] Fixed by ÷${divisor}: subtotal ${subtotal}→${fixedSub}, tax ${tax}→${fixedTax}`,
          );
          subtotal = fixedSub;
          tax = fixedTax;
          break;
        }
        // Try fixing only subtotal
        const sumWithFixedSub = fixedSub + tax - disc;
        if (Math.abs(sumWithFixedSub - total) / total < 0.02) {
          this.logger.warn(`[NumberFix] Fixed subtotal by ÷${divisor}: ${subtotal}→${fixedSub}`);
          subtotal = fixedSub;
          break;
        }
        // Try fixing only tax
        const sumWithFixedTax = subtotal + fixedTax - disc;
        if (Math.abs(sumWithFixedTax - total) / total < 0.02) {
          this.logger.warn(`[NumberFix] Fixed tax by ÷${divisor}: ${tax}→${fixedTax}`);
          tax = fixedTax;
          break;
        }
      }
    }

    // Fix line items: if unitPrice × qty is way off from lineTotal
    const fixedItems = lineItems.map((li) => {
      if (li.quantity > 0 && li.unitPrice > 0 && li.total > 0) {
        const expected = li.quantity * li.unitPrice;
        if (expected > li.total * 50) {
          // unitPrice is probably missing a decimal
          for (const div of [10, 100, 1000]) {
            const fixed = li.unitPrice / div;
            if (Math.abs(li.quantity * fixed - li.total) / li.total < 0.1) {
              this.logger.warn(
                `[NumberFix] Line "${li.description}": unitPrice ${li.unitPrice}→${fixed}`,
              );
              return { ...li, unitPrice: fixed };
            }
          }
        }
      }
      return li;
    });

    return { total, subtotal, tax, lineItems: fixedItems };
  }

  /**
   * Compute field-level confidence from presence and validity of extracted values.
   * More reliable than asking a small model to self-assess.
   */
  private computeFieldConfidence(
    raw: OllamaExtractionRaw,
    lineItems: ExtractedLineItem[],
  ): Record<string, number> {
    const conf: Record<string, number> = {};

    // Key fields — present and non-empty = high confidence
    conf.vendorName = raw.vendorName ? 0.85 : 0;
    conf.invoiceNumber = raw.invoiceNumber ? 0.85 : 0;
    conf.date = raw.date && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? 0.9 : raw.date ? 0.5 : 0;
    conf.total = raw.total != null && raw.total > 0 ? 0.9 : raw.total != null ? 0.5 : 0;

    // Line items — confidence based on completeness
    if (lineItems.length > 0) {
      const completeItems = lineItems.filter(
        (li) => li.description && li.quantity > 0 && li.total > 0,
      );
      conf.lineItems = completeItems.length / lineItems.length;
    } else {
      conf.lineItems = 0;
    }

    return conf;
  }

  /**
   * Derive standard accounting entry from document category.
   * Deterministic and correct — no model guessing.
   */
  private deriveAccountingEntry(
    category: string | null,
  ): DocumentExtractionResult['accountingEntry'] {
    switch (category) {
      case 'INVOICE':
        return {
          debitAccount: 'Accounts Receivable',
          creditAccount: 'Revenue',
          taxAccount: 'Tax Payable',
        };
      case 'RECEIPT':
        return {
          debitAccount: 'Cash / Bank',
          creditAccount: 'Accounts Receivable',
          taxAccount: null,
        };
      case 'PURCHASE_ORDER':
      case 'BANK_STATEMENT':
        return {
          debitAccount: 'Expense',
          creditAccount: 'Accounts Payable',
          taxAccount: 'Input Tax',
        };
      case 'PAYSLIP':
        return {
          debitAccount: 'Salary Expense',
          creditAccount: 'Cash / Bank',
          taxAccount: null,
        };
      default:
        return null;
    }
  }
}
