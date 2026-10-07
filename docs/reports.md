# Reports

## VAT Return Draft

The API provides a read-only endpoint to generate a VAT return draft computed from posted ledger invoices and bills.

**Endpoint:** `GET /api/v1/reports/vat-return-draft`

**Query Parameters:**

- `from`: Start date (ISO format, e.g., `2024-01-01`). Inclusive.
- `to`: End date (ISO format, e.g., `2024-01-31`). Inclusive.

**Limits & Constraints:**

- **Period Limit**: The date range cannot exceed 12 months.
- **Timezone**: The dates are interpreted as Africa/Cairo calendar days.
- **Authorization**: The endpoint is org-scoped. It extracts the organization from the user's session token and will not return cross-org data.
- **Data Source**: It only includes posted, non-deleted documents. Reversed documents are netted through their linked reversals.
- **Exceptions**: Any invoice or bill missing a tax amount or using a currency different from the base currency is not silently defaulted. Instead, it is placed in the `exceptions` array and the draft status is marked as `"incomplete"`.
- **Disclaimer**: This is a draft summary for reference and is "not for filing".

### Example usage

```bash
# Generate a VAT return draft for January 2024
curl -X GET "http://localhost:6001/api/v1/reports/vat-return-draft?from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer <your_token>"
```

**Example Response:**

```json
{
  "period": {
    "from": "2024-01-01",
    "to": "2024-01-31"
  },
  "outputTax": "140.0000",
  "inputTax": "50.0000",
  "netVatPayable": "90.0000",
  "status": "draft – not for filing",
  "exceptions": []
}
```
