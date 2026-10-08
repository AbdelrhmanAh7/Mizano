# Reports

## VAT Return Draft

`GET /api/reports/vat-return-draft?from=YYYY-MM-DD&to=YYYY-MM-DD` returns a read-only VAT summary computed from posted invoices (output tax) and bills (input tax). It requires `reports.view`; the organization always comes from the session token.

- **Draft only**: every response carries `"label": "DRAFT, not for filing"`. Nothing is filed or submitted.
- **Range**: both dates are inclusive ISO dates and `from` must be on or before `to`; anything else returns `400`. There is no maximum period length yet. Dates are parsed as UTC instants; there is no Africa/Cairo calendar-day handling yet.
- **Documents**: invoices and bills dated in the range, not soft-deleted, with a status other than `DRAFT` or `VOID`. Voided documents are excluded outright; credit notes and vendor credits are not netted yet.
- **Totals**: `outputTax`, `inputTax` and `netPayable` (output minus input) are decimal strings with 4 places, summed from each document's stored header tax.
- **`exceptions`**: a document in a currency other than the organization's `baseCurrency`, or without a tax amount, is listed here and left out of the totals; it is never converted or defaulted. A document with no `currencyCode` counts as base currency, as in the posting guards.
- **`etaMismatches`**: a document whose header tax differs from the sum of its line taxes (net line amount × line rate, rounded to 2 places per line). The Egyptian Tax Authority (ETA) recomputes the tax from the lines and rejects such an e-invoice, so the draft flags it before filing. The document stays in the totals at its header tax. This check is internal to the ledger: no ETA portal data is read yet (#119).
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
