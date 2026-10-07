/**
 * Seeded journey for the possible-duplicate bill warning (#96). Tenant A posts a bill, then
 * checks a draft of the same vendor, amount and date window through the real HTTP API with a
 * real login: by stored draft id and by a POST body (vendor name, decimal string, calendar
 * date, currency). Tenant B, an anonymous caller and a role without permissions probe the
 * guards, and the audit table proves the read-only POST writes nothing.
 */
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { eventually, isoDay } from './helpers/journey.helper';
import { registerTenant, TEST_PASSWORD, TestTenant } from './helpers/tenant.helper';
import { PrismaService } from '../src/prisma/prisma.service';

const CHECK = '/bills/possible-duplicates';

describe('Possible duplicate bills (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;

  const vendorName = `Nile Supplies ${uniqueSuffix()}`;
  const day = isoDay(-10);
  let vendorId = '';
  let postedBillId = '';
  let draftBillId = '';
  let currency = '';
  let rentAccountId = '';

  async function createBill(date: string): Promise<string> {
    const res = await a.post('/bills').send({
      vendorId,
      date,
      dueDate: isoDay(30),
      lines: [{ description: 'Paper', accountId: rentAccountId, quantity: '1', rate: '100.10' }],
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function viewerWithoutPermissions(tenant: TestTenant): Promise<ApiHelper> {
    const role = await prisma.role.create({
      data: { name: `NoPerms-${uniqueSuffix()}`, organizationId: tenant.organizationId },
    });
    const email = `e2e-noperms-${uniqueSuffix()}@mizano.test`;
    await prisma.user.create({
      data: {
        email,
        name: 'E2E No Perms',
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
        roleId: role.id,
        organizationId: tenant.organizationId,
      },
    });
    const login = await anon.post('/auth/login').send({ email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    return anon.withToken(login.body.tokens.accessToken as string);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    anon = ApiHelper.anonymous(app);
    tenantA = await registerTenant(app, 'DupA');
    tenantB = await registerTenant(app, 'DupB');
    a = tenantA.api;
    b = tenantB.api;

    expect((await a.post('/accounts/seed-defaults')).status).toBe(201);
    const accounts = await a.get('/accounts').query({ limit: 500 });
    rentAccountId = accounts.body.data.find((x: { code: string }) => x.code === '6100').id;

    const vendor = await a.post('/vendors').send({ name: vendorName });
    expect(vendor.status).toBe(201);
    vendorId = vendor.body.id;

    postedBillId = await createBill(day);
    expect((await a.post(`/bills/${postedBillId}/approve`)).status).toBe(201);
    draftBillId = await createBill(day);
  });

  afterAll(async () => {
    await app.close();
  });

  it('warns on a stored draft with the posted bill as a 4-dp match, excluding itself', async () => {
    const res = await a.get(`/bills/${draftBillId}/possible-duplicates`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('possible');
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0]).toMatchObject({
      billId: postedBillId,
      documentDate: day,
      amount: '100.1000',
    });
    currency = res.body.matches[0].currency;
    expect(currency).toMatch(/^[A-Z]{3}$/);
  });

  it('matches a POSTed draft by normalized vendor name, exact decimal and +/-3 days', async () => {
    const body = { vendorName: `  ${vendorName.toUpperCase()} `, amount: '100.1', currency };
    const near = await a.post(CHECK).send({ ...body, date: isoDay(-7) });
    expect(near.status).toBe(200);
    expect(near.body.matches.map((m: { billId: string }) => m.billId)).toEqual([postedBillId]);

    const far = await a.post(CHECK).send({ ...body, date: isoDay(-6) });
    expect(far.body).toEqual({ status: 'none', matches: [] });

    const otherAmount = await a.post(CHECK).send({ ...body, date: day, amount: '100.11' });
    expect(otherAmount.body.status).toBe('none');

    const noCurrency = await a.post(CHECK).send({ vendorId, amount: '100.10', date: day });
    expect(noCurrency.body).toEqual({ status: 'unknown', matches: [] });
  });

  it('rejects numeric amounts, exponents and timestamps with 400', async () => {
    const base = { vendorId, date: day, currency };
    for (const body of [
      { ...base, amount: 100.1 },
      { ...base, amount: '1e2' },
      { ...base, amount: '100.10', date: `${day}T23:30:00-02:00` },
    ]) {
      expect((await a.post(CHECK).send(body)).status).toBe(400);
    }
  });

  it('does not write an audit row for the read-only POST', async () => {
    const billAudits = () =>
      prisma.auditLog.count({
        where: { organizationId: tenantA.organizationId, entityType: 'bills' },
      });
    const before = await billAudits();
    const check = await a.post(CHECK).send({ vendorId, amount: '100.10', date: day, currency });
    expect(check.status).toBe(200);
    // An audited write afterwards: once its row lands, an audit of the check would have too.
    const marker = await createBill(day);
    await eventually(async () => {
      expect(
        await prisma.auditLog.count({
          where: { organizationId: tenantA.organizationId, entityId: marker },
        }),
      ).toBe(1);
    });
    expect(await billAudits()).toBe(before + 1);

    expect((await a.delete(`/bills/${marker}`)).status).toBe(200);
    expect((await a.get(`/bills/${marker}/possible-duplicates`)).status).toBe(404);
  });

  it('requires authentication and purchases.view', async () => {
    const body = { vendorId, amount: '100.10', date: day, currency };
    expect((await anon.post(CHECK).send(body)).status).toBe(401);
    expect((await anon.get(`/bills/${draftBillId}/possible-duplicates`)).status).toBe(401);

    const noPerms = await viewerWithoutPermissions(tenantA);
    expect((await noPerms.post(CHECK).send(body)).status).toBe(403);
    expect((await noPerms.get(`/bills/${draftBillId}/possible-duplicates`)).status).toBe(403);
  });

  it("never reveals tenant A's bills or vendors to tenant B", async () => {
    expect((await b.get(`/bills/${draftBillId}/possible-duplicates`)).status).toBe(404);
    expect(
      (await b.post(CHECK).send({ vendorId, amount: '100.10', date: day, currency })).status,
    ).toBe(400);
    const byName = await b.post(CHECK).send({ vendorName, amount: '100.10', date: day, currency });
    expect(byName.body).toEqual({ status: 'none', matches: [] });
  });
});
