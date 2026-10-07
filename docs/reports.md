# Reports & Compliance Metrics

## VAT Return Draft

The API provides a read-only endpoint to generate a VAT return draft computed from posted ledger invoices and bills.

**Endpoint:** `GET /api/v1/reports/vat-return-draft`

**Query Parameters:**

- `from`: Start date (ISO format, e.g. `2024-01-01`). Inclusive.
- `to`: End date (ISO format, e.g. `2024-01-31`). Inclusive.

**Limits & Constraints:**

- **Authorization**: Scoped strictly to the authenticated organization (`orgId`). Cross-org access is prohibited.
- **Data Source**: Includes posted, non-voided invoices and bills within the date range.
- **Exceptions**: Any invoice or bill missing tax amount or using a foreign currency is not silently defaulted; it is flagged in `exceptions` and the status is marked as `"incomplete"`.
- **Instrumentation**: Automatically logs a minimum `VAT_RETURN_DRAFT_EVENT` in `AuditLog` containing only `{ period, from, to, status, exceptionCount }` with zero invoice text, zero document contents, and zero PII.

---

## VAT Return Draft: Measure Reduction in Filing Corrections (Issue #120 / REQ-8)

### Metric Definition

The metric measures the **reduction in VAT return amendments and corrections per filed period** after accountants use the VAT return draft prior to filing.

Let $P$ be the set of all filed VAT return periods for an organization. We partition $P$ into two disjoint cohorts:

1. **Draft-Assisted Cohort ($P_{\text{draft}}$)**:
   Filed periods where at least one VAT return draft was generated prior to the initial filing of that period ($t_{\text{draft}} \le t_{\text{filed}}$).
   - Further tracked by draft completion: `complete` vs `incomplete` (with exceptions).
2. **Unassisted Cohort ($P_{\text{no\_draft}}$)**:
   Filed periods where no draft was generated prior to the initial filing of that period.

For each period $p \in P$, let $C(p)$ be the count of corrections/amendments recorded for that period after its initial filing.

#### Formulas:

- **Draft-Assisted Correction Rate**:
  $$\text{Rate}_{\text{draft}} = \frac{\sum_{p \in P_{\text{draft}}} C(p)}{|P_{\text{draft}}|}$$
  _(reports null / "no data" if $|P_{\text{draft}}| = 0$)_

- **Unassisted Correction Rate**:
  $$\text{Rate}_{\text{no\_draft}} = \frac{\sum_{p \in P_{\text{no\_draft}}} C(p)}{|P_{\text{no\_draft}}|}$$
  _(reports null / "no data" if $|P_{\text{no\_draft}}| = 0$)_

- **Absolute Reduction in Filing Corrections**:
  $$\Delta = \text{Rate}_{\text{no\_draft}} - \text{Rate}_{\text{draft}}$$

- **Relative Percentage Reduction**:
  $$\text{Reduction \%} = \frac{\text{Rate}_{\text{no\_draft}} - \text{Rate}_{\text{draft}}}{\text{Rate}_{\text{no\_draft}}} \times 100\%$$
  _(defined when $\text{Rate}_{\text{no\_draft}} > 0$)_

#### Baseline Principle

**Do not invent a baseline.** When an organization has zero filed VAT return periods ($|P| = 0$), the metric returns `status: "no data"` with `hasData: false` and `filedPeriodsCount: 0`.

---

### Data Source & Event Instrumentation

All events are stored locally in the tenant's PostgreSQL database under `audit_logs` (or `vat_returns`). No external analytics services or third-party trackers are used.

1. **Draft Generation Event (`VAT_RETURN_DRAFT_EVENT`)**:
   - Stored in `audit_logs`.
   - Fields:
     - `organizationId`: current authorized organization
     - `userId`: authenticated actor
     - `entityType`: `'VAT_RETURN_DRAFT_EVENT'`
     - `newValues`:
       ```json
       {
         "period": "2024-01",
         "from": "2024-01-01T00:00:00.000Z",
         "to": "2024-01-31T00:00:00.000Z",
         "status": "complete",
         "exceptionCount": 0
       }
       ```
   - **Privacy Guarantee**: Does NOT log invoice numbers, document text, customer/vendor names, line items, or any PII.

2. **VAT Return Filing (`vat_returns`)**:
   - Stored in `vat_returns` with `status = 'FILED'`, `period`, `startDate`, `endDate`, and `filedAt`.

3. **Correction / Amendment Event (`VAT_RETURN_CORRECTION_EVENT`)**:
   - Recorded via `POST /api/v1/reports/vat-return-draft/corrections` (or tax return amendment).
   - Fields:
     - `organizationId`: current authorized organization
     - `userId`: authenticated actor
     - `entityType`: `'VAT_RETURN_CORRECTION_EVENT'`
     - `newValues`:
       ```json
       {
         "period": "2024-02",
         "reason": "omitted_invoice_adjustment"
       }
       ```

