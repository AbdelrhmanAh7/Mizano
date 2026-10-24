import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

function apiBase(baseUrl: string): string {
  const raw = process.env.E2E_ARMY_API ?? process.env.E2E_ARMY_URL ?? baseUrl;
  return /\/api$/.test(raw) ? raw : `${raw.replace(/\/+$/, '')}/api`;
}

test(
  '@pr-58 AC3: generate telegram link code returns 6-digit code with /link command',
  { tags: ['feat:mz-settings-organization', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));

    // Sign in as seeded demo admin to get a bearer token
    const login = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@mizano.com', password: 'password123' }),
    });
    expect(login.status).toBe(200);
    const auth = {
      authorization: `Bearer ${(await login.json()).tokens.accessToken}`,
      'content-type': 'application/json',
    };

    // Generate link code
    const res = await fetch(`${api}/telegram/link-code`, {
      method: 'POST',
      headers: auth,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(typeof body.data.code).toBe('string');
    expect(body.data.code.length).toBe(6);
    expect(body.data.command).toBe(`/link ${body.data.code}`);
    expect(new Date(body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // List links (initially empty or array of linked chats)
    const listRes = await fetch(`${api}/telegram/links`, {
      method: 'GET',
      headers: auth,
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(Array.isArray(listBody.data)).toBe(true);
  },
);
