// @issue-108 Cross-tenant isolation of the cursor-paginated ledger and invoice lists.
// On the verify stack the seeded demo organization (admin@mizano.com) is the other tenant: a freshly
// registered tenant must get 404, and no rows, when it passes the demo tenant's real invoice, bill or
// journal id as cursor. The own-rows side is covered by apps/api/test/tenant-isolation.e2e-spec.ts. lvl:api.
import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { createHash } from 'node:crypto';

const base = (
  process.env.E2E_ARMY_API ??
  process.env.E2E_ARMY_URL ??
  'http://127.0.0.1:3000'
).replace(/\/+$/, '');
const seed = process.env.E2E_ARMY_SEED ?? 'nql-e2e-army-1';
const seededEmail = (name: string) =>
  `${name}-${createHash('sha1').update(`${seed}:${name}`).digest('hex').slice(0, 8)}@army-108.test`;

async function raw(method: string, path: string, token: string | null, body?: unknown) {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep the raw text */
  }
  return { status: res.status, body: parsed as Record<string, any> };
}

/** Fresh organization + admin user, registered then logged in through the public auth API. */
async function tenantToken(): Promise<string> {
  const email = seededEmail('mz-cursor-isolation');
  const password = 'ArmyE2e2026x';
  const payload = {
    email,
    password,
    firstName: 'Army',
    lastName: 'Cursor',
    organizationName: 'Army Cursor Co',
  };
  let res = await raw('POST', '/auth/register', null, payload);
  if (res.status === 429) {
    // AuthController is throttled even on the verify stack: poll for a free slot, never blind-retry.
    await expect
      .poll(async () => (res = await raw('POST', '/auth/register', null, payload)).status, {
        timeout: 85_000,
        interval: 5_000,
        message: 'register stayed rate limited',
      })
      .not.toBe(429);
  }
  if (res.status === 409) {
    // Deterministic account from a previous run of the same stack.
    res = await raw('POST', '/auth/login', null, { email, password });
  }
  if (res.status !== 201 && res.status !== 200)
    throw new Error(`register/login answered ${res.status}`);
  return res.body.tokens.accessToken as string;
}

/** The seeded demo admin's organization is the "other tenant" on the single-tenant verify stack. */
async function demoToken(): Promise<string> {
  const res = await raw('POST', '/auth/login', null, {
    email: 'admin@mizano.com',
    password: 'password123',
  });
  if (res.status !== 200 && res.status !== 201)
    throw new Error(`demo login answered ${res.status}`);
  return res.body.tokens.accessToken as string;
}

// One login each per process, keeping auth calls inside the 5/60s throttle budget.
let tokenPromise: Promise<string> | null = null;
let demoPromise: Promise<string> | null = null;
const token = () => (tokenPromise ??= tenantToken());
const demo = () => (demoPromise ??= demoToken());

const PATHS = ['/invoices/cursor', '/bills/cursor', '/journals/cursor'] as const;

/** Real row ids of the demo organization's seeded invoices, bills and journals (never empty). */
async function demoIds(path: string): Promise<string[]> {
  const res = await raw('GET', path, await demo());
  expect({ path, status: res.status }).toEqual({ path, status: 200 });
  const ids = (res.body.data as Array<{ id: string }>).map((r) => r.id);
  expect({ path, seeded: ids.length > 0 }).toEqual({ path, seeded: true });
  return ids;
}

test(
  "@issue-108 AC2/T4: another tenant's real id as cursor is rejected on the invoice, bill and journal cursor lists",
  { tags: ['feat:mz-sales-invoices', 'feat:mz-purchase-bills', 'feat:mz-journals', 'lvl:api'] },
  async () => {
    const t = await token();
    for (const path of PATHS) {
      const [foreign] = await demoIds(path);
      const res = await raw('GET', `${path}?cursor=${encodeURIComponent(foreign)}`, t);
      expect({ path, status: res.status }).toEqual({ path, status: 404 });
      expect({ path, rows: res.body.data }).toEqual({ path, rows: undefined });
    }
  },
);
