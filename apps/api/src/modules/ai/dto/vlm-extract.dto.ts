export interface VlmVendorInfo {
  name: string | null;
  address: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
}

export interface VlmPartyInfo {
  name: string | null;
  address: string | null;
  taxId: string | null;
}

export interface VlmShipToInfo {
  name: string | null;
  address: string | null;
}

export interface VlmLineItem {
  lineNumber: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxableAmount: number | null;
  taxRatePercent: number | null;
  taxAmount: number | null;
  lineTotal: number;
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
  documentType: string | null;
  /** Convenience shortcut — mirrors vendor.name */
  vendorName: string | null;
  /** Convenience shortcut — mirrors vendor.taxId */
  vendorTaxId: string | null;
  vendor: VlmVendorInfo;
  billTo: VlmPartyInfo;
  shipTo: VlmShipToInfo;
  customerName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  currency: string | null;
  paymentTerms: string | null;
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  discount: number | null;
  amountPaid: number | null;
  balanceDue: number | null;
  lineItems: VlmLineItem[];
  notes: string | null;
  accountingEntry: VlmAccountingEntry | null;
  confidence: VlmConfidence;
  rawText: string | null;
  processingTimeMs: number;
}
