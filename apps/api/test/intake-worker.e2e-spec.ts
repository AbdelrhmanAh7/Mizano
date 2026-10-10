/**
 * Intake worker split (issue #141): the API only enqueues; a separate headless process
 * (`IntakeWorkerModule`) consumes the queue. Extraction is stubbed (no model required).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { INestApplication, INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IntakeJobStatus } from '@prisma/client';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { eventually } from './helpers/journey.helper';
import { PrismaService } from '../src/prisma/prisma.service';
import { IntakeWorkerModule } from '../src/intake-worker.module';
import { workerHeartbeatHealthy } from '../src/intake-worker-healthcheck';
import { ExtractionStrategyResolver } from '../src/modules/ai/extraction/extraction-strategy-resolver.service';
import { IntakeProcessorService } from '../src/modules/ai/intake/intake-processor.service';
import { IntakeStorage, sha256Hex } from '../src/modules/ai/intake/intake-storage';

process.env.INTAKE_RETRY_BASE_MS = '50';
process.env.INTAKE_LEASE_MS = '1000';

const stubResolver = {
  resolve: async () => ({
    strategyUsed: 'rules',
    totalTimeMs: 1,
    extraction: {
      vendorName: 'E2E Vendor',
      vendorAddress: null,
      vendorPhone: null,
      vendorEmail: null,
      vendorTaxId: null,
      invoiceNumber: 'E2E-1',
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

describe('@e2e @flow:intake-worker @issue-141 Intake worker entrypoint', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: TestTenant;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(ExtractionStrategyResolver).useValue(stubResolver),
    );
    prisma = getPrisma(app);
    tenant = await registerTenant(app, 'IntakeWorker');
  });

  afterAll(async () => {
    await app.close();
  });

  it('@issue-141 AC1: the API does not resolve IntakeProcessorService; an upload stays QUEUED', async () => {
    expect(() => app.get(IntakeProcessorService, { strict: false })).toThrow();

    const res = await tenant.api
      .post('/ai/document-intake/process')
      .attach('file', pdfFixture(`AC1-${uniqueSuffix()}`), {
        filename: 'inv.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(201);
    const job = await prisma.intakeJob.findFirstOrThrow({
      where: { id: res.body.data.jobId, organizationId: tenant.organizationId },
    });
    expect(job.status).toBe(IntakeJobStatus.QUEUED);
    expect(job.attempts).toBe(0);
  });

  it('@issue-141 AC2: IntakeWorkerModule boots headless and processes a QUEUED job', async () => {
    const bytes = pdfFixture(`AC2-${uniqueSuffix()}`);
    const storageKey = `${tenant.organizationId}/2026/09/worker-${uniqueSuffix()}`;
    await app.get(IntakeStorage).put(storageKey, bytes);
    const queued = await prisma.intakeJob.create({
      data: {
        organizationId: tenant.organizationId,
        createdById: tenant.userId,
        originalFileName: 'worker-test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        sha256: sha256Hex(bytes),
        storageKey,
        status: IntakeJobStatus.QUEUED,
      },
    });

    const moduleRef = await Test.createTestingModule({ imports: [IntakeWorkerModule] })
      .overrideProvider(ExtractionStrategyResolver)
      .useValue(stubResolver)
      .compile();
    const worker: INestApplicationContext = await moduleRef.init();
    try {
      // A bare application context: no HTTP adapter, so nothing listens on a port.
      expect('getHttpServer' in worker).toBe(false);
      expect(worker.get(IntakeProcessorService)).toBeDefined();

      const done = await eventually(async () => {
        const row = await prisma.intakeJob.findFirstOrThrow({
          where: { id: queued.id, organizationId: tenant.organizationId },
        });
        expect(row.status).toBe(IntakeJobStatus.EXTRACTED);
        return row;
      }, 20000);
      expect(done.attempts).toBe(1);
      expect(done.result).not.toBeNull();
    } finally {
      await worker.close();
    }
  });

  it('@issue-141 AC3: the heartbeat check fails when the file is stale, missing, invalid or in the future', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mizano-hb-'));
    const file = join(dir, 'heartbeat');
    const now = 1_000_000_000_000;
    try {
      expect(workerHeartbeatHealthy(file, now)).toBe(false); // missing
      writeFileSync(file, 'not-a-number');
      expect(workerHeartbeatHealthy(file, now)).toBe(false); // invalid
      writeFileSync(file, String(now + 60_000));
      expect(workerHeartbeatHealthy(file, now)).toBe(false); // future
      writeFileSync(file, String(now - 30_000));
      expect(workerHeartbeatHealthy(file, now)).toBe(false); // stale
      writeFileSync(file, String(now - 1_000));
      expect(workerHeartbeatHealthy(file, now)).toBe(true); // fresh
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('@issue-141 AC4: docker-compose.pi.yml defines the worker service', () => {
    const compose = readFileSync(
      resolve(__dirname, '../../../deploy/pi/docker-compose.pi.yml'),
      'utf8',
    );
    const block = /^ {2}worker:\n((?: {4}.*\n|\s*\n)+)/m.exec(compose)?.[1] ?? '';
    expect(block).not.toBe('');
    expect(block).toContain('mem_limit: 2048m');
    expect(block).toContain('dist/intake-worker.js');
    expect(block).toMatch(/healthcheck:[\s\S]*dist\/intake-worker-healthcheck\.js/);
    expect(block).toContain('stop_grace_period: 30s');
    expect(block).toContain(':/data/originals:ro');
  });
});
