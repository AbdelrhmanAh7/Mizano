/**
 * Tenant isolation through the real HTTP API: two registered tenants with real logins, list
 * endpoints never overlap, ids from another tenant are 404, an organizationId in the query
 * string cannot widen access, and anonymous callers are rejected.
 */
import { INestApplication } from '@nestjs/common';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';

describe('Multi-tenancy (e2e)', () => {
  let app: INestApplication;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;

  let customerAId = '';
  let customerBId = '';
  let invoiceAId = '';
  let invoiceBId = '';

  const ids = (body: { data: Array<{ id: string }> }): string[] => body.data.map((x) => x.id);

  function invoiceBody(customerId: string): Record<string, unknown> {
    return {
      customerId,
      date: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      lines: [{ description: 'Service', quantity: '1', rate: '100' }],
    };
  }

  async function createInvoice(api: ApiHelper, customerId: string): Promise<string> {
    const res = await api.post('/invoices').send(invoiceBody(customerId));
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    tenantA = await registerTenant(app, 'TenantA');
    tenantB = await registerTenant(app, 'TenantB');
    a = tenantA.api;
    b = tenantB.api;
    anon = ApiHelper.anonymous(app);

    const ca = await a.post('/customers').send({ name: 'Alpha Customer', currency: 'EGP' });
    expect(ca.status).toBe(201);
    customerAId = ca.body.id;
    const cb = await b.post('/customers').send({ name: 'Beta Customer', currency: 'EGP' });
    expect(cb.status).toBe(201);
    customerBId = cb.body.id;
    invoiceAId = await createInvoice(a, customerAId);
    invoiceBId = await createInvoice(b, customerBId);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers two distinct organizations', () => {
    expect(tenantA.organizationId).not.toBe(tenantB.organizationId);
  });

  describe('data isolation', () => {
    it('invoice lists contain only the caller own invoices', async () => {
      const [ra, rb] = await Promise.all([a.get('/invoices'), b.get('/invoices')]);
      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);
      expect(ids(ra.body)).toEqual([invoiceAId]);
      expect(ids(rb.body)).toEqual([invoiceBId]);
    });

    it('customer lists contain only the caller own customers', async () => {
      const [ra, rb] = await Promise.all([a.get('/customers'), b.get('/customers')]);
      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);
      expect(ids(ra.body)).toEqual([customerAId]);
      expect(ids(rb.body)).toEqual([customerBId]);
    });
  });

  describe('cross-tenant access', () => {
    it('returns 404 for another tenant document ids', async () => {
      expect((await b.get(`/invoices/${invoiceAId}`)).status).toBe(404);
      expect((await a.get(`/invoices/${invoiceBId}`)).status).toBe(404);
      expect((await b.get(`/customers/${customerAId}`)).status).toBe(404);
      expect((await a.get(`/customers/${customerBId}`)).status).toBe(404);
    });

    it('cannot mutate another tenant records', async () => {
      expect((await b.patch(`/customers/${customerAId}`).send({ name: 'Hijacked' })).status).toBe(
        404,
      );
      expect((await b.delete(`/customers/${customerAId}`)).status).toBe(404);
      expect((await b.delete(`/invoices/${invoiceAId}`)).status).toBe(404);
      const still = await a.get(`/customers/${customerAId}`);
      expect(still.status).toBe(200);
      expect(still.body.name).toBe('Alpha Customer');
    });

    it('rejects another tenant customer id supplied in a body', async () => {
      const res = await b.post('/invoices').send(invoiceBody(customerAId));
      expect(res.status).toBe(400);
    });

    it('rejects an organizationId query param and never widens the scope', async () => {
      const res = await b.get('/invoices').query({ organizationId: tenantA.organizationId });
      expect(res.status).toBe(400);
      const own = await b.get('/invoices');
      expect(ids(own.body)).toEqual([invoiceBId]);
    });
  });

  describe('unauthenticated access', () => {
    it('returns 401 for anonymous requests', async () => {
      expect((await anon.get('/invoices')).status).toBe(401);
      expect((await anon.get('/customers')).status).toBe(401);
    });

    it('returns 401 for a forged token', async () => {
      expect((await anon.withToken('not-a-real-token').get('/invoices')).status).toBe(401);
    });
  });
});
