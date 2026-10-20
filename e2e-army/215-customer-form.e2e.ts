import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Issue #215: the customer form posted flat address fields (billingStreet, ...) and the API
// refused them (400 "property billingStreet should not exist"), so no customer could be saved.
const SEED = `army-215-${process.env.E2E_ARMY_SEED ?? 'seed-1'}`;
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
    // Bound a stalled connection; longer than the 85 s login polling window, far below the 300 s test timeout.
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
    phone: '+201000000215',
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
  '@issue-215 AC1 AC2 AC4 AC5: the form-shaped customer payload creates (201), lists, edits (200) with the address and notes round-tripping, and can be invoiced',
  { tags: ['feat:mz-customers', 'feat:mz-sales-invoices', 'lvl:api'] },
  async ({ app }) => {
    const base = apiBase(String(app.baseUrl));
    const token = await adminToken(base);
    const name = `${SEED} Customer API`;

    // The old flat payload stays rejected by the whitelist (proves the contract the form must follow).
    const legacy = await call(base, 'POST', '/customers', token, {
      name,
      billingStreet: '1 Nile St',
      notes: 'x',
    });
    expect(legacy.status).toBe(400);

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

test(
  '@issue-215 AC1 AC2 AC3: a customer with phone, billing + shipping address and notes is saved through the form in /en and edited in /ar',
  { tags: ['feat:mz-customers', 'lvl:ui'], timeout: 300_000 },
  async ({ app, agent, browser }) => {
    const base = apiBase(String(app.baseUrl));
    const name = `${SEED} Customer UI`;

    await app.open('/en/login');
    await agent.act('sign in as {email} with password {pw}', { params: ADMIN });
    await app.open('/en/sales/customers/new');
    await agent.act(
      'fill the new customer form: name {name}, email {email}, phone {phone}, billing street address {street}, shipping street address {ship}, notes {notes}; then press the save / create button',
      {
        params: {
          name,
          email: `${SEED}-ui@example.com`,
          phone: '1000000215',
          street: '1 Nile St',
          ship: '9 Port Road',
          notes: 'Prefers invoices by e-mail',
        },
      },
    );
    await agent.assert('no error says a property should not exist and the customer was saved');

    const token = await adminToken(base);
    let id = '';
    await expect
      .poll(
        async () => {
          const found = listRows(
            await call(base, 'GET', `/customers?search=${encodeURIComponent(name)}`, token),
          ).find((c) => c.name === name);
          id = String(found?.id ?? '');
          return found ? `${found.billingStreet}|${found.shippingStreet}|${found.notes}` : null;
        },
        { timeout: 30_000 },
      )
      .toBe('1 Nile St|9 Port Road|Prefers invoices by e-mail');

    await app.open('/en/sales/customers');
    await agent.waitFor('the customers list has loaded and shows the customer {name}', {
      params: { name },
    });

    await app.open(`/ar/sales/customers/${id}/edit`);
    await expect.poll(() => browser.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await agent.act(
      'change the billing street address to {street} and press the save / update button',
      {
        params: { street: '2 Tahrir Sq' },
      },
    );
    await expect
      .poll(async () => (await call(base, 'GET', `/customers/${id}`, token)).body?.billingStreet, {
        timeout: 30_000,
      })
      .toBe('2 Tahrir Sq');
    const after = await call(base, 'GET', `/customers/${id}`, token);
    expect(after.body).toMatchObject({
      shippingStreet: '9 Port Road',
      notes: 'Prefers invoices by e-mail',
    });
  },
);
