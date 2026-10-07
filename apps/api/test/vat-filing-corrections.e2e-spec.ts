/**
 * Acceptance tests for Issue #120:
 * Measure reduction in filing corrections after using the VAT return draft.
 */
import { INestApplication } from '@nestjs/common';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { PrismaService } from '../src/prisma/prisma.service';

describe('VAT return draft - filing corrections metric (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    anon = ApiHelper.anonymous(app);
    tenantA = await registerTenant(app, 'VatMetricA');
    tenantB = await registerTenant(app, 'VatMetricB');
    a = tenantA.api;
    b = tenantB.api;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('@issue-120 AC1: baseline reporting with no data', () => {
    it('@issue-120 AC1: reports "no data" when no real filings exist without inventing a baseline', async () => {
      const res = await a.get('/reports/vat-filing-corrections-metric');
      expect(res.status).toBe(200);
      expect(res.body.hasData).toBe(false);
      expect(res.body.status).toBe('no data');
      expect(res.body.filedPeriodsCount).toBe(0);
      expect(res.body.withDraft.filedPeriods).toBe(0);
      expect(res.body.withoutDraft.filedPeriods).toBe(0);
      expect(res.body.comparison.reductionRate).toBeNull();
    });
  });

  describe('@issue-120 AC2: minimum event recording without invoice text or PII', () => {
    it('@issue-120 AC2: records draft generated event without logging invoice text, document content, or PII', async () => {
      // Seed account setup for tenant
      await a.post('/accounts/seed-defaults');

      // 1. Generate a complete draft
      const draftRes = await a.get('/reports/vat-return-draft').query({
        from: '2024-01-01',
        to: '2024-01-31',
      });
      expect(draftRes.status).toBe(200);
      expect(draftRes.body.status).toBe('complete');

      // Verify event was recorded in AuditLog for Tenant A
      const draftLogs = await prisma.auditLog.findMany({
        where: {
          organizationId: tenantA.organizationId,
          entityType: 'VAT_RETURN_DRAFT_EVENT',
        },
      });
      expect(draftLogs.length).toBeGreaterThanOrEqual(1);

      const latestLog = draftLogs[draftLogs.length - 1];
      const payload = latestLog.newValues as Record<string, unknown>;

      // Minimum events needed: period, status, timestamps
      expect(payload).toHaveProperty('period');
      expect(payload).toHaveProperty('status', 'complete');

      // CRITICAL: Ensure no invoice text, document text, or PII in logs
      const rawLogString = JSON.stringify(latestLog);
      expect(rawLogString).not.toContain('invoiceNumber');
      expect(rawLogString).not.toContain('customerName');
      expect(rawLogString).not.toContain('email');
      expect(rawLogString).not.toContain('description');
    });
  });

  describe('@issue-120 AC3: seeded scenario produces verifiable metric', () => {
    it('@issue-120 AC3: calculates verifiable reduction in filing corrections comparing draft-assisted vs unassisted periods', async () => {
      // Period 1 (2024-01): Draft generated (complete) -> Filed -> 0 corrections
      // (Draft already generated in AC2 test above)
      const p1 = await a.post('/vat-returns').send({
        period: '2024-01',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });
      expect(p1.status).toBe(201);
      const calc1 = await a.post(`/vat-returns/${p1.body.id}/calculate`);
      expect(calc1.status).toBe(201);
      const sub1 = await a.post(`/vat-returns/${p1.body.id}/submit`);
      expect(sub1.status).toBe(201);
      const file1 = await a.post(`/vat-returns/${p1.body.id}/file`);
      expect(file1.status).toBe(201);

      // Period 2 (2024-02): Draft generated (incomplete exception) -> Filed -> 1 correction
      // Create a customer with EUR currency (foreign currency exception) and an invoice to make draft incomplete
      const cust = await a
        .post('/customers')
        .send({ name: 'Foreign Customer P2', currency: 'EUR' });
      expect(cust.status).toBe(201);
      const invForeign = await a.post('/invoices').send({
        customerId: cust.body.id,
        date: '2024-02-10',
        dueDate: '2024-02-28',
        lines: [{ description: 'Line P2', quantity: '1', rate: '500', taxRate: '14' }],
      });
      expect(invForeign.status).toBe(201);
      await a.patch(`/invoices/${invForeign.body.id}/send`);

      const draft2 = await a.get('/reports/vat-return-draft').query({
        from: '2024-02-01',
        to: '2024-02-28',
      });
      expect(draft2.status).toBe(200);
      expect(draft2.body.status).toBe('incomplete');

      const p2 = await a.post('/vat-returns').send({
        period: '2024-02',
        startDate: '2024-02-01',
        endDate: '2024-02-28',
      });
      expect(p2.status).toBe(201);
      await a.post(`/vat-returns/${p2.body.id}/calculate`);
      await a.post(`/vat-returns/${p2.body.id}/submit`);
      await a.post(`/vat-returns/${p2.body.id}/file`);

      // Record 1 correction for Period 2
      const corr1 = await a.post('/reports/vat-return-draft/corrections').send({
        period: '2024-02',
        reason: 'omitted_invoice_adjustment',
      });
      expect(corr1.status).toBe(201);

      // Period 3 (2024-03): NO draft generated -> Filed -> 2 corrections
      const p3 = await a.post('/vat-returns').send({
        period: '2024-03',
        startDate: '2024-03-01',
        endDate: '2024-03-31',
      });
      expect(p3.status).toBe(201);
      await a.post(`/vat-returns/${p3.body.id}/calculate`);
      await a.post(`/vat-returns/${p3.body.id}/submit`);
      await a.post(`/vat-returns/${p3.body.id}/file`);

      // Record 2 corrections for Period 3
      const corr2a = await a.post('/reports/vat-return-draft/corrections').send({
        period: '2024-03',
        reason: 'rate_correction',
      });
      expect(corr2a.status).toBe(201);
      const corr2b = await a.post('/reports/vat-return-draft/corrections').send({
        period: '2024-03',
        reason: 'classification_amendment',
      });
      expect(corr2b.status).toBe(201);

      // Verify the metric output
      const metricRes = await a.get('/reports/vat-filing-corrections-metric');
      expect(metricRes.status).toBe(200);
      expect(metricRes.body.hasData).toBe(true);
      expect(metricRes.body.status).toBe('active');
      expect(metricRes.body.filedPeriodsCount).toBe(3);

      // With draft: 2 periods (2024-01 and 2024-02), 1 correction total
      expect(metricRes.body.withDraft.filedPeriods).toBe(2);
      expect(metricRes.body.withDraft.correctionsCount).toBe(1);
      expect(metricRes.body.withDraft.correctionRate).toBe('0.5000');
      expect(metricRes.body.withDraft.completeDraftCount).toBe(1);
      expect(metricRes.body.withDraft.incompleteDraftCount).toBe(1);

      // Without draft: 1 period (2024-03), 2 corrections total
      expect(metricRes.body.withoutDraft.filedPeriods).toBe(1);
      expect(metricRes.body.withoutDraft.correctionsCount).toBe(2);
      expect(metricRes.body.withoutDraft.correctionRate).toBe('2.0000');

      // Comparison: reduction = 2.0000 - 0.5000 = 1.5000; percentage = 75.00%
      expect(metricRes.body.comparison.reductionRate).toBe('1.5000');
      expect(metricRes.body.comparison.reductionPercentage).toBe('75.00%');
    });
  });

  describe('@issue-120 AC4: tenant isolation and authorization', () => {
    it('@issue-120 AC4: tenant B cannot view tenant A figures and anonymous caller is rejected', async () => {
      // Tenant B has no filed returns -> sees 'no data'
      const resB = await b.get('/reports/vat-filing-corrections-metric');
      expect(resB.status).toBe(200);
      expect(resB.body.hasData).toBe(false);
      expect(resB.body.status).toBe('no data');
      expect(resB.body.filedPeriodsCount).toBe(0);

      // Anonymous callers rejected
      const resAnon = await anon.get('/reports/vat-filing-corrections-metric');
      expect(resAnon.status).toBe(401);
    });
  });
});
