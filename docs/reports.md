# Reports

## VAT Return Draft

The API provides a read-only endpoint to generate a VAT return draft computed from posted ledger invoices and bills.

**Endpoint:** `GET /api/v1/reports/vat-return-draft`

**Query Parameters:**

- `from`: Start date (ISO format, e.g., `2024-01-01`). Inclusive.
- `to`: End date (ISO format, e.g., `2024-01-31`). Inclusive.

**Limits & Constraints:**

- **Label**: Every response carries `"label": "DRAFT, not for filing"`. It is a summary for review, never a tax filing.
- **Range**: `from` and `to` must be ISO dates and `from` must be on or before `to`; otherwise the API returns `400`. A single day (`from` = `to`) is valid. There is no maximum period length yet.
- **Timezone**: Dates are parsed as UTC instants (`new Date(value)`); there is no Africa/Cairo calendar-day handling yet.
- **Authorization**: Requires `reports.view`. The endpoint is org-scoped: the organization comes from the user's session token and no other organization's documents are read.
- **Data Source**: Invoices and bills dated inside the range, not soft-deleted, with a status other than `DRAFT` or `VOID`. Voided documents are excluded outright; credit notes and vendor credits are not netted yet.
- **Currency**: Documents are compared with the organization's `baseCurrency`. A document with no `currencyCode` counts as base currency, as in the posting guards. A different code is never converted or added one-for-one.
- **Exceptions**: A document in another currency, or without a tax amount, is not silently defaulted. It is listed in `exceptions` and the draft `status` is `"incomplete"`.

### Example usage

```bash
# Generate a VAT return draft for January 2024
curl -X GET "http://localhost:6001/api/v1/reports/vat-return-draft?from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer <your_token>"
```

**Example Response:**

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
      "id": "cm0example",
      "type": "invoice",
      "documentNumber": "INV-0007",
      "reason": "Foreign currency"
    }
  ]
}
```
