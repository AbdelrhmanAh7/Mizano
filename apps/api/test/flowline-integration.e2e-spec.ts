/**
 * FlowLine connector, end to end against the real AppModule and database:
 *
 *  - Mizano -> FlowLine: business changes write outbox events in their own transaction; the
 *    dispatcher signs and POSTs them to a local receiver that runs FlowLine's exact verification
 *    (copied from FlowLine src/routes/api/public/webhooks.$endpointId.ts: WebCrypto HMAC of
 *    "<t>.<event id>.<body>", 300 s tolerance, dedupe on x-flowline-event-id). Retries, backoff,
 *    permanent failures, redelivery and the overdue scan are exercised.
 *  - FlowLine -> Mizano: the scoped integration API key creates customers, draft invoices and
 *    notes (with Idempotency-Key replay), reads invoices and balances, and is rate limited,
 *    scope-checked, revocable and tenant-isolated.
 *
 * The dispatcher's interval is disabled; the test drives `processDue()` so timing is exact.
 */
import { INestApplication } from '@nestjs/common';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { isoDay } from './helpers/journey.helper';
import { PrismaService } from '../src/prisma/prisma.service';
import { WebhookDispatcherService } from '../src/modules/integrations/services/webhook-dispatcher.service';
import { OverdueScannerService } from '../src/modules/integrations/services/overdue-scanner.service';

// ── A receiver that behaves exactly like FlowLine's public webhook route ──────────

interface Received {
  eventId: string;
  body: string;
  json: { id: string; type: string; source: { type: string }; data: Record<string, unknown> };
  status: number;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

class FlowlineReceiver {
  server!: Server;
  readonly endpointId = randomUUID();
  readonly secret = `whsec_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  received: Received[] = [];
  rejected: { status: number; reason: string }[] = [];
  private seen = new Set<string>();
  /** Statuses to answer before behaving normally (e.g. [503, 503]). */
  failNext: number[] = [];

  get url(): string {
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}/api/public/webhooks/${this.endpointId}`;
  }

  start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    return new Promise((resolve) => this.server.listen(0, '127.0.0.1', resolve));
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  ofType(type: string): Received[] {
    return this.received.filter((r) => r.json.type === type && r.status === 202);
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    const reply = (status: number, payload: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.url !== `/api/public/webhooks/${this.endpointId}`) return reply(404, 'Not found');
    if (body.length > 256 * 1024) return reply(413, 'Payload too large');
    const sigHeader = String(req.headers['x-flowline-signature'] ?? '');
    const eventId = String(req.headers['x-flowline-event-id'] ?? '');
    const parts = Object.fromEntries(
      sigHeader.split(',').map((p) => p.trim().split('=') as [string, string]),
    ) as { t?: string; v1?: string };
    const t = Number(parts.t);
    const reject = (status: number, reason: string): void => {
      this.rejected.push({ status, reason });
      reply(status, reason);
    };
    if (!parts.v1 || !Number.isFinite(t) || !eventId || eventId.length > 200) {
      return reject(400, 'Missing signature or event id');
    }
    if (Math.abs(Date.now() / 1000 - t) > 300)
      return reject(401, 'Signature timestamp outside tolerance');
    const expected = await hmacHex(this.secret, `${t}.${eventId}.${body}`);
    if (!safeEqual(expected, parts.v1)) return reject(401, 'Invalid signature');
    const json = JSON.parse(body) as Received['json'];

    const forced = this.failNext.shift();
    if (forced) {
      this.received.push({ eventId, body, json, status: forced });
      return reply(forced, 'forced failure');
    }
    if (this.seen.has(eventId)) {
      this.received.push({ eventId, body, json, status: 200 });
      return reply(200, { duplicate: true });
    }
    this.seen.add(eventId);
    this.received.push({ eventId, body, json, status: 202 });
    return reply(202, { runId: randomUUID(), status: 'succeeded' });
  }
}

// ── Test ──────────────────────────────────────────────────────────────────────

