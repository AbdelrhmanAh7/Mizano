import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// The auth error contract: validation rejections return
// { code: 'VALIDATION_ERROR', message: 'Validation Failed', details: { ... } },
// and unauthorized requests return a 401 with error: 'Unauthorized'.
const WEAK = {
  email: 'army-280-weak@army-e2e.test',
  password: 'alllowercase1',
  firstName: 'Army',
  lastName: 'Weak',
  organizationName: 'Army 280 Weak Org',
};

// Outbound fetch calls timeout after 15s to prevent hanging on unresponsive sockets.
const REQUEST_TIMEOUT_MS = 15_000;
// Shared auth rate-limit window wait (5 attempts / minute per IP).
const RATE_WAIT_MS = 85_000;
// Test timeout raised to 120s to allow rate-limit backoff (up to 85s) plus request execution headroom.
const TEST_TIMEOUT_MS = 120_000;

interface Res {
  status: number;
  body: Record<string, unknown>;
}

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).toString()).replace(/\/+$/, '');
}

async function send(url: string, init: RequestInit): Promise<Res> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* non-JSON body: leave empty, status assertion reports it */
  }
  return { status: res.status, body };
}

/** One request; the 5-per-minute auth limit is shared with the suite, so 429 is waited out. */
async function call(url: string, init: RequestInit): Promise<Res> {
  let res = await send(url, init);
  if (res.status === 429) {
    await expect
      .poll(async () => (res = await send(url, init)).status, {
        timeout: RATE_WAIT_MS,
        interval: 5_000,
      })
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
  '@issue-280 AC1 AC3: weak registration password returns 400 VALIDATION_ERROR with Validation Failed and uppercase rule in details',
  { tags: ['feat:mz-auth', 'lvl:api'], timeout: TEST_TIMEOUT_MS },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));

    const weak = await call(`${api}/auth/register`, json(WEAK));
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('VALIDATION_ERROR');
    expect(weak.body.message).toBe('Validation Failed');
    expect(JSON.stringify(weak.body.details)).toMatch(/uppercase/i);
    expect(JSON.stringify(weak.body)).not.toMatch(/passwordHash/i);

    // Invalid case: malformed email names the email rule instead.
    const badMail = await call(
      `${api}/auth/register`,
      json({ ...WEAK, email: 'not-an-email', password: 'Army280Strong9' }),
    );
    expect(badMail.status).toBe(400);
    expect(badMail.body.code).toBe('VALIDATION_ERROR');
    expect(badMail.body.message).toBe('Validation Failed');
    expect(JSON.stringify(badMail.body.details)).toMatch(/email/i);
    expect(JSON.stringify(badMail.body.details)).not.toMatch(/uppercase/i);
  },
);

test(
  '@issue-280 AC2 AC4: protected auth route rejects missing or forged bearer token with 401 Unauthorized',
  { tags: ['feat:mz-auth', 'lvl:api'], timeout: TEST_TIMEOUT_MS },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));

    const forged = await call(`${api}/auth/logout`, {
      method: 'POST',
      headers: { accept: 'application/json', authorization: 'Bearer army-280.not-a.jwt' },
    });
    expect(forged.status).toBe(401);
    expect(forged.body.error).toBe('Unauthorized');

    const missing = await call(`${api}/auth/logout`, {
      method: 'POST',
      headers: { accept: 'application/json' },
    });
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBe('Unauthorized');

    const invalidCreds = await call(
      `${api}/auth/login`,
      json({ email: 'army-280-nonexistent@army-e2e.test', password: 'WrongPassword123' }),
    );
    expect(invalidCreds.status).toBe(401);
    expect(invalidCreds.body.error).toBe('Unauthorized');
  },
);
