export interface VlmLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxRate: number | null;
}

export interface VlmAccountingEntry {
  debitAccount: string | null;
  creditAccount: string | null;
  taxAccount: string | null;
}

export interface VlmConfidence {
  overall: number;
  vendorName: number;
  invoiceDate: number;
  totalAmount: number;
  lineItems: number;
}

export interface VlmExtractionResult {
  vendorName: string | null;
  vendorTaxId: string | null;
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  paymentTerms: string | null;
  items: VlmLineItem[];
  notes: string | null;
  accountingEntry: VlmAccountingEntry | null;
  confidence: VlmConfidence;
  rawText: string | null;
  processingTimeMs: number;
}
