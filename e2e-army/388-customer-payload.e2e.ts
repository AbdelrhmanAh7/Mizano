import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

type Json = Record<string, any>;

test(
  '@issue-388 AC1 AC2 AC3 AC4: customer creation with nested addresses and clearing optional fields with null on patch',
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

    // 2. Verify server initial values before patch (ensuring they are populated, not null)
    const initial = await call(`/customers/${customerId}`, 'GET', undefined, token);
    expect(initial.status).toBe(200);
    expect(initial.body.displayName).toBe('Initial Display 388');
    expect(initial.body.email).toBe('army-edit-388@mizano.test');
    expect(initial.body.phone).toBe('+201011112222');
    expect(initial.body.taxId).toBe('TAX-388-INIT');
    expect(initial.body.billingStreet).toBe('123 Nile Corniche');
    expect(initial.body.billingCity).toBe('Cairo');
    expect(initial.body.billingState).toBe('Cairo Governorate');
    expect(initial.body.billingPostalCode).toBe('11511');
    expect(initial.body.billingCountry).toBe('Egypt');
    expect(initial.body.shippingStreet).toBe('456 Port Said St');
    expect(initial.body.shippingCity).toBe('Alexandria');
    expect(initial.body.shippingState).toBe('Alexandria Governorate');
    expect(initial.body.shippingPostalCode).toBe('21500');
    expect(initial.body.shippingCountry).toBe('Egypt');

    // 3. Edit customer to clear optional fields: sent as null on PATCH
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
    expect(update.body.displayName).toBeNull();
    expect(update.body.displayName).not.toBe('Initial Display 388');
    expect(update.body.displayName).not.toBe('null');
    expect(update.body.email).toBeNull();
    expect(update.body.email).not.toBe('army-edit-388@mizano.test');
    expect(update.body.email).not.toBe('null');

    // 4. Verify server values are actually cleared (null) and not set to literal string "null" or retaining old values
    const get = await call(`/customers/${customerId}`, 'GET', undefined, token);
    expect(get.status).toBe(200);
    expect(get.body.displayName).toBeNull();
    expect(get.body.displayName).not.toBe('Initial Display 388');
    expect(get.body.displayName).not.toBe('null');
    expect(typeof get.body.displayName).not.toBe('string');

    expect(get.body.email).toBeNull();
    expect(get.body.email).not.toBe('army-edit-388@mizano.test');
    expect(get.body.email).not.toBe('null');
    expect(typeof get.body.email).not.toBe('string');

    expect(get.body.phone).toBeNull();
    expect(get.body.phone).not.toBe('+201011112222');
    expect(get.body.phone).not.toBe('null');
    expect(typeof get.body.phone).not.toBe('string');

    expect(get.body.taxId).toBeNull();
    expect(get.body.taxId).not.toBe('TAX-388-INIT');
    expect(get.body.taxId).not.toBe('null');
    expect(typeof get.body.taxId).not.toBe('string');

    expect(get.body.billingStreet).toBeNull();
    expect(get.body.billingStreet).not.toBe('123 Nile Corniche');
    expect(get.body.billingStreet).not.toBe('null');

    expect(get.body.billingCity).toBeNull();
    expect(get.body.billingCity).not.toBe('Cairo');
    expect(get.body.billingCity).not.toBe('null');

    expect(get.body.billingState).toBeNull();
    expect(get.body.billingState).not.toBe('Cairo Governorate');
    expect(get.body.billingState).not.toBe('null');

    expect(get.body.billingPostalCode).toBeNull();
    expect(get.body.billingPostalCode).not.toBe('11511');
    expect(get.body.billingPostalCode).not.toBe('null');

    expect(get.body.billingCountry).toBeNull();
    expect(get.body.billingCountry).not.toBe('Egypt');
    expect(get.body.billingCountry).not.toBe('null');

    expect(get.body.shippingStreet).toBeNull();
    expect(get.body.shippingStreet).not.toBe('456 Port Said St');
    expect(get.body.shippingStreet).not.toBe('null');

    expect(get.body.shippingCity).toBeNull();
    expect(get.body.shippingCity).not.toBe('Alexandria');
    expect(get.body.shippingCity).not.toBe('null');

    expect(get.body.shippingState).toBeNull();
    expect(get.body.shippingState).not.toBe('Alexandria Governorate');
    expect(get.body.shippingState).not.toBe('null');

    expect(get.body.shippingPostalCode).toBeNull();
    expect(get.body.shippingPostalCode).not.toBe('21500');
    expect(get.body.shippingPostalCode).not.toBe('null');

    expect(get.body.shippingCountry).toBeNull();
    expect(get.body.shippingCountry).not.toBe('Egypt');
    expect(get.body.shippingCountry).not.toBe('null');

    // 5. Verify direct null address payload clearing on patch
    const repopulate = await call(
      `/customers/${customerId}`,
      'PATCH',
      {
        billingAddress: {
          street: '789 Giza Pyramids',
          city: 'Giza',
          country: 'Egypt',
        },
      },
      token,
    );
    expect(repopulate.status).toBe(200);
    expect(repopulate.body.billingStreet).toBe('789 Giza Pyramids');

    const clearNullAddress = await call(
      `/customers/${customerId}`,
      'PATCH',
      {
        billingAddress: null,
      },
      token,
    );
    expect(clearNullAddress.status).toBe(200);
    expect(clearNullAddress.body.billingStreet).toBeNull();
    expect(clearNullAddress.body.billingStreet).not.toBe('789 Giza Pyramids');
    expect(clearNullAddress.body.billingStreet).not.toBe('null');

    // 6. Clean up
    await call(`/customers/${customerId}`, 'DELETE', undefined, token);
  },
);
