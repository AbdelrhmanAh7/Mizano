/**
 * Intake worker entrypoint E2E tests for issue #141.
 * Tests that the worker runs as a separate process without HTTP server,
 * processes queued jobs, and reports health via heartbeat file.
 */
import { INestApplication } from '@nestjs/common';
import { IntakeJobStatus } from '@prisma/client';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { eventually } from './helpers/journey.helper';
import { ApiHelper } from './helpers/api-client.helper';
import { PrismaService } from '../src/prisma/prisma.service';
import { IntakeStorage, sha256Hex } from '../src/modules/ai/intake/intake-storage';
import {
  IntakeQueueService,
  INTAKE_QUEUE_NAME,
} from '../src/modules/ai/intake/intake-queue.service';
import { ExtractionStrategyResolver } from '../src/modules/ai/extraction/extraction-strategy-resolver.service';

process.env.INTAKE_RETRY_BASE_MS = '50';
process.env.INTAKE_LEASE_MS = '1000';

const stub = { mode: 'ok' as 'ok' | 'fail', calls: 0 };

const stubResolver = {
  resolve: async () => {
    stub.calls += 1;
    if (stub.mode === 'fail') throw new Error('stub extraction failure with INVOICE-TEXT-SECRET');
    return {
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
    };
  },
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

describe('@e2e @issue-141 Intake worker entrypoint', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let a: ApiHelper;

  async function bootApi(overrides?: (builder: any) => any): Promise<INestApplication> {
    return createTestApp((builder) =>
      builder.overrideProvider(ExtractionStrategyResolver).useValue(stubResolver),
    );
  }

  async function waitForStatus(jobId: string, orgId: string, status: IntakeJobStatus) {
    return eventually(async () => {
      const job = await prisma.intakeJob.findFirst({
        where: { id: jobId, organizationId: orgId },
      });
      expect(job?.status).toBe(status);
      return job;
    }, 20000);
  }

  beforeAll(async () => {
    stub.mode = 'ok';
    app = await bootApi();
    prisma = getPrisma(app);
    tenantA = await registerTenant(app, 'IntakeWorkerA');
    a = tenantA.api;
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * AC1: AppModule no longer resolves IntakeProcessorService.
   * An upload that is enqueued stays QUEUED in the API.
   */
  it('@issue-141 AC1: AppModule does not provide IntakeProcessorService; uploaded job stays QUEUED', async () => {
    // Verify AppModule doesn't have IntakeProcessorService in its providers
    const appModuleProviders = Reflect.getMetadata(
      'providers',
      (await import('../src/app.module')).AppModule,
    );
    const providerNames = (appModuleProviders as unknown[])
      .filter((p): p is { name: string } => typeof p === 'function')
      .map((p) => p.name);
    expect(providerNames).not.toContain('IntakeProcessorService');
    expect(providerNames).not.toContain('IntakeExecutorService');
    expect(providerNames).not.toContain('IntakeMatchingService');

    // Upload a document - it should be queued but not processed
    const fixture = pdfFixture(`AC1-${uniqueSuffix()}`);
    const res = await a.post('/ai/document-intake/process').attach('file', fixture, {
      filename: 'inv.pdf',
      contentType: 'application/pdf',
    });
    expect(res.status).toBe(201);
    const jobId = res.body.data.jobId;

    // Job should stay QUEUED because no worker is running in the API process
    const job = await prisma.intakeJob.findFirst({
      where: { id: jobId, organizationId: tenantA.organizationId },
    });
    expect(job?.status).toBe(IntakeJobStatus.QUEUED);
    expect(job?.progress).toBe(0);
  });

  /**
   * AC2: IntakeWorkerModule boots with no HTTP server and processes a QUEUED job.
   * This test simulates the worker module booting and processing a job.
   */
  it('@issue-141 AC2: IntakeWorkerModule boots without HTTP server and processes QUEUED job', async () => {
    // Import the worker module directly and verify it has no controllers
    const { IntakeWorkerModule } = await import('../src/intake-worker.module');
    expect(Reflect.getMetadata('controllers', IntakeWorkerModule)).toBeUndefined();

    const workerModuleProviders = Reflect.getMetadata('providers', IntakeWorkerModule);
    const workerProviderNames = (workerModuleProviders as unknown[])
      .filter((p): p is { name: string } => typeof p === 'function')
      .map((p) => p.name);
    expect(workerProviderNames).toContain('IntakeProcessorService');
    expect(workerProviderNames).toContain('IntakeExecutorService');
    expect(workerProviderNames).toContain('IntakeMatchingService');
    expect(workerProviderNames).toContain('IntakeQueueService');
    expect(workerProviderNames).toContain('PrismaService');

    // Create a QUEUED job directly in the database
    const bytes = pdfFixture(`AC2-${uniqueSuffix()}`);
    const storage = app.get(IntakeStorage);
    const storageKey = `${tenantA.organizationId}/2026/09/worker-${uniqueSuffix()}`;
    await storage.put(storageKey, bytes);

    const job = await prisma.intakeJob.create({
      data: {
        organizationId: tenantA.organizationId,
        createdById: tenantA.userId,
        originalFileName: 'worker-test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        sha256: sha256Hex(bytes),
        storageKey,
        status: IntakeJobStatus.QUEUED,
        attempts: 0,
      },
    });

    // Bootstrap the worker module (simulating the worker process)
    const { NestFactory } = await import('@nestjs/core');
    const workerApp = await NestFactory.createApplicationContext(IntakeWorkerModule);

    // Give it time to process the job
    await waitForStatus(job.id, tenantA.organizationId, IntakeJobStatus.EXTRACTED);

    const processed = await prisma.intakeJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(processed.status).toBe(IntakeJobStatus.EXTRACTED);
    expect(processed.attempts).toBe(1);
    expect(processed.result).toBeDefined();

    await workerApp.close();
  });

  /**
   * AC3: The heartbeat check fails when the heartbeat file is stale or missing.
   */
  it('@issue-141 AC3: workerHeartbeatHealthy rejects stale, missing, invalid, or future heartbeats', async () => {
    const { workerHeartbeatHealthy, WORKER_HEARTBEAT_FILE } =
      await import('../src/intake-worker-healthcheck');
    const fs = await import('fs');

    // Missing file
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(workerHeartbeatHealthy()).toBe(false);

    // Invalid content
    jest.spyOn(fs, 'readFileSync').mockReturnValue('invalid');
    expect(workerHeartbeatHealthy()).toBe(false);

    // Future timestamp
    jest.spyOn(fs, 'readFileSync').mockReturnValue(String(Date.now() + 100000));
    expect(workerHeartbeatHealthy()).toBe(false);

    // Stale (older than 20 seconds)
    jest.spyOn(fs, 'readFileSync').mockReturnValue(String(Date.now() - 30000));
    expect(workerHeartbeatHealthy()).toBe(false);

    // Recent (within 20 seconds)
    jest.spyOn(fs, 'readFileSync').mockReturnValue(String(Date.now() - 1000));
    expect(workerHeartbeatHealthy()).toBe(true);

    jest.restoreAllMocks();
  });

  /**
   * AC4: docker-compose.pi.yml defines the worker service with correct config.
   */
  it('@issue-141 AC4: docker-compose.pi.yml has worker service with 2048m mem, healthcheck command', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const composePath = path.resolve(__dirname, '../../deploy/pi/docker-compose.pi.yml');
    const compose = fs.readFileSync(composePath, 'utf8');

    expect(compose).toContain('worker:');
    expect(compose).toContain('mem_limit: 2048m');
    expect(compose).toContain('memswap_limit: 2048m');
    expect(compose).toContain('command:');
    // Should use intake-worker.js not worker.js
    expect(compose).toContain('dist/intake-worker.js');
    // Healthcheck should use intake-worker-healthcheck.js
    expect(compose).toContain('dist/intake-worker-healthcheck.js');
    // Should have init: true for signal handling
    expect(compose).toContain('init: true');
    // Should have stop_grace_period
    expect(compose).toContain('stop_grace_period: 30s');
    // Should have cpus and pids_limit
    expect(compose).toContain('cpus: 2.0');
    expect(compose).toContain('pids_limit: 128');
    // Should depend on postgres, redis, migrate
    expect(compose).toContain('postgres:');
    expect(compose).toContain('redis:');
    expect(compose).toContain('migrate:');
  });
});
