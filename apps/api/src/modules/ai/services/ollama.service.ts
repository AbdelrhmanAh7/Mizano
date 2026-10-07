import { Injectable, Logger } from '@nestjs/common';
import { OllamaInferenceGateway } from './ollama-inference-gateway.service';
import {
  OLLAMA_EXTRACTION_SYSTEM_PROMPT,
  OLLAMA_VISION_PROMPT,
  buildTextExtractionPrompt,
  buildOcrTextExtractionPrompt,
} from '../prompts/ollama-extraction.prompts';
import { preprocessForVlm } from '../utils/image-preprocessor.util';
import { describeError } from '../../../common/utils/redact';
import { normalizeDigits } from '../extraction/rules/rules-normalize';

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
  /** Rule-based extraction only: source line per field. Document content, never log. */
  fieldEvidence?: Record<string, { text: string; lineIndex: number }>;
  /** Rule-based extraction only: machine codes for failed consistency checks. */
  extractionWarnings?: string[];
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
    modelOverride?: string,
  ): Promise<DocumentExtractionResult | null> {
    let processed: Buffer;
    try {
      processed = await preprocessForVlm(fileBuffer, mimeType);
    } catch (err) {
      this.logger.error(`Image preprocessing failed: ${describeError(err)}`);
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
        maxTokens: 4096,
        model: modelOverride,
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

    // Normalize Arabic-Indic/Persian digits and separators before extraction
    const normalizedText = normalizeDigits(rawText);
    const prompt = buildTextExtractionPrompt(normalizedText);

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
    modelOverride?: string,
  ): Promise<DocumentExtractionResult | null> {
    const model = modelOverride || this.gateway.textModel;
    this.logger.log(
      `[LLM INPUT] OCR text (${ocrText.length} chars, conf=${ocrConfidence}%) → sending to ${model}`,
    );

    // Normalize Arabic-Indic/Persian digits and separators before extraction
    const normalizedText = normalizeDigits(ocrText);
    const prompt = buildOcrTextExtractionPrompt(normalizedText, ocrConfidence);

    const result = await this.gateway.infer<OllamaExtractionRaw>(prompt, {
      systemPrompt: OLLAMA_EXTRACTION_SYSTEM_PROMPT,
      model: modelOverride,
    });

    if (!result) {
      this.logger.warn('[LLM OUTPUT] Ollama returned null');
      return null;
    }

    // The raw LLM JSON holds invoice fields (vendor, amounts, tax ids): log metadata only.
    this.logger.log(
      `[LLM OUTPUT] Response from ${result.model} (${result.processingTimeMs}ms, ` +
        `fields=${Object.keys(result.data ?? {}).length})`,
    );

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
   * Validate and auto-fix numbers.
   *
   * ALWAYS runs the math-based triplet finder to find correct total/subtotal/tax,
   * regardless of what the LLM returned (it often picks address codes as amounts).
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
    const disc = discount ?? 0;

    // Quick check: if LLM numbers are already consistent, accept them
    if (total != null && total > 0 && subtotal != null && subtotal > 0 && tax != null && tax > 0) {
      const sum = subtotal + tax - disc;
      if (Math.abs(sum - total) / total < 0.02) {
        const fixedItems = this.fixLineItems(lineItems, subtotal, tax, total);
        return { total, subtotal, tax, lineItems: fixedItems };
      }
    }

    this.logger.warn('[NumberFix] LLM numbers inconsistent or missing; running reconciliation');

    // Collect ALL numbers from the extraction (LLM output + line items)
    const allNums: number[] = [];
    if (total != null && total > 0) allNums.push(total);
    if (subtotal != null && subtotal > 0) allNums.push(subtotal);
    if (tax != null && tax > 0) allNums.push(tax);
    for (const li of lineItems) {
      if (li.unitPrice > 0) allNums.push(li.unitPrice);
      if (li.total > 0) allNums.push(li.total);
      if (li.taxAmount > 0) allNums.push(li.taxAmount);
    }
    const unique = [...new Set(allNums)].sort((a, b) => b - a); // largest first

    // Strategy 1: Find triplet where A + B = C and B/A is a valid tax rate (3-25%)
    let fixed = false;
    for (const c of unique) {
      for (const a of unique) {
        if (a >= c) continue;
        const b = Math.round((c - a) * 100) / 100;
        const bMatch = unique.find((n) => n > 0 && Math.abs(n - b) / c < 0.015);
        if (bMatch && a !== bMatch) {
          const smaller = Math.min(a, bMatch);
          const larger = Math.max(a, bMatch);
          const impliedRate = smaller / larger;
          if (impliedRate >= 0.03 && impliedRate <= 0.25) {
            this.logger.warn(
              `[NumberFix] Math triplet found (rate=${(impliedRate * 100).toFixed(1)}%)`,
            );
            total = c;
            subtotal = larger;
            tax = smaller;
            fixed = true;
            break;
          }
        }
      }
      if (fixed) break;
    }

    // Strategy 2: If no triplet found but we have a plausible total, derive with common rates
    if (!fixed) {
      // Pick the most likely total: a number with decimals, or the line item total
      const candidates = unique.filter((n) => n > 0 && n < 100000);
      for (const candidate of candidates) {
        for (const rate of [0.15, 0.05, 0.1, 0.14, 0.07]) {
          const derivedSub = Math.round((candidate / (1 + rate)) * 100) / 100;
          const derivedTax = Math.round((candidate - derivedSub) * 100) / 100;
          if (derivedTax > 0 && Math.abs(derivedSub + derivedTax - candidate) < 0.02) {
            // Check if derivedSub or derivedTax exists among our numbers
            const subExists = unique.some((n) => Math.abs(n - derivedSub) < 0.02);
            const taxExists = unique.some((n) => Math.abs(n - derivedTax) < 0.02);
            if (subExists || taxExists) {
              this.logger.warn(`[NumberFix] Derived totals using ${rate * 100}% tax rate`);
              total = candidate;
              subtotal = derivedSub;
              tax = derivedTax;
              fixed = true;
              break;
            }
          }
        }
        if (fixed) break;
      }
    }

    // Fix line items using corrected totals
    const fixedItems = this.fixLineItems(lineItems, subtotal, tax, total);

    return { total, subtotal, tax, lineItems: fixedItems };
  }

  /** Column header words that the LLM might mistake for item descriptions. */
  private static readonly COLUMN_HEADERS = new Set([
    'itemname',
    'item',
    'unit',
    'price',
    'qty',
    'qyt',
    'quantity',
    'rate',
    'total',
    'amount',
    'description',
    'vat',
    'tax',
    'discount',
    'net',
    'pric+vat',
    't.pric+v',
    'supply',
    'narration',
    'sl',
    'sno',
    'sr',
  ]);

  /**
   * Fix line items: remove fake items, fix quantities, fix tax split.
   */
  private fixLineItems(
    lineItems: ExtractedLineItem[],
    subtotal: number | null,
    tax: number | null,
    total: number | null,
  ): ExtractedLineItem[] {
    if (!total || lineItems.length === 0) return lineItems;

    // Step 1: Remove fake line items (column headers used as descriptions)
    let cleaned = lineItems.filter((li) => {
      const desc = (li.description || '').toLowerCase().trim();
      if (OllamaService.COLUMN_HEADERS.has(desc)) {
        this.logger.warn('[LineFix] Removing fake line item (column header)');
        return false;
      }
      // Remove items with no meaningful description (1-2 chars)
      if (desc.length < 3 && li.unitPrice <= 0) {
        return false;
      }
      return true;
    });

    // Step 2: Fix quantities — if qty*unitPrice is way off from total, try smaller qty
    cleaned = cleaned.map((li) => {
      if (li.quantity > 1 && li.unitPrice > 0 && li.total > 0) {
        const computed = li.quantity * li.unitPrice;
        // If computed is way off (e.g. 20 * 34.78 = 695.6 vs total=40), try dividing qty by 10
        if (computed > li.total * 3) {
          for (const div of [10, 100]) {
            const fixedQty = li.quantity / div;
            if (fixedQty >= 1 && Math.abs(fixedQty * li.unitPrice - li.total) / li.total < 0.1) {
              this.logger.warn(`[LineFix] Corrected line quantity (divisor=${div})`);
              return { ...li, quantity: fixedQty };
            }
          }
          // Also try: maybe unitPrice is actually the line total, and we need to find real unitPrice
          if (subtotal && Math.abs(li.unitPrice - subtotal) < 0.01) {
            const realQty = Math.round(li.quantity / 10) || 1;
            const realUnitPrice = Math.round((li.total / realQty) * 10000) / 10000;
            if (realQty >= 1 && Math.abs(realQty * realUnitPrice - (subtotal || li.total)) < 0.1) {
              this.logger.warn('[LineFix] Reconstructed line quantity and unit price');
              return { ...li, quantity: realQty, unitPrice: realUnitPrice };
            }
          }
        }
      }
      return li;
    });

    // Step 3: If we have corrected subtotal/tax, fix tax split on line items
    if (subtotal && subtotal > 0 && tax && tax > 0) {
      const taxRate = tax / subtotal;
      const sumLineTotals = cleaned.reduce((s, li) => s + li.total, 0);

      // If line totals match document total (with tax), split into pre-tax
      if (total > 0 && Math.abs(sumLineTotals - total) / total < 0.05) {
        cleaned = cleaned.map((li) => {
          const preTax = Math.round((li.total / (1 + taxRate)) * 100) / 100;
          const lineTax = Math.round((li.total - preTax) * 100) / 100;
          return {
            ...li,
            unitPrice: Math.round((preTax / (li.quantity || 1)) * 10000) / 10000,
            taxAmount: lineTax,
          };
        });
      }
      // If line totals match subtotal (pre-tax), just add tax
      else if (Math.abs(sumLineTotals - subtotal) / subtotal < 0.05) {
        cleaned = cleaned.map((li) => {
          const lineTax = Math.round(li.total * taxRate * 100) / 100;
          return { ...li, taxAmount: lineTax, total: li.total + lineTax };
        });
      }
    }

    // Step 4: If no valid line items left but we have subtotal, create one from document totals
    if (cleaned.length === 0 && subtotal && subtotal > 0) {
      this.logger.warn(`[LineFix] No valid line items — creating one from document totals`);
      cleaned = [
        {
          description: 'Item',
          quantity: 1,
          unitPrice: subtotal,
          taxAmount: tax ?? 0,
          total: total,
        },
      ];
    }

    return cleaned;
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
