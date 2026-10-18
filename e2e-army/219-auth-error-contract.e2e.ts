import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// The auth error contract the stable gate (mz-auth.3) relies on: a class-validator rejection is
// { code: 'VALIDATION_ERROR', message: 'Validation failed', details: { <Field>: [constraint texts] } },
// and a bad bearer token is a 401 with error 'Unauthorized'. Fixed seed data, no tenant is created.
const WEAK = {
  email: 'army-219-weak@army-e2e.test',
  password: 'alllowercase1',
  firstName: 'Army',
  lastName: 'Weak',
  organizationName: 'Army 219 Weak Org',
};

interface Res {
  status: number;
  body: Record<string, unknown>;
}

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

async function send(url: string, init: RequestInit): Promise<Res> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* non-JSON body: leave empty, the status assertion reports it */
  }
  return { status: res.status, body };
}

/** One request; the 5-per-minute auth limit is shared with the rest of the suite, so a 429 is waited out. */
async function call(url: string, init: RequestInit): Promise<Res> {
  let res = await send(url, init);
  if (res.status === 429) {
    await expect
      .poll(async () => (res = await send(url, init)).status, { timeout: 85_000, interval: 5_000 })
      .not.toBe(429);
  }
  return res;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify(body),
});

test(
  '@issue-219 AC1 AC3: a weak registration password is a VALIDATION_ERROR whose details name the uppercase rule',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));

    const weak = await call(`${api}/auth/register`, json(WEAK));
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('VALIDATION_ERROR');
    expect(weak.body.message).toBe('Validation failed');
    expect(JSON.stringify(weak.body.details)).toMatch(/uppercase/i);
    expect(JSON.stringify(weak.body)).not.toMatch(/passwordHash/i);

    // Invalid case: a strong password with a malformed email names the email rule instead.
    const badMail = await call(
      `${api}/auth/register`,
      json({ ...WEAK, email: 'not-an-email', password: 'Army219Strong9' }),
    );
    expect(badMail.status).toBe(400);
    expect(badMail.body.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(badMail.body.details)).toMatch(/email/i);
    expect(JSON.stringify(badMail.body.details)).not.toMatch(/uppercase/i);
  },
);

test(
  '@issue-219 AC2 AC4: a protected auth route refuses a missing or forged bearer token with 401 Unauthorized',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));

    const forged = await call(`${api}/auth/logout`, {
      method: 'POST',
      headers: { accept: 'application/json', authorization: 'Bearer army-219.not-a.jwt' },
    });
    expect(forged.status).toBe(401);
    expect(forged.body.error).toBe('Unauthorized');

    const missing = await call(`${api}/auth/logout`, {
      method: 'POST',
      headers: { accept: 'application/json' },
    });
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBe('Unauthorized');
  },
);
