import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Issue #259: customer form payload, verify check flow, notes and nested address mapping.
const SEED = `army-259-${process.env.E2E_ARMY_SEED ?? 'seed-1'}`;
const ADMIN = { email: 'admin@mizano.com', password: 'password123' };

type Res = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped JSON from the API under test

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? `${baseUrl.replace(/\/+$/, '')}/api`).replace(/\/+$/, '');
}

const REQUEST_TIMEOUT_MS = 90_000;

async function call(
  base: string,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<Res> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body: parsed };
}

async function adminToken(base: string): Promise<string> {
  let login: Res = { status: 0, body: null };
  await expect
    .poll(async () => (login = await call(base, 'POST', '/auth/login', undefined, ADMIN)).status, {
      timeout: 85_000,
      interval: 5_000,
    })
    .toBe(200);
  return login.body.tokens.accessToken as string;
}

const listRows = (r: Res): Array<Record<string, unknown>> =>
  Array.isArray(r.body) ? r.body : Array.isArray(r.body?.data) ? r.body.data : [];

/** The exact shape `buildCustomerPayload` in apps/web/components/sales/customer-form.tsx sends. */
function formPayload(name: string, street: string) {
  return {
    name,
    displayName: null,
    email: `${SEED}@example.com`,
    phone: '+201000000259',
    currency: 'EGP',
    taxId: null,
    paymentTerms: 30,
    notes: 'Prefers invoices by e-mail',
    billingAddress: { street, city: 'Cairo', state: null, postalCode: '11511', country: 'EG' },
    shippingAddress: {
      street: '9 Port Road',
      city: 'Alexandria',
      state: null,
      postalCode: '21500',
      country: 'EG',
    },
  };
}

test(
  '@issue-259 AC1 AC2 AC3 AC4: the form-shaped customer payload creates (201), lists, edits (200) with address and notes round-tripping, and can be invoiced',
  { tags: ['feat:mz-customers', 'feat:mz-sales-invoices', 'lvl:api'] },
  async ({ app }) => {
    const base = apiBase(String(app.baseUrl));
    const token = await adminToken(base);
    const name = `${SEED} Customer API`;

    // AC2: The old flat payload stays rejected by the whitelist pipe (proves contract).
    const legacy = await call(base, 'POST', '/customers', token, {
      name,
      billingStreet: '1 Nile St',
      notes: 'x',
    });
    expect(legacy.status).toBe(400);

    // AC1: Form payload with nested billingAddress/shippingAddress and notes returns 201.
    const created = await call(base, 'POST', '/customers', token, formPayload(name, '1 Nile St'));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name,
      notes: 'Prefers invoices by e-mail',
      billingStreet: '1 Nile St',
      billingCity: 'Cairo',
      shippingStreet: '9 Port Road',
      shippingCity: 'Alexandria',
    });
    const id = created.body.id as string;

    const list = await call(base, 'GET', `/customers?search=${encodeURIComponent(name)}`, token);
    expect(list.status).toBe(200);
    expect(listRows(list).map((c) => c.id)).toContain(id);

    // AC3: Patching customer with updated address and cleared notes succeeds (200).
    const updated = await call(base, 'PATCH', `/customers/${id}`, token, {
      ...formPayload(name, '2 Tahrir Sq'),
      notes: null,
    });
    expect(updated.status).toBe(200);
    const one = await call(base, 'GET', `/customers/${id}`, token);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({
      billingStreet: '2 Tahrir Sq',
      billingPostalCode: '11511',
      shippingStreet: '9 Port Road',
      shippingCountry: 'EG',
      notes: null,
    });

    // AC4: An invoice can be created referencing the new customer (201).
    const invoice = await call(base, 'POST', '/invoices', token, {
      customerId: id,
      date: '2026-03-10',
      dueDate: '2099-12-31',
      lines: [{ description: `${SEED} line`, quantity: '1', rate: '100' }],
    });
    expect(invoice.status).toBe(201);
    expect(invoice.body.customerId).toBe(id);
  },
);
