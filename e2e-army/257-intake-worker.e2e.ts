import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

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

test(
  '@issue-391 (closes #257, #142) AC1: API process has no tesseract.js or pdf-parse in require cache before and after invoice upload',
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
    form.append('file', pdfFixture('army-391-cache-isolation'), 'inv.pdf');
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
  '@issue-391 (closes #257, #142) AC2: intake endpoint rejects unauthenticated or empty uploads',
  { tags: ['feat:mz-document-intake', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));

    const unauthForm = new FormData();
    unauthForm.append('file', pdfFixture('army-391-anon'), 'inv.pdf');
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
  },
);
