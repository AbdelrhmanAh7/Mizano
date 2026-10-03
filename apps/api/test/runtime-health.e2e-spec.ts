import type { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers/app.helper';
import { ApiHelper } from './helpers/api-client.helper';

describe('runtime health with real PostgreSQL and Redis (e2e)', () => {
  let app: INestApplication;
  let api: ApiHelper;

  beforeAll(async () => {
    app = await createTestApp();
    api = ApiHelper.anonymous(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('checks both live dependencies rather than an in-memory cache', async () => {
    const response = await api.get('/health').expect(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.services.database.status).toBe('connected');
    expect(response.body.services.redis.status).toBe('connected');
  });

  it('reports database readiness', async () => {
    const response = await api.get('/health/ready').expect(200);
    expect(response.body.ready).toBe(true);
  });

  it('reports process liveness independently', async () => {
    const response = await api.get('/health/live').expect(200);
    expect(response.body.alive).toBe(true);
    expect(response.body.uptime).toBeGreaterThan(0);
  });
});
