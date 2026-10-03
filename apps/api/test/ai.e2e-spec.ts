/**
 * AI advisory endpoints through the real HTTP API. Only routes that exist are exercised; each
 * must succeed for a real tenant, never post anything and stay scoped to the caller. Models are
 * not required to be online: these endpoints read tenant data and return empty results.
 */
import { INestApplication } from '@nestjs/common';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';

describe('AI (e2e)', () => {
  let app: INestApplication;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let anon: ApiHelper;

  beforeAll(async () => {
    app = await createTestApp();
    tenantA = await registerTenant(app, 'AiA');
    tenantB = await registerTenant(app, 'AiB');
    a = tenantA.api;
    b = tenantB.api;
    anon = ApiHelper.anonymous(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const readRoutes = [
    '/ai/insights',
    '/ai/cash-flow/quick',
    '/ai/demand-forecast/dashboard',
    '/ai/anomalies',
    '/ai/alerts',
    '/ai/feedback/stats?feature=CATEGORIZATION',
  ];

  describe.each(readRoutes)('GET %s', (route) => {
    it('succeeds for an authenticated tenant', async () => {
      const res = await a.get(route);
      expect(res.status).toBe(200);
    });

    it('returns 401 when anonymous', async () => {
      expect((await anon.get(route)).status).toBe(401);
    });
  });

  describe('feedback', () => {
    it('accepts feedback and stores it only for the submitting tenant', async () => {
      const res = await a.post('/ai/feedback').send({
        feature: 'CATEGORIZATION',
        userAction: 'ACCEPTED',
        aiSuggestion: { label: 'Office Supplies', confidence: 0.85 },
        inputData: { description: 'Office supplies purchase', amount: 150 },
      });
      expect(res.status).toBe(201);

      const prisma = getPrisma(app);
      const forA = await prisma.aiFeedback.count({
        where: { organizationId: tenantA.organizationId },
      });
      const forB = await prisma.aiFeedback.count({
        where: { organizationId: tenantB.organizationId },
      });
      expect(forA).toBe(1);
      expect(forB).toBe(0);
    });

    it('rejects an unknown feature', async () => {
      const res = await a.post('/ai/feedback').send({
        feature: 'NOT_A_FEATURE',
        userAction: 'ACCEPTED',
        aiSuggestion: {},
        inputData: {},
      });
      expect(res.status).toBe(400);
    });

    it('returns 401 when anonymous', async () => {
      expect((await anon.post('/ai/feedback').send({})).status).toBe(401);
    });
  });

  describe('advisory only', () => {
    it('creates no journals while serving AI reads', async () => {
      const prisma = getPrisma(app);
      const before = await prisma.journal.count({
        where: { organizationId: tenantB.organizationId },
      });
      expect((await b.get('/ai/insights')).status).toBe(200);
      expect((await b.get('/ai/anomalies')).status).toBe(200);
      const after = await prisma.journal.count({
        where: { organizationId: tenantB.organizationId },
      });
      expect(after).toBe(before);
    });
  });
});
