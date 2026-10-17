/**
 * General ledger tenant isolation (#223, part of #108). Two tenants register and log in through
 * the real API; tenant A posts a journal to its own accounts. GET /reports/general-ledger/:id
 * (by id) and GET /reports/trial-balance (list) then answer 200 to the owner, 404 / nothing to
 * the other tenant, and 401 to a missing, malformed or wrongly signed token.
 */
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp } from './helpers/app.helper';
import { isoDay } from './helpers/journey.helper';
import { createAccount } from './helpers/postings.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';

describe('General ledger tenant isolation (e2e) @issue-223', () => {
  let app: INestApplication;
  let tenantA: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let bankA = '';

  beforeAll(async () => {
    app = await createTestApp();
    tenantA = await registerTenant(app, 'GlOwner');
    a = tenantA.api;
    b = (await registerTenant(app, 'GlForeign')).api;
    bankA = await createAccount(a, '1223', 'GL Isolation Bank', 'ASSET');
    const equityA = await createAccount(a, '3223', 'GL Isolation Equity', 'EQUITY');
    const journal = await a.post('/journals').send({
      date: isoDay(-1),
      reference: 'GL-ISOLATION-223',
      lines: [
        { accountId: bankA, debit: '125.50' },
        { accountId: equityA, credit: '125.50' },
      ],
    });
    expect(journal.status).toBe(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC1: the owner gets 200 and its ledger entries by account id', async () => {
    const res = await a.get(`/reports/general-ledger/${bankA}`);
    expect(res.status).toBe(200);
    expect(res.body.account.id).toBe(bankA);
    expect(Array.isArray(res.body.entries)).toBe(true);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.totalDebits).toBe('125.5000');
  });

  it('AC1: the owner sees its account in the trial balance list', async () => {
    const res = await a.get('/reports/trial-balance');
    expect(res.status).toBe(200);
    expect(res.body.accounts.map((l: { accountId: string }) => l.accountId)).toContain(bankA);
  });

  it('AC2: another tenant gets 404 for the foreign account id and no ledger data', async () => {
    const res = await b.get(`/reports/general-ledger/${bankA}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('GL Isolation Bank');
  });

  it('AC2: another tenant gets 404 for an unknown account id (same answer as foreign)', async () => {
    expect((await b.get('/reports/general-ledger/cl-does-not-exist-223')).status).toBe(404);
  });

  it('AC2: the foreign account never appears in the other tenant trial balance list', async () => {
    const res = await b.get('/reports/trial-balance');
    expect(res.status).toBe(200);
    expect(res.body.accounts.map((l: { accountId: string }) => l.accountId)).not.toContain(bankA);
  });

  it('AC3: missing, malformed and wrongly signed tokens get 401 on by-id and list', async () => {
    const forged = new JwtService({ secret: 'not-the-app-secret-223' }).sign({
      sub: tenantA.userId,
      email: tenantA.email,
      organizationId: tenantA.organizationId,
    });
    for (const token of [null, 'invalid.jwt.token', forged]) {
      const client = a.withToken(token);
      expect((await client.get(`/reports/general-ledger/${bankA}`)).status).toBe(401);
      expect((await client.get('/reports/trial-balance')).status).toBe(401);
    }
  });
});
