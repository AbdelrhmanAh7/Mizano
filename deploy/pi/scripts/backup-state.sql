-- This query runs in the pg_dump exported snapshot, and again in the isolated restore.
WITH tenant_rows AS (
  SELECT "organizationId" AS org, 'accounts' AS kind, count(*) AS n FROM accounts GROUP BY 1
  UNION ALL SELECT "organizationId", 'users', count(*) FROM users GROUP BY 1
  UNION ALL SELECT "organizationId", 'customers', count(*) FROM customers GROUP BY 1
  UNION ALL SELECT "organizationId", 'vendors', count(*) FROM vendors GROUP BY 1
  UNION ALL SELECT "organizationId", 'invoices', count(*) FROM invoices GROUP BY 1
  UNION ALL SELECT "organizationId", 'credit_notes', count(*) FROM credit_notes GROUP BY 1
  UNION ALL SELECT "organizationId", 'bills', count(*) FROM bills GROUP BY 1
  UNION ALL SELECT "organizationId", 'vendor_credits', count(*) FROM vendor_credits GROUP BY 1
  UNION ALL SELECT "organizationId", 'payments_received', count(*) FROM payments_received GROUP BY 1
  UNION ALL SELECT "organizationId", 'payments_made', count(*) FROM payments_made GROUP BY 1
  UNION ALL SELECT "organizationId", 'journals', count(*) FROM journals GROUP BY 1
  UNION ALL SELECT "organizationId", 'intake_jobs', count(*) FROM intake_jobs GROUP BY 1
  UNION ALL SELECT j."organizationId", 'journal_lines', count(*) FROM journal_lines l JOIN journals j ON j.id=l."journalId" GROUP BY 1
), counts AS (
  SELECT o.id, coalesce(jsonb_object_agg(r.kind,r.n) FILTER (WHERE r.kind IS NOT NULL),'{}'::jsonb) AS rows
  FROM organizations o LEFT JOIN tenant_rows r ON r.org=o.id GROUP BY o.id
), linked AS (
  SELECT k.id, k."organizationId", k."draftDocumentType", k."draftDocumentId",
    b.id AS bill_id, b.status::text AS bill_status, i.id AS invoice_id, i.status::text AS invoice_status
  FROM intake_jobs k
  LEFT JOIN bills b ON k."draftDocumentType"='bill' AND b.id=k."draftDocumentId" AND b."organizationId"=k."organizationId"
  LEFT JOIN invoices i ON k."draftDocumentType"='invoice' AND i.id=k."draftDocumentId" AND i."organizationId"=k."organizationId"
  WHERE k."draftDocumentId" IS NOT NULL
)
SELECT jsonb_build_object(
  'counts', coalesce((SELECT jsonb_agg(jsonb_build_object('organizationId',id,'rows',rows) ORDER BY id) FROM counts),'[]'::jsonb),
  'originals', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'organizationId',"organizationId",'key',"storageKey",'sha256',sha256) ORDER BY id) FROM intake_jobs),'[]'::jsonb),
  'checks', jsonb_build_object(
    'unbalancedJournals', (SELECT count(*) FROM (
      SELECT j.id FROM journals j LEFT JOIN journal_lines l ON l."journalId"=j.id
      WHERE j."isPosted" AND j."deletedAt" IS NULL GROUP BY j.id
      HAVING count(l.id)=0 OR coalesce(sum(l.debit),0)<>coalesce(sum(l.credit),0)
    ) bad),
    'unbalancedOrganizations', (SELECT count(*) FROM (
      SELECT j."organizationId" FROM journals j JOIN journal_lines l ON l."journalId"=j.id
      WHERE j."isPosted" AND j."deletedAt" IS NULL GROUP BY 1 HAVING sum(l.debit)<>sum(l.credit)
    ) bad),
    'foreignJournalAccounts', (SELECT count(*) FROM journal_lines l JOIN journals j ON j.id=l."journalId" JOIN accounts a ON a.id=l."accountId" WHERE a."organizationId"<>j."organizationId"),
    'brokenDrafts', (SELECT count(*) FROM linked WHERE bill_id IS NULL AND invoice_id IS NULL),
    'brokenPostedLinks', (SELECT count(*) FROM linked k WHERE
      ((bill_id IS NOT NULL AND bill_status IN ('OPEN','PARTIALLY_PAID','PAID','OVERDUE','VOID')) OR (invoice_id IS NOT NULL AND invoice_status<>'DRAFT'))
      AND NOT EXISTS (SELECT 1 FROM journals j WHERE j."organizationId"=k."organizationId" AND j."sourceId"=k."draftDocumentId" AND j."isPosted"
        AND j."sourceType"=CASE WHEN k.bill_id IS NOT NULL THEN 'BILL_APPROVAL' ELSE 'INVOICE_SEND' END))
  ),
  'linkedDrafts', (SELECT count(*) FROM linked)
);
