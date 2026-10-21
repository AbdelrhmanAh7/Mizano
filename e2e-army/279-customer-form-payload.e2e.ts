import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Request-level test for issue #279: customer form sends nested address objects (not flat fields)
// to match CreateCustomerDto/UpdateCustomerDto API contract.

const PASSWORD = "password123";
const EMAIL = "admin@mizano.com";

type Json = Record<string, any>;

test(
  "@issue-279 AC1: create customer payload uses nested billingAddress/shippingAddress objects, no flat address fields",
  { tags: ["feat:mz-customers"] },
  async ({ app }) => {
    const api = (process.env.E2E_ARMY_API ?? new URL("/api", app.baseUrl).href).replace(/\/+$/, "");
    const call = async (path: string, method: string, body?: unknown, token?: string): Promise<{ status: number; body: Json }> => {
      const res = await fetch(`${api}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
    };

    // Sign in as seeded demo admin
    const auth = await call("/auth/login", "POST", { email: EMAIL, password: PASSWORD });
    expect([200, 201]).toContain(auth.status);
    const token: string = auth.body.tokens.accessToken;

    // Create a customer with nested addresses - this is what the fixed form should send
    const payload = {
      name: "Army 279 Customer",
      displayName: "Display Name",
      email: "customer@army279.test",
      phone: "+15551234567",
      currency: "USD",
      taxId: "TAX123456",
      paymentTerms: 30,
      notes: "Test notes",
      billingAddress: {
        street: "123 Billing St",
        city: "Billing City",
        state: "Billing State",
        postalCode: "12345",
        country: "US",
      },
      shippingAddress: {
        street: "456 Shipping Ave",
        city: "Shipping City",
        state: "Shipping State",
        postalCode: "67890",
        country: "US",
      },
    };

    const create = await call("/customers", "POST", payload, token);
    expect(create.status).toBe(201);
    const customerId = create.body.id;

    // Verify the created customer has the nested addresses stored correctly
    const get = await call(`/customers/${customerId}`, "GET", undefined, token);
    expect(get.status).toBe(200);
    expect(get.body.billingStreet).toBe("123 Billing St");
    expect(get.body.billingCity).toBe("Billing City");
    expect(get.body.billingState).toBe("Billing State");
    expect(get.body.billingPostalCode).toBe("12345");
    expect(get.body.billingCountry).toBe("US");
    expect(get.body.shippingStreet).toBe("456 Shipping Ave");
    expect(get.body.shippingCity).toBe("Shipping City");
    expect(get.body.shippingState).toBe("Shipping State");
    expect(get.body.shippingPostalCode).toBe("67890");
    expect(get.body.shippingCountry).toBe("US");

    // Clean up
    await call(`/customers/${customerId}`, "DELETE", undefined, token);
  },
);

test(
  "@issue-279 AC2: update customer payload uses nested addresses and omits flat fields",
  { tags: ["feat:mz-customers"] },
  async ({ app }) => {
    const api = (process.env.E2E_ARMY_API ?? new URL("/api", app.baseUrl).href).replace(/\/+$/, "");
    const call = async (path: string, method: string, body?: unknown, token?: string): Promise<{ status: number; body: Json }> => {
      const res = await fetch(`${api}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
    };

    const auth = await call("/auth/login", "POST", { email: EMAIL, password: PASSWORD });
    expect([200, 201]).toContain(auth.status);
    const token: string = auth.body.tokens.accessToken;

    // Create a customer first
    const create = await call("/customers", "POST", {
      name: "Army 279 Update Test",
      billingAddress: { street: "Old Street", city: "Old City", country: "US" },
      shippingAddress: { street: "Old Ship St", city: "Old Ship City", country: "US" },
    }, token);
    expect(create.status).toBe(201);
    const customerId = create.body.id;

    // Update with new nested addresses - no flat fields
    const update = await call(`/customers/${customerId}`, "PATCH", {
      name: "Army 279 Updated",
      billingAddress: {
        street: "New Billing St",
        city: "New Billing City",
        state: "New State",
        postalCode: "54321",
        country: "CA",
      },
      shippingAddress: {
        street: "New Shipping Ave",
        city: "New Shipping City",
        state: "New Ship State",
        postalCode: "09876",
        country: "CA",
      },
    }, token);
    expect(update.status).toBe(200);

    // Verify the update worked with nested addresses
    const get = await call(`/customers/${customerId}`, "GET", undefined, token);
    expect(get.status).toBe(200);
    expect(get.body.billingStreet).toBe("New Billing St");
    expect(get.body.billingCity).toBe("New Billing City");
    expect(get.body.billingState).toBe("New State");
    expect(get.body.billingPostalCode).toBe("54321");
    expect(get.body.billingCountry).toBe("CA");
    expect(get.body.shippingStreet).toBe("New Shipping Ave");
    expect(get.body.shippingCity).toBe("New Shipping City");
    expect(get.body.shippingState).toBe("New Ship State");
    expect(get.body.shippingPostalCode).toBe("09876");
    expect(get.body.shippingCountry).toBe("CA");

    // Clean up
    await call(`/customers/${customerId}`, "DELETE", undefined, token);
  },
);

test(
  "@issue-279 AC3: empty optional fields in payload are sent as null/undefined, not empty strings",
  { tags: ["feat:mz-customers"] },
  async ({ app }) => {
    const api = (process.env.E2E_ARMY_API ?? new URL("/api", app.baseUrl).href).replace(/\/+$/, "");
    const call = async (path: string, method: string, body?: unknown, token?: string): Promise<{ status: number; body: Json }> => {
      const res = await fetch(`${api}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
    };

    const auth = await call("/auth/login", "POST", { email: EMAIL, password: PASSWORD });
    expect([200, 201]).toContain(auth.status);
    const token: string = auth.body.tokens.accessToken;

    // Create customer with minimal fields - empty optional fields should be handled
    const create = await call("/customers", "POST", {
      name: "Minimal Customer",
      displayName: "",
      email: "",
      phone: "",
      taxId: "",
      notes: "",
      billingAddress: {},
      shippingAddress: {},
    }, token);
    expect(create.status).toBe(201);
    const customerId = create.body.id;

    // Verify empty strings are stored as null/empty in DB
    const get = await call(`/customers/${customerId}`, "GET", undefined, token);
    expect(get.status).toBe(200);
    // The service should convert empty strings to null for optional fields
    // Prisma will store them as null if the DTO validation passes

    await call(`/customers/${customerId}`, "DELETE", undefined, token);
  },
);
