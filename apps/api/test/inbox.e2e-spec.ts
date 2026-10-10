/**
 * Accountant inbox (issue #21): real HTTP API, real login, real PostgreSQL and Redis/BullMQ.
 * Only the extraction strategy is stubbed (like intake.e2e-spec.ts): two complete documents and
 * one with a missing date are ingested, then bulk-approved.
 *
 * Field validation (issue #18) runs on every extraction, so a document whose currency differs
 * from the organization base currency lands in NEEDS_REVIEW. The inbox keeps its own currency
 * check for EXTRACTED jobs (for example after the base currency changed), covered below.
 */
import { INestApplication } from '@nestjs/common';
import { IntakeJobStatus } from '@prisma/client';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { eventually } from './helpers/journey.helper';
import { ApiHelper } from './helpers/api-client.helper';
import { ExtractionStrategyResolver } from '../src/modules/ai/extraction/extraction-strategy-resolver.service';
import { INTAKE_DRAFT_ENTITY } from '../src/modules/ai/intake/intake-jobs.service';
import { PrismaService } from '../src/prisma/prisma.service';

const stub = {
  vendorName: 'Inbox Vendor',
  invoiceNumber: 'X-1',
  date: '2026-09-01' as string | null,
  currency: 'EGP',
};

const stubResolver = {
  resolve: async () => ({
    strategyUsed: 'ocr',
    totalTimeMs: 1,
    extraction: {
      vendorName: stub.vendorName,
      vendorAddress: null,
      vendorPhone: null,
      vendorEmail: null,
      vendorTaxId: null,
      invoiceNumber: stub.invoiceNumber,
      date: stub.date,
      dueDate: null,
      total: 115,
      subtotal: 100,
      tax: 15,
      discount: null,
      currency: stub.currency,
      paymentTerms: null,
      notes: null,
      lineItems: [{ description: 'CPU', quantity: 1, unitPrice: 100, taxAmount: 15, total: 115 }],
      rawText: 'stubbed text',
      ocrConfidence: 0.95,
      fieldConfidence: {},
      documentCategory: 'INVOICE',
      accountingEntry: null,
      processingTimeMs: 1,
    },
  }),
};

function pdfFixture(marker: string): Buffer {
  const text = `Invoice ${marker} Total 115.00`;
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length ${text.length + 30}>>stream\nBT /F1 12 Tf 20 100 Td (${text}) Tj ET\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}

