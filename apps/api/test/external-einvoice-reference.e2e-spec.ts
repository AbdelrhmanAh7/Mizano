import { INestApplication } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';

type Tenant = { api: ApiHelper; organizationId: string; userId: string; invoiceId: string };

/** Real PostgreSQL uniqueness and authenticated HTTP; run only against a disposable test DB. */
describe('external ETA reference (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let a: Tenant;
  let b: Tenant;

  async function tenant(label: string): Promise<Tenant> {
    const anon = ApiHelper.anonymous(app);
    const email = `eta-${label}-${uniqueSuffix()}@mizano.test`;
    const password = randomBytes(24).toString('base64url');
    const registered = await anon.post('/auth/register').send({
      email,
      password,
      firstName: 'ETA',
      lastName: label,
      organizationName: `ETA ${label}`,
    });
    expect(registered.status).toBe(201);
    const login = await anon.post('/auth/login').send({ email, password });
    expect(login.status).toBe(200);
    const { user, organization, tokens } = login.body;
    const api = new ApiHelper(app, tokens.accessToken);
    expect((await api.post('/accounts/seed-defaults')).status).toBe(201);
    const returns = await api
      .post('/accounts')
      .send({ code: '4150', name: 'Returns', type: 'INCOME' });
    expect(returns.status).toBe(201);
    expect(
      (
        await api
          .patch('/organization/account-settings')
          .send({ defaultSalesReturnsAccountId: returns.body.id })
      ).status,
    ).toBe(200);
    const customer = await api.post('/customers').send({ name: `Customer ${label}` });
    expect(customer.status).toBe(201);
    const invoice = await api.post('/invoices').send({
      customerId: customer.body.id,
      date: '2026-10-31',
      dueDate: '2026-12-01',
      lines: [{ description: 'Service', quantity: '1', rate: '100', taxRate: '0' }],
    });
    expect(invoice.status).toBe(201);
    return { api, organizationId: organization.id, userId: user.id, invoiceId: invoice.body.id };
  }

  const reference = (owner: Tenant, id: string, value: string | null, kind = 'invoices') =>
    owner.api
      .patch(`/${kind}/${id}/external-einvoice-reference`)
      .send({ externalEInvoiceNumber: value });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    a = await tenant('A');
    b = await tenant('B');
  });
  afterAll(async () => {
    // The runner destroys its disposable DB/container; never delete posted history in teardown.
    if (app) await app.close();
  });

  it('enforces real per-tenant invoice uniqueness, ownership, validation and search', async () => {
    expect((await reference(a, a.invoiceId, '  ETA-42  ')).status).toBe(200);
    expect((await reference(b, a.invoiceId, 'foreign')).status).toBe(404);
    expect(
      (
        await ApiHelper.anonymous(app)
          .patch(`/invoices/${a.invoiceId}/external-einvoice-reference`)
          .send({ externalEInvoiceNumber: 'anonymous' })
      ).status,
    ).toBe(401);
    const clone = await a.api.post(`/invoices/${a.invoiceId}/clone`);
    expect(clone.status).toBe(201);
    expect((await reference(a, clone.body.id, 'ETA-42')).status).toBe(409);
    expect((await reference(b, b.invoiceId, 'ETA-42')).status).toBe(200);
    const search = await a.api.get('/invoices?search=ETA-42');
    expect(search.status).toBe(200);
    expect(search.body.data.map((row: { id: string }) => row.id)).toEqual([a.invoiceId]);
    const invalid = await a.api
      .patch(`/invoices/${a.invoiceId}/external-einvoice-reference`)
      .send({ externalEInvoiceNumber: 'ETA', grandTotal: '1', organizationId: b.organizationId });
    expect(invalid.status).toBe(400);
  });

  it('updates and clears posted metadata with a transactional audit and unchanged journal/amounts', async () => {
    expect((await a.api.patch(`/invoices/${a.invoiceId}/send`)).status).toBe(200);
    const financial = {
      status: true,
      date: true,
      dueDate: true,
      subtotal: true,
      taxAmount: true,
      grandTotal: true,
      balanceDue: true,
    } as const;
    const before = await prisma.invoice.findFirstOrThrow({
      where: { id: a.invoiceId, organizationId: a.organizationId },
      select: financial,
    });
    const journals = await prisma.journal.findMany({
      where: { organizationId: a.organizationId },
      include: { lines: true },
    });
    expect((await reference(a, a.invoiceId, 'ETA-posted')).status).toBe(200);
    expect((await reference(a, a.invoiceId, null)).status).toBe(200);
    expect(
      await prisma.invoice.findFirstOrThrow({
        where: { id: a.invoiceId, organizationId: a.organizationId },
        select: financial,
      }),
    ).toEqual(before);
    expect(
      await prisma.journal.findMany({
        where: { organizationId: a.organizationId },
        include: { lines: true },
      }),
    ).toEqual(journals);
    const audit = await prisma.auditLog.findFirst({
      where: {
        organizationId: a.organizationId,
        userId: a.userId,
        entityType: 'Invoice',
        entityId: a.invoiceId,
        action: 'UPDATE',
      },
    });
    expect(audit?.newValues).toEqual({ fields: ['externalEInvoiceNumber'] });
    expect(JSON.stringify(audit)).not.toContain('ETA-posted');
  });

  it('enforces credit-note uniqueness in each tenant and preserves the posted amount', async () => {
    expect((await b.api.patch(`/invoices/${b.invoiceId}/send`)).status).toBe(200);
    async function credit(owner: Tenant) {
      const invoice = await owner.api.get(`/invoices/${owner.invoiceId}`);
      const result = await owner.api.post('/credit-notes').send({
        customerId: invoice.body.customerId,
        invoiceId: owner.invoiceId,
        date: '2026-10-31',
        amount: '10',
        reason: 'Return',
        type: 'APPLY_TO_INVOICE',
      });
      expect(result.status).toBe(201);
      return result.body.id as string;
    }
    const ca = await credit(a);
    const ca2 = await credit(a);
    const cb = await credit(b);
    expect((await reference(a, a.invoiceId, 'ETA-invoice')).status).toBe(200);
    expect((await reference(a, ca, 'ETA-invoice', 'credit-notes')).status).toBe(409);
    expect((await reference(a, ca, 'ETA-credit', 'credit-notes')).status).toBe(200);
    expect((await reference(a, ca2, 'ETA-credit', 'credit-notes')).status).toBe(409);
    expect((await reference(b, cb, 'ETA-credit', 'credit-notes')).status).toBe(200);
    expect((await reference(b, ca, 'foreign', 'credit-notes')).status).toBe(404);
    const raced = await Promise.all([
      reference(a, a.invoiceId, 'ETA-race'),
      reference(a, ca2, 'ETA-race', 'credit-notes'),
    ]);
    expect(raced.map((result) => result.status).sort()).toEqual([200, 409]);
    const raceWhere = { organizationId: a.organizationId, externalEInvoiceNumber: 'ETA-race' };
    expect(
      (await prisma.invoice.count({ where: raceWhere })) +
        (await prisma.creditNote.count({ where: raceWhere })),
    ).toBe(1);
    const stored = await prisma.creditNote.findFirstOrThrow({
      where: { id: ca, organizationId: a.organizationId },
    });
    expect(stored.amount.toFixed(4)).toBe('10.0000');
    const search = await a.api.get('/credit-notes?search=ETA-credit');
    expect(search.status).toBe(200);
    expect(search.body.data.map((row: { id: string }) => row.id)).toEqual([ca]);
  });
});
