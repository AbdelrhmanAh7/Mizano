/**
 * E2E tests for issue #142: heavy OCR/PDF dependencies live in the worker only.
 *
 * Jest runs each test file in its own module registry, so `require.cache` is not a faithful
 * view of what the process loaded. The two heavy packages are therefore replaced with
 * recording mocks: any `require('pdf-parse')` / `require('tesseract.js')` is logged in
 * `loaded`, which is the registry-level equivalent of inspecting `require.cache`.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IntakeJobStatus } from '@prisma/client';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { eventually } from './helpers/journey.helper';
import { IntakeJobsService } from '../src/modules/ai/intake/intake-jobs.service';
import { PrismaService } from '../src/prisma/prisma.service';

const loaded: string[] = [];

jest.mock('pdf-parse', () => {
  loaded.push('pdf-parse');
  return jest.requireActual('pdf-parse');
});
jest.mock(
  'tesseract.js',
  () => {
    loaded.push('tesseract.js');
    return {};
  },
  { virtual: true },
);

process.env.INTAKE_RETRY_BASE_MS = '50';
process.env.INTAKE_LEASE_MS = '1000';

const stubResolver = {
  resolve: async () => ({
    strategyUsed: 'ocr',
    totalTimeMs: 1,
    extraction: {
      vendorName: 'Worker Vendor',
      vendorAddress: null,
      vendorPhone: null,
      vendorEmail: null,
      vendorTaxId: null,
      invoiceNumber: 'W-1',
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

describe('Intake worker isolation (e2e) @issue-142', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: TestTenant;
  let jobId = '';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    tenant = await registerTenant(app, 'IntakeWorkerIsolation');
  });

  afterAll(async () => {
    await app.close();
  });

  it('@e2e @flow:intake @issue-142 AC1: API process has no tesseract.js or pdf-parse loaded, even after an upload', async () => {
    expect(loaded).toEqual([]);

    const res = await tenant.api
      .post('/ai/document-intake/process')
      .attach('file', pdfFixture(`ISOLATION-${uniqueSuffix()}`), {
        filename: 'inv.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
    jobId = res.body.data.jobId;

    expect(loaded).toEqual([]);
  });

  it('@e2e @flow:intake @issue-142 AC2: without a worker the job is only queued, never extracted by the API', async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const job = await prisma.intakeJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe(IntakeJobStatus.QUEUED);
    expect(job.attempts).toBe(0);
  });

  it('@e2e @flow:intake @issue-142 AC2: the worker container picks the job up and extracts it', async () => {
    const { AiWorkerModule } = await import('../src/modules/ai/worker/ai-worker.module');
    const { ExtractionStrategyResolver } =
      await import('../src/modules/ai/extraction/extraction-strategy-resolver.service');
    const worker = await Test.createTestingModule({ imports: [AiWorkerModule] })
      .overrideProvider(ExtractionStrategyResolver)
      .useValue(stubResolver)
      .compile();
    await worker.init();
    try {
      // The worker graph is what loads the PDF stack.
      expect(loaded).toContain('pdf-parse');

      await app.get(IntakeJobsService).recoverJobs();
      const done = await eventually(async () => {
        const job = await prisma.intakeJob.findFirst({
          where: { id: jobId, organizationId: tenant.organizationId },
        });
        expect(job?.status).toBe(IntakeJobStatus.EXTRACTED);
        return job;
      }, 30000);
      expect(done?.attempts).toBe(1);
    } finally {
      await worker.close();
    }
  });
});
