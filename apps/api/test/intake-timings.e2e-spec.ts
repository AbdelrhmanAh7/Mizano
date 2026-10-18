/**
 * Per-stage extraction timings on intake jobs (issue #126): real HTTP API, real login, real
 * PostgreSQL. Only the extraction strategy and the worker clock are stubbed.
 */
import { INestApplication } from '@nestjs/common';
import { IntakeJobStatus } from '@prisma/client';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { eventually } from './helpers/journey.helper';
import { ExtractionStrategyResolver } from '../src/modules/ai/extraction/extraction-strategy-resolver.service';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.INTAKE_RETRY_BASE_MS = '50';
process.env.INTAKE_LEASE_MS = '1000';

const SECRET = 'TIMING-SECRET-VENDOR';
const stub = { mode: 'ok' as 'ok' | 'fail', clock: 'real' as 'real' | 'throw' };

const stubResolver = {
  resolve: async () => {
    if (stub.mode === 'fail') throw new Error(`stub extraction failure ${SECRET}`);
    return {
      strategyUsed: 'ocr',
      totalTimeMs: 1,
      extraction: {
        vendorName: SECRET,
        vendorAddress: null,
        vendorPhone: null,
        vendorEmail: null,
        vendorTaxId: null,
        invoiceNumber: 'T-1',
        date: '2026-09-01',
        dueDate: null,
        total: 115,
        subtotal: 100,
        tax: 15,
        discount: null,
        currency: 'EGP',
        paymentTerms: null,
        notes: null,
        lineItems: [],
        rawText: `${SECRET} text`,
        ocrConfidence: 0.95,
        fieldConfidence: {},
        documentCategory: 'INVOICE',
        accountingEntry: null,
        processingTimeMs: 1,
      },
    };
  },
};

/** The worker clock (token `INTAKE_CLOCK`); `throw` simulates a broken timer. */
function stubClock(): number {
  if (stub.clock === 'throw') throw new Error('clock unavailable');
  return performance.now();
}

function pdfFixture(marker: string): Buffer {
  const text = `Invoice ${marker} Total 115.00`;
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length ${text.length + 30}>>stream\nBT /F1 12 Tf 20 100 Td (${text}) Tj ET\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}

const STAGES = ['load', 'extract', 'parse', 'validate'];

function expectMillis(timings: Record<string, unknown>, stages: string[]): void {
  expect(Object.keys(timings).sort()).toEqual([...stages].sort());
  for (const stage of stages) {
    const ms = timings[stage];
    expect(Number.isInteger(ms)).toBe(true);
    expect(ms as number).toBeGreaterThanOrEqual(0);
  }
}

describe('@e2e @flow:intake-timings @issue-126 intake stage timings', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: TestTenant;

  async function uploadAndWait(marker: string, status: IntakeJobStatus) {
    const res = await tenant.api
      .post('/ai/document-intake/process')
      .attach('file', pdfFixture(`${marker}-${uniqueSuffix()}`), {
        filename: 'inv.pdf',
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
    const view = await tenant.api.get(`/ai/document-intake/${jobId}/result`);
    expect(view.status).toBe(200);
    return { jobId, view: view.body.data };
  }

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(ExtractionStrategyResolver)
        .useValue(stubResolver)
        .overrideProvider('INTAKE_CLOCK')
        .useValue(stubClock),
    );
    prisma = getPrisma(app);
    tenant = await registerTenant(app, 'Timings');
  });

  afterEach(() => {
    stub.mode = 'ok';
    stub.clock = 'real';
  });

  afterAll(async () => {
    await app.close();
  });

  it('@issue-126 AC1: a completed job exposes a non-negative integer ms for every stage that ran', async () => {
    const { jobId, view } = await uploadAndWait('OK', IntakeJobStatus.EXTRACTED);
    expect(view.status).toBe('EXTRACTED');
    expectMillis(view.stageTimingsMs, STAGES);

    // The list read model carries the same timings for the benchmark script.
    const list = await tenant.api.get('/ai/document-intake/jobs');
    const row = list.body.data.find((j: { id: string }) => j.id === jobId);
    expect(row.stageTimingsMs).toEqual(view.stageTimingsMs);
  });

  it('@issue-126 AC2: a failed job keeps the timings of the stages that ran before the failure', async () => {
    stub.mode = 'fail';
    const { view } = await uploadAndWait('FAIL', IntakeJobStatus.DEAD_LETTER);
    expectMillis(view.stageTimingsMs, ['load', 'extract']);
  });

  it('@issue-126 AC3: a timer failure never fails the job', async () => {
    stub.clock = 'throw';
    const { view } = await uploadAndWait('CLOCK', IntakeJobStatus.EXTRACTED);
    expect(view.status).toBe('EXTRACTED');
    expect(view.stageTimingsMs).toEqual({});
  });

  it('@issue-126 timings carry stage names and numbers only, never document content', async () => {
    const { view } = await uploadAndWait('PII', IntakeJobStatus.EXTRACTED);
    expect(view.result.extractedFields.vendorName).toBe(SECRET);
    expect(JSON.stringify(view.stageTimingsMs)).not.toContain(SECRET);
    expectMillis(view.stageTimingsMs, STAGES);
  });
});
