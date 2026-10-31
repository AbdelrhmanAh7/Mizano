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

/** The result when no reader produced anything: every field unknown. */
export function emptyExtraction(rawText = ''): DocumentExtractionResult {
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
