import { createHash } from 'crypto';
import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { InvoicesService } from '../../sales/services/invoices.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { IntegrationApiKeyGuard, KeyRateLimiter } from '../guards/integration-api-key.guard';
import { integrationRequestContext } from '../integration-request-context';
import { hashApiKey, generateApiKey } from '../utils/api-key';
import { sealSecret } from '../../../common/utils/secret-box';
import { verifyFlowlineSignature } from '../utils/flowline-signature';
import { IntegrationApiService } from './integration-api.service';
import {
  isRetryableStatus,
  nextDelaySeconds,
  RETRY_SCHEDULE_SECONDS,
  WebhookDispatcherService,
} from './webhook-dispatcher.service';
import { WebhookOutboxService } from './webhook-outbox.service';

const ORG = 'org_1';

describe('retry policy', () => {
  it('retries server errors, throttling, timeouts and 409, not other client errors', () => {
    for (const s of [500, 502, 503, 504, 408, 409, 425, 429])
      expect(isRetryableStatus(s)).toBe(true);
    for (const s of [400, 401, 403, 404, 410, 413, 422]) expect(isRetryableStatus(s)).toBe(false);
  });

  it('backs off along the schedule with ±10% jitter and caps at the last step', () => {
    expect(nextDelaySeconds(1, () => 0.5)).toBe(30);
    expect(nextDelaySeconds(2, () => 0)).toBe(108);
    expect(nextDelaySeconds(3, () => 1)).toBe(660);
    expect(nextDelaySeconds(50, () => 0.5)).toBe(
      RETRY_SCHEDULE_SECONDS[RETRY_SCHEDULE_SECONDS.length - 1],
    );
  });
});

