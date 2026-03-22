/**
 * Prompts for Ollama-based document extraction (invoice/bill/receipt).
 */

export const OLLAMA_EXTRACTION_SYSTEM_PROMPT = `You are a document data extraction assistant. You extract structured data from invoices, bills, and receipts. Return ONLY valid JSON with no explanation. Do NOT think or reason — output the JSON immediately.`;

export const OLLAMA_VISION_PROMPT = `/no_think
Extract all data from this document image. Return ONLY a JSON object with these fields:

{
  "vendorName": "company/vendor name or null",
  "vendorAddress": "full address or null",
  "vendorPhone": "phone number or null",
  "vendorEmail": "email or null",
  "vendorTaxId": "tax ID / VAT number or null",
  "invoiceNumber": "invoice/bill number or null",
  "date": "document date in YYYY-MM-DD format or null",
  "dueDate": "due date in YYYY-MM-DD format or null",
  "total": 0.00,
  "subtotal": 0.00,
  "tax": 0.00,
  "discount": 0.00,
  "currency": "3-letter currency code or null",
  "paymentTerms": "payment terms or null",
  "notes": "any notes or null",
  "documentCategory": "INVOICE | RECEIPT | PURCHASE_ORDER | CONTRACT | TAX_DOCUMENT | BANK_STATEMENT | PAYSLIP | OTHER",
  "lineItems": [
    { "description": "item description", "quantity": 1, "unitPrice": 0.00, "taxAmount": 0.00, "total": 0.00 }
  ],
  "confidence": {
    "overall": 0.85,
    "vendorName": 0.9,
    "invoiceNumber": 0.8,
    "date": 0.9,
    "total": 0.85,
    "lineItems": 0.7
  },
  "accountingEntry": {
    "debitAccount": "suggested debit account name or null",
    "creditAccount": "suggested credit account name or null",
    "taxAccount": "suggested tax account name or null"
  }
}

Rules:
- Return ONLY the JSON, no markdown fences, no explanation
- Use null for fields you cannot find
- Use 0.00 for numeric fields you cannot determine
- Dates must be YYYY-MM-DD format
- Confidence values should be between 0.0 and 1.0
- Extract ALL line items visible in the document
- taxAmount is the actual tax monetary amount for this line item (e.g. 5.60), use 0 if not shown
- Support both English and Arabic documents
- documentCategory must be one of: INVOICE, RECEIPT, PURCHASE_ORDER, CONTRACT, TAX_DOCUMENT, BANK_STATEMENT, PAYSLIP, OTHER`;

/**
 * Build a prompt for extracting data from raw text (PDF text extraction).
 */
export function buildTextExtractionPrompt(rawText: string): string {
  return `/no_think
Extract structured data from this document text. Return ONLY a JSON object with these fields:

{
  "vendorName": "company/vendor name or null",
  "vendorAddress": "full address or null",
  "vendorPhone": "phone number or null",
  "vendorEmail": "email or null",
  "vendorTaxId": "tax ID / VAT number or null",
  "invoiceNumber": "invoice/bill number or null",
  "date": "document date in YYYY-MM-DD format or null",
  "dueDate": "due date in YYYY-MM-DD format or null",
  "total": 0.00,
  "subtotal": 0.00,
  "tax": 0.00,
  "discount": 0.00,
  "currency": "3-letter currency code or null",
  "paymentTerms": "payment terms or null",
  "notes": "any notes or null",
  "documentCategory": "INVOICE | RECEIPT | PURCHASE_ORDER | CONTRACT | TAX_DOCUMENT | BANK_STATEMENT | PAYSLIP | OTHER",
  "lineItems": [
    { "description": "item description", "quantity": 1, "unitPrice": 0.00, "taxAmount": 0.00, "total": 0.00 }
  ],
  "confidence": {
    "overall": 0.85,
    "vendorName": 0.9,
    "invoiceNumber": 0.8,
    "date": 0.9,
    "total": 0.85,
    "lineItems": 0.7
  },
  "accountingEntry": {
    "debitAccount": "suggested debit account name or null",
    "creditAccount": "suggested credit account name or null",
    "taxAccount": "suggested tax account name or null"
  }
}

Rules:
- Return ONLY the JSON, no markdown fences, no explanation
- Use null for fields you cannot find
- Use 0.00 for numeric fields you cannot determine
- Dates must be YYYY-MM-DD format
- Confidence values should be between 0.0 and 1.0
- taxAmount is the actual tax monetary amount for this line item (e.g. 5.60), use 0 if not shown
- documentCategory must be one of: INVOICE, RECEIPT, PURCHASE_ORDER, CONTRACT, TAX_DOCUMENT, BANK_STATEMENT, PAYSLIP, OTHER

--- DOCUMENT TEXT ---
${rawText}`;
}
