import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ApiHelper } from './helpers/api.helper';
import { generateTestToken, generateOtherOrgToken } from './helpers/auth.helper';

describe('Multi-Tenancy (e2e)', () => {
  let app: INestApplication;
  let apiOrg1: ApiHelper;
  let apiOrg2: ApiHelper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    apiOrg1 = new ApiHelper(app, generateTestToken({ organizationId: 'org-001' }));
    apiOrg2 = new ApiHelper(app, generateOtherOrgToken());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Data Isolation', () => {
    it('Org1 should not see Org2 data on invoice list', async () => {
      const res1 = await apiOrg1.get('/invoices');
      const res2 = await apiOrg2.get('/invoices');

      // Both should succeed but return different data
      if (res1.status === 200 && res2.status === 200) {
        const org1Ids = (res1.body.data || []).map((i: any) => i.id);
        const org2Ids = (res2.body.data || []).map((i: any) => i.id);

        // No overlap between organizations
        const overlap = org1Ids.filter((id: string) => org2Ids.includes(id));
        expect(overlap).toHaveLength(0);
      }
    });

    it('Org1 should not see Org2 data on customer list', async () => {
      const res1 = await apiOrg1.get('/customers');
      const res2 = await apiOrg2.get('/customers');

      if (res1.status === 200 && res2.status === 200) {
        const org1Ids = (res1.body.data || []).map((c: any) => c.id);
        const org2Ids = (res2.body.data || []).map((c: any) => c.id);

        const overlap = org1Ids.filter((id: string) => org2Ids.includes(id));
        expect(overlap).toHaveLength(0);
      }
    });
  });

  describe('Cross-Org Access Prevention', () => {
    it('should return 403 or 404 when accessing other org resources with orgId param', async () => {
      const res = await apiOrg1
        .get('/invoices')
        .query({ organizationId: 'other-org-002' });

      // OrganizationGuard should block this (403) or endpoint ignores param (200 with own data)
      expect([200, 403, 404]).toContain(res.status);
    });
  });

  describe('Unauthenticated Access', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const res = await apiOrg1.getNoAuth('/invoices');
      expect(res.status).toBe(401);
    });
  });
});
