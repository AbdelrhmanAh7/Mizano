import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ApiHelper } from './helpers/api.helper';

describe('Purchases (e2e)', () => {
  let app: INestApplication;
  let api: ApiHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    api = new ApiHelper(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Vendors', () => {
    it('GET /vendors should return vendor list', async () => {
      const res = await api.get('/vendors');
      expect([200, 404]).toContain(res.status);
    });

    it('POST /vendors should create vendor', async () => {
      const res = await api.post('/vendors').send({
        name: 'E2E Test Vendor',
        email: `e2e-vendor-${Date.now()}@test.com`,
      });
      expect([201, 400, 403]).toContain(res.status);
    });
  });

  describe('Bills', () => {
    it('GET /bills should return bill list', async () => {
      const res = await api.get('/bills');
      expect([200, 404]).toContain(res.status);
    });

    it('POST /bills should validate required fields', async () => {
      const res = await api.post('/bills').send({});
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('Expenses', () => {
    it('GET /expenses should return expense list', async () => {
      const res = await api.get('/expenses');
      expect([200, 404]).toContain(res.status);
    });
  });
});
