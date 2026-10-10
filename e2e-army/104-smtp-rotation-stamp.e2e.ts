// Issue #104, AC3: the SMTP password rotation stamp is written server-side only. The settings
// flow has no email/SMTP page in the UI, so this is a request-level test against the real API
// (no model call): changing the SMTP password is accepted without echoing it, and a client can
// never supply `smtpPasswordRotatedAt` itself (the validation pipe rejects unknown fields).
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const PASSWORD_ROTATED = "army-smtp-rotation-1";
const PASSWORD_NEW = "army-smtp-rotation-2";

/** Mizano's Nest API is on its own origin (`E2E_ARMY_API` ends in `/api`); fall back to the app origin. */
function apiBase(app: { baseUrl: string }): string {
  const raw = process.env.E2E_ARMY_API ?? process.env.E2E_ARMY_URL ?? app.baseUrl;
  return /\/api$/.test(raw) ? raw : `${raw.replace(/\/+$/, "")}/api`;
}

test("@issue-104 AC3: the SMTP password rotation stamp is set server-side only", { tags: ["feat:mz-settings-organization", "lvl:api"] }, async ({ app }) => {
  const base = apiBase(app);

  // Sign in as the seeded demo admin (throwaway DB) to get a bearer token.
  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@mizano.com", password: "password123" }),
  });
  expect(login.status).toBe(200);
  const auth = { authorization: `Bearer ${(await login.json()).tokens.accessToken}`, "content-type": "application/json" };

  // Changing the SMTP password is accepted, and the password is never echoed back.
  const updated = await fetch(`${base}/organization/settings/email`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ smtpHost: "smtp.army-e2e.test", smtpUser: "army-smtp-user", smtpPassword: PASSWORD_ROTATED }),
  });
  expect(updated.status).toBe(200);
  expect(JSON.stringify(await updated.json())).not.toContain(PASSWORD_ROTATED);

  // A client cannot supply the rotation stamp: the unknown field is rejected.
  const forged = await fetch(`${base}/organization/settings/email`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ smtpPassword: PASSWORD_NEW, smtpPasswordRotatedAt: "2030-01-01" }),
  });
  expect(forged.status).toBe(400);
});