describe('Accountant inbox (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;
  const ids: Record<'ready1' | 'ready2' | 'review' | 'foreign', string> = {
    ready1: '',
    ready2: '',
    review: '',
    foreign: '',
  };

  async function ingest(
    api: ApiHelper,
    tenant: TestTenant,
    invoiceNumber: string,
    date: string | null,
    status: IntakeJobStatus,
    currency = 'EGP',
  ): Promise<string> {
    stub.invoiceNumber = invoiceNumber;
    stub.date = date;
    stub.currency = currency;
    const res = await api
      .post('/ai/document-intake/process')
      .attach('file', pdfFixture(`${invoiceNumber}-${uniqueSuffix()}`), {
        filename: `${invoiceNumber}.pdf`,
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
    const jobId = res.body.data.jobId as string;
    await eventually(async () => {
      const job = await prisma.intakeJob.findFirst({
        where: { id: jobId, organizationId: tenant.organizationId },
      });
      expect(job?.status).toBe(status);
    }, 20000);
    return jobId;
  }

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(ExtractionStrategyResolver).useValue(stubResolver),
    );
    prisma = getPrisma(app);
    tenantA = await registerTenant(app, 'InboxA');
    tenantB = await registerTenant(app, 'InboxB');
    a = tenantA.api;
    b = tenantB.api;
    anon = ApiHelper.anonymous(app);
    stub.vendorName = `Inbox Vendor ${uniqueSuffix()}`;
    const vendor = await a.post('/vendors').send({ name: stub.vendorName });
    expect(vendor.status).toBe(201);
    // Registration defaults the base currency to USD. The complete USD document is extracted
    // while the base is still USD (under an EGP base field validation sends it to review);
    // the base then becomes EGP, so it is an EXTRACTED job in a foreign currency: it stays in
    // the inbox as an exception and is never bulk-approvable (base-only ledger).
    ids.foreign = await ingest(a, tenantA, 'IN-4', '2026-09-03', IntakeJobStatus.EXTRACTED, 'USD');
    await prisma.organization.update({
      where: { id: tenantA.organizationId },
      data: { baseCurrency: 'EGP' },
    });
    ids.ready1 = await ingest(a, tenantA, 'IN-1', '2026-09-01', IntakeJobStatus.EXTRACTED);
    ids.ready2 = await ingest(a, tenantA, 'IN-2', '2026-09-02', IntakeJobStatus.EXTRACTED);
    ids.review = await ingest(a, tenantA, 'IN-3', null, IntakeJobStatus.NEEDS_REVIEW);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists with status, source and search filters and flags ready rows', async () => {
    const ready = await a.get('/ai/document-intake/jobs?status=EXTRACTED');
    expect(ready.status).toBe(200);
    expect(ready.body.meta.total).toBe(3);
    const summaries = new Map<string, Record<string, unknown>>(
      ready.body.data.map((j: { id: string; summary: Record<string, unknown> }) => [
        j.id,
        j.summary,
      ]),
    );
    expect(summaries.get(ids.ready1)).toMatchObject({
      total: '115.0000',
      currency: 'EGP',
      readyToApprove: true,
      blocker: null,
    });
    expect(summaries.get(ids.foreign)).toMatchObject({
      currency: 'USD',
      readyToApprove: false,
      blocker: 'CURRENCY_MISMATCH',
    });
    expect(ready.body.data[0]).not.toHaveProperty('result');

    const multi = await a.get('/ai/document-intake/jobs?status=EXTRACTED,NEEDS_REVIEW');
    expect(multi.body.meta.total).toBe(4);
    const unfiltered = await a.get('/ai/document-intake/jobs?status=');
    expect(unfiltered.body.meta.total).toBe(4);
    const bySearch = await a.get('/ai/document-intake/jobs?search=in-2');
    expect(bySearch.body.data.map((j: { id: string }) => j.id)).toEqual([ids.ready2]);
    // LIKE wildcards in the search are literal characters, not patterns.
    const wildcard = await a.get('/ai/document-intake/jobs?search=%25');
    expect(wildcard.body.meta.total).toBe(0);
    const underscore = await a.get('/ai/document-intake/jobs?search=IN_');
    expect(underscore.body.meta.total).toBe(0);
    const telegram = await a.get('/ai/document-intake/jobs?source=TELEGRAM');
    expect(telegram.body.meta.total).toBe(0);
    const future = await a.get('/ai/document-intake/jobs?from=2999-01-01');
    expect(future.body.meta.total).toBe(0);
    const bad = await a.get('/ai/document-intake/jobs?status=BOGUS');
    expect(bad.status).toBe(400);
  });

  it("tenant B cannot see or approve tenant A's jobs", async () => {
    expect((await b.get('/ai/document-intake/jobs')).body.meta.total).toBe(0);
    const res = await b.post('/ai/document-intake/jobs/bulk-approve').send({
      jobIds: [ids.ready1, ids.ready2],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ processed: 0, total: 2 });
    expect(res.body.failures).toHaveLength(2);
    expect(await prisma.bill.count({ where: { organizationId: tenantA.organizationId } })).toBe(0);
    const still = await prisma.intakeJob.findMany({
      where: { id: { in: [ids.ready1, ids.ready2] } },
    });
    expect(still.every((j) => j.status === IntakeJobStatus.EXTRACTED)).toBe(true);
  });

  it('requires authentication', async () => {
    const res = await anon.post('/ai/document-intake/jobs/bulk-approve').send({ jobIds: ['x'] });
    expect(res.status).toBe(401);
  });

  it('bulk approves two ready jobs, rejects the needs-review one, and is idempotent', async () => {
    const res = await a.post('/ai/document-intake/jobs/bulk-approve').send({
      jobIds: [ids.ready1, ids.ready2, ids.review, ids.foreign],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ processed: 2, total: 4 });
    expect(res.body.failures).toEqual([
      { id: ids.review, reason: expect.any(String) },
      { id: ids.foreign, reason: expect.stringContaining('currency'), code: 'CURRENCY_MISMATCH' },
    ]);

    const bills = await prisma.bill.findMany({ where: { organizationId: tenantA.organizationId } });
    expect(bills).toHaveLength(2);
    expect(bills.every((bill) => bill.currencyCode === 'EGP')).toBe(true);
    expect(bills.every((bill) => bill.grandTotal.toFixed(4) === '115.0000')).toBe(true);
    const jobs = await prisma.intakeJob.findMany({ where: { id: { in: Object.values(ids) } } });
    const byId = new Map(jobs.map((j) => [j.id, j]));
    expect(byId.get(ids.ready1)).toMatchObject({ status: IntakeJobStatus.APPROVED });
    expect(byId.get(ids.ready2)?.draftDocumentId).toBeTruthy();
    expect(byId.get(ids.review)?.status).toBe(IntakeJobStatus.NEEDS_REVIEW);
    expect(byId.get(ids.foreign)?.status).toBe(IntakeJobStatus.EXTRACTED);

    // Bulk approval reuses the transactional single-confirm command: every approved job has
    // exactly one org-scoped INTAKE_DRAFT marker for the draft it is linked to, and the
    // rejected jobs have none.
    const markers = await prisma.auditLog.findMany({
      where: { organizationId: tenantA.organizationId, entityType: INTAKE_DRAFT_ENTITY },
    });
    expect(markers.map((m) => m.entityId).sort()).toEqual([ids.ready1, ids.ready2].sort());
    for (const marker of markers) {
      expect(marker.newValues).toEqual({
        draftType: 'bill',
        draftId: byId.get(marker.entityId)?.draftDocumentId,
      });
      expect(marker.userId).toBe(tenantA.userId);
    }

    const again = await a.post('/ai/document-intake/jobs/bulk-approve').send({
      jobIds: [ids.ready1, ids.ready2],
    });
    expect(again.body).toMatchObject({ processed: 0, total: 2 });
    expect(await prisma.bill.count({ where: { organizationId: tenantA.organizationId } })).toBe(2);

    const approved = await a.get('/ai/document-intake/jobs?status=APPROVED');
    expect(approved.body.meta.total).toBe(2);
  });

  it('sends a document in another currency to review instead of the ready tab', async () => {
    const jobId = await ingest(
      a,
      tenantA,
      'IN-5',
      '2026-09-04',
      IntakeJobStatus.NEEDS_REVIEW,
      'USD',
    );
    const review = await a.get('/ai/document-intake/jobs?status=NEEDS_REVIEW');
    const row = review.body.data.find((j: { id: string }) => j.id === jobId);
    expect(row.summary).toMatchObject({ currency: 'USD', readyToApprove: false });
    const res = await a.post('/ai/document-intake/jobs/bulk-approve').send({ jobIds: [jobId] });
    expect(res.body).toMatchObject({ processed: 0, total: 1 });
    expect(res.body.failures).toEqual([{ id: jobId, reason: expect.any(String) }]);
  });
});
