/**
 * Prompts for Ollama-based document extraction (invoice/bill/receipt).
 */

export const OLLAMA_EXTRACTION_SYSTEM_PROMPT = `You are a document data extraction assistant. You extract structured data from invoices, bills, and receipts. Return ONLY valid JSON with no explanation.`;

export const OLLAMA_VISION_PROMPT = `Extract all data from this document image. Return a JSON object with these fields:

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
  "lineItems": [
    { "description": "item description", "quantity": 1, "unitPrice": 0.00, "total": 0.00 }
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
- Support both English and Arabic documents

/no_think`;

/**
 * Build a prompt for extracting data from raw text (PDF text extraction).
 */
export function buildTextExtractionPrompt(rawText: string): string {
  return `Extract structured data from this document text. Return a JSON object with these fields:

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
  "lineItems": [
    { "description": "item description", "quantity": 1, "unitPrice": 0.00, "total": 0.00 }
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

--- DOCUMENT TEXT ---
${rawText}

/no_think`;
}