---

### Internal/Admin View & API Surface

#### 1. Metric Endpoint

`GET /api/v1/reports/vat-filing-corrections-metric`

- **Permissions**: `reports.view`
- **Output (Active)**:
  ```json
  {
    "status": "active",
    "hasData": true,
    "message": "VAT filing corrections metric calculated successfully",
    "filedPeriodsCount": 3,
    "withDraft": {
      "filedPeriods": 2,
      "correctionsCount": 1,
      "correctionRate": "0.5000",
      "completeDraftCount": 1,
      "incompleteDraftCount": 1
    },
    "withoutDraft": {
      "filedPeriods": 1,
      "correctionsCount": 2,
      "correctionRate": "2.0000"
    },
    "comparison": {
      "reductionRate": "1.5000",
      "reductionPercentage": "75.00%"
    }
  }
  ```
- **Output (No Filings - Baseline)**:
  ```json
  {
    "status": "no data",
    "hasData": false,
    "message": "No filed VAT return periods found for organization",
    "filedPeriodsCount": 0,
    "withDraft": {
      "filedPeriods": 0,
      "correctionsCount": 0,
      "correctionRate": null,
      "completeDraftCount": 0,
      "incompleteDraftCount": 0
    },
    "withoutDraft": {
      "filedPeriods": 0,
      "correctionsCount": 0,
      "correctionRate": null
    },
    "comparison": {
      "reductionRate": null,
      "reductionPercentage": null
    }
  }
  ```

#### 2. Record Filing Correction Endpoint

`POST /api/v1/reports/vat-return-draft/corrections`

- **Body**:
  ```json
  {
    "period": "2024-02",
    "reason": "omitted_invoice_adjustment"
  }
  ```

---

### Documented SQL Query (Internal Database Administration)

Administrators can directly execute this query in PostgreSQL to compute the metric without touching an external service:

```sql
WITH filed_periods AS (
  SELECT
    vr.id AS return_id,
    vr.organization_id,
    vr.period,
    COALESCE(vr.filed_at, vr.updated_at) AS filed_time
  FROM vat_returns vr
  WHERE vr.organization_id = :organizationId
    AND vr.status = 'FILED'
    AND vr.deleted_at IS NULL
),
draft_flags AS (
  SELECT
    fp.period,
    BOOL_OR(al.id IS NOT NULL) AS had_draft_before_filing,
    COUNT(DISTINCT al.id) AS draft_count
  FROM filed_periods fp
  LEFT JOIN audit_logs al
    ON al.organization_id = fp.organization_id
   AND al.entity_type = 'VAT_RETURN_DRAFT_EVENT'
   AND (
     al.new_values->>'period' = fp.period
     OR fp.period LIKE (SUBSTRING(al.new_values->>'from', 1, 7) || '%')
   )
   AND al.created_at <= fp.filed_time
  GROUP BY fp.period
),
period_corrections AS (
  SELECT
    fp.period,
    COUNT(al.id) AS correction_count
  FROM filed_periods fp
  LEFT JOIN audit_logs al
    ON al.organization_id = fp.organization_id
   AND al.entity_type = 'VAT_RETURN_CORRECTION_EVENT'
   AND al.new_values->>'period' = fp.period
  GROUP BY fp.period
),
period_summary AS (
  SELECT
    df.period,
    df.had_draft_before_filing,
    COALESCE(pc.correction_count, 0) AS corrections
  FROM draft_flags df
  JOIN period_corrections pc ON pc.period = df.period
)
SELECT
  -- Cohort 1: Draft-assisted
  COUNT(*) FILTER (WHERE had_draft_before_filing) AS with_draft_filed_periods,
  COALESCE(SUM(corrections) FILTER (WHERE had_draft_before_filing), 0) AS with_draft_corrections,
  ROUND(
    COALESCE(SUM(corrections) FILTER (WHERE had_draft_before_filing), 0)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE had_draft_before_filing), 0),
    4
  ) AS with_draft_correction_rate,

  -- Cohort 2: Unassisted
  COUNT(*) FILTER (WHERE NOT had_draft_before_filing) AS without_draft_filed_periods,
  COALESCE(SUM(corrections) FILTER (WHERE NOT had_draft_before_filing), 0) AS without_draft_corrections,
  ROUND(
    COALESCE(SUM(corrections) FILTER (WHERE NOT had_draft_before_filing), 0)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE NOT had_draft_before_filing), 0),
    4
  ) AS without_draft_correction_rate
FROM period_summary;
```
