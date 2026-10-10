export type IntakeDocumentType = 'BILL' | 'INVOICE' | 'RECEIPT' | 'OTHER';

export interface VendorCandidate {
  id: string;
  name: string;
  similarity: number;
}

export interface CustomerCandidate {
  id: string;
  name: string;
  similarity: number;
}

export interface IntakeLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxAmount: number;
  total: number;
}

export interface DocumentIntakeResult {
  /** Classification */
  documentType: IntakeDocumentType;
  classificationConfidence: number;

  /** Extracted fields */
  extractedFields: {
    date: string | null;
    dueDate: string | null;
    total: number | null;
    subtotal: number | null;
    tax: number | null;
    discount: number | null;
    documentNumber: string | null;
    vendorName: string | null;
    vendorAddress: string | null;
    vendorPhone: string | null;
    vendorEmail: string | null;
    vendorTaxId: string | null;
    currency: string | null;
    paymentTerms: string | null;
    notes: string | null;
    customerName: string | null;
    lineItems: IntakeLineItem[];
  };

  /** Per-field confidence (0-1) */
  fieldConfidence: Record<string, number>;
  /** Rules strategy only: source line per field (document content). */
  fieldEvidence?: Record<string, { text: string; lineIndex: number }>;
  /** Rules strategy only: failed consistency checks as machine codes. */
  extractionWarnings?: string[];
  ocrConfidence: number;

  /** Vendor matching */
  matchedVendor: VendorCandidate | null;
  vendorCandidates: VendorCandidate[];

  /** Customer matching */
  matchedCustomer: CustomerCandidate | null;
  customerCandidates: CustomerCandidate[];

  /** Duplicate detection */
  duplicateWarning: {
    isDuplicate: boolean;
    existingId: string | null;
    matchType: string;
    similarity: number;
  } | null;

  /** Raw text */
  rawText: string;

  /** Accounting entry suggestion */
  accountingEntry?: {
    debitAccount: string | null;
    creditAccount: string | null;
    taxAccount: string | null;
  } | null;

  /** Suggested new vendor when no existing vendor matched */
  suggestCreateVendor: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    taxId: string | null;
  } | null;

  /** Which AI engine extracted the data */
  extractionMethod:
    | 'ollama-vision'
    | 'ollama-text'
    | 'ocr-llm'
    | 'hybrid-ocr'
    | 'hybrid-vlm'
    | 'rules';
}

// ---------------------------------------------------------------------------
// Async intake types
// ---------------------------------------------------------------------------

export type IntakeStage =
  | 'received'
  | 'extracting'
  | 'classifying'
  | 'matching'
  | 'complete'
  | 'error';

export interface IntakeProgressEvent {
  stage: IntakeStage;
  progress: number;
  message?: string;
  result?: DocumentIntakeResult;
  error?: string;
}

/**
 * Confirm payload. Money and percentages travel as decimal strings; the
 * `taxRatePercent` is a percentage (14 => 14%), never a tax amount.
 */
export interface ConfirmIntakeLineInput {
  itemId?: string;
  accountId?: string;
  taxRateId?: string;
  description: string;
  quantity: string;
  rate: string;
  taxRatePercent?: string;
  discountPercent?: string;
}

export interface ConfirmIntakeInput {
  type: 'BILL' | 'INVOICE';
  vendorId?: string;
  customerId?: string;
  date: string;
  dueDate: string;
  documentNumber?: string;
  reference?: string;
  currencyCode?: string;
  lines: ConfirmIntakeLineInput[];
  notes?: string;
  projectId?: string;
  /** User corrections for AI learning */
  corrections?: Record<string, unknown>;
}
