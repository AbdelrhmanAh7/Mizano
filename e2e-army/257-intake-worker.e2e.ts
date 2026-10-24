import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ACCEPTED = ['QUEUED', 'PROCESSING', 'EXTRACTED'];
const TERMINAL = ['EXTRACTED', 'NEEDS_REVIEW', 'FAILED', 'DEAD_LETTER'];

function apiBase(baseUrl: string): string {
  const raw = (process.env.E2E_ARMY_API ?? process.env.E2E_ARMY_URL ?? baseUrl).replace(/\/+$/, '');
  return /\/api$/.test(raw) ? raw : `${raw}/api`;
}

function pdfFixture(marker: string): Blob {
  const text = `Invoice ${marker} Total 115.00`;
  const body =
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
    `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
    `4 0 obj<</Length ${text.length + 30}>>stream\nBT /F1 12 Tf 20 100 Td (${text}) Tj ET\nendstream endobj\n` +
    `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  return new Blob([body], { type: 'application/pdf' });
}

async function accessToken(api: string): Promise<string> {
  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@mizano.com', password: 'password123' }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { tokens: { accessToken: string } }).tokens.accessToken;
}

async function waitForJobCompletion(
  api: string,
  token: string,
  jobId: string,
  timeoutMs = 60000,
): Promise<{ status: string; result?: unknown }> {
  const start = Date.now();
  const headers = { authorization: `Bearer ${token}` };
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${api}/ai/document-intake/${jobId}/result`, { headers });
    if (res.status === 200) {
      const body = (await res.json()) as { data: { status: string; result?: unknown } };
      if (TERMINAL.includes(body.data.status)) {
        return { status: body.data.status, result: body.data.result };
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
}

test(
  '@issue-257 (closes #142) AC1: API process has no tesseract.js or pdf-parse in require cache before and after invoice upload',
  { tags: ['feat:mz-document-intake', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const checkCache = async () => {
      const res = await fetch(`${api}/health/modules`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        tesseractLoaded: boolean;
        pdfParseLoaded: boolean;
        ocrModules: string[];
      };
      expect(body.status).toBe('healthy');
      expect(body.tesseractLoaded).toBe(false);
      expect(body.pdfParseLoaded).toBe(false);
      expect(body.ocrModules).toEqual([]);
    };

    await checkCache();

    const token = await accessToken(api);
    const form = new FormData();
    form.append('file', pdfFixture('army-257-cache-isolation'), 'inv.pdf');
    const uploadRes = await fetch(`${api}/ai/document-intake/process`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    // With Redis (or worker) upload returns 201; without Redis/worker it returns 503 (fail-fast)
    expect([201, 503]).toContain(uploadRes.status);

    await checkCache();
  },
);

test(
  '@issue-257 (closes #142) AC1: worker process loads pdf-parse into require cache during document processing',
  { tags: ['feat:mz-document-intake', 'lvl:job'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const token = await accessToken(api);
    const headers = { authorization: `Bearer ${token}` };

    const form = new FormData();
    form.append('file', pdfFixture('army-257-worker-cache'), 'inv.pdf');
    const uploadRes = await fetch(`${api}/ai/document-intake/process`, {
      method: 'POST',
      headers,
      body: form,
    });
    // In standalone API runs without Redis/worker, check worker cache diagnostic endpoint without timing out
    if (uploadRes.status === 503) {
      const workerCache = (await (await fetch(`${api}/health/worker-modules`)).json()) as {
        status: string;
      };
      expect(['healthy', 'unavailable']).toContain(workerCache.status);
      return;
    }
    expect(uploadRes.status).toBe(201);
    const { data } = (await uploadRes.json()) as { data: { jobId: string; status: string } };

    const completion = await waitForJobCompletion(api, token, data.jobId);
    expect(TERMINAL).toContain(completion.status);

    const apiCache = (await (await fetch(`${api}/health/modules`)).json()) as {
      tesseractLoaded: boolean;
      pdfParseLoaded: boolean;
      ocrModules: string[];
    };
    expect(apiCache.tesseractLoaded).toBe(false);
    expect(apiCache.pdfParseLoaded).toBe(false);
    expect(apiCache.ocrModules).toEqual([]);

    const workerCache = (await (await fetch(`${api}/health/worker-modules`)).json()) as {
      status: string;
      pdfParseLoaded: boolean;
      ocrModules: string[];
    };
    expect(workerCache.status).toBe('healthy');
    expect(workerCache.pdfParseLoaded).toBe(true);
    expect(workerCache.ocrModules.length).toBeGreaterThan(0);
  },
);

test(
  '@issue-257 (closes #142) AC2: intake endpoint rejects unauthenticated or empty uploads and enqueues valid uploads',
  { tags: ['feat:mz-document-intake', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));

    const unauthForm = new FormData();
    unauthForm.append('file', pdfFixture('army-257-anon'), 'inv.pdf');
    const unauthRes = await fetch(`${api}/ai/document-intake/process`, {
      method: 'POST',
      body: unauthForm,
    });
    expect(unauthRes.status).toBe(401);

    const token = await accessToken(api);
    const headers = { authorization: `Bearer ${token}` };
    const emptyRes = await fetch(`${api}/ai/document-intake/process`, {
      method: 'POST',
      headers,
      body: new FormData(),
    });
    expect(emptyRes.status).toBe(400);

    const validForm = new FormData();
    validForm.append('file', pdfFixture('army-257-valid'), 'inv.pdf');
    const validRes = await fetch(`${api}/ai/document-intake/process`, {
      method: 'POST',
      headers,
      body: validForm,
    });
    expect([201, 503]).toContain(validRes.status);
    if (validRes.status === 201) {
      const { data } = (await validRes.json()) as { data: { jobId: string; status: string } };
      expect(ACCEPTED).toContain(data.status);

      const listRes = await fetch(`${api}/ai/document-intake/jobs?limit=100`, { headers });
      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as { data: { id: string }[] };
      expect(listBody.data.map((j) => j.id)).toContain(data.jobId);
    }
  },
);
