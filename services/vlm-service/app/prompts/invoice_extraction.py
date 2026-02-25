INVOICE_EXTRACTION_PROMPT = """You are an expert financial document analyzer. Analyze this invoice/bill image and extract all information into structured JSON.

CRITICAL RULES:
1. This document may be in Arabic (عربي), English, or mixed. Read ALL text carefully.
2. For Arabic text, preserve the original Arabic characters exactly as written.
3. Extract ALL line items from tables, even if the layout is complex or multi-column.
4. Monetary values MUST be numeric only (no currency symbols, no commas in numbers).
5. Dates MUST be in ISO format: YYYY-MM-DD
6. If a field is not found or unclear, use null.
7. For the accounting_entry, suggest appropriate account names based on the invoice content:
   - Office supplies, utilities, rent → "Operating Expenses"
   - Raw materials, goods for resale → "Cost of Goods Sold" or "Purchases"
   - Equipment, machinery → "Fixed Assets"
   - Services (consulting, legal, IT) → "Professional Services"
   - The credit side is typically "Accounts Payable"
   - If tax exists, the tax account is typically "Input VAT" or "Tax Receivable"

Return ONLY valid JSON with this exact structure (no markdown, no explanation, no extra text):
{
  "vendor_name": "string or null",
  "vendor_tax_id": "string or null",
  "customer_name": "string or null",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "currency": "3-letter ISO code or null",
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "total_amount": 0.00,
  "payment_terms": "string or null",
  "items": [
    {
      "description": "item name/description",
      "quantity": 1.0,
      "unit_price": 0.00,
      "total": 0.00,
      "tax_rate": null
    }
  ],
  "notes": "any additional notes, PO numbers, or special terms",
  "accounting_entry": {
    "debit_account": "suggested debit account name",
    "credit_account": "Accounts Payable",
    "tax_account": "Input VAT or null"
  },
  "confidence": {
    "overall": 0.95,
    "vendor_name": 0.98,
    "invoice_date": 0.90,
    "total_amount": 0.95,
    "line_items": 0.85
  }
}"""
