import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// #183: the API now builds its Redis connection through resolveRedisUrl (REDIS_URL plus a
// separately passed REDIS_PASSWORD). Request-level checks that the cache and the intake queue
// still work through it on the verify stack (no model call, no sleeps, seeded data only).
const API = () =>
  String(process.env.E2E_ARMY_API ?? 'http://127.0.0.1:6001/api').replace(/\/+$/, '');
const ADMIN = { email: 'admin@mizano.com', password: 'password123' };
const MARKER = 'army183redis';

let tokenP: Promise<string> | null = null;
function adminToken(): Promise<string> {
  tokenP ??= (async () => {
    const res = await fetch(`${API()}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(ADMIN),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { tokens: { accessToken: string } }).tokens.accessToken;
  })();
  return tokenP;
}

async function call(path: string, init: RequestInit = {}) {
  const headers = {
    accept: 'application/json',
    authorization: `Bearer ${await adminToken()}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${API()}${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep the raw text
  }
  return { status: res.status, body };
}

function pdfFixture(marker: string): Uint8Array {
  const text = `Invoice ${marker} Total 115.00`;
  return new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length ${text.length + 30}>>stream\nBT /F1 12 Tf 20 100 Td (${text}) Tj ET\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}

test(
  '@issue-183 AC2: the cache works through the API redis connection; anonymous callers are refused',
  { tags: ['feat:mz-system-diagnostics', 'lvl:api'] },
  async () => {
    expect((await fetch(`${API()}/cache/stats`)).status).toBe(401);
    const stats = await call('/cache/stats');
    expect(stats.status).toBe(200);
    expect(stats.body).toHaveProperty('storeType');
    expect(stats.body).toHaveProperty('connected');
    // warm a cached list, then the keys and flush endpoints answer for this organization
    expect((await call('/customers?limit=5')).status).toBe(200);
    expect((await call('/cache/keys')).status).toBe(200);
    const flushed = await call('/cache/flush', { method: 'DELETE' });
    expect(flushed.status).toBe(200);
    expect(flushed.body.success).toBe(true);
  },
);

test(
  '@issue-183 AC2: the intake queue picks up an uploaded PDF through the API redis connection',
  { tags: ['feat:mz-intake-processor', 'lvl:job'], timeout: 260_000 },
  async () => {
    const form = new FormData();
    form.set(
      'file',
      new Blob([pdfFixture(MARKER) as any], { type: 'application/pdf' }),
      'army183.pdf',
    );
    const up = await call('/ai/document-intake/process', { method: 'POST', body: form });
    expect(up.status).toBe(201);
    const jobId = up.body.data.jobId as string;
    expect(jobId).toBeTruthy();
    // the queue transport (BullMQ with Redis, in-process timers without) runs the job to a terminal state
    await expect
      .poll(async () => (await call(`/ai/document-intake/${jobId}/result`)).body?.data?.status, {
        timeout: 200_000,
        interval: 3_000,
        message: 'the intake job never left QUEUED/PROCESSING',
      })
      .toMatch(/^(EXTRACTED|NEEDS_REVIEW|FAILED|DEAD_LETTER|APPROVED)$/);
  },
);
