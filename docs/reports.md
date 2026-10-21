# Reports

## VAT Return Draft

`GET /api/tax/vat-returns/draft?periodStart=YYYY-MM-DD&periodEnd=YYYY-MM-DD` returns a read-only VAT summary computed from the posted VAT ledger and recorded documents. It requires `tax.view`; the organization always comes from the session token.

- **Draft only**: every response carries `"label": "DRAFT, not for filing"`. Nothing is filed or submitted.
- **Range**: both dates are inclusive UTC calendar days (a date-only `periodEnd` covers the whole day; a timestamp counts as the day it falls in). The start date must be on or before the end date, and the period may span at most 366 days; anything else returns `400`.
- **Totals**: `outputVat`, `inputVat` and `netVat` (output minus input; negative means refundable) are decimal strings with 4 places, along with `totalSales` and `totalPurchases`. Figures derive from the posted VAT Payable and VAT Receivable ledger lines and invoice/bill document records. Expenses, credit notes, vendor credits, reversals and manual VAT journals count; settlement/payment journals and opening balances do not.
- **`currency`**: the organization's base currency, the currency of every amount in the draft.
- **Documents checked**: invoices (`SENT`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`) and bills (`OPEN`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`) dated in the range and not soft-deleted. `DRAFT`, `PENDING` and `VOID` documents are ignored. They are read in pages of 500 ordered by id, so memory stays flat for long histories.
- **`mismatches`**: discrepancies between computed figures (`netVat`, `outputVat`, `inputVat`, `totalSales`, `totalPurchases`) and any previously recorded/filed VAT return for the same period. When no stored return exists, `mismatches` is an empty array.
- **`exceptions`**: a checked document that cannot be compared with its lines: a currency other than `baseCurrency` ("Foreign currency"), no tax amount ("Missing tax amount"), a negative tax amount, or a line tax rate outside 0 to 100 ("Invalid tax rate"). Exceptions are for review; they do not change the ledger totals.
- **`etaMismatches`**: a document whose header tax differs from the sum of its line taxes (net line amount × line rate, rounded to 2 places per line). The Egyptian Tax Authority (ETA) recomputes the tax from the lines and rejects such an e-invoice, so the draft flags it before filing.
- **`status`**: `"incomplete"` when `exceptions`, `etaMismatches` or `mismatches` is not empty, otherwise `"complete"`.

```bash
TOKEN=$(curl -s -X POST http://localhost:6001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@mizano.com","password":"password123"}' | jq -r .tokens.accessToken)

curl -s "http://localhost:6001/api/tax/vat-returns/draft?periodStart=2024-01-01&periodEnd=2024-01-31" \
  -H "Authorization: Bearer $TOKEN"
```

The login uses the seeded demo admin (`pnpm db:seed`). Example response:

```json
{
  "label": "DRAFT, not for filing",
  "currency": "EGP",
  "from": "2024-01-01T00:00:00.000Z",
  "to": "2024-01-31T00:00:00.000Z",
  "periodStart": "2024-01-01",
  "periodEnd": "2024-01-31",
  "status": "incomplete",
  "outputVat": "140.0000",
  "inputVat": "70.0000",
  "netVat": "70.0000",
  "totalSales": "1000.0000",
  "totalPurchases": "500.0000",
  "mismatches": [],
  "exceptions": [
    {
      "id": "cm0example1",
      "type": "invoice",
      "documentNumber": "INV-0007",
      "reason": "Foreign currency"
    }
  ],
  "etaMismatches": [
    {
      "id": "cm0example2",
      "type": "invoice",
      "documentNumber": "INV-0009",
      "headerTax": "139.9900",
      "lineTax": "140.0000"
    }
  ]
}
```
