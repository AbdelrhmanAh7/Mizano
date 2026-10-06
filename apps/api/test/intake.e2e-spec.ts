/**
 * Durable document intake (issues #15, #9 and #42): real HTTP API, real login, real PostgreSQL and
 * Redis/BullMQ. The HTTP API only produces jobs; a separate minimal worker context (the same
 * `IntakeWorkerModule` that `dist/intake-worker.js` boots) consumes them. Only the extraction
 * child is substituted (no OCR engine, Poppler or Linux process cap is required): the executor
 * reads the stored original, takes the text the fixture PDF carries as the OCR output and runs
 * the child's real deterministic rules (`structuredCpuResult`). Everything after the child is the
 * production worker: vendor and duplicate matching from the database, review routing, retries
 * and persistence. The executor throws when `stub.mode === 'fail'` and fails like a deadline when
 * `stub.mode === 'timeout'`. The real supervisor is covered by intake-executor.process.spec.ts.
 */
import { INestApplication, INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IntakeJob, IntakeJobStatus } from '@prisma/client';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { eventually } from './helpers/journey.helper';
import { ApiHelper } from './helpers/api-client.helper';
import { IntakeWorkerModule } from '../src/intake-worker.module';
import { structuredCpuResult } from '../src/modules/ai/intake/cpu-structured';
import { IntakeExecutorService } from '../src/modules/ai/intake/intake-executor.service';
import { IntakeRuntimeError } from '../src/modules/ai/intake/intake-runtime';
import { IntakeStorage, sha256Hex } from '../src/modules/ai/intake/intake-storage';
import { PrismaService } from '../src/prisma/prisma.service';

process.env.INTAKE_RETRY_BASE_MS = '50';
process.env.INTAKE_LEASE_MS = '1000';

const stub = { mode: 'ok' as 'ok' | 'fail' | 'timeout', calls: 0 };
/** Text-layer confidence the real child assigns to a PDF's embedded text. */
const TEXT_CONFIDENCE = 0.95;

/** A one-page PDF whose text is `lines`; `\n` escapes separate them inside one text string. */
function textPdf(lines: string[]): Buffer {
  if (lines.some((line) => /[()\\]/.test(line))) throw new Error('fixture text needs escaping');
  const text = lines.join('\\n');
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length ${text.length + 30}>>stream\nBT /F1 12 Tf 20 100 Td (${text}) Tj ET\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}

/** What the substituted extraction child "reads" from a fixture produced by `textPdf`. */
function fixtureText(pdf: Buffer): string {
  const match = /\((.*)\) Tj/.exec(pdf.toString('latin1'));
  if (!match) throw new Error('not a textPdf fixture');
  return match[1].replace(/\\n/g, '\n');
}

/** The lines of a plain English tax invoice; the rules read every field below from them. */
function invoiceLines(
  vendor: string,
  number: string,
  amounts = { net: '100.00', vat: '15.00', gross: '115.00' },
): string[] {
  return [
    `Supplier: ${vendor}`,
    'Tax Invoice',
    `Invoice No: ${number}`,
    'Invoice Date: 2026-09-01',
    `Sub Total: EGP ${amounts.net}`,
    `VAT 15%: EGP ${amounts.vat}`,
    `Total: EGP ${amounts.gross}`,
  ];
}

/** A complete invoice from `E2E Vendor`; the marker makes the bytes (and the number) unique. */
function pdfFixture(marker: string): Buffer {
  return textPdf(invoiceLines('E2E Vendor', `E2E-${marker}`));
}

let worker: INestApplicationContext | undefined;
/** Observes how many documents the (stubbed) executor runs at the same time. */
const gate = { delayMs: 0, inFlight: 0, maxInFlight: 0 };

/** The dedicated minimal worker context; only its extraction subprocess is substituted. */
async function startWorker(app: INestApplication): Promise<INestApplicationContext> {
  const module = await Test.createTestingModule({ imports: [IntakeWorkerModule] })
    .overrideProvider(IntakeExecutorService)
    .useValue({
      run: async (job: IntakeJob) => {
        gate.inFlight += 1;
        gate.maxInFlight = Math.max(gate.maxInFlight, gate.inFlight);
        try {
          if (gate.delayMs) await new Promise((resolve) => setTimeout(resolve, gate.delayMs));
          stub.calls += 1;
          if (stub.mode === 'timeout') throw new IntakeRuntimeError('INTAKE_TIMEOUT');
          if (stub.mode === 'fail')
            throw new Error('stub extraction failure with INVOICE-TEXT-SECRET');
          const buffer = await app.get(IntakeStorage).get(job.storageKey, job.sha256);
          return structuredCpuResult(fixtureText(buffer), TEXT_CONFIDENCE);
        } finally {
          gate.inFlight -= 1;
        }
      },
    })
    .compile();
  return module.init();
}

async function boot(): Promise<INestApplication> {
  const app = await createTestApp();
  worker = await startWorker(app);
  return app;
}

