import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

type Json = Record<string, any>;

test(
  '@issue-388 AC1 AC2 AC4: customer creation with nested addresses and clearing optional fields with null on patch',
  { tags: ['feat:mz-customers', 'lvl:api'] },
  async ({ app }) => {
    const api = (process.env.E2E_ARMY_API ?? new URL('/api', app.baseUrl).href).replace(/\/+$/, '');
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

    const auth = await call('/auth/login', 'POST', {
      email: 'admin@mizano.com',
      password: 'password123',
    });
    expect([200, 201]).toContain(auth.status);
    const token: string = auth.body.tokens.accessToken;

    // 1. Create customer with optional fields and addresses populated
    const create = await call(
      '/customers',
      'POST',
      {
        name: 'Army Customer 388 Edit',
        displayName: 'Initial Display 388',
        email: 'army-edit-388@mizano.test',
        phone: '+201011112222',
        taxId: 'TAX-388-INIT',
        billingAddress: {
          street: '123 Nile Corniche',
          city: 'Cairo',
          state: 'Cairo Governorate',
          postalCode: '11511',
          country: 'Egypt',
        },
        shippingAddress: {
          street: '456 Port Said St',
          city: 'Alexandria',
          state: 'Alexandria Governorate',
          postalCode: '21500',
          country: 'Egypt',
        },
      },
      token,
    );
    expect(create.status).toBe(201);
    const customerId: string = create.body.id;

    // 2. Edit customer to clear optional fields: sent as null on PATCH
    const update = await call(
      `/customers/${customerId}`,
      'PATCH',
      {
        name: 'Army Customer 388 Edit',
        displayName: null,
        email: null,
        phone: null,
        taxId: null,
        billingAddress: {
          street: null,
          city: null,
          state: null,
          postalCode: null,
          country: null,
        },
        shippingAddress: {
          street: null,
          city: null,
          state: null,
          postalCode: null,
          country: null,
        },
      },
      token,
    );
    expect(update.status).toBe(200);

    // 3. Verify server values are cleared (null) and old values do not persist
    const get = await call(`/customers/${customerId}`, 'GET', undefined, token);
    expect(get.status).toBe(200);
    expect(get.body.displayName).toBeNull();
    expect(get.body.email).toBeNull();
    expect(get.body.phone).toBeNull();
    expect(get.body.taxId).toBeNull();
    expect(get.body.billingStreet).toBeNull();
    expect(get.body.billingCity).toBeNull();
    expect(get.body.billingState).toBeNull();
    expect(get.body.billingPostalCode).toBeNull();
    expect(get.body.billingCountry).toBeNull();
    expect(get.body.shippingStreet).toBeNull();
    expect(get.body.shippingCity).toBeNull();
    expect(get.body.shippingState).toBeNull();
    expect(get.body.shippingPostalCode).toBeNull();
    expect(get.body.shippingCountry).toBeNull();

    // 4. Clean up
    await call(`/customers/${customerId}`, 'DELETE', undefined, token);
  },
);
