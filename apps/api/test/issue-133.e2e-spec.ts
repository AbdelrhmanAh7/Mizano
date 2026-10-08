/**
 * Issue #133: Move intake extraction out of the API process and remove dead Colab wiring.
 *
 * Acceptance coverage:
 *  - AC1: exactly one route handler for `GET ai/narrative/monthly`, and it answers
 *    (guard 401, not 404) so the single handler's DI graph resolves.
 *  - AC2: `POST/GET internal/tunnel-update` and `ollama-status` return 404.
 *  - AC3: with `AI_SCHEDULERS_ENABLED` unset (enforced in `setup-e2e.ts` before this
 *    module is loaded), the `SchedulerRegistry` has none of the AI cron jobs and the
 *    five scheduler providers are not registered — while non-AI cron jobs still exist
 *    (so the assertion inspects a live registry). A positive control boots a second
 *    module graph with the flag set and asserts every `ai:` cron job registers.
 *  - AC4: the scheduled notification checks scope every entity query by
 *    `organizationId`, bound it with `take`, and page through *all* organizations.
 */
import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  NOTIFICATION_BATCH_SIZE,
  NOTIFICATION_QUERY_LIMIT,
  NotificationsService,
} from '../src/modules/notifications/services/notifications.service';
import { AiOperationsScheduler } from '../src/modules/ai/schedulers/ai-operations.scheduler';
import { AiHrOpsScheduler } from '../src/modules/ai/schedulers/ai-hr-ops.scheduler';
import { AiNlpChatScheduler } from '../src/modules/ai/schedulers/ai-nlp-chat.scheduler';
import { AiSalesCrmScheduler } from '../src/modules/ai/schedulers/ai-sales-crm.scheduler';
import { AiSecurityScheduler } from '../src/modules/ai/schedulers/ai-security.scheduler';
import { createTestApp } from './helpers/app.helper';

// The five AI scheduler classes gated behind AI_SCHEDULERS_ENABLED (#133 AC3).
const AI_SCHEDULER_CLASSES = [
  AiOperationsScheduler,
  AiHrOpsScheduler,
  AiNlpChatScheduler,
  AiSalesCrmScheduler,
  AiSecurityScheduler,
] as const;

type SchedulerConstructor = { prototype: object };

/**
 * Derive the cron job names each AI scheduler registers, straight from the
 * `@Cron(..., { name })` metadata on its methods. The names are stable keys in
 * the SchedulerRegistry (an unnamed `@Cron` falls back to a per-run UUID).
 */
function aiCronNames(classes: readonly SchedulerConstructor[]): string[] {
  const names: string[] = [];
  for (const schedulerClass of classes) {
    const proto = schedulerClass.prototype as Record<string, unknown>;
    for (const methodName of Object.getOwnPropertyNames(proto)) {
      const methodRef = proto[methodName];
      if (typeof methodRef !== 'function') continue;
      const cronOptions = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', methodRef);
      if (cronOptions === undefined) continue;
      const schedulerName = Reflect.getMetadata('SCHEDULER_NAME', methodRef);
      if (typeof schedulerName === 'string' && schedulerName.startsWith('ai:')) {
        names.push(schedulerName);
      }
    }
  }
  return names;
}

/** Number of @Cron methods on the five AI schedulers; must be stable and non-zero. */
const EXPECTED_AI_CRON_NAMES = aiCronNames(AI_SCHEDULER_CLASSES);

describe('@issue-133 AC1: exactly one route handler for GET ai/narrative', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers exactly one GET handler for /ai/narrative/monthly', () => {
    const discovery = app.get(DiscoveryService);
    const controllers = discovery.getControllers();
    // Sanity: the scan below is inspecting a real, populated route table.
    expect(controllers.length).toBeGreaterThan(0);

    let narrativeMonthlyHandlers = 0;
    for (const wrapper of controllers) {
      const instance = wrapper.instance;
      if (!instance) continue;
      const controllerPath = (Reflect.getMetadata('path', instance.constructor) as string) ?? '';
      const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
      for (const methodName of Object.getOwnPropertyNames(proto)) {
        if (methodName === 'constructor') continue;
        const methodRef = proto[methodName];
        if (typeof methodRef !== 'function') continue;
        const routePath = Reflect.getMetadata('path', methodRef) as string | undefined;
        const method = Reflect.getMetadata('method', methodRef) as RequestMethod | undefined;
        if (routePath === undefined || method !== RequestMethod.GET) continue;
        const fullPath = `/${controllerPath}/${routePath}`.replace(/\/+/g, '/');
        if (fullPath === '/ai/narrative/monthly') narrativeMonthlyHandlers += 1;
      }
    }

    expect(narrativeMonthlyHandlers).toBe(1);
  });

  it('answers on the single handler (guard 401, not 404), proving the DI graph resolves', async () => {
    const res = await request(app.getHttpServer()).get('/ai/narrative/monthly');
    // JwtAuthGuard + PermissionsGuard run before the handler; a 401 means the
    // controller and its injected FinancialNarrativeService were constructed.
    // A 404 would mean the handler (or its module) is missing.
    expect(res.status).toBe(401);
  });
});

