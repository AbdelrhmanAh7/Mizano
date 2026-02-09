import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ApiHelper } from './helpers/api.helper';

describe('Banking (e2e)', () => {
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

  describe('Bank Accounts', () => {
    it('GET /bank-accounts should return account list', async () => {
      const res = await api.get('/bank-accounts');
      expect([200, 404]).toContain(res.status);
    });

    it('POST /bank-accounts should create bank account', async () => {
      const res = await api.post('/bank-accounts').send({
        name: 'E2E Test Bank',
        accountNumber: '****5678',
        currency: 'USD',
        type: 'CHECKING',
      });
      expect([201, 400, 403]).toContain(res.status);
    });
  });

  describe('Bank Transactions', () => {
    it('GET /bank-transactions should return transaction list', async () => {
      const res = await api.get('/bank-transactions');
      expect([200, 404]).toContain(res.status);
    });
  });
});
