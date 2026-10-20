// Issue #104, AC3: the SMTP password rotation stamp is written server-side only. The settings
// flow has no email/SMTP page in the UI, so this is a request-level test against the real API
// (no model call): changing the SMTP password is accepted without echoing it, and a client can
// never supply `smtpPasswordRotatedAt` itself (the validation pipe rejects unknown fields).
// Fail closed: the test overwrites the seeded admin organization's SMTP settings, so it only runs
// against a local API or a target explicitly marked disposable with E2E_ARMY_DISPOSABLE=1.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

const PASSWORD_ROTATED = 'army-smtp-rotation-1';
const PASSWORD_NEW = 'army-smtp-rotation-2';

/** Mizano's Nest API is on its own origin (`E2E_ARMY_API` ends in `/api`); fall back to the app origin. */
function apiBase(app: { baseUrl: string }): string {
  const raw = process.env.E2E_ARMY_API ?? process.env.E2E_ARMY_URL ?? app.baseUrl;
  return /\/api$/.test(raw) ? raw : `${raw.replace(/\/+$/, '')}/api`;
}

/** True for a local API, or when the operator declared the target throwaway. */
function isDisposable(base: string): boolean {
  if (process.env.E2E_ARMY_DISPOSABLE === '1') return true;
  return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname);
}

test(
  '@issue-104 AC3: the SMTP password rotation stamp is set server-side only',
  { tags: ['feat:mz-settings-organization', 'lvl:api'] },
  async ({ app }) => {
    const base = apiBase(app);
    test.skip(
      !isDisposable(base),
      'refusing to change SMTP settings on a non-disposable target (set E2E_ARMY_DISPOSABLE=1 for a throwaway stack)',
    );

    // Sign in as the seeded demo admin (throwaway DB) to get a bearer token.
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@mizano.com', password: 'password123' }),
    });
    expect(login.status).toBe(200);
    const auth = {
      authorization: `Bearer ${(await login.json()).tokens.accessToken}`,
      'content-type': 'application/json',
    };

    // Remember the readable (non-secret) SMTP fields so they can be put back afterwards. The
    // password is write-only in the API and cannot be read or restored, hence the disposable guard.
    const before =
      (await (await fetch(`${base}/organization/settings`, { headers: auth })).json()).email ?? {};
    const restore = Object.fromEntries(
      ['smtpHost', 'smtpPort', 'smtpUser', 'smtpFromEmail', 'smtpFromName']
        .filter((k) => before[k] != null)
        .map((k) => [k, before[k]]),
    );

    try {
      // Changing the SMTP password is accepted, and the password is never echoed back.
      const updated = await fetch(`${base}/organization/settings/email`, {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({
          smtpHost: 'smtp.army-e2e.test',
          smtpUser: 'army-smtp-user',
          smtpPassword: PASSWORD_ROTATED,
        }),
      });
      expect(updated.status).toBe(200);
      expect(JSON.stringify(await updated.json())).not.toContain(PASSWORD_ROTATED);

      // A client cannot supply the rotation stamp: the unknown field is rejected.
      const forged = await fetch(`${base}/organization/settings/email`, {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ smtpPassword: PASSWORD_NEW, smtpPasswordRotatedAt: '2030-01-01' }),
      });
      expect(forged.status).toBe(400);
    } finally {
      await fetch(`${base}/organization/settings/email`, {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify(restore),
      });
    }
  },
);
