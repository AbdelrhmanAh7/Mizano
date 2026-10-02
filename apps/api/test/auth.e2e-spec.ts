/**
 * Authentication and security e2e (issue #19).
 *
 * Runs the real AppModule against the seeded e2e database with real registrations and real
 * logins (no forged tokens): auth endpoints, protected-route rejection, the tenant-scoped /
 * admin-only logger endpoints and WebSocket, and the minimal audit trail.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { LoggerGateway } from '../src/modules/logger/logger.gateway';
import { LogLevel, LogSource, LogEntry } from '@mizano/shared-types';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { TEST_PASSWORD, registerTenant, TestTenant } from './helpers/tenant.helper';
import { eventually, isoDay } from './helpers/journey.helper';
import { seedChart } from './helpers/postings.helper';

interface SocketOutcome {
  connected: boolean;
  error?: string;
  socket: Socket;
}

function connectLoggerSocket(port: number, token?: string): Promise<SocketOutcome> {
  return new Promise((resolve) => {
    const socket = io(`http://127.0.0.1:${port}/logger`, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      timeout: 4000,
      auth: token ? { token } : {},
    });
    socket.on('connect', () => resolve({ connected: true, socket }));
    socket.on('connect_error', (error) =>
      resolve({ connected: false, error: error.message, socket }),
    );
  });
}

function nextEvent<T>(socket: Socket, event: string, waitMs: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), waitMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let anon: ApiHelper;

  beforeAll(async () => {
    app = await createTestApp();
    anon = ApiHelper.anonymous(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const suffix = uniqueSuffix();
  const testUser = {
    email: `e2e-auth-${suffix}@mizano.test`,
    password: TEST_PASSWORD,
    firstName: 'E2E',
    lastName: 'Auth',
    organizationName: `E2E Auth Org ${suffix}`,
  };

  describe('POST /auth/register', () => {
    it('registers a new user and organization', async () => {
      const res = await anon.post('/auth/register').send(testUser);
      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
    });

    it('rejects a duplicate email', async () => {
      const res = await anon.post('/auth/register').send(testUser);
      expect([400, 409]).toContain(res.status);
    });

    it('rejects an invalid email', async () => {
      const res = await anon.post('/auth/register').send({ ...testUser, email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('rejects a weak password', async () => {
      const res = await anon
        .post('/auth/register')
        .send({ ...testUser, email: `weak-${suffix}@mizano.test`, password: 'short' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with valid credentials and returns tokens, never hashes', async () => {
      const res = await anon
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      expect(res.status).toBe(200);
      expect(res.body.tokens.accessToken).toEqual(expect.any(String));
      expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
    });

    it('rejects an invalid password', async () => {
      const res = await anon
        .post('/auth/login')
        .send({ email: testUser.email, password: 'Wrong-password-1' });
      expect(res.status).toBe(401);
    });

    it('rejects a non-existent user', async () => {
      const res = await anon
        .post('/auth/login')
        .send({ email: `nobody-${suffix}@mizano.test`, password: 'Password123' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    const refresh = (token: string) =>
      anon.withToken(token).post('/auth/refresh').send({ refreshToken: token });

    it('rotates two users concurrently, each only gets their own session, replay and logout are rejected', async () => {
      const a = await registerTenant(app, 'RefA');
      const b = await registerTenant(app, 'RefB');

      const [ra, rb] = await Promise.all([refresh(a.refreshToken), refresh(b.refreshToken)]);
      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);
      const tokensA = ra.body.tokens as { accessToken: string; refreshToken: string };
      const tokensB = rb.body.tokens as { accessToken: string; refreshToken: string };
      expect(tokensA.refreshToken).not.toEqual(tokensB.refreshToken);

      // Each rotated token belongs to its own user.
      const subOf = (jwt: string): string =>
        (JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as { sub: string }).sub;
      expect(subOf(tokensA.accessToken)).toBe(a.userId);
      expect(subOf(tokensA.refreshToken)).toBe(a.userId);
      expect(subOf(tokensB.accessToken)).toBe(b.userId);
      expect(subOf(tokensB.refreshToken)).toBe(b.userId);

      // Replaying A's old refresh token fails and does not affect B.
      expect((await refresh(a.refreshToken)).status).toBe(401);
      expect((await refresh(tokensB.refreshToken)).status).toBe(200);

      // Logout revokes A's current refresh token.
      expect((await anon.withToken(tokensA.accessToken).post('/auth/logout')).status).toBe(200);
      expect((await refresh(tokensA.refreshToken)).status).toBe(401);
      // Logout without a token is rejected, not a 500.
      expect((await anon.post('/auth/logout')).status).toBe(401);
    });
  });

  describe('Protected endpoints', () => {
    it('rejects requests without a token', async () => {
      expect((await anon.get('/users/me')).status).toBe(401);
    });

    it('rejects requests with an invalid token', async () => {
      expect((await anon.withToken('invalid-token').get('/users/me')).status).toBe(401);
    });

    it('accepts the token issued by a real login', async () => {
      const tenant = await registerTenant(app, 'Me');
      expect((await tenant.api.get('/organization/account-settings')).status).toBe(200);
      expect((await anon.get('/organization/account-settings')).status).toBe(401);
    });
  });
});

describe('Logger endpoints and stream (e2e)', () => {
  let app: INestApplication;
  let port: number;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let viewer: ApiHelper;
  let viewerToken: string;
  let anon: ApiHelper;
  const sockets: Socket[] = [];

  const MARKER = `e2e-marker-${uniqueSuffix()}`;

  async function createViewer(tenant: TestTenant): Promise<string> {
    const prisma = getPrisma(app);
    const role = await prisma.role.create({
      data: { name: `Viewer-${uniqueSuffix()}`, organizationId: tenant.organizationId },
    });
    const email = `e2e-viewer-${uniqueSuffix()}@mizano.test`;
    await prisma.user.create({
      data: {
        email,
        name: 'E2E Viewer',
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
        roleId: role.id,
        organizationId: tenant.organizationId,
      },
    });
    const login = await anon.post('/auth/login').send({ email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    return login.body.tokens.accessToken as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
    anon = ApiHelper.anonymous(app);
    tenantA = await registerTenant(app, 'LogA');
    tenantB = await registerTenant(app, 'LogB');
    viewerToken = await createViewer(tenantA);
    viewer = anon.withToken(viewerToken);
  });

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    await app.close();
  });

  describe('REST authentication', () => {
    const calls: Array<[string, (api: ApiHelper) => request.Test]> = [
      ['GET /logger/logs', (api) => api.get('/logger/logs')],
      ['GET /logger/stats', (api) => api.get('/logger/stats')],
      ['GET /logger/logs/:id', (api) => api.get('/logger/logs/abc')],
      [
        'POST /logger/capture',
        (api) =>
          api
            .post('/logger/capture')
            .send({ level: LogLevel.ERROR, source: LogSource.FRONTEND, message: 'x' }),
      ],
      [
        'POST /logger/update-status',
        (api) => api.post('/logger/update-status').send({ ids: ['a'], status: 'fixed' }),
      ],
      ['DELETE /logger/clear', (api) => api.delete('/logger/clear').send({})],
      [
        'POST /logger/generate-prompt',
        (api) => api.post('/logger/generate-prompt').send({ logIds: ['a'] }),
      ],
    ];

    it.each(calls)('%s rejects anonymous callers (401)', async (_name, call) => {
      expect((await call(anon)).status).toBe(401);
    });

    it.each(calls)('%s rejects a forged token (401)', async (_name, call) => {
      expect((await call(anon.withToken('forged.token.value'))).status).toBe(401);
    });
  });

  describe('admin-level permission', () => {
    it('forbids a non-admin user from reading or managing logs (403)', async () => {
      expect((await viewer.get('/logger/logs')).status).toBe(403);
      expect((await viewer.get('/logger/stats')).status).toBe(403);
      expect((await viewer.get('/logger/logs/abc')).status).toBe(403);
      expect(
        (await viewer.post('/logger/update-status').send({ ids: ['a'], status: 'fixed' })).status,
      ).toBe(403);
      expect((await viewer.post('/logger/generate-prompt').send({ logIds: ['a'] })).status).toBe(
        403,
      );
      expect((await viewer.delete('/logger/clear').send({})).status).toBe(403);
    });

    it('still lets that user report their own frontend error', async () => {
      const res = await viewer
        .post('/logger/capture')
        .send({ level: LogLevel.ERROR, source: LogSource.FRONTEND, message: `${MARKER}-viewer` });
      expect(res.status).toBe(201);
    });

    it('lets the organization admin read logs and stats', async () => {
      expect((await tenantA.api.get('/logger/logs')).status).toBe(200);
      expect((await tenantA.api.get('/logger/stats')).status).toBe(200);
    });
  });

  describe('organization scoping', () => {
    let entryId = '';

    it('tags captured entries with the caller organization and redacts secrets', async () => {
      const res = await tenantA.api.post('/logger/capture').send({
        level: LogLevel.ERROR,
        source: LogSource.FRONTEND,
        message: `${MARKER} failed Authorization: Bearer abcdef123456 password=hunter2`,
        context: { password: 'hunter2', note: 'ok' },
      });
      expect(res.status).toBe(201);
      const entry = res.body as LogEntry;
      entryId = entry.id;
      expect(entry.organizationId).toBe(tenantA.organizationId);
      expect(entry.userId).toBe(tenantA.userId);
      const stored = JSON.stringify(entry);
      expect(stored).not.toContain('abcdef123456');
      expect(stored).not.toContain('hunter2');
    });

    it("rejects another organization's id supplied in the body", async () => {
      const res = await tenantA.api.post('/logger/capture').send({
        level: LogLevel.ERROR,
        source: LogSource.FRONTEND,
        message: 'spoof',
        organizationId: tenantB.organizationId,
      });
      expect(res.status).toBe(403); // OrganizationGuard: not the caller's organization
      const b = await tenantB.api.get('/logger/logs');
      expect(JSON.stringify(b.body)).not.toContain('spoof');
    });

    it("shows the entry to its own organization's admin only", async () => {
      const a = await tenantA.api.get('/logger/logs');
      expect((a.body as LogEntry[]).some((l) => l.id === entryId)).toBe(true);

      const b = await tenantB.api.get('/logger/logs');
      expect(b.status).toBe(200);
      expect((b.body as LogEntry[]).some((l) => l.id === entryId)).toBe(false);
      expect(JSON.stringify(b.body)).not.toContain(MARKER);

      const stats = await tenantB.api.get('/logger/stats');
      expect(stats.body.totalErrors).toBe(0);
    });

    it("cannot be read, updated, summarised or deleted by another organization's admin", async () => {
      const byId = await tenantB.api.get(`/logger/logs/${entryId}`);
      expect(byId.status).toBe(200);
      expect(byId.text).toBe('');

      const update = await tenantB.api
        .post('/logger/update-status')
        .send({ ids: [entryId], status: 'fixed' });
      expect(update.body).toEqual({ updated: 0 });

      const prompt = await tenantB.api.post('/logger/generate-prompt').send({ logIds: [entryId] });
      expect(prompt.body.logCount).toBe(0);

      const byIds = await tenantB.api.delete('/logger/clear').send({ ids: [entryId] });
      expect(byIds.body).toEqual({ removed: 0 });
      const all = await tenantB.api.delete('/logger/clear');
      expect(all.body).toEqual({ removed: 0 });

      const still = await tenantA.api.get('/logger/logs');
      expect((still.body as LogEntry[]).some((l) => l.id === entryId)).toBe(true);
    });

    it("clears only the caller's own entries", async () => {
      const res = await tenantA.api.delete('/logger/clear');
      expect(res.status).toBe(200);
      expect(res.body.removed).toBeGreaterThanOrEqual(1);
      expect((await tenantA.api.get('/logger/logs')).body).toEqual([]);
    });
  });

  describe('rate limiting', () => {
    it('throttles capture bursts (real throttler storage, separate app instance)', async () => {
      const throttled = (
        await Test.createTestingModule({ imports: [AppModule] }).compile()
      ).createNestApplication();
      await throttled.init();
      try {
        const api = ApiHelper.anonymous(throttled).withToken(tenantA.accessToken);
        const statuses = await Promise.all(
          Array.from({ length: 8 }, () =>
            api
              .post('/logger/capture')
              .send({ level: LogLevel.WARN, source: LogSource.FRONTEND, message: 'burst' })
              .then((r) => r.status),
          ),
        );
        expect(statuses).toContain(201);
        expect(statuses).toContain(429);
      } finally {
        await throttled.close();
      }
    });
  });

  describe('WebSocket /logger', () => {
    it('rejects a handshake without a token', async () => {
      const outcome = await connectLoggerSocket(port);
      sockets.push(outcome.socket);
      expect(outcome.connected).toBe(false);
      expect(outcome.error).toBe('Unauthorized');
    });

    it('rejects a forged token', async () => {
      const outcome = await connectLoggerSocket(port, 'forged.token.value');
      sockets.push(outcome.socket);
      expect(outcome.connected).toBe(false);
    });

    it('rejects a valid user without the admin-level permission', async () => {
      const outcome = await connectLoggerSocket(port, viewerToken);
      sockets.push(outcome.socket);
      expect(outcome.connected).toBe(false);
      expect(outcome.error).toBe('Unauthorized');
    });

    it("delivers broadcasts only to the entry's organization", async () => {
      const a = await connectLoggerSocket(port, tenantA.accessToken);
      const b = await connectLoggerSocket(port, tenantB.accessToken);
      sockets.push(a.socket, b.socket);
      expect(a.connected).toBe(true);
      expect(b.connected).toBe(true);

      const gateway = app.get(LoggerGateway);
      const forA = nextEvent<LogEntry>(a.socket, 'new-log', 1500);
      const forB = nextEvent<LogEntry>(b.socket, 'new-log', 600);

      // sockets join their room asynchronously after connecting
      await eventually(async () => {
        const rooms = (
          await app.get(LoggerGateway).server.in(`org:${tenantA.organizationId}`).fetchSockets()
        ).length;
        if (rooms < 1) throw new Error('not joined yet');
      });
      gateway.broadcastLog({
        id: 'e2e-entry',
        message: `${MARKER}-broadcast`,
        organizationId: tenantA.organizationId,
      } as unknown as LogEntry);

      expect((await forA)?.message).toBe(`${MARKER}-broadcast`);
      expect(await forB).toBeUndefined();
    });
  });
});

describe('Audit trail (e2e)', () => {
  let app: INestApplication;
  let tenant: TestTenant;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await registerTenant(app, 'Audit');
  });

  afterAll(async () => {
    await app.close();
  });

  it('stores a minimal redacted summary, never the response', async () => {
    const name = `Audit Vendor ${uniqueSuffix()}`;
    const created = await tenant.api.post('/vendors').send({ name });
    expect(created.status).toBe(201);

    const prisma = getPrisma(app);
    const row = await eventually(async () => {
      const found = await prisma.auditLog.findFirst({
        where: { organizationId: tenant.organizationId, entityId: created.body.id },
      });
      if (!found) throw new Error('audit row not written yet');
      return found;
    });

    expect(row).toMatchObject({
      userId: tenant.userId,
      entityType: 'vendors',
      action: 'CREATE',
      organizationId: tenant.organizationId,
    });
    expect(row.oldValues).toBeNull();
    const summary = row.newValues as { fields: string[]; values?: unknown };
    expect(summary.fields).toEqual(['name']);
    // request values (document content) are never stored, only field names
    expect(summary.values).toBeUndefined();
    const stored = JSON.stringify(row.newValues);
    expect(stored).not.toContain(name);
    // none of the response's columns were copied
    expect(stored).not.toContain('createdAt');
    expect(stored).not.toContain('organizationId');
  });
});

describe('Organization currency (e2e)', () => {
  let app: INestApplication;
  let anon: ApiHelper;
  let tenant: TestTenant;

  /** A real user of `tenant` whose custom role only has `purchases.view` (no settings access). */
  async function loginPurchasesViewer(): Promise<ApiHelper> {
    const prisma = getPrisma(app);
    const role = await prisma.role.create({
      data: {
        name: `AP-Viewer-${uniqueSuffix()}`,
        organizationId: tenant.organizationId,
        permissions: { create: [{ module: 'purchases', actions: ['view'] }] },
      },
    });
    const email = `e2e-ap-viewer-${uniqueSuffix()}@mizano.test`;
    await prisma.user.create({
      data: {
        email,
        name: 'E2E AP Viewer',
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
        roleId: role.id,
        organizationId: tenant.organizationId,
      },
    });
    const login = await anon.post('/auth/login').send({ email, password: TEST_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.organization.baseCurrency).toBe('EGP');
    return anon.withToken(login.body.tokens.accessToken as string);
  }

  beforeAll(async () => {
    app = await createTestApp();
    anon = ApiHelper.anonymous(app);
    tenant = await registerTenant(app, 'Currency');
    // Before anything is posted the base currency may still be chosen (guarded settings path).
    const general = await tenant.api
      .patch('/organization/settings/general')
      .send({ baseCurrency: 'EGP' });
    expect(general.status).toBe(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the base currency to a purchases.view-only user without settings access', async () => {
    const viewer = await loginPurchasesViewer();
    expect((await viewer.get('/organization')).status).toBe(403);
    expect((await viewer.get('/bills')).status).toBe(200);

    const res = await viewer.get('/organization/base-currency');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ baseCurrency: 'EGP' });
  });

  it('rejects anonymous callers of the base-currency lookup', async () => {
    expect((await anon.get('/organization/base-currency')).status).toBe(401);
  });

  it('cannot change the currency through PATCH /organization once journals exist', async () => {
    const chart = await seedChart(tenant.api);
    const created = await tenant.api.post('/journals').send({
      date: isoDay(-1),
      reference: `CUR-${uniqueSuffix()}`,
      lines: [
        { accountId: chart.bank, debit: '100' },
        { accountId: chart.revenue, credit: '100' },
      ],
    });
    expect(created.status).toBe(201);
    if (!created.body.isPosted) {
      expect((await tenant.api.post(`/journals/${created.body.id}/post`)).status).toBe(201);
    }

    const legacy = await tenant.api.patch('/organization').send({ currency: 'USD' });
    expect(legacy.status).toBe(400);
    const guarded = await tenant.api
      .patch('/organization/settings/general')
      .send({ baseCurrency: 'USD' });
    expect(guarded.status).toBe(400);

    const stored = await getPrisma(app).organization.findUniqueOrThrow({
      where: { id: tenant.organizationId },
      select: { currency: true, baseCurrency: true },
    });
    expect(stored).toEqual({ currency: 'EGP', baseCurrency: 'EGP' });
    // The legacy route still edits the non-currency fields.
    expect((await tenant.api.patch('/organization').send({ phone: '+20100000000' })).status).toBe(
      200,
    );
  });
});
