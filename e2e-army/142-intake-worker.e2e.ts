// Request-level checks for #142: the API only accepts and enqueues intake uploads; extraction (OCR/PDF) runs in the worker.
// Demo admin of the throwaway verify DB (public seed credentials, no real data). No model calls, no sleeps.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const ACCEPTED = ['QUEUED', 'PROCESSING', 'EXTRACTED'];

function pdfFixture(marker: string): Blob {
  const text = `Invoice ${marker} Total 115.00`;
  const body =
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
    `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
    `4 0 obj<</Length ${text.length + 30}>>stream\nBT /F1 12 Tf 20 100 Td (${text}) Tj ET\nendstream endobj\n` +
    `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  return new Blob([body], { type: 'application/pdf' });
}

async function accessToken(app: { baseUrl: string }): Promise<string> {
  const res = await fetch(new URL('/api/auth/login', app.baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@mizano.com', password: 'password123' }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { tokens: { accessToken: string } }).tokens.accessToken;
}

test(
  '@issue-142 AC1: an upload without a session is rejected before any job exists',
  { tags: ['feat:mz-document-intake'] },
  async ({ app }) => {
    const form = new FormData();
    form.append('file', pdfFixture('army-142-anon'), 'inv.pdf');
    const res = await fetch(new URL('/api/ai/document-intake/process', app.baseUrl), {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(401);
  },
);

test(
  '@issue-142 AC2: the API accepts an upload, returns a job at once and lists it for the organization',
  { tags: ['feat:mz-document-intake', 'feat:mz-intake-processor'] },
  async ({ app }) => {
    const token = await accessToken(app);
    const headers = { authorization: `Bearer ${token}` };

    const form = new FormData();
    form.append('file', pdfFixture('army-142-worker'), 'inv.pdf');
    const res = await fetch(new URL('/api/ai/document-intake/process', app.baseUrl), {
      method: 'POST',
      headers,
      body: form,
    });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { jobId: string; status: string } };
    expect(typeof data.jobId).toBe('string');
    expect(ACCEPTED).toContain(data.status);

    const list = await fetch(new URL('/api/ai/document-intake/jobs?limit=100', app.baseUrl), {
      headers,
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { data: { id: string }[] };
    expect(body.data.map((j) => j.id)).toContain(data.jobId);
  },
);

test(
  '@issue-142 AC2: an upload with no file is a 400, not a queued job',
  { tags: ['feat:mz-document-intake'] },
  async ({ app }) => {
    const token = await accessToken(app);
    const res = await fetch(new URL('/api/ai/document-intake/process', app.baseUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: new FormData(),
    });
    expect(res.status).toBe(400);
  },
);

test(
  '@issue-142 AC3: AI insights displays worker configuration with container and entrypoint',
  { tags: ['feat:mz-document-intake', 'feat:mz-intake-processor'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open('/en/ai-insights');
    await expect(screen.getByRole('button', { name: 'Worker Configuration' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'View Jobs' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Start Worker' })).toBeVisible();
    await agent.act('click button with name {name}', { params: { name: 'Worker Configuration' } });
    await expect(screen.getByText('Worker Container')).toBeVisible();
    await expect(screen.getByText('API Image')).toBeVisible();
    await expect(screen.getByText('Worker Entrypoint')).toBeVisible();
  },
);

test(
  '@issue-142 AC4: bill scan page provides accessible upload document input and process button',
  { tags: ['feat:mz-document-intake'] },
  async ({ app, agent, screen }) => {
    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', {
      params: { email: 'admin@mizano.com', pw: 'password123' },
    });
    await app.open('/en/purchases/bills/scan');
    await expect(screen.getByLabel('Upload document')).toBeAttached();
    await expect(screen.getByRole('button', { name: 'Upload' })).toBeVisible();
    await expect(screen.getByRole('button', { name: 'Process' })).toBeVisible();
  },
);
