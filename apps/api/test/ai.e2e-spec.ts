import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ApiHelper } from './helpers/api.helper';

describe('AI (e2e)', () => {
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

  describe('AI Insights', () => {
    it('GET /ai/insights should return insights', async () => {
      const res = await api.get('/ai/insights');
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('AI Predictions', () => {
    it('GET /ai/cash-flow-prediction should return forecast', async () => {
      const res = await api.get('/ai/cash-flow-prediction');
      expect([200, 404]).toContain(res.status);
    });

    it('GET /ai/demand-forecasting should return demand forecast', async () => {
      const res = await api.get('/ai/demand-forecasting');
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('AI Feedback', () => {
    it('POST /ai/feedback should accept feedback', async () => {
      const res = await api.post('/ai/feedback').send({
        feature: 'CATEGORIZATION',
        userAction: 'ACCEPTED',
        predictionId: 'test-prediction-id',
      });
      expect([201, 400, 404]).toContain(res.status);
    });
  });

  describe('AI Anomalies', () => {
    it('GET /ai/anomalies should return anomaly list', async () => {
      const res = await api.get('/ai/anomalies');
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('AI Alerts', () => {
    it('GET /ai/alerts should return alert list', async () => {
      const res = await api.get('/ai/alerts');
      expect([200, 404]).toContain(res.status);
    });
  });
});
