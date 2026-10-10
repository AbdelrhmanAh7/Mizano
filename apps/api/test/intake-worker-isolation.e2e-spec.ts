/**
 * E2E tests for issue #142: heavy OCR/PDF dependencies live in the worker only.
 *
 * Why a recording mock instead of `require.cache`: Jest runs every test file in its own module
 * registry and does not populate Node's `require.cache` for modules it loads, so inspecting
 * `require.cache` would pass vacuously. `jest.mock` factories run exactly when the module
 * registry first loads the package, so each factory records its load in `loaded`; that is the
 * registry-level equivalent of "is this key in require.cache". (tesseract.js is required lazily
 * at OCR time, so its factory fires only if an OCR call actually happens.)
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IntakeJobStatus } from '@prisma/client';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { eventually } from './helpers/journey.helper';
import { IntakeJobsService } from '../src/modules/ai/intake/intake-jobs.service';
import { IntakeQueueService } from '../src/modules/ai/intake/intake-queue.service';
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

/** Body of one top-level service in the compose file (text slice; no YAML parser in the repo). */
function composeService(name: string): string {
  const file = readFileSync(
    join(__dirname, '..', '..', '..', 'docker-compose.production.yml'),
    'utf8',
  );
  const start = file.search(new RegExp(`^  ${name}:\\s*$`, 'm'));
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = file.slice(start + 1);
  const next = rest.search(/^ {2}[\w-]+:\s*$|^[\w-]+:/m);
  return next === -1 ? rest : rest.slice(0, next);
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

  it('@e2e @flow:intake @issue-142 AC1: API app graph never loads tesseract.js or pdf-parse, even after an upload', async () => {
    expect(loaded).toEqual([]);
    // The API graph has no extraction providers at all: nothing in it can consume the queue.
    // (Looked up by name: importing these classes here would itself load pdf-parse.)
    const providers = [...app.get(ModulesContainer).values()].flatMap((m) =>
      [...m.providers.values()].map((p) => p.name),
    );
    expect(providers).not.toContain('IntakeProcessorService');
    expect(providers).not.toContain('DocumentIntakeService');

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

  it('@e2e @flow:intake @issue-142 AC2: without AiWorkerModule the enqueued job is never processed', async () => {
    await app.get(IntakeJobsService).recoverJobs();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const job = await prisma.intakeJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe(IntakeJobStatus.QUEUED);
    expect(job.attempts).toBe(0);
  });

  it('@e2e @flow:intake @issue-142 AC2: once AiWorkerModule is booted the same job is processed', async () => {
    // Imported here, not at the top, so the API graph above is measured before the PDF stack loads.
    const { AiWorkerModule } = await import('../src/modules/ai/worker/ai-worker.module');
    const { ExtractionStrategyResolver } =
      await import('../src/modules/ai/extraction/extraction-strategy-resolver.service');
    // Without REDIS_URL the queue is in-process, so the worker shares the API's queue instance.
    const worker = await Test.createTestingModule({ imports: [AiWorkerModule] })
      .overrideProvider(ExtractionStrategyResolver)
      .useValue(stubResolver)
      .overrideProvider(IntakeQueueService)
      .useValue(app.get(IntakeQueueService))
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

  it('@e2e @flow:intake @issue-142 AC2: compose runs the worker from the API image with the worker entrypoint', () => {
    const api = composeService('api');
    const worker = composeService('intake-worker');

    const imageOf = (block: string): string | undefined => /^\s+image:\s*(\S+)/m.exec(block)?.[1];
    expect(imageOf(worker)).toBeDefined();
    expect(imageOf(worker)).toBe(imageOf(api));
    expect(worker).toMatch(/^\s+command:\s*\["node",\s*"dist\/main\.worker\.js"\]\s*$/m);
    expect(api).not.toContain('main.worker');
  });
});
