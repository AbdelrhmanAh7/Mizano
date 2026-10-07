import { toExtractionResult } from '../extraction/rules-strategy.service';
import { extractInvoiceFields } from '../extraction/rules/invoice-rules-extractor';
import { foldForMatch, normalizeDigits } from '../extraction/rules/rules-normalize';
import type { DocumentIntakeResult, IntakeDocumentType } from '../services/document-intake.service';

/**
 * Pure, no-LLM result building for the dedicated CPU worker. It runs inside the disposable child
 * (no database, Nest application, network client or model is involved): OCR/PDF text in,
 * structured fields with evidence out. Tenant-scoped matching needs the database and runs later
 * in the worker process (`IntakeMatchingService`).
 */

/** Same floor as the rules strategy: shorter text is not a document, so nothing is parsed. */
export const MIN_RULES_TEXT_LENGTH = 10;
/** Confidence of an embedded PDF text layer, as in the rules strategy. OCR text uses its own score. */
export const NATIVE_TEXT_CONFIDENCE = 0.95;

/**
 * OCR evidence only: every field stays unknown. Used when the text is too short to parse; the
 * job is then reviewed by an accountant instead of being guessed.
 */
export function cpuReviewResult(rawText: string, confidence: number): DocumentIntakeResult {
  return {
    documentType: 'OTHER',
    classificationConfidence: 0,
    ocrConfidence: confidence,
    extractedFields: {
      date: null,
      dueDate: null,
      total: null,
      subtotal: null,
      tax: null,
      discount: null,
      documentNumber: null,
      vendorName: null,
      vendorAddress: null,
      vendorPhone: null,
      vendorEmail: null,
      vendorTaxId: null,
      currency: null,
      paymentTerms: null,
      notes: null,
      customerName: null,
      lineItems: [],
    },
    fieldConfidence: {},
    matchedVendor: null,
    vendorCandidates: [],
    matchedCustomer: null,
    customerCandidates: [],
    duplicateWarning: null,
    rawText,
    accountingEntry: null,
    suggestCreateVendor: null,
    extractionMethod: 'cpu-ocr',
  };
}

/**
 * Strong invoice phrases, written the way `foldForMatch` leaves Arabic (taa marbuta as haa,
 * alef variants as alef). The same evidence the legacy classifier's keyword boost looks for.
 */
const STRONG_INVOICE_PHRASES = [
  'tax invoice',
  'invoice no',
  'invoice number',
  'invoice date',
  'bill to',
  'total amount due',
  'فاتوره ضريبيه',
  'رقم الفاتوره',
  'فاتوره رقم',
  'تاريخ الفاتوره',
];
const INVOICE_WORD = /\binvoice\b|فاتوره/;
const RECEIPT_WORD = /\breceipt\b|ايصال/;

/**
 * Deterministic document type from keywords, because the model-based classifier is not part of
 * the worker. The confidence is the strength of the keyword evidence (0.5 plus 0.1 per strong
 * phrase, at most 0.95), not a measured accuracy. Text with neither keyword stays `OTHER`, which
 * sends the job to review.
 */
export function classifyDocumentText(rawText: string): {
  documentType: IntakeDocumentType;
  confidence: number;
} {
  // Whitespace is collapsed because a PDF text layer may separate words with several spaces.
  const folded = foldForMatch(normalizeDigits(rawText)).replace(/\s+/g, ' ');
  const strong = STRONG_INVOICE_PHRASES.filter((phrase) => folded.includes(phrase)).length;
  const receipt = RECEIPT_WORD.test(folded);
  if (strong > 0 || (INVOICE_WORD.test(folded) && !receipt)) {
    return { documentType: 'BILL', confidence: Math.min(0.5 + strong * 0.1, 0.95) };
  }
  if (receipt) return { documentType: 'RECEIPT', confidence: 0.5 };
  return { documentType: 'OTHER', confidence: 0 };
}

/**
 * Structured extraction over OCR/PDF text with the same deterministic rules the API's rules
 * strategy uses (`extractInvoiceFields` and `toExtractionResult`), so the worker and the legacy
 * path cannot drift apart. Unknown stays unknown: a value is set only when the rules found it with
 * source evidence, and no due date is invented. Vendor and duplicate matching are left empty here.
 *
 * @param textConfidence 0..1 reliability of the text source: the weakest OCR page, or
 *   {@link NATIVE_TEXT_CONFIDENCE} for an embedded text layer
 */
export function structuredCpuResult(rawText: string, textConfidence: number): DocumentIntakeResult {
  if (rawText.trim().length < MIN_RULES_TEXT_LENGTH) {
    return cpuReviewResult(rawText, textConfidence);
  }
  try {
    return parsedResult(rawText, textConfidence);
  } catch {
    // A defect in the rules must not lose the recognized text, nor retry the same document into the
    // dead letter: keep the evidence for the accountant and say, by code only, why nothing was parsed.
    return { ...cpuReviewResult(rawText, textConfidence), extractionWarnings: ['RULES_FAILED'] };
  }
}

function parsedResult(rawText: string, textConfidence: number): DocumentIntakeResult {
  const rules = extractInvoiceFields(rawText, textConfidence);
  const extraction = toExtractionResult(rules, rawText, 0);
  const classification = classifyDocumentText(rawText);
  return {
    documentType: classification.documentType,
    classificationConfidence: classification.confidence,
    extractedFields: {
      date: extraction.date,
      dueDate: extraction.dueDate,
      total: rules.total?.value.toFixed(4) ?? null,
      subtotal: rules.subtotal?.value.toFixed(4) ?? null,
      tax: rules.tax?.value.toFixed(4) ?? null,
      discount: extraction.discount?.toString() ?? null,
      documentNumber: extraction.invoiceNumber,
      vendorName: extraction.vendorName,
      vendorAddress: extraction.vendorAddress,
      vendorPhone: extraction.vendorPhone,
      vendorEmail: extraction.vendorEmail,
      vendorTaxId: extraction.vendorTaxId,
      currency: extraction.currency,
      paymentTerms: extraction.paymentTerms,
      notes: extraction.notes,
      customerName: null,
      lineItems: extraction.lineItems,
    },
    fieldConfidence: extraction.fieldConfidence,
    fieldEvidence: extraction.fieldEvidence,
    extractionWarnings: extraction.extractionWarnings,
    ocrConfidence: extraction.ocrConfidence,
    matchedVendor: null,
    vendorCandidates: [],
    matchedCustomer: null,
    customerCandidates: [],
    duplicateWarning: null,
    rawText,
    accountingEntry: null,
    suggestCreateVendor: null,
    extractionMethod: 'rules',
  };
}