async function close(app: INestApplication): Promise<void> {
  await worker?.close();
  await app.close();
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

  async function waitForStatus(
    jobId: string,
    status: IntakeJobStatus,
    organizationId = tenantA.organizationId,
  ) {
    return eventually(async () => {
      const job = await prisma.intakeJob.findFirst({ where: { id: jobId, organizationId } });
      expect(job?.status).toBe(status);
      return job;
    }, 20000);
  }

  /** Uploads a document, waits for the worker to finish it and returns the API's result view. */
  async function extract(
    api: ApiHelper,
    organizationId: string,
    file: Buffer,
    status: IntakeJobStatus,
  ) {
    const res = await upload(api, file);
    expect(res.status).toBe(201);
    const jobId = res.body.data.jobId as string;
    await waitForStatus(jobId, status, organizationId);
    const view = await api.get(`/ai/document-intake/${jobId}/result`);
    expect(view.status).toBe(200);
    return view.body.data.result;
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
    await close(app);
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
    await close(app);
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

    await close(app);
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

  it('timeout errors are retryable and localized on the authenticated result route', async () => {
    stub.mode = 'timeout';
    try {
      const res = await upload(a, pdfFixture(`TIMEOUT-${uniqueSuffix()}`));
      const id = res.body.data.jobId as string;
      await waitForStatus(id, IntakeJobStatus.DEAD_LETTER);
      const en = await a.get(`/ai/document-intake/${id}/result`).set('x-lang', 'en');
      const ar = await a.get(`/ai/document-intake/${id}/result`).set('x-lang', 'ar');
      expect(en.status).toBe(200);
      expect(ar.status).toBe(200);
      expect(en.body.data).toMatchObject({ errorCode: 'INTAKE_TIMEOUT', retryable: true });
      expect(en.body.data.lastError).toContain('timed out');
      expect(ar.body.data.lastError).toContain('إعادة المحاولة');
      expect((await b.get(`/ai/document-intake/${id}/result`)).status).toBe(404);
    } finally {
      stub.mode = 'ok';
    }
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

  describe('structured extraction in the worker (#42, #16)', () => {
    it('turns OCR text into structured fields, matches the tenant vendor and needs no review', async () => {
      const vendorName = `Delta Supplies ${uniqueSuffix()}`;
      const vendor = await a.post('/vendors').send({ name: vendorName });
      expect(vendor.status).toBe(201);
      const number = `STR-2026-${uniqueSuffix()}`;

      const result = await extract(
        a,
        tenantA.organizationId,
        textPdf(invoiceLines(vendorName, number)),
        IntakeJobStatus.EXTRACTED,
      );

      expect(result).toMatchObject({
        documentType: 'BILL',
        extractionMethod: 'rules',
        extractedFields: {
          vendorName,
          documentNumber: number,
          date: '2026-09-01',
          subtotal: 100,
          tax: 15,
          total: 115,
          currency: 'EGP',
        },
        matchedVendor: { id: vendor.body.id, similarity: 1 },
        duplicateWarning: null,
        suggestCreateVendor: null,
        extractionWarnings: [],
      });
      expect(result.ocrConfidence).toBeGreaterThanOrEqual(0.6);
      // Evidence points at the document line each value came from.
      expect(result.fieldEvidence.total.text).toContain('115.00');
      expect(result.rawText).toContain(number);
    });

    it('flags the same invoice arriving again once its bill exists, and sends it to review', async () => {
      const vendorName = `Echo Traders ${uniqueSuffix()}`;
      const vendor = await a.post('/vendors').send({ name: vendorName });
      expect(vendor.status).toBe(201);
      const number = `DUP-2026-${uniqueSuffix()}`;
      const lines = invoiceLines(vendorName, number);

      const first = await extract(
        a,
        tenantA.organizationId,
        textPdf(lines),
        IntakeJobStatus.EXTRACTED,
      );
      expect(first.duplicateWarning).toBeNull();
      const bill = await a.post('/ai/document-intake/confirm').send({
        type: 'BILL',
        vendorId: vendor.body.id,
        documentNumber: number,
        date: '2026-09-01',
        dueDate: '2026-10-01',
        lines: [{ description: 'Goods', quantity: '1', rate: '100', taxRatePercent: '15' }],
      });
      expect(bill.status).toBe(201);

      // Different bytes (a second page marker), same supplier invoice.
      const again = await extract(
        a,
        tenantA.organizationId,
        textPdf([...lines, 'Page 2 of 2']),
        IntakeJobStatus.NEEDS_REVIEW,
      );
      expect(again.duplicateWarning).toEqual({
        isDuplicate: true,
        existingId: bill.body.data.id,
        matchType: 'exact_number',
        similarity: 1,
      });
      expect(again.extractedFields.total).toBe(115);
    });

    it('never matches another tenant vendor, and each tenant matches its own', async () => {
      const vendorName = `Shared Name Trading ${uniqueSuffix()}`;
      const theirs = await b.post('/vendors').send({ name: vendorName });
      expect(theirs.status).toBe(201);

      const mine = await extract(
        a,
        tenantA.organizationId,
        textPdf(invoiceLines(vendorName, `ISO-2026-${uniqueSuffix()}`)),
        IntakeJobStatus.EXTRACTED,
      );
      // Tenant A has no vendor of that name; tenant B's must not leak in as a match or a candidate.
      expect(mine.matchedVendor).toBeNull();
      expect(mine.suggestCreateVendor).toMatchObject({ name: vendorName });
      expect(JSON.stringify(mine)).not.toContain(theirs.body.id);

      const ownResult = await extract(
        b,
        tenantB.organizationId,
        textPdf(invoiceLines(vendorName, `ISO-2026-${uniqueSuffix()}`)),
        IntakeJobStatus.EXTRACTED,
      );
      expect(ownResult.matchedVendor).toMatchObject({ id: theirs.body.id });
    });

    it('routes totals that do not add up to review and keeps the reason', async () => {
      const result = await extract(
        a,
        tenantA.organizationId,
        textPdf(
          invoiceLines('Mismatch Trading', `MIS-2026-${uniqueSuffix()}`, {
            net: '1,000.00',
            vat: '150.00',
            gross: '1,300.00',
          }),
        ),
        IntakeJobStatus.NEEDS_REVIEW,
      );
      expect(result.extractionWarnings).toContain('TOTALS_MISMATCH');
      expect(result.ocrConfidence).toBeLessThan(0.6);
    });

    it('keeps every field unknown when the text holds no invoice evidence', async () => {
      const result = await extract(
        a,
        tenantA.organizationId,
        textPdf(['Meeting notes', `Agenda for Monday ${uniqueSuffix()}`]),
        IntakeJobStatus.NEEDS_REVIEW,
      );
      expect(result).toMatchObject({
        documentType: 'OTHER',
        extractedFields: { total: null, date: null, documentNumber: null, currency: null },
        matchedVendor: null,
        duplicateWarning: null,
      });
    });
  });

  describe('worker isolation and concurrency (#42)', () => {
    async function restartWorker(): Promise<void> {
      await worker?.close();
      worker = undefined;
      gate.maxInFlight = 0;
      worker = await startWorker(app);
    }
    async function uploadMany(count: number): Promise<string[]> {
      const ids: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const res = await upload(a, pdfFixture(`CONC-${i}-${uniqueSuffix()}`));
        expect(res.status).toBe(201);
        ids.push(res.body.data.jobId as string);
      }
      return ids;
    }

    afterEach(async () => {
      gate.delayMs = 0;
      delete process.env.INTAKE_CONCURRENCY;
      if (!worker) worker = await startWorker(app);
    });

    it('the HTTP API never processes a job itself: it stays QUEUED until a worker runs', async () => {
      await worker?.close();
      worker = undefined;
      const callsBefore = stub.calls;
      const res = await upload(a, pdfFixture(`NOWORKER-${uniqueSuffix()}`));
      expect(res.status).toBe(201);
      const id = res.body.data.jobId as string;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const queued = await prisma.intakeJob.findFirst({
        where: { id, organizationId: tenantA.organizationId },
      });
      expect(queued).toMatchObject({ status: IntakeJobStatus.QUEUED, attempts: 0 });
      expect(stub.calls).toBe(callsBefore);

      // The durable queue entry is picked up as soon as a worker exists.
      worker = await startWorker(app);
      const done = await waitForStatus(id, IntakeJobStatus.EXTRACTED);
      expect(done?.attempts).toBe(1);
    });

    it('runs one document at a time by default', async () => {
      gate.delayMs = 300;
      await restartWorker();
      const ids = await uploadMany(3);
      for (const id of ids) await waitForStatus(id, IntakeJobStatus.EXTRACTED);
      expect(gate.maxInFlight).toBe(1);
    });

    it('INTAKE_CONCURRENCY=2 runs two at once and never three', async () => {
      process.env.INTAKE_CONCURRENCY = '2';
      gate.delayMs = 400;
      await restartWorker();
      const ids = await uploadMany(5);
      for (const id of ids) await waitForStatus(id, IntakeJobStatus.EXTRACTED);
      expect(gate.maxInFlight).toBe(2);
    });

    it('an out-of-range INTAKE_CONCURRENCY falls back to one', async () => {
      process.env.INTAKE_CONCURRENCY = '8';
      gate.delayMs = 200;
      await restartWorker();
      const ids = await uploadMany(3);
      for (const id of ids) await waitForStatus(id, IntakeJobStatus.EXTRACTED);
      expect(gate.maxInFlight).toBe(1);
    });

    it('the API stays responsive (p95 under threshold) while the worker processes a batch', async () => {
      gate.delayMs = 200;
      await restartWorker();
      const ids = await uploadMany(4);

      // Concurrently issue API requests while the worker churns through the batch
      const latencies: number[] = [];
      const requests = Array.from({ length: 15 }, async () => {
        const start = Date.now();
        const res = await a.get('/documents/intake/jobs');
        latencies.push(Date.now() - start);
        expect(res.status).toBe(200);
      });
      await Promise.all(requests);

      for (const id of ids) await waitForStatus(id, IntakeJobStatus.EXTRACTED);

      latencies.sort((x, y) => x - y);
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      expect(p95).toBeLessThan(500);
    });
  });
});
