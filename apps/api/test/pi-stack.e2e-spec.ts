/**
 * Pi 5 compose profile (issue #39): the HTTP surface the stack's health gates, start order
 * and reboot recovery rely on, driven through the real AppModule against the throwaway e2e
 * database. The acceptance items themselves (24 h soak, reboot) run on the Pi; these tests
 * pin the API behaviour they depend on:
 *
 *  - AC1 (24 h under the demo workload): the workload reaches the api over the readiness
 *    route that `docker-compose.pi.yml`, `healthcheck.sh` and the web probe hit, and uploads
 *    are still processed in-process on non-Pi deploys (INTAKE_WORKER_ENABLED unset).
 *  - AC2 (reboot recovers all services): readiness answers 503 until the database answers,
 *    so compose keeps web/cloudflared waiting on the api after a reboot, and concurrent probes
 *    from the api, web and the healthcheck timer do not report a healthy api as down.
 */
import { INestApplication } from '@nestjs/common';
import { IntakeJobStatus } from '@prisma/client';
import { readFileSync } from 'fs';
import { parse } from 'yaml';
import * as path from 'path';
import { ExtractionStrategyResolver } from '../src/modules/ai/extraction/extraction-strategy-resolver.service';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { eventually } from './helpers/journey.helper';
import { registerTenant } from './helpers/tenant.helper';

const COMPOSE = path.resolve(__dirname, '../../../deploy/pi/docker-compose.pi.yml');

interface ComposeFile {
  services: Record<string, { healthcheck?: { test: string[] } }>;
}

/** The URL path a compose `CMD wget --spider <url>` probe requests, without the `/api` prefix. */
function probedPath(service: string): string {
  const compose = parse(readFileSync(COMPOSE, 'utf8')) as ComposeFile;
  const test = compose.services[service]?.healthcheck?.test ?? [];
  const url = test.find((arg) => arg.startsWith('http://'));
  if (!url) throw new Error(`${service} has no http health probe in ${COMPOSE}`);
  return new URL(url).pathname.replace(/^\/api/, '');
}

