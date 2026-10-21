/**
 * Durable document intake (issues #15 and #9): real HTTP API, real login, real PostgreSQL and
 * Redis/BullMQ. Only the extraction strategy is stubbed (no model is required): it returns a
 * fixed extraction, or throws when `stub.mode === 'fail'`.
 */
import { INestApplication } from '@nestjs/common';
import { IntakeJobStatus } from '@prisma/client';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { eventually } from './helpers/journey.helper';
import { ApiHelper } from './helpers/api-client.helper';
import { ExtractionStrategyResolver } from '../src/modules/ai/extraction/extraction-strategy-resolver.service';
import { IntakeStorage, sha256Hex } from '../src/modules/ai/intake/intake-storage';
import { IntakeProcessorService } from '../src/modules/ai/intake/intake-processor.service';
import { IntakeQueueService } from '../src/modules/ai/intake/intake-queue.service';
import { DocumentIntakeService } from '../src/modules/ai/services/document-intake.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.INTAKE_RETRY_BASE_MS = '50';
process.env.INTAKE_LEASE_MS = '1000';

const stub = { mode: 'ok' as 'ok' | 'fail', calls: 0 };

const stubResolver = {
  resolve: async () => {
    stub.calls += 1;
    if (stub.mode === 'fail') throw new Error('stub extraction failure with INVOICE-TEXT-SECRET');
    return {
      strategyUsed: 'ocr',
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

/**
 * The API process only enqueues; in production `IntakeWorkerModule` runs the processor in its own
 * container. These tests stand in for that worker by registering the processor on the app's queue.
 */
async function boot(): Promise<INestApplication> {
  const app = await createTestApp((builder) =>
    builder.overrideProvider(ExtractionStrategyResolver).useValue(stubResolver),
  );
  new IntakeProcessorService(
    app.get(PrismaService),
    app.get(IntakeStorage),
    app.get(DocumentIntakeService),
    app.get(IntakeQueueService),
    app.get(ConfigService),
  ).onModuleInit();
  return app;
}

describe('Document intake (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;

  function upload(api: ApiHelper, file: Buffer, name = 'inv.pdf') {
    return api.post('/ai/document-intake/process').attach('file', file, {
      filename: name,
      contentType: 'application/pdf',
    });
  }

  async function waitForStatus(jobId: string, status: IntakeJobStatus) {
    return eventually(async () => {
      const job = await prisma.intakeJob.findFirst({
        where: { id: jobId, organizationId: tenantA.organizationId },
      });
      expect(job?.status).toBe(status);
      return job;
    }, 20000);
  }

  beforeAll(async () => {
    stub.mode = 'ok';
    app = await boot();
    prisma = getPrisma(app);
    tenantA = await registerTenant(app, 'IntakeA');
    tenantB = await registerTenant(app, 'IntakeB');
    a = tenantA.api;
    b = tenantB.api;
    anon = ApiHelper.anonymous(app);
  });

  afterAll(async () => {
    await app.close();
  });

  let jobId = '';
  const fixture = pdfFixture(`A-${uniqueSuffix()}`);

  it('upload stores the original, creates a durable job and extracts it', async () => {
    const res = await upload(a, fixture);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ duplicate: false });
    jobId = res.body.data.jobId;

    const done = await waitForStatus(jobId, IntakeJobStatus.EXTRACTED);
    expect(done).toMatchObject({
      organizationId: tenantA.organizationId,
      createdById: tenantA.userId,
      sha256: sha256Hex(fixture),
      sizeBytes: fixture.length,
      attempts: 1,
    });
    expect(done?.storageKey.startsWith(`${tenantA.organizationId}/`)).toBe(true);

    const result = await a.get(`/ai/document-intake/${jobId}/result`);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ id: jobId, status: 'EXTRACTED', stage: 'complete' });
    expect(result.body.data.result.extractedFields.total).toBe(115);
    expect(result.body.data).not.toHaveProperty('storageKey');
  });

  it('serves the preserved original with its content type, byte for byte', async () => {
    const res = await a
      .get(`/ai/document-intake/${jobId}/original`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(sha256Hex(res.body as Buffer)).toBe(sha256Hex(fixture));
  });

  it('a duplicate upload returns the same job without a second extraction', async () => {
    const before = stub.calls;
    const res = await upload(a, fixture, 'renamed.pdf');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ jobId, duplicate: true });
    expect(
      await prisma.intakeJob.count({
        where: { organizationId: tenantA.organizationId, sha256: sha256Hex(fixture) },
      }),
    ).toBe(1);
    expect(stub.calls).toBe(before);
  });

  it('the same file in another tenant is a separate job', async () => {
    const res = await upload(b, fixture);
    expect(res.status).toBe(201);
    expect(res.body.data.duplicate).toBe(false);
    expect(res.body.data.jobId).not.toBe(jobId);
  });

  it('lists only the caller organization and filters by status', async () => {
    const mine = await a.get('/ai/document-intake/jobs?status=EXTRACTED');
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((j: { id: string }) => j.id)).toContain(jobId);
    expect(mine.body.data.every((j: { storageKey?: string }) => j.storageKey === undefined)).toBe(
      true,
    );
    const theirs = await b.get('/ai/document-intake/jobs');
    expect(theirs.status).toBe(200);
    expect(theirs.body.data.map((j: { id: string }) => j.id)).not.toContain(jobId);
    const none = await a.get('/ai/document-intake/jobs?status=DEAD_LETTER');
    expect(none.body.data).toHaveLength(0);
    expect((await a.get('/ai/document-intake/jobs?status=BOGUS')).status).toBe(400);
  });

  it('tenant B gets 404 for tenant A job, result, original, retry and SSE', async () => {
    for (const path of ['', '/result', '/original', '/progress']) {
      const res = await b.get(`/ai/document-intake/${jobId}${path}`);
      expect(res.status).toBe(404);
    }
    expect((await b.post(`/ai/document-intake/${jobId}/retry`)).status).toBe(404);
    const confirm = await b.post('/ai/document-intake/confirm').send({
      type: 'BILL',
      jobId,
      date: '2026-09-01',
      dueDate: '2026-10-01',
      lines: [{ description: 'x', quantity: '1', rate: '1', taxRatePercent: '0' }],
    });
    expect(confirm.status).toBe(404);
    const untouched = await prisma.intakeJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(untouched.status).toBe(IntakeJobStatus.EXTRACTED);
  });

  it('anonymous callers get 401 on every intake route', async () => {
    expect((await anon.get(`/ai/document-intake/${jobId}/progress`)).status).toBe(401);
    expect((await anon.get(`/ai/document-intake/${jobId}/result`)).status).toBe(401);
    expect((await anon.get(`/ai/document-intake/${jobId}/original`)).status).toBe(401);
    expect((await anon.get('/ai/document-intake/jobs')).status).toBe(401);
    expect((await anon.post(`/ai/document-intake/${jobId}/retry`)).status).toBe(401);
    expect((await upload(anon, fixture)).status).toBe(401);
  });

  it('the owner can read the SSE stream; it ends on the terminal state with the result', async () => {
    const res = await a
      .get(`/ai/document-intake/${jobId}/progress`)
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (c: Buffer) => (data += c.toString()));
        r.on('end', () => cb(null, data));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(String(res.body)).toContain('"stage":"complete"');
    expect(String(res.body)).toContain('"status":"EXTRACTED"');
  });

  it('job state survives an application restart and stays readable', async () => {
    await app.close();
    app = await boot();
    prisma = getPrisma(app);
    const res = await a.withToken(tenantA.accessToken).get(`/ai/document-intake/${jobId}/result`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('EXTRACTED');
    a = new ApiHelper(app, tenantA.accessToken);
    b = new ApiHelper(app, tenantB.accessToken);
    anon = ApiHelper.anonymous(app);
  });

  it('a job whose worker died mid-run is recovered after restart and finishes once', async () => {
    const before = stub.calls;
    const bytes = pdfFixture(`CRASH-${uniqueSuffix()}`);
    const storage = app.get(IntakeStorage);
    const storageKey = `${tenantA.organizationId}/2026/09/crash-${uniqueSuffix()}`;
    await storage.put(storageKey, bytes);
    const orphan = await prisma.intakeJob.create({
      data: {
        organizationId: tenantA.organizationId,
        createdById: tenantA.userId,
        originalFileName: 'crash.pdf',
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        sha256: sha256Hex(bytes),
        storageKey,
        status: IntakeJobStatus.PROCESSING,
        attempts: 1,
        leaseToken: 'dead-worker',
        leaseExpiresAt: new Date(Date.now() + 1500), // expires while the app is restarting
      },
    });

    await app.close();
    app = await boot(); // bootstrap recovery re-enqueues the orphan
    prisma = getPrisma(app);
    a = new ApiHelper(app, tenantA.accessToken);
    b = new ApiHelper(app, tenantB.accessToken);
    anon = ApiHelper.anonymous(app);

    const done = await waitForStatus(orphan.id, IntakeJobStatus.EXTRACTED);
    expect(done?.attempts).toBe(2);
    expect(stub.calls).toBe(before + 1);
  });

  it('failures back off and dead-letter after maxAttempts; retry re-runs idempotently', async () => {
    stub.mode = 'fail';
    const res = await upload(a, pdfFixture(`FAIL-${uniqueSuffix()}`), 'bad.pdf');
    const failingId = res.body.data.jobId as string;
    const dead = await waitForStatus(failingId, IntakeJobStatus.DEAD_LETTER);
    expect(dead?.attempts).toBe(3);
    expect(dead?.lastError).toBeTruthy();
    expect(dead?.lastError).not.toContain('SECRET');

    const view = await a.get(`/ai/document-intake/${failingId}/result`);
    expect(view.body.data).toMatchObject({ status: 'DEAD_LETTER', stage: 'error' });

    stub.mode = 'ok';
    const retry = await a.post(`/ai/document-intake/${failingId}/retry`);
    expect(retry.status).toBe(201);
    await waitForStatus(failingId, IntakeJobStatus.EXTRACTED);
    expect((await a.post(`/ai/document-intake/${failingId}/retry`)).status).toBe(409);
  });

  it('confirm with a jobId approves the job once and links the draft', async () => {
    const vendor = await a.post('/vendors').send({ name: `Intake Vendor ${uniqueSuffix()}` });
    expect(vendor.status).toBe(201);
    const body = {
      type: 'BILL',
      jobId,
      vendorId: vendor.body.id,
      date: '2026-09-01',
      dueDate: '2026-10-01',
      lines: [{ description: 'CPU', quantity: '1', rate: '100', taxRatePercent: '0' }],
    };
    const first = await a.post('/ai/document-intake/confirm').send(body);
    expect(first.status).toBe(201);
    const replay = await a.post('/ai/document-intake/confirm').send(body);
    expect(replay.status).toBe(409);
    const job = await prisma.intakeJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({
      status: IntakeJobStatus.APPROVED,
      draftDocumentType: 'bill',
      draftDocumentId: first.body.data.id,
    });
    expect(await prisma.bill.count({ where: { organizationId: tenantA.organizationId } })).toBe(1);
  });

  it('a confirmed scanned draft has the same totals as the equivalent manual bill', async () => {
    const vendor = await a.post('/vendors').send({ name: `Parity Vendor ${uniqueSuffix()}` });
    expect(vendor.status).toBe(201);
    const lines = [
      { description: 'CPU', quantity: '3', rate: '33.33', taxRate: '14' },
      { description: 'Cable', quantity: '1.375', rate: '19.999', taxRate: '5' },
      { description: 'Stand', quantity: '7', rate: '0.35', taxRate: '0' },
    ];
    const common = { vendorId: vendor.body.id, date: '2026-09-01', dueDate: '2026-10-01' };
    const manual = await a.post('/bills').send({ ...common, lines });
    expect(manual.status).toBe(201);
    const scanned = await a.post('/ai/document-intake/confirm').send({
      ...common,
      type: 'BILL',
      lines: lines.map(({ taxRate, ...l }) => ({ ...l, taxRatePercent: taxRate })),
    });
    expect(scanned.status).toBe(201);

    const [m, s] = await Promise.all([
      prisma.bill.findUniqueOrThrow({ where: { id: manual.body.id } }),
      prisma.bill.findUniqueOrThrow({ where: { id: scanned.body.data.id } }),
    ]);
    expect(s.subtotal.toString()).toBe('129.94');
    expect(s.taxAmount.toString()).toBe('15.38');
    expect(s.grandTotal.toString()).toBe('145.32');
    expect(s.subtotal.toString()).toBe(m.subtotal.toString());
    expect(s.taxAmount.toString()).toBe(m.taxAmount.toString());
    expect(s.grandTotal.toString()).toBe(m.grandTotal.toString());
    expect(s.status).toBe('DRAFT');
  });

  it('confirm rejects a currency different from the organization base currency', async () => {
    const vendor = await a.post('/vendors').send({ name: `Fx Vendor ${uniqueSuffix()}` });
    const res = await a.post('/ai/document-intake/confirm').send({
      type: 'BILL',
      vendorId: vendor.body.id,
      date: '2026-09-01',
      dueDate: '2026-10-01',
      currencyCode: 'ZZZ',
      lines: [{ description: 'x', quantity: '1', rate: '1', taxRatePercent: '0' }],
    });
    expect(res.status).toBe(400);
  });

  it('a soft-deleted job does not block re-uploading the same file (partial unique index)', async () => {
    const bytes = pdfFixture(`DEL-${uniqueSuffix()}`);
    const first = await upload(a, bytes);
    const firstId = first.body.data.jobId as string;
    await waitForStatus(firstId, IntakeJobStatus.EXTRACTED);
    await prisma.intakeJob.update({ where: { id: firstId }, data: { deletedAt: new Date() } });
    const again = await upload(a, bytes);
    expect(again.status).toBe(201);
    expect(again.body.data.duplicate).toBe(false);
    expect(again.body.data.jobId).not.toBe(firstId);
    // The live-row uniqueness still holds at the database level.
    await expect(
      prisma.intakeJob.create({
        data: {
          organizationId: tenantA.organizationId,
          createdById: tenantA.userId,
          originalFileName: 'x.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          sha256: sha256Hex(bytes),
          storageKey: 'x',
        },
      }),
    ).rejects.toThrow();
  });

  it('a FAILED job is re-enqueued by the periodic sweep and finishes', async () => {
    const bytes = pdfFixture(`SWEEP-${uniqueSuffix()}`);
    const storage = app.get(IntakeStorage);
    const storageKey = `${tenantA.organizationId}/2026/09/sweep-${uniqueSuffix()}`;
    await storage.put(storageKey, bytes);
    const failed = await prisma.intakeJob.create({
      data: {
        organizationId: tenantA.organizationId,
        createdById: tenantA.userId,
        originalFileName: 'sweep.pdf',
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        sha256: sha256Hex(bytes),
        storageKey,
        status: IntakeJobStatus.FAILED,
        attempts: 1,
      },
    });
    const done = await waitForStatus(failed.id, IntakeJobStatus.EXTRACTED);
    expect(done?.attempts).toBe(2);
  });
});
