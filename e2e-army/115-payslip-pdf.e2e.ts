import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Request-level checks of the payslip PDF endpoint (no model calls).
const PDF_PATH = '/api/payslips/army-115-missing/pdf';

async function loginToken(baseUrl: string): Promise<string> {
  const res = await fetch(new URL('/api/auth/login', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@mizano.com', password: 'password123' }),
  });
  expect(res.status).toBeLessThan(300);
  const body = (await res.json()) as { accessToken?: string; data?: { accessToken?: string } };
  const token = body.accessToken ?? body.data?.accessToken;
  expect(token).toBeTruthy();
  return token as string;
}

test(
  '@issue-115 AC1: an unauthenticated payslip PDF request is rejected with 401',
  { tags: ['feat:mz-payroll', 'lvl:api'] },
  async ({ app }) => {
    const res = await fetch(new URL(PDF_PATH, app.baseUrl));
    expect(res.status).toBe(401);
  },
);

test(
  '@issue-115 AC2: lang=ar and lang=en are accepted, an unsupported lang returns 400',
  { tags: ['feat:mz-payroll', 'lvl:api'] },
  async ({ app }) => {
    const token = await loginToken(app.baseUrl);
    const headers = { authorization: `Bearer ${token}` };

    const bad = await fetch(new URL(`${PDF_PATH}?lang=fr`, app.baseUrl), { headers });
    expect(bad.status).toBe(400);

    // Valid languages pass validation and reach the lookup, so an unknown id is a 404 (not 400).
    for (const lang of ['ar', 'en']) {
      const res = await fetch(new URL(`${PDF_PATH}?lang=${lang}`, app.baseUrl), { headers });
      expect(res.status).toBe(404);
    }
  },
);

test(
  '@issue-115 AC5: an unknown payslip id returns 404 and no PDF body',
  { tags: ['feat:mz-payroll', 'lvl:api'] },
  async ({ app }) => {
    const token = await loginToken(app.baseUrl);
    const res = await fetch(new URL(PDF_PATH, app.baseUrl), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type') ?? '').not.toContain('application/pdf');
  },
);