describe('WebhookOutboxService', () => {
  it('writes nothing when no active endpoint subscribes to the event type', async () => {
    const db = {
      webhookEndpoint: { findMany: jest.fn().mockResolvedValue([]) },
      webhookEvent: { create: jest.fn() },
      invoice: { findFirst: jest.fn() },
    };
    const outbox = new WebhookOutboxService(db as unknown as PrismaService);
    await expect(
      outbox.invoiceEvent(db as unknown as PrismaService, ORG, 'invoice.paid', 'inv_1'),
    ).resolves.toBeNull();
    expect(db.webhookEndpoint.findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: ORG,
      isActive: true,
      deletedAt: null,
      eventTypes: { has: 'invoice.paid' },
    });
    expect(db.invoice.findFirst).not.toHaveBeenCalled();
    expect(db.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('creates the event with one delivery per subscriber and tags API-key writes', async () => {
    const db = {
      webhookEndpoint: { findMany: jest.fn().mockResolvedValue([{ id: 'ep1' }, { id: 'ep2' }]) },
      organization: { findUnique: jest.fn().mockResolvedValue({ id: ORG, name: 'Noor' }) },
      webhookEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const outbox = new WebhookOutboxService(db as unknown as PrismaService);
    const id = await integrationRequestContext.run(
      { apiKeyId: 'key1', apiKeyName: 'FlowLine' },
      () =>
        outbox.record(db as unknown as PrismaService, ORG, 'customer.created', {
          customer: { id: 'c1' },
        }),
    );
    expect(id).toMatch(/^evt_[0-9a-f]{32}$/);
    const data = db.webhookEvent.create.mock.calls[0][0].data;
    expect(data.deliveries.create).toEqual([
      { organizationId: ORG, endpointId: 'ep1' },
      { organizationId: ORG, endpointId: 'ep2' },
    ]);
    const payload = JSON.parse(data.payload);
    expect(payload).toMatchObject({
      id,
      type: 'customer.created',
      organization: { id: ORG, name: 'Noor' },
      source: { type: 'api_key', apiKeyId: 'key1', apiKeyName: 'FlowLine' },
      data: { customer: { id: 'c1' } },
    });
  });
});

describe('WebhookDispatcherService', () => {
  const secret = 'whsec_unit_test_secret_value_0123456789';
  beforeAll(() => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'unit-test-integrations-key-0123456789';
    process.env.INTEGRATIONS_ALLOW_PRIVATE_WEBHOOKS = 'true';
  });

  function setup(attempts: number, maxAttempts = 8) {
    const delivery = {
      id: 'd1',
      organizationId: ORG,
      maxAttempts,
      event: { id: 'evt_abc', payload: '{"id":"evt_abc"}' },
      endpoint: {
        id: 'ep1',
        organizationId: ORG,
        url: 'http://127.0.0.1:9/hook',
        isActive: true,
        deletedAt: null,
        secretCiphertext: sealSecret(secret, `${ORG}:ep1`),
      },
    };
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'd1', attempts }])
        .mockResolvedValue([]),
      webhookDelivery: {
        findUnique: jest.fn().mockResolvedValue(delivery),
        update: jest.fn((a) => a),
      },
      webhookDeliveryAttempt: { create: jest.fn((a) => a) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const svc = new WebhookDispatcherService(prisma as unknown as PrismaService);
    return { svc, prisma };
  }

  const update = (prisma: ReturnType<typeof setup>['prisma']) =>
    prisma.webhookDelivery.update.mock.calls[0][0].data;

  it('signs the stored body with a fresh timestamp and marks a 2xx as delivered', async () => {
    const { svc, prisma } = setup(1);
    const transport = jest.fn().mockResolvedValue({ status: 202 });
    svc.transport = transport;
    await svc.processDue();
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:9/hook');
    expect(init.body).toBe('{"id":"evt_abc"}');
    expect(init.headers['x-flowline-event-id']).toBe('evt_abc');
    expect(
      verifyFlowlineSignature(secret, 'evt_abc', init.body, init.headers['x-flowline-signature']),
    ).toBe(true);
    expect(update(prisma)).toMatchObject({
      status: 'SUCCEEDED',
      lastStatusCode: 202,
      lockedUntil: null,
    });
    expect(prisma.webhookDeliveryAttempt.create.mock.calls[0][0].data).toMatchObject({
      deliveryId: 'd1',
      attempt: 1,
      statusCode: 202,
    });
  });

  it('reschedules a retryable failure', async () => {
    const { svc, prisma } = setup(2);
    svc.transport = jest.fn().mockResolvedValue({ status: 503 });
    const before = Date.now();
    await svc.processDue();
    const data = update(prisma);
    expect(data.status).toBe('PENDING');
    expect(data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 108_000);
  });

  it('treats network errors as retryable and records only their class', async () => {
    const { svc, prisma } = setup(1);
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    svc.transport = jest.fn().mockRejectedValue(err);
    await svc.processDue();
    expect(update(prisma)).toMatchObject({ status: 'PENDING', lastStatusCode: null });
    expect(update(prisma).lastError).toContain('ECONNREFUSED');
  });

  it('fails permanently on a non-retryable 4xx or when attempts are exhausted', async () => {
    const a = setup(1);
    a.svc.transport = jest.fn().mockResolvedValue({ status: 401 });
    await a.svc.processDue();
    expect(update(a.prisma).status).toBe('FAILED');

    const b = setup(8, 8);
    b.svc.transport = jest.fn().mockResolvedValue({ status: 500 });
    await b.svc.processDue();
    expect(update(b.prisma).status).toBe('FAILED');
  });

  it('does not send to a disabled endpoint', async () => {
    const { svc, prisma } = setup(1);
    prisma.webhookDelivery.findUnique.mockResolvedValueOnce({
      ...(await prisma.webhookDelivery.findUnique()),
      endpoint: { id: 'ep1', organizationId: ORG, isActive: false, deletedAt: null },
    });
    const transport = jest.fn();
    svc.transport = transport;
    await svc.processDue();
    expect(transport).not.toHaveBeenCalled();
    expect(update(prisma).status).toBe('FAILED');
  });
});

