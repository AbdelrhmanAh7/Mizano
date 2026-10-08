import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Issue #132: login throttling counts each client by X-Forwarded-For, and the NextAuth session JSON carries no refresh token.
// Request-level (no model). The client addresses come from the documentation ranges (RFC 5737), so they never share a
// throttle bucket with the hub suite's own logins, which arrive without X-Forwarded-For.
const WEB = (app: { baseUrl?: string }) =>
  String(process.env.E2E_ARMY_URL ?? app.baseUrl ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
const API = (app: { baseUrl?: string }) =>
  String(process.env.E2E_ARMY_API ?? `${WEB(app)}/api`).replace(/\/+$/, '');
const ADMIN = { email: 'admin@mizano.com', password: 'password123' } as const;
const LOGIN_LIMIT = 5;

function failedLogin(app: { baseUrl?: string }, forwardedFor: string): Promise<Response> {
  return fetch(`${API(app)}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': forwardedFor },
    body: JSON.stringify({
      email: 'army-throttle-132@army-e2e.test',
      password: 'not-the-password-1',
    }),
  });
}

test(
  '@issue-132 AC2: one client exceeding the login limit does not lock other clients out',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app }) => {
    const attacker = '203.0.113.132';
    // A re-run inside the same minute may already find the attacker limited; either way the last attempt must be refused with 429.
    let last = 0;
    for (let attempt = 0; attempt <= LOGIN_LIMIT; attempt += 1) {
      last = (await failedLogin(app, attacker)).status;
      expect([401, 429]).toContain(last);
    }
    expect(last).toBe(429);

    // Another browser behind the same proxy still gets an answer on its credentials, not the attacker's lockout.
    expect((await failedLogin(app, '198.51.100.132')).status).toBe(401);
    // A client-supplied prefix does not escape the limit: the proxy-appended (right-most) address is counted.
    expect((await failedLogin(app, `10.13.2.1, ${attacker}`)).status).toBe(429);
  },
);

test(
  '@issue-132 AC3: /api/auth/session after sign-in has the access token but no refreshToken',
  { tags: ['feat:mz-auth', 'lvl:api'] },
  async ({ app }) => {
    const web = WEB(app);
    const jar = new Map<string, string>();
    const take = (res: Response) => {
      for (const c of res.headers.getSetCookie()) {
        const pair = c.split(';')[0];
        const i = pair.indexOf('=');
        if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
      }
    };
    const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const client = { 'x-forwarded-for': '192.0.2.132' };

    const csrfRes = await fetch(`${web}/api/auth/csrf`, { headers: client });
    expect(csrfRes.status).toBe(200);
    take(csrfRes);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

    const signIn = await fetch(`${web}/api/auth/callback/credentials`, {
      method: 'POST',
      redirect: 'manual',
      headers: { ...client, 'content-type': 'application/x-www-form-urlencoded', cookie: cookie() },
      body: new URLSearchParams({
        csrfToken,
        email: ADMIN.email,
        password: ADMIN.password,
        callbackUrl: `${web}/en/dashboard`,
        json: 'true',
      }),
    });
    take(signIn);
    expect([...jar.keys()].some((k) => /next-auth\.session-token/.test(k))).toBe(true);

    const sessionRes = await fetch(`${web}/api/auth/session`, {
      headers: { ...client, cookie: cookie() },
    });
    expect(sessionRes.status).toBe(200);
    const text = await sessionRes.text();
    const session = JSON.parse(text) as { user?: { email?: string }; accessToken?: string };
    expect(session.user?.email).toBe(ADMIN.email);
    expect(session.accessToken).toMatch(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(text).not.toMatch(/refreshToken/i);

    // Signed out (no cookie): the session endpoint returns no user and no tokens at all.
    const anon = await fetch(`${web}/api/auth/session`, { headers: client });
    expect(anon.status).toBe(200);
    expect(await anon.text()).not.toMatch(/accessToken|refreshToken/i);
  },
);