describe('@issue-133 AC2: dead Colab endpoints return 404', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects POST /internal/tunnel-update and GET /internal/ollama-status', async () => {
    const server = app.getHttpServer();
    // Test app has no global prefix; production routes live under /api.
    await expect(
      request(server).post('/internal/tunnel-update').send({
        tunnel_url: 'https://test.trycloudflare.com',
        secret: 'test',
      }),
    ).resolves.toMatchObject({ status: 404 });
    await expect(request(server).get('/internal/ollama-status')).resolves.toMatchObject({
      status: 404,
    });
    // Prefixed production paths are equally gone.
    await expect(
      request(server).post('/api/internal/tunnel-update').send({}),
    ).resolves.toMatchObject({ status: 404 });
    await expect(request(server).get('/api/internal/ollama-status')).resolves.toMatchObject({
      status: 404,
    });
  });
});

describe('@issue-133 AC3: no AI cron jobs with AI_SCHEDULERS_ENABLED unset', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // setup-e2e.ts already deleted the flag before this module loaded (module
    // registration reads process.env at import time). Keep the delete here as a
    // visible reminder of the precondition.
    delete process.env.AI_SCHEDULERS_ENABLED;
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('has zero AI cron jobs registered, and the gate itself is inspectable', () => {
    // The derivation must not be vacuous: the five classes carry real cron metadata.
    expect(EXPECTED_AI_CRON_NAMES.length).toBeGreaterThan(0);

    const registries = app.get(SchedulerRegistry);
    const cronJobs = registries.getCronJobs();
    const keys = [...cronJobs.keys()];

    // No AI cron job name is registered.
    const aiKeys = keys.filter((name) => EXPECTED_AI_CRON_NAMES.includes(name));
    expect(aiKeys).toEqual([]);
    // Any later ai: job that forgets to be added to the known set is still caught.
    expect(keys.filter((name) => name.startsWith('ai:'))).toEqual([]);
    // Non-AI cron jobs (notifications, depreciation) are still registered, so the
    // inspection above operates on a live registry rather than an empty map.
    expect(cronJobs.size).toBeGreaterThan(0);
  });

  it('does not register any of the five gated scheduler providers', () => {
    const discovery = app.get(DiscoveryService);
    const providerClasses = discovery
      .getProviders()
      .map((wrapper) => wrapper.instance?.constructor);
    for (const schedulerClass of AI_SCHEDULER_CLASSES) {
      expect(providerClasses).not.toContain(schedulerClass);
    }
  });
});

describe('@issue-133 AC3b: AI cron jobs register when AI_SCHEDULERS_ENABLED=true (positive control)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    expect(EXPECTED_AI_CRON_NAMES.length).toBeGreaterThan(0);
    // Reset the module registry so the AppModule graph is re-evaluated with the
    // flag set; the "flag unset" graphs created earlier keep their own bindings.
    process.env.AI_SCHEDULERS_ENABLED = 'true';
    jest.resetModules();
    const { AppModule: EnabledAppModule } = require('../src/app.module') as {
      AppModule: typeof AppModule;
    };
    const { Test: FreshTest } = require('@nestjs/testing') as {
      Test: typeof import('@nestjs/testing').Test;
    };
    const { ThrottlerStorage: FreshThrottlerStorage } = require('@nestjs/throttler') as {
      ThrottlerStorage: typeof import('@nestjs/throttler').ThrottlerStorage;
    };

    const builder = FreshTest.createTestingModule({ imports: [EnabledAppModule] })
      .overrideProvider(FreshThrottlerStorage)
      .useValue({
        increment: async (_key: string, ttl: number) => ({
          totalHits: 1,
          timeToExpire: ttl,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      });
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.AI_SCHEDULERS_ENABLED;
  });

  it('registers every ai: cron job from the five scheduler classes', () => {
    const { SchedulerRegistry: FreshSchedulerRegistry } = require('@nestjs/schedule') as {
      SchedulerRegistry: typeof SchedulerRegistry;
    };
    const cronKeys = [...app.get(FreshSchedulerRegistry).getCronJobs().keys()];
    const aiKeys = cronKeys.filter((name) => name.startsWith('ai:'));
    expect(aiKeys).toHaveLength(EXPECTED_AI_CRON_NAMES.length);
    for (const expectedName of EXPECTED_AI_CRON_NAMES) {
      expect(aiKeys).toContain(expectedName);
    }
  });
});