describe('IntegrationApiKeyGuard', () => {
  const { key, hash } = generateApiKey();
  const baseKey = {
    id: 'k1',
    organizationId: ORG,
    createdById: 'u1',
    name: 'FlowLine',
    scopes: ['customers:read'],
    rateLimitPerMinute: 2,
    revokedAt: null as Date | null,
    expiresAt: null as Date | null,
    lastUsedAt: new Date(),
  };

  function ctx(headers: Record<string, string>, required: string[] = []) {
    const req: { headers: Record<string, string>; user?: unknown } = { headers };
    const res = { setHeader: jest.fn() };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    const context = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
    return { req, res, reflector, context };
  }

  function prismaFor(row: typeof baseKey | null, status = 'ACTIVE') {
    return {
      integrationApiKey: {
        findUnique: jest.fn(async ({ where }: { where: { keyHash: string } }) =>
          row && where.keyHash === hash ? row : null,
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A', status, roleId: 'r1' }),
      },
    } as unknown as PrismaService;
  }

  beforeEach(() => {
    (IntegrationApiKeyGuard as unknown as { limiter: KeyRateLimiter }).limiter =
      new KeyRateLimiter();
  });

  it('authenticates a valid key, acting as its creator within the key organization', async () => {
    const c = ctx({ authorization: `Bearer ${key}` }, ['customers:read']);
    const guard = new IntegrationApiKeyGuard(prismaFor(baseKey), c.reflector);
    await expect(guard.canActivate(c.context)).resolves.toBe(true);
    expect(c.req.user).toMatchObject({
      id: 'u1',
      organizationId: ORG,
      roleId: 'r1',
      apiKeyId: 'k1',
    });
    expect(hashApiKey(key)).toBe(hash);
  });

  it('rejects unknown, revoked, expired keys and inactive creators with 401', async () => {
    const tries: [typeof baseKey | null, string][] = [
      [null, 'ACTIVE'],
      [{ ...baseKey, revokedAt: new Date() }, 'ACTIVE'],
      [{ ...baseKey, expiresAt: new Date(Date.now() - 1000) }, 'ACTIVE'],
      [baseKey, 'INACTIVE'],
    ];
    for (const [row, status] of tries) {
      const c = ctx({ 'x-api-key': key });
      const guard = new IntegrationApiKeyGuard(prismaFor(row, status), c.reflector);
      await expect(guard.canActivate(c.context)).rejects.toMatchObject({ status: 401 });
    }
    const c = ctx({ authorization: 'Bearer not-a-key' });
    await expect(
      new IntegrationApiKeyGuard(prismaFor(baseKey), c.reflector).canActivate(c.context),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('requires every scope of the route (403)', async () => {
    const c = ctx({ authorization: `Bearer ${key}` }, ['invoices:write']);
    const guard = new IntegrationApiKeyGuard(prismaFor(baseKey), c.reflector);
    await expect(guard.canActivate(c.context)).rejects.toMatchObject({ status: 403 });
  });

  it('rate limits per key with Retry-After', async () => {
    const guard = (c: ReturnType<typeof ctx>) =>
      new IntegrationApiKeyGuard(prismaFor(baseKey), c.reflector);
    for (let i = 0; i < 2; i++) {
      const c = ctx({ authorization: `Bearer ${key}` });
      await expect(guard(c).canActivate(c.context)).resolves.toBe(true);
    }
    const c = ctx({ authorization: `Bearer ${key}` });
    const err = await guard(c)
      .canActivate(c.context)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect(c.res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });
});

describe('IntegrationApiService.idempotent', () => {
  const principal = {
    id: 'u1',
    email: '',
    name: '',
    organizationId: ORG,
    roleId: 'r1',
    apiKeyId: 'k1',
    apiKeyName: 'FlowLine',
    scopes: [],
  };
  const req = { method: 'POST', path: '/integrations/v1/customers', body: { name: 'A' } };

  type Row = {
    id: string;
    requestHash: string;
    responseStatus: number | null;
    responseBody: unknown;
  };

  /**
   * An in-memory store with transactional semantics: `$transaction` works on a copy and only
   * replaces the committed state when its callback succeeds, like Postgres rolling back.
   */
  function service() {
    let rows = new Map<string, Row>();
    let customers: string[] = [];
    const store = (state: { rows: Map<string, Row>; customers: string[] }) => ({
      integrationIdempotencyKey: {
        create: jest.fn(async ({ data }: { data: { key: string; requestHash: string } }) => {
          if (state.rows.has(data.key)) {
            throw new Prisma.PrismaClientKnownRequestError('dup', {
              code: 'P2002',
              clientVersion: 'x',
            });
          }
          state.rows.set(data.key, {
            id: data.key,
            requestHash: data.requestHash,
            responseStatus: null,
            responseBody: null,
          });
          return { id: data.key };
        }),
        findUnique: jest.fn(
          async ({ where }: { where: { apiKeyId_key: { key: string } } }) =>
            state.rows.get(where.apiKeyId_key.key) ?? null,
        ),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
          if (failNextResponseUpdate) {
            failNextResponseUpdate = false;
            throw new Error('connection lost');
          }
          state.rows.set(where.id, { ...state.rows.get(where.id)!, ...data });
        }),
      },
      customer: {
        create: jest.fn(async ({ data }: { data: { name: string } }) => {
          state.customers.push(data.name);
          return { id: `c${state.customers.length}` };
        }),
      },
    });
    let failNextResponseUpdate = false;
    const committed = () => store({ rows, customers });
    const prisma = {
      ...committed(),
      integrationIdempotencyKey: {
        findUnique: jest.fn(
          async ({ where }: { where: { apiKeyId_key: { key: string } } }) =>
            rows.get(where.apiKeyId_key.key) ?? null,
        ),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const draft = { rows: new Map(rows), customers: [...customers] };
        const result = await fn(store(draft));
        rows = draft.rows;
        customers = draft.customers;
        return result;
      }),
    };
    const svc = new IntegrationApiService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      { emit: jest.fn() } as never,
    );
    return {
      svc,
      prisma,
      rows: () => rows,
      setRow: (key: string, row: Row) => rows.set(key, row),
      customers: () => customers,
      failNextResponseUpdate: () => {
        failNextResponseUpdate = true;
      },
    };
  }

  /** The integration write under test: creates a customer in the given transaction. */
  const createCustomer = async (tx: unknown) => {
    const t = tx as { customer: { create: (a: { data: { name: string } }) => Promise<unknown> } };
    return { data: await t.customer.create({ data: { name: 'A' } }) };
  };

  it('runs once and replays the stored response for the same request', async () => {
    const { svc, customers } = service();
    const fn = jest.fn(createCustomer);
    const first = await svc.idempotent(principal, 'k-1', req, 201, fn);
    const second = await svc.idempotent(principal, 'k-1', req, 201, fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(customers()).toEqual(['A']);
    expect(first).toMatchObject({ status: 201, replayed: false });
    expect(second).toEqual({ status: 201, body: { data: { id: 'c1' } }, replayed: true });
  });

  it('commits the record and its idempotency key together (audit F1)', async () => {
    const { svc, rows, customers, failNextResponseUpdate } = service();
    // The customer is written, then storing the response fails (crash, lost connection).
    failNextResponseUpdate();
    await expect(svc.idempotent(principal, 'k-1', req, 201, createCustomer)).rejects.toThrow(
      'connection lost',
    );
    // Neither the customer nor an in-progress key survives, so the retry is not a 409 and
    // does not create a second customer.
    expect(customers()).toEqual([]);
    expect(rows().has('k-1')).toBe(false);
    await expect(svc.idempotent(principal, 'k-1', req, 201, createCustomer)).resolves.toMatchObject(
      { status: 201, replayed: false },
    );
    expect(customers()).toEqual(['A']);
    expect(rows().get('k-1')).toMatchObject({ responseStatus: 201 });
  });

  it('replays the winner when a concurrent duplicate loses the key at insert', async () => {
    const { svc, prisma, rows, setRow, customers } = service();
    await svc.idempotent(principal, 'k-0', req, 201, createCustomer);
    const requestHash = rows().get('k-0')!.requestHash;
    // The pre-check misses the winner, which commits before this request claims the key.
    prisma.integrationIdempotencyKey.findUnique.mockImplementationOnce(async () => {
      setRow('k-1', { id: 'k-1', requestHash, responseStatus: 201, responseBody: { won: true } });
      return null;
    });
    await expect(svc.idempotent(principal, 'k-1', req, 201, createCustomer)).resolves.toEqual({
      status: 201,
      body: { won: true },
      replayed: true,
    });
    expect(customers()).toEqual(['A']);
  });

  it('replays the same body sent with another key order; arrays keep their order', async () => {
    const { svc } = service();
    const body = { name: 'A', billingAddress: { city: 'Cairo', street: '1 Tahrir' }, tags: [1, 2] };
    const reordered = {
      tags: [1, 2],
      billingAddress: { street: '1 Tahrir', city: 'Cairo' },
      name: 'A',
    };
    const fn = jest.fn(createCustomer);
    await svc.idempotent(principal, 'k-1', { ...req, body }, 201, fn);
    await expect(
      svc.idempotent(principal, 'k-1', { ...req, body: reordered }, 201, fn),
    ).resolves.toMatchObject({ status: 201, replayed: true });
    expect(fn).toHaveBeenCalledTimes(1);
    await expect(
      svc.idempotent(principal, 'k-1', { ...req, body: { ...body, tags: [2, 1] } }, 201, fn),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('still replays a key stored under the pre-canonical hash', async () => {
    const { svc, setRow } = service();
    const body = { name: 'A', email: 'a@nile.example' };
    const legacyHash = createHash('sha256')
      .update(`${req.method} ${req.path}\n${JSON.stringify(body)}`)
      .digest('hex');
    setRow('k-1', {
      id: 'k-1',
      requestHash: legacyHash,
      responseStatus: 201,
      responseBody: { old: 1 },
    });
    await expect(
      svc.idempotent(principal, 'k-1', { ...req, body }, 201, async () => 1),
    ).resolves.toEqual({ status: 201, body: { old: 1 }, replayed: true });
  });

  it('rejects a different body with the same key (422) and a legacy unfinished key (409)', async () => {
    const { svc, rows, setRow } = service();
    await svc.idempotent(principal, 'k-1', req, 201, async () => ({ ok: 1 }));
    await expect(
      svc.idempotent(principal, 'k-1', { ...req, body: { name: 'B' } }, 201, async () => 1),
    ).rejects.toMatchObject({ status: 422 });
    setRow('k-2', {
      id: 'k-2',
      requestHash: rows().get('k-1')!.requestHash,
      responseStatus: null,
      responseBody: null,
    });
    await expect(svc.idempotent(principal, 'k-2', req, 201, async () => 1)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('frees the key when the first attempt fails so a retry can succeed', async () => {
    const { svc, rows } = service();
    await expect(
      svc.idempotent(principal, 'k-1', req, 201, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(rows().has('k-1')).toBe(false);
    await expect(
      svc.idempotent(principal, 'k-1', req, 201, async () => 'ok'),
    ).resolves.toMatchObject({ body: 'ok' });
  });

  it('runs side effects only after the commit', async () => {
    const { svc } = service();
    const effect = jest.fn();
    await expect(
      svc.idempotent(principal, 'k-1', req, 201, async (_tx, afterCommit) => {
        afterCommit(effect);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(effect).not.toHaveBeenCalled();
    await svc.idempotent(principal, 'k-1', req, 201, async (_tx, afterCommit) => {
      afterCommit(effect);
      expect(effect).not.toHaveBeenCalled();
      return 1;
    });
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('validates the header and runs normally without one', async () => {
    const { svc } = service();
    await expect(
      svc.idempotent(principal, 'has space', req, 201, async () => 1),
    ).rejects.toMatchObject({ status: 400 });
    await expect(svc.idempotent(principal, undefined, req, 201, async () => 7)).resolves.toEqual({
      status: 201,
      body: 7,
      replayed: false,
    });
  });
});

describe('InvoicesService.recalculateBalance -> invoice.paid', () => {
  function run(previous: InvoiceStatus, paid: string) {
    const tx = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inv1',
          organizationId: ORG,
          status: previous,
          grandTotal: new Prisma.Decimal('100'),
          balanceDue: new Prisma.Decimal(previous === InvoiceStatus.PAID ? '0' : '100'),
          dueDate: new Date(Date.now() + 86_400_000),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      paymentAllocation: {
        findMany: jest.fn().mockResolvedValue([{ amount: new Prisma.Decimal(paid) }]),
      },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const outbox = { invoiceEvent: jest.fn().mockResolvedValue('evt') };
    const svc = new InvoicesService(
      {} as PrismaService,
      {} as JournalsService,
      outbox as unknown as WebhookOutboxService,
    );
    return {
      promise: svc.recalculateBalance(tx as unknown as Prisma.TransactionClient, 'inv1'),
      outbox,
      tx,
    };
  }

  it('emits invoice.paid in the same transaction when the balance reaches zero', async () => {
    const { promise, outbox, tx } = run(InvoiceStatus.PARTIALLY_PAID, '100');
    await promise;
    expect(outbox.invoiceEvent).toHaveBeenCalledWith(tx, ORG, 'invoice.paid', 'inv1');
  });

  it('sends invoice.updated, not paid, for a partial payment; nothing for an unchanged paid invoice', async () => {
    const partial = run(InvoiceStatus.SENT, '40');
    await partial.promise;
    expect(partial.outbox.invoiceEvent.mock.calls).toEqual([
      [partial.tx, ORG, 'invoice.updated', 'inv1'],
    ]);
    const again = run(InvoiceStatus.PAID, '100');
    await again.promise;
    expect(again.outbox.invoiceEvent).not.toHaveBeenCalled();
  });
});
