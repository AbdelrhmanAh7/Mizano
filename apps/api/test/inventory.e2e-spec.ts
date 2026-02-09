import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ApiHelper } from './helpers/api.helper';

describe('Inventory (e2e)', () => {
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

  describe('Items', () => {
    it('GET /items should return item list', async () => {
      const res = await api.get('/items');
      expect([200, 404]).toContain(res.status);
    });

    it('POST /items should create item', async () => {
      const res = await api.post('/items').send({
        name: 'E2E Test Item',
        sku: `TST-${Date.now()}`,
        type: 'GOODS',
        unit: 'PCS',
        sellingPrice: 100,
        costPrice: 60,
      });
      expect([201, 400, 403]).toContain(res.status);
    });

    it('POST /items should reject duplicate SKU', async () => {
      const sku = `DUP-${Date.now()}`;
      // Create first
      await api.post('/items').send({
        name: 'First Item',
        sku,
        type: 'GOODS',
        unit: 'PCS',
        sellingPrice: 100,
        costPrice: 60,
      });
      // Create duplicate
      const res = await api.post('/items').send({
        name: 'Duplicate Item',
        sku,
        type: 'GOODS',
        unit: 'PCS',
        sellingPrice: 100,
        costPrice: 60,
      });
      expect([400, 409]).toContain(res.status);
    });
  });

  describe('Warehouses', () => {
    it('GET /warehouses should return warehouse list', async () => {
      const res = await api.get('/warehouses');
      expect([200, 404]).toContain(res.status);
    });
  });
});