describe('FlowLine integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dispatcher: WebhookDispatcherService;
  let scanner: OverdueScannerService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  const flowline = new FlowlineReceiver();

  let apiKey = '';
  let apiKeyId = '';
  let endpointId = '';
  let customerId = '';
  let invoiceId = '';
  let bankAccountId = '';

  const key = (k = apiKey) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${k}`),
    post: (url: string) =>
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${k}`),
  });

  const deliver = async (): Promise<void> => {
    await dispatcher.processDue();
  };

  beforeAll(async () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'e2e-integrations-key-that-is-long-enough-123';
    process.env.INTEGRATIONS_ALLOW_PRIVATE_WEBHOOKS = 'true';
    process.env.INTEGRATIONS_DISPATCH_ENABLED = 'false';
    await flowline.start();
    app = await createTestApp();
    prisma = getPrisma(app);
    dispatcher = app.get(WebhookDispatcherService);
    scanner = app.get(OverdueScannerService);
    tenantA = await registerTenant(app, 'FlowA');
    tenantB = await registerTenant(app, 'FlowB');
    a = tenantA.api;
    expect((await a.post('/accounts/seed-defaults')).status).toBe(201);
    const settings = await a.get('/organization/account-settings');
    bankAccountId = settings.body.defaultBankAccountId;
    expect(bankAccountId).toEqual(expect.any(String));
  });

  afterAll(async () => {
    await app.close();
    await flowline.stop();
  });

  describe('connect (settings screen)', () => {
    it('creates a scoped API key whose plaintext is returned once and stored only as a hash', async () => {
      const res = await a.post('/integration-settings/api-keys').send({
        name: 'FlowLine',
        scopes: [
          'customers:read',
          'customers:write',
          'invoices:read',
          'invoices:write',
          'balances:read',
          'notes:write',
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body.key).toMatch(/^mzk_[A-Za-z0-9_-]{43}$/);
      apiKey = res.body.key;
      apiKeyId = res.body.id;

      const list = await a.get('/integration-settings/api-keys');
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).not.toContain(apiKey);
      expect(list.body[0]).not.toHaveProperty('keyHash');
      const row = await prisma.integrationApiKey.findUniqueOrThrow({ where: { id: apiKeyId } });
      expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.keyHash).not.toContain(apiKey);
    });

    it('rejects an unsafe or invalid webhook URL', async () => {
      const res = await a.post('/integration-settings/webhooks').send({
        name: 'bad',
        url: 'ftp://example.com/x',
        secret: flowline.secret,
        eventTypes: ['invoice.paid'],
      });
      expect(res.status).toBe(400);
    });

    it('registers the FlowLine webhook with its signing secret encrypted at rest', async () => {
      const res = await a.post('/integration-settings/webhooks').send({
        name: 'FlowLine pilot',
        url: flowline.url,
        secret: flowline.secret,
        eventTypes: [
          'customer.created',
          'invoice.created',
          'invoice.sent',
          'invoice.paid',
          'invoice.overdue',
          'payment.received',
        ],
      });
      expect(res.status).toBe(201);
      endpointId = res.body.id;
      expect(res.body).not.toHaveProperty('secretCiphertext');
      expect(res.body.secretHint).toMatch(/^whs…/);
      const row = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpointId } });
      expect(row.secretCiphertext).not.toContain(flowline.secret);
    });

    it('sends a signed test event that FlowLine accepts', async () => {
      const res = await a.post(`/integration-settings/webhooks/${endpointId}/test`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('SUCCEEDED');
      expect(res.body.lastStatusCode).toBe(202);
      const [test] = flowline.ofType('mizano.test');
      expect(test.eventId).toBe(res.body.eventId);
      expect(test.json.id).toBe(test.eventId);
      expect(flowline.rejected).toEqual([]);
    });
  });

  describe('FlowLine -> Mizano actions with the API key', () => {
    it('authenticates the key and rejects missing, malformed and unknown keys', async () => {
      const me = await key().get('/integrations/v1/me');
      expect(me.status).toBe(200);
      expect(me.body.organization.id).toBe(tenantA.organizationId);
      expect(me.body.key.scopes).toContain('invoices:write');

      expect((await request(app.getHttpServer()).get('/integrations/v1/me')).status).toBe(401);
      expect((await key('mzk_nope').get('/integrations/v1/me')).status).toBe(401);
      expect((await key(`mzk_${'A'.repeat(43)}`).get('/integrations/v1/me')).status).toBe(401);
      // A user JWT is not an integration key.
      expect((await key(tenantA.accessToken).get('/integrations/v1/me')).status).toBe(401);
    });

    it('creates a customer once per Idempotency-Key and replays the same response', async () => {
      const body = {
        name: 'شركة النيل للتجارة',
        email: 'nile@example.com',
        phone: '+201000000000',
      };
      const first = await key()
        .post('/integrations/v1/customers')
        .set('Idempotency-Key', 'run-1:create-customer')
        .send(body);
      expect(first.status).toBe(201);
      customerId = first.body.data.id;
      expect(first.body.data.name).toBe(body.name);

      const again = await key()
        .post('/integrations/v1/customers')
        .set('Idempotency-Key', 'run-1:create-customer')
        .send(body);
      expect(again.status).toBe(201);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(again.body.data.id).toBe(customerId);
      expect(
        await prisma.customer.count({
          where: { organizationId: tenantA.organizationId, email: body.email },
        }),
      ).toBe(1);

      const conflict = await key()
        .post('/integrations/v1/customers')
        .set('Idempotency-Key', 'run-1:create-customer')
        .send({ ...body, name: 'Other' });
      expect(conflict.status).toBe(422);
    });

    it('finds the customer by e-mail', async () => {
      const res = await key().get('/integrations/v1/customers?email=NILE@example.com');
      expect(res.status).toBe(200);
      expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([customerId]);
    });

    it('creates a DRAFT invoice through the regular sales command', async () => {
      const res = await key()
        .post('/integrations/v1/invoices')
        .set('Idempotency-Key', 'run-1:create-invoice')
        .send({
          customerId,
          date: isoDay(0),
          dueDate: isoDay(14),
          lines: [{ description: 'استشارات', quantity: '2', rate: '500', taxRate: '14' }],
          notes: 'Created by FlowLine',
        });
      expect(res.status).toBe(201);
      invoiceId = res.body.data.id;
      expect(res.body.data).toMatchObject({
        status: 'DRAFT',
        total: '1140.0000',
        balanceDue: '1140.0000',
        amountPaid: '0.0000',
        customer: { id: customerId },
      });
      expect(res.body.data.number).toMatch(/^INV-/);
      // Drafts never post: no journal exists for it.
      expect(
        await prisma.journal.count({
          where: { organizationId: tenantA.organizationId, sourceId: invoiceId },
        }),
      ).toBe(0);
    });

    it('validates input with the same DTO rules as the web app', async () => {
      const res = await key()
        .post('/integrations/v1/invoices')
        .send({
          customerId,
          date: isoDay(0),
          dueDate: isoDay(1),
          lines: [{ description: 'x', quantity: 'abc', rate: '1' }],
        });
      expect(res.status).toBe(400);
    });

    it('adds a note to the invoice and notifies the key owner in-app', async () => {
      const res = await key()
        .post('/integrations/v1/notes')
        .set('Idempotency-Key', 'run-1:note')
        .send({
          entityType: 'invoice',
          entityId: invoiceId,
          body: 'تم إرسال الفاتورة للعميل عبر واتساب',
        });
      expect(res.status).toBe(201);
      const list = await key().get(
        `/integrations/v1/notes?entityType=invoice&entityId=${invoiceId}`,
      );
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      const n = await prisma.notification.findFirst({
        where: {
          organizationId: tenantA.organizationId,
          type: 'integration.note',
          entityId: invoiceId,
        },
      });
      expect(n?.userId).toBe(tenantA.userId);

      const missing = await key()
        .post('/integrations/v1/notes')
        .send({ entityType: 'invoice', entityId: 'nope', body: 'x' });
      expect(missing.status).toBe(404);
    });

    it('records writes in the audit log as the key owner', async () => {
      const audit = await prisma.auditLog.findFirst({
        where: { organizationId: tenantA.organizationId, entityType: 'integrations' },
      });
      expect(audit?.userId).toBe(tenantA.userId);
    });
  });

  describe('Mizano -> FlowLine events', () => {
    it('delivers customer.created and invoice.created, marking API-key writes as such', async () => {
      await deliver();
      const [cust] = flowline.ofType('customer.created');
      expect(cust.json.data).toMatchObject({
        customer: { id: customerId, email: 'nile@example.com' },
      });
      expect(cust.json.source).toMatchObject({ type: 'api_key', apiKeyId });
      const [inv] = flowline.ofType('invoice.created');
      expect(inv.json.data).toMatchObject({ invoice: { id: invoiceId, status: 'DRAFT' } });
      expect(flowline.rejected).toEqual([]);
    });

    it('delivers invoice.sent when an accountant sends the invoice', async () => {
      expect((await a.patch(`/invoices/${invoiceId}/send`)).status).toBe(200);
      await deliver();
      const [sent] = flowline.ofType('invoice.sent');
      expect(sent.json.data).toMatchObject({
        invoice: { id: invoiceId, status: 'SENT', balanceDue: '1140.0000' },
      });
      expect(sent.json.source).toEqual({ type: 'user' });
    });

    it('reports balances through the API', async () => {
      const res = await key().get(`/integrations/v1/customers/${customerId}/balance`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        outstanding: '1140.0000',
        overdue: '0.0000',
        openInvoices: 1,
      });
      const org = await key().get('/integrations/v1/balances');
      expect(org.body.data.outstanding).toBe('1140.0000');
    });

    it('delivers payment.received on a partial payment, then invoice.paid once fully settled', async () => {
      const partial = await a.post(`/invoices/${invoiceId}/record-payment`).send({
        amount: '140',
        date: isoDay(0),
        depositToAccountId: bankAccountId,
      });
      expect(partial.status).toBe(201);
      await deliver();
      expect(flowline.ofType('payment.received')).toHaveLength(1);
      expect(flowline.ofType('invoice.paid')).toHaveLength(0);

      const rest = await a.post(`/invoices/${invoiceId}/record-payment`).send({
        amount: '1000',
        date: isoDay(0),
        depositToAccountId: bankAccountId,
      });
      expect(rest.status).toBe(201);
      await deliver();
      expect(flowline.ofType('payment.received')).toHaveLength(2);
      const [paid] = flowline.ofType('invoice.paid');
      expect(paid.json.data).toMatchObject({
        invoice: { id: invoiceId, status: 'PAID', balanceDue: '0.0000', amountPaid: '1140.0000' },
      });

      const inv = await key().get(`/integrations/v1/invoices/${invoiceId}`);
      expect(inv.body.data.status).toBe('PAID');
    });

    it('emits invoice.overdue once per invoice and due date, old debts only on request', async () => {
      const draft = await a.post('/invoices').send({
        customerId,
        date: isoDay(-40),
        dueDate: isoDay(-10),
        lines: [{ description: 'Old work', quantity: '1', rate: '300' }],
      });
      expect(draft.status).toBe(201);
      expect((await a.patch(`/invoices/${draft.body.id}/send`)).status).toBe(200);

      // Overdue before the endpoint subscribed: no flood on the first scan (audit F2) ...
      expect(await scanner.scan()).toBe(0);
      // ... until the owner explicitly asks for the backlog.
      const backlog = await a.post(`/integration-settings/webhooks/${endpointId}/overdue-backlog`);
      expect(backlog.status).toBe(201);
      expect(await scanner.scan()).toBeGreaterThanOrEqual(1);
      expect(await scanner.scan()).toBe(0);
      await deliver();
      const overdue = flowline
        .ofType('invoice.overdue')
        .filter((r) => (r.json.data.invoice as { id: string }).id === draft.body.id);
      expect(overdue).toHaveLength(1);
      expect(overdue[0].json.data.invoice).toMatchObject({
        daysOverdue: 10,
        balanceDue: '300.0000',
      });
      expect(overdue[0].json.source).toEqual({ type: 'system' });
    });
  });

  describe('delivery reliability', () => {
    it('retries 5xx with backoff, keeping the event id, and logs every attempt', async () => {
      flowline.failNext = [503, 500];
      const created = await a.post('/customers').send({ name: 'Retry Co' });
      expect(created.status).toBe(201);

      await deliver();
      const delivery = await prisma.webhookDelivery.findFirstOrThrow({
        where: {
          organizationId: tenantA.organizationId,
          event: { type: 'customer.created', payload: { contains: created.body.id } },
        },
      });
      let row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(row).toMatchObject({ status: 'PENDING', attempts: 1, lastStatusCode: 503 });
      expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20_000);

      // Not due yet: nothing is sent.
      await deliver();
      expect(
        (await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).attempts,
      ).toBe(1);

      for (let i = 0; i < 2; i++) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { nextAttemptAt: new Date() },
        });
        await deliver();
      }
      row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(row).toMatchObject({ status: 'SUCCEEDED', attempts: 3, lastStatusCode: 202 });
      const attempts = await prisma.webhookDeliveryAttempt.findMany({
        where: { deliveryId: delivery.id },
        orderBy: { attempt: 'asc' },
      });
      expect(attempts.map((x) => x.statusCode)).toEqual([503, 500, 202]);
      const ids = new Set(
        flowline.received.filter((r) => r.json.id === row.eventId).map((r) => r.eventId),
      );
      expect([...ids]).toEqual([row.eventId]);

      const log = await a.get(`/integration-settings/deliveries?endpointId=${endpointId}`);
      expect(log.status).toBe(200);
      expect(log.body.find((d: { id: string }) => d.id === delivery.id)).toMatchObject({
        eventType: 'customer.created',
        status: 'SUCCEEDED',
      });
    });

    it('fails a permanently rejected delivery at once and lets an admin redeliver it', async () => {
      flowline.failNext = [401];
      const created = await a.post('/customers').send({ name: 'Rejected Co' });
      await deliver();
      const delivery = await prisma.webhookDelivery.findFirstOrThrow({
        where: {
          organizationId: tenantA.organizationId,
          event: { payload: { contains: created.body.id } },
        },
      });
      expect(delivery).toMatchObject({ status: 'FAILED', attempts: 1, lastStatusCode: 401 });

      const redo = await a.post(`/integration-settings/deliveries/${delivery.id}/redeliver`);
      expect(redo.status).toBe(201);
      await deliver();
      const after = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(after).toMatchObject({ status: 'SUCCEEDED', attempts: 2 });
    });

    it('redelivering an already delivered event is deduplicated by FlowLine', async () => {
      const done = await prisma.webhookDelivery.findFirstOrThrow({
        where: {
          organizationId: tenantA.organizationId,
          status: 'SUCCEEDED',
          event: { type: 'invoice.paid' },
        },
      });
      expect((await a.post(`/integration-settings/deliveries/${done.id}/redeliver`)).status).toBe(
        201,
      );
      await deliver();
      const dupes = flowline.received.filter((r) => r.eventId === done.eventId);
      expect(dupes.map((r) => r.status)).toEqual([202, 200]);
      expect(flowline.ofType('invoice.paid')).toHaveLength(1);
    });

    it('writes no events for organizations without a subscribed endpoint', async () => {
      const before = await prisma.webhookEvent.count({
        where: { organizationId: tenantB.organizationId },
      });
      expect((await tenantB.api.post('/customers').send({ name: 'Quiet Co' })).status).toBe(201);
      expect(
        await prisma.webhookEvent.count({ where: { organizationId: tenantB.organizationId } }),
      ).toBe(before);
    });

    it('never left a request that FlowLine would reject for its signature', () => {
      expect(flowline.rejected).toEqual([]);
    });
  });

  describe('key controls', () => {
    it('enforces scopes', async () => {
      const res = await a
        .post('/integration-settings/api-keys')
        .send({ name: 'read only', scopes: ['customers:read'] });
      const ro = res.body.key as string;
      expect((await key(ro).get('/integrations/v1/customers')).status).toBe(200);
      expect((await key(ro).get(`/integrations/v1/invoices/${invoiceId}`)).status).toBe(403);
      expect((await key(ro).post('/integrations/v1/customers').send({ name: 'x' })).status).toBe(
        403,
      );
    });

    it('isolates tenants: tenant B cannot read tenant A records or settings', async () => {
      const res = await tenantB.api
        .post('/integration-settings/api-keys')
        .send({ name: 'B', scopes: ['invoices:read', 'customers:read', 'notes:write'] });
      const kb = res.body.key as string;
      expect((await key(kb).get(`/integrations/v1/invoices/${invoiceId}`)).status).toBe(404);
      expect((await key(kb).get(`/integrations/v1/customers/${customerId}`)).status).toBe(404);
      expect(
        (
          await key(kb)
            .post('/integrations/v1/notes')
            .send({ entityType: 'invoice', entityId: invoiceId, body: 'x' })
        ).status,
      ).toBe(404);
      const list = await key(kb).get('/integrations/v1/invoices');
      expect(list.body.data).toEqual([]);
      expect(
        (await tenantB.api.post(`/integration-settings/webhooks/${endpointId}/test`)).status,
      ).toBe(404);
      expect((await tenantB.api.get('/integration-settings/deliveries')).body).toEqual([]);
      expect(
        (await tenantB.api.post(`/integration-settings/api-keys/${apiKeyId}/revoke`)).status,
      ).toBe(404);
    });

    it('rate limits per key with Retry-After', async () => {
      const res = await a
        .post('/integration-settings/api-keys')
        .send({ name: 'slow', scopes: ['customers:read'], rateLimitPerMinute: 3 });
      const slow = res.body.key as string;
      for (let i = 0; i < 3; i++)
        expect((await key(slow).get('/integrations/v1/me')).status).toBe(200);
      const limited = await key(slow).get('/integrations/v1/me');
      expect(limited.status).toBe(429);
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('stops working immediately when revoked', async () => {
      const res = await a.post(`/integration-settings/api-keys/${apiKeyId}/revoke`);
      expect(res.status).toBe(201);
      expect(res.body.revokedAt).toEqual(expect.any(String));
      expect((await key().get('/integrations/v1/me')).status).toBe(401);
    });

    it('does not let a user without settings.edit manage integrations anonymously', async () => {
      expect(
        (await request(app.getHttpServer()).get('/integration-settings/api-keys')).status,
      ).toBe(401);
    });
  });
});