describe('@issue-133 AC4: notification checks are org-scoped, paginated and bounded', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    notificationsService = app.get(NotificationsService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('checkOverdueInvoices pages through every org, scoping and bounding each invoice query', async () => {
    // Full first page forces the loop to fetch a second page (cursor pagination).
    const firstPage = Array.from({ length: NOTIFICATION_BATCH_SIZE }, (_, i) => ({
      id: `org-${i}`,
    }));
    const secondPage = [{ id: 'org-beyond-first-page' }];
    const orgSpy = jest
      .spyOn(prisma.organization, 'findMany')
      .mockResolvedValueOnce(firstPage as never)
      .mockResolvedValueOnce(secondPage as never);
    const invoiceSpy = jest.spyOn(prisma.invoice, 'findMany').mockResolvedValue([] as never);

    await notificationsService.checkOverdueInvoices();

    // Organizations are fetched in bounded pages and the loop continues past the
    // first page instead of processing only the first NOTIFICATION_BATCH_SIZE orgs.
    expect(orgSpy).toHaveBeenCalledTimes(2);
    const firstOrgPageArgs = orgSpy.mock.calls[0]![0]!;
    const secondOrgPageArgs = orgSpy.mock.calls[1]![0]!;
    expect(firstOrgPageArgs.take).toBe(NOTIFICATION_BATCH_SIZE);
    expect(secondOrgPageArgs.cursor).toEqual({ id: 'org-49' });

    // Every invoice query is scoped to one organization and bounded by take.
    const scopedOrganizationIds = invoiceSpy.mock.calls.map(
      (call) => call[0]!.where!.organizationId,
    );
    expect(scopedOrganizationIds).toHaveLength(NOTIFICATION_BATCH_SIZE + 1);
    expect(scopedOrganizationIds).toContain('org-0');
    expect(scopedOrganizationIds).toContain('org-49');
    expect(scopedOrganizationIds).toContain('org-beyond-first-page');
    // Cursor pagination visits each organization exactly once.
    expect(new Set(scopedOrganizationIds).size).toBe(scopedOrganizationIds.length);
    for (const call of invoiceSpy.mock.calls) {
      const args = call[0]!;
      expect(args.where).toBeDefined();
      expect(args.where!.organizationId).toEqual(expect.any(String));
      expect(args.take).toBeLessThanOrEqual(NOTIFICATION_QUERY_LIMIT);
    }
  });

  it('checkUpcomingBillPayments scopes and bounds the bill query', async () => {
    const orgSpy = jest
      .spyOn(prisma.organization, 'findMany')
      .mockResolvedValue([{ id: 'org-bills' }] as never);
    const billSpy = jest.spyOn(prisma.bill, 'findMany').mockResolvedValue([] as never);

    await notificationsService.checkUpcomingBillPayments();

    expect(orgSpy).toHaveBeenCalledTimes(1);
    expect(orgSpy.mock.calls[0]![0]!.take).toBe(NOTIFICATION_BATCH_SIZE);
    expect(billSpy.mock.calls).toHaveLength(1);
    expect(billSpy.mock.calls[0]).toBeDefined();
    const billArgs = billSpy.mock.calls[0]![0]!;
    expect(billArgs.where).toBeDefined();
    expect(billArgs.where!.organizationId).toBe('org-bills');
    expect(billArgs.take).toBeLessThanOrEqual(NOTIFICATION_QUERY_LIMIT);
  });

  it('checkLowInventory scopes and bounds the item query', async () => {
    const orgSpy = jest
      .spyOn(prisma.organization, 'findMany')
      .mockResolvedValue([{ id: 'org-items' }] as never);
    const itemSpy = jest.spyOn(prisma.item, 'findMany').mockResolvedValue([] as never);

    await notificationsService.checkLowInventory();

    expect(orgSpy).toHaveBeenCalledTimes(1);
    expect(orgSpy.mock.calls[0]![0]!.take).toBe(NOTIFICATION_BATCH_SIZE);
    expect(itemSpy.mock.calls).toHaveLength(1);
    expect(itemSpy.mock.calls[0]).toBeDefined();
    const itemArgs = itemSpy.mock.calls[0]![0]!;
    expect(itemArgs.where).toBeDefined();
    expect(itemArgs.where!.organizationId).toBe('org-items');
    expect(itemArgs.take).toBeLessThanOrEqual(NOTIFICATION_QUERY_LIMIT);
  });
});
