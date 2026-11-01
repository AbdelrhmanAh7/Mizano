/** One line read from a document. Amounts are numbers only at this legacy boundary (4 dp). */
export interface ExtractedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  total: number;
  /** An expense account of the organization the AI suggested (categorization); advisory. */
  suggestedAccountId?: string | null;
}

/** What a reader (rules or AI) extracted from one document. Document content: never log it. */
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
  /** Rule-based extraction only: source line per field. */
  fieldEvidence?: Record<string, { text: string; lineIndex: number }>;
  /** Failed consistency checks as machine codes. */
  extractionWarnings?: string[];
  documentCategory: string | null;
  accountingEntry: {
    debitAccount: string | null;
    creditAccount: string | null;
    taxAccount: string | null;
  } | null;
  processingTimeMs: number;
}

/**
 * Stable codes for a reading that produced nothing usable. The job fails with the code as its
 * `lastError` (never complete/100%): `INTAKE_NO_TEXT` when no text could be read at all,
 * `INTAKE_NOTHING_READ` when text was read but no bill value was found in it.
 */
export type IntakeReadFailureCode = 'INTAKE_NO_TEXT' | 'INTAKE_NOTHING_READ';

/** A reading that produced nothing usable. Retrying reads the same file the same way. */
export class IntakeReadError extends Error {
  constructor(readonly code: IntakeReadFailureCode) {
    super(code);
    this.name = 'IntakeReadError';
  }
}

/** True when a reader returned no vendor, number, date, amount or line at all. */
export function isEmptyExtraction(extraction: DocumentExtractionResult): boolean {
  return (
    !extraction.vendorName &&
    !extraction.invoiceNumber &&
    !extraction.date &&
    extraction.total === null &&
    extraction.subtotal === null &&
    extraction.tax === null &&
    extraction.lineItems.length === 0
  );
}
