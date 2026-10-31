/**
 * AI through the organization's own account, over the real HTTP API. No provider is called:
 * a new tenant has AI off, the retired AI routes are gone, settings are permission-gated and
 * never return a key, and nothing AI-related posts to the ledger.
 */
import { INestApplication } from '@nestjs/common';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';

describe('AI settings (e2e)', () => {
  let app: INestApplication;
  let tenantA: TestTenant;
  let a: ApiHelper;
  let anon: ApiHelper;

  beforeAll(async () => {
    app = await createTestApp();
    tenantA = await registerTenant(app, 'AiA');
    a = tenantA.api;
    anon = ApiHelper.anonymous(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('a new organization has AI off and the status carries no key', async () => {
    const res = await a.get('/ai-settings');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'none', activeFeatures: [], keyHint: null });
    expect(JSON.stringify(res.body)).not.toMatch(/keyCiphertext|apiKey/);
    expect((await a.get('/ai-settings/features')).body).toEqual({ activeFeatures: [] });
  });

  it('refuses anonymous callers', async () => {
    expect((await anon.get('/ai-settings')).status).toBe(401);
    expect((await anon.post('/ai-settings/connect').send({ provider: 'openai' })).status).toBe(401);
  });

  it('enables no feature without a connected provider and consent', async () => {
    const res = await a.patch('/ai-settings').send({ features: ['documents'] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('AI_NOT_ENABLED');
  });

  it('validates the provider and the OpenRouter callback', async () => {
    expect((await a.post('/ai-settings/connect').send({ provider: 'colab' })).status).toBe(400);
    const start = await a
      .post('/ai-settings/openrouter/start')
      .send({ callbackUrl: 'https://evil.example/en/settings/ai' });
    expect(start.status).toBe(400);
  });

  it.each([
    '/ai/insights',
    '/ai/chatbot/history',
    '/ai/narrative/monthly',
    '/internal/ollama-status',
  ])('the retired route %s is gone', async (route) => {
    expect((await a.get(route)).status).toBe(404);
  });

  it('creates no journals while serving AI settings', async () => {
    const prisma = getPrisma(app);
    const where = { organizationId: tenantA.organizationId };
    const before = await prisma.journal.count({ where });
    await a.get('/ai-settings');
    await a.get('/ai-settings/usage');
    expect(await prisma.journal.count({ where })).toBe(before);
  });
});
