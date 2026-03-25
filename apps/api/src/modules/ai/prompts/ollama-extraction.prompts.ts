/**
 * Prompts for Ollama-based document extraction (invoice/bill/receipt).
 *
 * Optimized for small/medium models (7B–12B) on CPU:
 *  - Concrete few-shot example instead of abstract schema
 *  - Number validation rules
 *  - No confidence/accountingEntry (computed in code)
 *  - Model-agnostic (no Qwen-specific /no_think)
 */

/** Number validation rules — appended to all extraction prompts. */
const NUMBER_RULES = `- CRITICAL number validation:
  - total MUST equal subtotal + tax - discount. Cross-check your math before returning.
  - If a number seems too large (e.g. 12800 when total is 135.45), it has a missing decimal point: 12800 → 128.00
  - All monetary values must have proper decimal places (129.00 not 12900, 6.45 not 645)
  - READ numbers directly from the text. NEVER compute or estimate monetary values.
  - subtotal, tax, and total are explicitly printed on the document — find and copy them exactly
  - unitPrice is the PRE-TAX price per unit, NOT the total including tax
  - For each line: (unitPrice × quantity) + taxAmount = line total
  - Words like "ItemName", "UNIT", "PRICE", "QYT", "TOTAL", "Rate", "Amount" are COLUMN HEADERS, not item descriptions — do NOT use them as lineItem descriptions
  - If you see "PRIC+VAT" that means price INCLUDING tax — the unitPrice should be the column BEFORE it
  - Look at the last few numbers in the document for subtotal, tax%, and total (usually at the bottom)
  - quantity is usually a small number (1-100). If it seems too large, you may have confused it with a price`;

export const OLLAMA_EXTRACTION_SYSTEM_PROMPT =
  'You are a document data extraction assistant. Extract structured data from invoices, bills, and receipts. Return ONLY valid JSON. No thinking, no explanation.';

/**
 * Few-shot example used in both vision and text prompts.
 * Bilingual-friendly (Arabic vendor + English format) so the model
 * sees both languages are acceptable.
 */
const EXTRACTION_EXAMPLE = JSON.stringify(
  {
    vendorName: 'شركة الأمل للتجارة',
    vendorAddress: '123 King Fahd Rd, Riyadh',
    vendorPhone: '+966501234567',
    vendorEmail: 'info@alamal.sa',
    vendorTaxId: '300012345600003',
    invoiceNumber: 'INV-2024-0042',
    date: '2024-03-15',
    dueDate: '2024-04-15',
    total: 1725.0,
    subtotal: 1500.0,
    tax: 225.0,
    discount: 0,
    currency: 'SAR',
    paymentTerms: 'Net 30',
    notes: null,
    documentCategory: 'INVOICE',
    lineItems: [
      {
        description: 'Office Supplies',
        quantity: 10,
        unitPrice: 100.0,
        taxAmount: 150.0,
        total: 1150.0,
      },
      {
        description: 'Printer Paper A4',
        quantity: 5,
        unitPrice: 80.0,
        taxAmount: 75.0,
        total: 575.0,
      },
    ],
  },
  null,
  0,
);

export const OLLAMA_VISION_PROMPT = `Extract all data from this document image into JSON. Respond with ONLY the JSON object.

Example output:
${EXTRACTION_EXAMPLE}

Rules:
- Return ONLY the JSON object, nothing else
- null for missing text fields, 0 for missing numbers
- Dates must be YYYY-MM-DD
- Extract ALL visible line items
- documentCategory must be one of: INVOICE, RECEIPT, PURCHASE_ORDER, CONTRACT, TAX_DOCUMENT, BANK_STATEMENT, PAYSLIP, OTHER
- Support both Arabic and English documents
${NUMBER_RULES}`;

/**
 * Build a prompt for extracting data from raw text (PDF text extraction).
 */
export function buildTextExtractionPrompt(rawText: string): string {
  return `Extract structured data from this document text into JSON. Respond with ONLY the JSON object.

Example output:
${EXTRACTION_EXAMPLE}

Rules:
- Return ONLY the JSON object, nothing else
- null for missing text fields, 0 for missing numbers
- Dates must be YYYY-MM-DD
- Extract ALL line items found in the text
- documentCategory must be one of: INVOICE, RECEIPT, PURCHASE_ORDER, CONTRACT, TAX_DOCUMENT, BANK_STATEMENT, PAYSLIP, OTHER
- Support both Arabic and English
${NUMBER_RULES}

--- DOCUMENT TEXT ---
${rawText}`;
}

/**
 * Build a prompt for extracting data from OCR-produced text.
 * Instructs the model to handle OCR recognition errors (misread characters, merged words).
 */
export function buildOcrTextExtractionPrompt(ocrText: string, ocrConfidence: number): string {
  return `Extract structured data from this OCR-scanned document text into JSON. Respond with ONLY the JSON object.
This text was extracted via OCR (confidence: ${ocrConfidence.toFixed(0)}%). It may contain recognition errors, merged words, or misread characters. Use context to correct obvious mistakes.

Example output:
${EXTRACTION_EXAMPLE}

Rules:
- Return ONLY the JSON object, nothing else
- null for missing text fields, 0 for missing numbers
- Dates must be YYYY-MM-DD
- Correct obvious OCR errors (e.g. "lnvoice" → "Invoice", "0" vs "O", "rn" vs "m")
- Extract ALL line items found in the text
- documentCategory must be one of: INVOICE, RECEIPT, PURCHASE_ORDER, CONTRACT, TAX_DOCUMENT, BANK_STATEMENT, PAYSLIP, OTHER
- Support both Arabic and English
${NUMBER_RULES}

--- OCR TEXT ---
${ocrText}`;
}
