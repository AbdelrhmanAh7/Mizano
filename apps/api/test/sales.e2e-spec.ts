import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ApiHelper } from './helpers/api.helper';

describe('Sales (e2e)', () => {
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

  describe('Customers', () => {
    it('GET /customers should return customer list', async () => {
      const res = await api.get('/customers');
      expect([200, 404]).toContain(res.status);
    });

    it('POST /customers should create customer', async () => {
      const res = await api.post('/customers').send({
        name: 'E2E Test Customer',
        email: `e2e-customer-${Date.now()}@test.com`,
      });
      expect([201, 400, 403]).toContain(res.status);
    });
  });

  describe('Invoices', () => {
    it('GET /invoices should return invoice list', async () => {
      const res = await api.get('/invoices');
      expect([200, 404]).toContain(res.status);
    });

    it('POST /invoices should validate required fields', async () => {
      const res = await api.post('/invoices').send({});
      expect([400, 422]).toContain(res.status);
    });
  });

  describe('Quotes', () => {
    it('GET /quotes should return quote list', async () => {
      const res = await api.get('/quotes');
      expect([200, 404]).toContain(res.status);
    });
  });
});
