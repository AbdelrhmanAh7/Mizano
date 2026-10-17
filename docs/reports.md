# Reports

## VAT Return Draft

`GET /api/reports/vat-return-draft?from=YYYY-MM-DD&to=YYYY-MM-DD` returns a read-only VAT summary computed from the posted VAT ledger lines. It requires `reports.view`; the organization always comes from the session token.

- **Draft only**: every response carries `"label": "DRAFT, not for filing"`. Nothing is filed or submitted.
- **Range**: both dates are inclusive UTC calendar days (a date-only `to` covers the whole day; a timestamp counts as the day it falls in). `from` must be on or before `to`, and the period may span at most 366 days; anything else returns `400`. There is no Africa/Cairo calendar-day handling yet.
- **Totals**: `outputTax`, `inputTax` and `netPayable` (output minus input; negative means refundable) are decimal strings with 4 places, taken from the posted VAT Payable and VAT Receivable journal lines of the period through the same calculation as `GET /api/vat-returns/summary` and a VAT return. Expenses, credit notes, vendor credits, reversals and manual VAT journals therefore count, and settlement/payment journals and opening balances do not. The organization's VAT accounts must be configured; otherwise the endpoint returns `400` with the setting to fix.
- **`currency`**: the organization's base currency, the currency of every amount in the draft.
- **Documents checked**: invoices (`SENT`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`) and bills (`OPEN`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`) dated in the range and not soft-deleted. `DRAFT`, `PENDING` and `VOID` documents are ignored. They are read in pages of 500 ordered by id, so memory stays flat for long histories.
- **`exceptions`**: a checked document that cannot be compared with its lines: a currency other than `baseCurrency` ("Foreign currency"), no tax amount ("Missing tax amount"), a negative tax amount, or a line tax rate outside 0 to 100 ("Invalid tax rate"). A document with no `currencyCode` counts as base currency, as in the posting guards. Exceptions are for review; they do not change the ledger totals.
- **`etaMismatches`**: a document whose header tax differs from the sum of its line taxes (net line amount × line rate, rounded to 2 places per line). The Egyptian Tax Authority (ETA) recomputes the tax from the lines and rejects such an e-invoice, so the draft flags it before filing. The ledger total still holds what was posted. This check is internal to the ledger: no ETA portal data is read yet (#119).
- **`status`**: `"incomplete"` when `exceptions` or `etaMismatches` is not empty, otherwise `"complete"`.

```bash
TOKEN=$(curl -s -X POST http://localhost:6001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@mizano.com","password":"password123"}' | jq -r .tokens.accessToken)

curl -s "http://localhost:6001/api/reports/vat-return-draft?from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer $TOKEN"
```

The login uses the seeded demo admin (`pnpm db:seed`). Example response:

```json
{
  "label": "DRAFT, not for filing",
  "currency": "EGP",
  "from": "2024-01-01T00:00:00.000Z",
  "to": "2024-01-31T00:00:00.000Z",
  "status": "incomplete",
  "outputTax": "140.0000",
  "inputTax": "70.0000",
  "netPayable": "70.0000",
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
