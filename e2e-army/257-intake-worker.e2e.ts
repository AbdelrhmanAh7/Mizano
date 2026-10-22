import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ACCEPTED = ['QUEUED', 'PROCESSING', 'EXTRACTED'];

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
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

test(
  '@issue-257 AC1: API process has no tesseract.js or pdf-parse in require cache',
  { tags: ['feat:mz-document-intake', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
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
  },
);

test(
  '@issue-257 AC1: require cache remains free of tesseract.js and pdf-parse after invoice upload',
  { tags: ['feat:mz-document-intake', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const token = await accessToken(api);
    const headers = { authorization: `Bearer ${token}` };

    const form = new FormData();
    form.append('file', pdfFixture('army-257-cache-isolation'), 'inv.pdf');
    const uploadRes = await fetch(`${api}/ai/document-intake/process`, {
      method: 'POST',
      headers,
      body: form,
    });
    expect(uploadRes.status).toBe(201);

    const checkRes = await fetch(`${api}/health/modules`);
    expect(checkRes.status).toBe(200);
    const body = (await checkRes.json()) as {
      status: string;
      tesseractLoaded: boolean;
      pdfParseLoaded: boolean;
      ocrModules: string[];
    };
    expect(body.tesseractLoaded).toBe(false);
    expect(body.pdfParseLoaded).toBe(false);
    expect(body.ocrModules).toEqual([]);
  },
);

test(
  '@issue-257 AC2: an upload without a session is rejected before any job exists',
  { tags: ['feat:mz-document-intake', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const form = new FormData();
    form.append('file', pdfFixture('army-257-anon'), 'inv.pdf');
    const res = await fetch(`${api}/ai/document-intake/process`, { method: 'POST', body: form });
    expect(res.status).toBe(401);
  },
);

test(
  '@issue-257 AC2: the API accepts an upload, returns a job at once and lists it for the organization',
  { tags: ['feat:mz-document-intake', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const token = await accessToken(api);
    const headers = { authorization: `Bearer ${token}` };

    const form = new FormData();
    form.append('file', pdfFixture('army-257-worker'), 'inv.pdf');
    const res = await fetch(`${api}/ai/document-intake/process`, {
      method: 'POST',
      headers,
      body: form,
    });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { jobId: string; status: string } };
    expect(typeof data.jobId).toBe('string');
    expect(ACCEPTED).toContain(data.status);

    const list = await fetch(`${api}/ai/document-intake/jobs?limit=100`, { headers });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { data: { id: string }[] };
    expect(body.data.map((j) => j.id)).toContain(data.jobId);
  },
);

test(
  '@issue-257 AC2: an upload with no file is a 400, not a queued job',
  { tags: ['feat:mz-document-intake', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const token = await accessToken(api);
    const res = await fetch(`${api}/ai/document-intake/process`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: new FormData(),
    });
    expect(res.status).toBe(400);
  },
);