const stubResolver = {
  resolve: async () => ({
    strategyUsed: 'ocr',
    totalTimeMs: 1,
    extraction: {
      vendorName: 'Pi Vendor',
      vendorAddress: null,
      vendorPhone: null,
      vendorEmail: null,
      vendorTaxId: null,
      invoiceNumber: 'PI-1',
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

async function bootWithStub(): Promise<INestApplication> {
  return createTestApp((builder) =>
    builder.overrideProvider(ExtractionStrategyResolver).useValue(stubResolver),
  );
}

/** Uploads one document and waits for the process that booted `app` to extract it. */
async function uploadIsExtracted(app: INestApplication): Promise<void> {
  const prisma = getPrisma(app);
  const tenant = await registerTenant(app, 'Pi');
  const marker = uniqueSuffix();
  const res = await tenant.api
    .post('/ai/document-intake/process')
    .attach('file', pdfFixture(marker), {
      filename: `${marker}.pdf`,
      contentType: 'application/pdf',
    });
  expect(res.status).toBe(201);
  const jobId = res.body.data.id as string;
  await eventually(async () => {
    const job = await prisma.intakeJob.findFirst({
      where: { id: jobId, organizationId: tenant.organizationId },
    });
    expect(job?.status).toBe(IntakeJobStatus.EXTRACTED);
  }, 20000);
}

describe('Pi stack health gates (e2e)', () => {
  let app: INestApplication;
  let anon: ApiHelper;
  let readyPath: string;

  const originalRedis = process.env.REDIS_URL;

  beforeAll(async () => {
    // Like a deploy without Redis: readiness depends on the database only.
    process.env.REDIS_URL = '';
    app = await createTestApp();
    anon = ApiHelper.anonymous(app);
    readyPath = probedPath('api');
  });

  afterAll(async () => {
    await app.close();
    if (originalRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedis;
  });

  test('@e2e @flow:pi-stack @issue-39 AC1: the readiness route the compose api probe hits answers 200 ready while the database answers', async () => {
    expect(readyPath).toBe('/health/ready');
    const res = await anon.get(readyPath);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ready: true, services: { database: 'connected' } });
  });

  test('@e2e @flow:pi-stack @issue-39 AC2: readiness answers 503 while the database is unreachable, so start order and reboot recovery wait for Postgres', async () => {
    const prisma = getPrisma(app);
    const query = jest
      .spyOn(prisma, '$queryRaw')
      .mockRejectedValue(new Error("Can't reach database server at `postgres:5432`"));
    try {
      const res = await anon.get(readyPath);
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ ready: false, services: { database: 'disconnected' } });
      // The failure message names the service, never the connection details.
      expect(res.text).not.toContain('postgres:5432');
    } finally {
      query.mockRestore();
    }
    expect((await anon.get(readyPath)).status).toBe(200);
  });

  test('@e2e @flow:pi-stack @issue-39 AC2: concurrent readiness probes (api, web and healthcheck.sh) all answer 200 on a healthy api', async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => anon.get(readyPath).then((res) => res.status)),
    );
    expect(results).toEqual(Array(25).fill(200));
  });

  test('@e2e @flow:pi-stack @issue-39 AC2: readiness answers 503 while the configured Redis is unreachable, so the api is not declared healthy before Redis', async () => {
    // Nothing listens on port 1: the real Redis client cannot connect.
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
    const withRedis = await createTestApp();
    try {
      const res = await ApiHelper.anonymous(withRedis).get(readyPath);
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({
        ready: false,
        services: { database: 'connected', redis: 'disconnected' },
      });
      expect(res.text).not.toContain('127.0.0.1:1');
    } finally {
      await withRedis.close();
      process.env.REDIS_URL = '';
    }
  });

  test('@e2e @flow:pi-stack @issue-39 AC2: the api liveness route stays 200 independently of its dependencies', async () => {
    const prisma = getPrisma(app);
    const query = jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('down'));
    try {
      const res = await anon.get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body.alive).toBe(true);
    } finally {
      query.mockRestore();
    }
  });
});

describe('Pi stack intake consumption (e2e)', () => {
  const originalFlag = process.env.INTAKE_WORKER_ENABLED;
  const originalRedis = process.env.REDIS_URL;

  beforeAll(() => {
    // Same shape as a bare deploy: no Redis, so the api itself runs extraction. An empty
    // value (not a deleted key) keeps the api's .env.local from putting its REDIS_URL back.
    process.env.REDIS_URL = '';
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env.INTAKE_WORKER_ENABLED;
    else process.env.INTAKE_WORKER_ENABLED = originalFlag;
    if (originalRedis === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedis;
  });

  test('@e2e @flow:pi-stack @issue-39 AC1: with INTAKE_WORKER_ENABLED unset (every non-Pi deploy) the api still extracts uploads in-process', async () => {
    delete process.env.INTAKE_WORKER_ENABLED;
    const app = await bootWithStub();
    try {
      await uploadIsExtracted(app);
    } finally {
      await app.close();
    }
  });

  test('@e2e @flow:pi-stack @issue-39 AC1: INTAKE_WORKER_ENABLED=false without Redis is ignored, so no upload can be left unprocessed', async () => {
    process.env.INTAKE_WORKER_ENABLED = 'false';
    const app = await bootWithStub();
    try {
      await uploadIsExtracted(app);
    } finally {
      await app.close();
    }
  });

  test('@e2e @flow:pi-stack @issue-39 AC1: an invalid INTAKE_WORKER_ENABLED value keeps in-process extraction on', async () => {
    process.env.INTAKE_WORKER_ENABLED = 'off';
    const app = await bootWithStub();
    try {
      await uploadIsExtracted(app);
    } finally {
      await app.close();
    }
  });
});
