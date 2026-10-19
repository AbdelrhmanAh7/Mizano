import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Request-level test for issue #260 (supersedes part of #233):
// The customer form sends nested billingAddress/shippingAddress and optional notes.
// The API accepts and persists them, and rejects legacy flat address keys.

const PASSWORD = 'ArmyE2e2026x';
const EMAIL = 'army-260-cust@army-e2e.test';

type Json = Record<string, any>;

function apiBase(baseUrl: string): string {
  return (process.env.E2E_ARMY_API ?? new URL('/api', baseUrl).href).replace(/\/+$/, '');
}

function formPayload(name: string, street: string) {
  return {
    name,
    displayName: null,
    email: 'army-260-cust@example.com',
    phone: '+201000000260',
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
  '@issue-260 AC1: customer form payload creates (201), lists, edits (200) with address and notes round-tripping, and rejects legacy flat keys',
  { tags: ['feat:mz-customers', 'lvl:api'] },
  async ({ app }) => {
    const api = apiBase(String(app.baseUrl));
    const call = async (
      path: string,
      method: string,
      body?: unknown,
      token?: string,
    ): Promise<{ status: number; body: Json }> => {
      const res = await fetch(`${api}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
    };

    // A throwaway tenant: register it, or log in when already registered.
    let auth = await call('/auth/register', 'POST', {
      email: EMAIL,
      password: PASSWORD,
      firstName: 'Army',
      lastName: 'Customer',
      organizationName: 'Army 260 Customer',
    });
    if (auth.status === 409) {
      auth = await call('/auth/login', 'POST', { email: EMAIL, password: PASSWORD });
    }
    if (auth.status !== 200 && auth.status !== 201) {
      auth = await call('/auth/login', 'POST', {
        email: 'admin@mizano.com',
        password: 'password123',
      });
    }
    expect([200, 201]).toContain(auth.status);
    const token: string = auth.body.tokens.accessToken;

    const name = 'Army 260 Customer';

    // The legacy flat payload is rejected by the whitelist (forbidNonWhitelisted).
    const legacy = await call(
      '/customers',
      'POST',
      {
        name,
        billingStreet: '1 Nile St',
        notes: 'x',
      },
      token,
    );
    expect(legacy.status).toBe(400);

    // Creating customer with nested address and notes returns 201 and persisted fields.
    const created = await call('/customers', 'POST', formPayload(name, '1 Nile St'), token);
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
    expect(id).toBeDefined();

    // The customer appears in the list.
    const list = await call(`/customers?search=${encodeURIComponent(name)}`, 'GET', undefined, token);
    expect(list.status).toBe(200);
    const rows = Array.isArray(list.body)
      ? list.body
      : Array.isArray(list.body?.data)
        ? list.body.data
        : [];
    expect(rows.map((c: Json) => c.id)).toContain(id);

    // Updating customer with new address and clearing notes (null).
    const updated = await call(
      `/customers/${id}`,
      'PATCH',
      {
        ...formPayload(name, '2 Tahrir Sq'),
        notes: null,
      },
      token,
    );
    expect(updated.status).toBe(200);

    // Fetching updated customer confirms address and notes changes.
    const one = await call(`/customers/${id}`, 'GET', undefined, token);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({
      billingStreet: '2 Tahrir Sq',
      billingPostalCode: '11511',
      shippingStreet: '9 Port Road',
      shippingCountry: 'EG',
      notes: null,
    });
  },
);
