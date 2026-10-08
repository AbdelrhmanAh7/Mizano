/**
 * @issue-108 Cross-tenant isolation of the ledger and invoice read endpoints. Two registered
 * tenants each get a sent invoice, an approved bill and a manual journal with distinct amounts
 * (A: 1111, B: 7777). Every list, cursor, get-by-id and report endpoint is then read with each
 * tenant's real token and checked against database ground truth scoped to that tenant, and
 * anonymous, expired and forged tokens are rejected on every endpoint.
 */
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { isoDay } from './helpers/journey.helper';
import { seedChart } from './helpers/postings.helper';
import { ledgerNetByAccount } from './helpers/reports.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { PrismaService } from '../src/prisma/prisma.service';

interface Seeded {
  invoiceId: string;
  billId: string;
  journalId: string;
  accountId: string;
}

const D = (v: unknown): Prisma.Decimal => new Prisma.Decimal(String(v));
const sortedIds = (rows: Array<{ id: string }>): string[] => rows.map((r) => r.id).sort();

describe('Tenant isolation of ledger and invoice reads (e2e) @issue-108', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let seedA: Seeded;
  let seedB: Seeded;

  async function seedTenant(api: ApiHelper, amount: string): Promise<Seeded> {
    const chart = await seedChart(api);
    const customer = await api.post('/customers').send({ name: `Cust ${uniqueSuffix()}` });
    expect(customer.status).toBe(201);
    const invoice = await api.post('/invoices').send({
      customerId: customer.body.id,
      date: isoDay(-2),
      dueDate: isoDay(30),
      lines: [{ description: 'Service', quantity: '1', rate: amount }],
    });
    expect(invoice.status).toBe(201);
    expect((await api.patch(`/invoices/${invoice.body.id}/send`)).status).toBe(200);

    const vendor = await api.post('/vendors').send({ name: `Vendor ${uniqueSuffix()}` });
    expect(vendor.status).toBe(201);
    const bill = await api.post('/bills').send({
      vendorId: vendor.body.id,
      date: isoDay(-2),
      dueDate: isoDay(30),
      lines: [{ description: 'Rent', accountId: chart.rent, quantity: '1', rate: amount }],
    });
    expect(bill.status).toBe(201);
    expect((await api.post(`/bills/${bill.body.id}/approve`)).status).toBe(201);

    const journal = await api.post('/journals').send({
      date: isoDay(-1),
      reference: `ISO-${uniqueSuffix()}`,
      lines: [
        { accountId: chart.cash, debit: amount },
        { accountId: chart.revenue, credit: amount },
      ],
    });
    expect(journal.status).toBe(201);
    return {
      invoiceId: invoice.body.id,
      billId: bill.body.id,
      journalId: journal.body.id,
      accountId: chart.cash,
    };
  }

  /** Signs a token for the user exactly like the app does, with a chosen lifetime. */
  async function tokenFor(tenant: TestTenant, expiresIn: number): Promise<string> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: tenant.userId } });
    return app.get(JwtService).signAsync(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        organizationId: user.organizationId,
        roleId: user.roleId,
      },
      { secret: app.get(ConfigService).get<string>('JWT_SECRET'), expiresIn },
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    tenantA = await registerTenant(app, 'IsoA');
    tenantB = await registerTenant(app, 'IsoB');
    seedA = await seedTenant(tenantA.api, '1111');
    seedB = await seedTenant(tenantB.api, '7777');
  });

  afterAll(async () => {
    await app.close();
  });

  const pairs = (): Array<[string, TestTenant, Seeded, Seeded]> => [
    ['A', tenantA, seedA, seedB],
    ['B', tenantB, seedB, seedA],
  ];

  const byIdPaths = (s: Seeded): string[] => [
    `/invoices/${s.invoiceId}`,
    `/bills/${s.billId}`,
    `/journals/${s.journalId}`,
    `/accounting-reports/general-ledger/${s.accountId}`,
  ];

  const allPaths = (): string[] => [
    '/invoices',
    '/invoices/cursor',
    '/bills',
    '/bills/cursor',
    '/journals',
    '/journals/cursor',
    '/reports/payables-aging',
    '/accounting-reports/trial-balance',
    '/reports/trial-balance',
    ...byIdPaths(seedA),
  ];

  describe('AC1: get-by-id on another tenant resource', () => {
    it('@e2e @flow:tenant-isolation @issue-108 AC1: returns 404 for every foreign id', async () => {
      for (const [, tenant, own, foreign] of pairs()) {
        for (const path of byIdPaths(own)) expect((await tenant.api.get(path)).status).toBe(200);
        for (const path of byIdPaths(foreign)) {
          const res = await tenant.api.get(path);
          expect({ path, status: res.status }).toEqual({ path, status: 404 });
        }
      }
    });
  });

  describe('AC2: lists and reports carry only the caller rows and totals', () => {
    it('@e2e @flow:tenant-isolation @issue-108 AC2: invoice and bill lists hold only own rows', async () => {
      for (const [, tenant, own] of pairs()) {
        for (const path of ['/invoices', '/invoices/cursor']) {
          const res = await tenant.api.get(path);
          expect(res.status).toBe(200);
          expect(sortedIds(res.body.data)).toEqual([own.invoiceId]);
        }
        for (const path of ['/bills', '/bills/cursor']) {
          const res = await tenant.api.get(path);
          expect(res.status).toBe(200);
          expect(sortedIds(res.body.data)).toEqual([own.billId]);
        }
      }
    });

    it('@e2e @flow:tenant-isolation @issue-108 AC2: journal lists equal the tenant ledger', async () => {
      for (const [, tenant] of pairs()) {
        const expected = sortedIds(
          await prisma.journal.findMany({
            where: { organizationId: tenant.organizationId, deletedAt: null },
            select: { id: true },
          }),
        );
        expect(expected.length).toBeGreaterThanOrEqual(3);
        for (const [path, query] of [
          ['/journals', { limit: 100 }],
          ['/journals/cursor', { take: 100 }],
        ] as const) {
          const res = await tenant.api.get(path).query(query);
          expect(res.status).toBe(200);
          expect(sortedIds(res.body.data)).toEqual(expected);
        }
      }
    });

    it('@e2e @flow:tenant-isolation @issue-108 AC2: AP aging lists only own bills and totals', async () => {
      for (const [, tenant, own, foreign] of pairs()) {
        const res = await tenant.api.get('/reports/payables-aging');
        expect(res.status).toBe(200);
        const items = Object.values(res.body.buckets as Record<string, Array<{ billId: string }>>)
          .flat()
          .map((i) => i.billId);
        expect(items).toEqual([own.billId]);
        expect(items).not.toContain(foreign.billId);
        expect(res.body.billCount).toBe(1);
        expect(res.body.vendorCount).toBe(1);
        const bill = await prisma.bill.findFirstOrThrow({
          where: { id: own.billId, organizationId: tenant.organizationId },
        });
        expect(D(res.body.summary.netTotal).equals(bill.balanceDue)).toBe(true);
        expect(D(res.body.summary.total).equals(bill.balanceDue)).toBe(true);
      }
    });

    it('@e2e @flow:tenant-isolation @issue-108 AC2: trial balances equal the tenant ledger', async () => {
      for (const [, tenant] of pairs()) {
        const ledger = await ledgerNetByAccount(prisma, tenant.organizationId);
        const expected = new Map(
          [...ledger].filter(([, b]) => !b.net.isZero()).map(([id, b]) => [id, b.net]),
        );
        const expectedDebits = [...expected.values()]
          .filter((n) => n.greaterThan(0))
          .reduce((s, n) => s.add(n), D(0));
        expect(expectedDebits.greaterThan(0)).toBe(true);

        const acc = await tenant.api.get('/accounting-reports/trial-balance');
        expect(acc.status).toBe(200);
        const accRows = acc.body.accounts as Array<{ id: string; debit: string; credit: string }>;
        expect(accRows.map((r) => r.id).sort()).toEqual([...expected.keys()].sort());
        for (const r of accRows) {
          expect(D(r.debit).sub(r.credit).toFixed(4)).toBe(expected.get(r.id)?.toFixed(4));
        }
        expect(D(acc.body.totals.totalDebits).equals(expectedDebits)).toBe(true);
        expect(D(acc.body.totals.totalCredits).equals(expectedDebits)).toBe(true);

        const rep = await tenant.api.get('/reports/trial-balance').query({ asOfDate: isoDay(0) });
        expect(rep.status).toBe(200);
        const repRows = rep.body.accounts as Array<{
          accountId: string;
          debit: string;
          credit: string;
        }>;
        const nonZero = repRows.filter((r) => !D(r.debit).sub(r.credit).isZero());
        expect(nonZero.map((r) => r.accountId).sort()).toEqual([...expected.keys()].sort());
        for (const r of repRows) expect(ledger.has(r.accountId)).toBe(true);
        expect(D(rep.body.totals.debit).equals(expectedDebits)).toBe(true);
        expect(D(rep.body.totals.credit).equals(expectedDebits)).toBe(true);
      }
    });
  });

  describe('AC3: missing, expired or forged tokens', () => {
    it('@e2e @flow:tenant-isolation @issue-108 AC3: rejects anonymous callers on every endpoint', async () => {
      const anon = ApiHelper.anonymous(app);
      for (const path of allPaths()) {
        expect({ path, status: (await anon.get(path)).status }).toEqual({ path, status: 401 });
      }
    });

    it('@e2e @flow:tenant-isolation @issue-108 AC3: rejects an expired token on every endpoint', async () => {
      const fresh = tenantA.api.withToken(await tokenFor(tenantA, 300));
      expect((await fresh.get('/invoices')).status).toBe(200);
      const expired = tenantA.api.withToken(await tokenFor(tenantA, -60));
      for (const path of allPaths()) {
        expect({ path, status: (await expired.get(path)).status }).toEqual({ path, status: 401 });
      }
    });

    it('@e2e @flow:tenant-isolation @issue-108 AC3: rejects a token with a forged signature', async () => {
      const [header, payload] = tenantA.accessToken.split('.');
      const forged = tenantA.api.withToken(`${header}.${payload}.${'x'.repeat(43)}`);
      for (const path of allPaths()) {
        expect({ path, status: (await forged.get(path)).status }).toEqual({ path, status: 401 });
      }
    });
  });
});
