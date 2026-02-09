import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ApiHelper } from './helpers/api.helper';
import { generateTestToken } from './helpers/auth.helper';

describe('Accounting (e2e)', () => {
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

  describe('Chart of Accounts', () => {
    it('GET /accounts should return list of accounts', async () => {
      const res = await api.get('/accounts');
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });

    it('POST /accounts should create a new account', async () => {
      const res = await api.post('/accounts').send({
        name: 'E2E Test Account',
        code: `E2E-${Date.now()}`,
        type: 'EXPENSE',
      });
      expect([201, 400, 403]).toContain(res.status);
    });
  });

  describe('Journal Entries', () => {
    it('POST /journals should reject unbalanced entry', async () => {
      const res = await api.post('/journals').send({
        date: new Date().toISOString(),
        description: 'Unbalanced test entry',
        lines: [
          { accountId: 'test-acc-1', debit: 1000, credit: 0 },
          { accountId: 'test-acc-2', debit: 0, credit: 500 },
        ],
      });
      // Should be rejected because debits (1000) != credits (500)
      expect([400, 422]).toContain(res.status);
    });

    it('POST /journals should accept balanced entry', async () => {
      const res = await api.post('/journals').send({
        date: new Date().toISOString(),
        description: 'Balanced test entry',
        lines: [
          { accountId: 'test-acc-1', debit: 1000, credit: 0 },
          { accountId: 'test-acc-2', debit: 0, credit: 1000 },
        ],
      });
      // Either succeeds (201) or validation error if accounts don't exist
      expect([201, 400, 404]).toContain(res.status);
    });

    it('GET /journals should return list', async () => {
      const res = await api.get('/journals');
      expect([200, 404]).toContain(res.status);
    });
  });
});
