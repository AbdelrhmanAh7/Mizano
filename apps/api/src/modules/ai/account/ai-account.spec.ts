import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { openSecret } from '../../../common/utils/secret-box';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiProviderAdapter, AiProviderError } from '../providers/ai-provider';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { AiError } from './ai-features';
import { AiGatewayService } from './ai-gateway.service';
import { AiSettingsController } from './ai-settings.controller';
import { AiSettingsService, keyAad } from './ai-settings.service';
import { OpenRouterOAuthService } from './openrouter-oauth.service';

const ORG = 'org-1';
const KEY = 'sk-ant-api03-very-secret-key-ab12';

function adapter(overrides: Partial<AiProviderAdapter> = {}): AiProviderAdapter {
  return {
    id: 'anthropic',
    acceptsImages: true,
    acceptsPdf: true,
    listModels: jest.fn().mockResolvedValue([{ id: 'claude-haiku-4-5', name: 'Haiku' }]),
    complete: jest.fn().mockResolvedValue({
      text: '{"ok":true}',
      inputTokens: 100,
      outputTokens: 10,
      reportedCostUsd: null,
    }),
    ...overrides,
  } as AiProviderAdapter;
}

/** In-memory ai_settings / ai_usage / ai_oauth_states for one test. */
function memoryPrisma() {
  const settings = new Map<string, Record<string, unknown>>();
  const usage: Array<Record<string, unknown>> = [];
  const states: Array<Record<string, unknown>> = [];
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        const cond = v as { gt?: Date; not?: unknown; has?: string; in?: string[] };
        if ('gt' in cond) return (row[k] as Date) > (cond.gt as Date);
        if ('not' in cond) return row[k] !== cond.not;
        if ('has' in cond) return (row[k] as string[]).includes(cond.has as string);
        if ('in' in cond) return (cond.in as string[]).includes(row[k] as string);
        return true;
      }
      return row[k] === v;
    });
  const prisma: Record<string, unknown> = {
    aiSettings: {
      findUnique: jest.fn(async ({ where }) => settings.get(where.organizationId) ?? null),
      findMany: jest.fn(async ({ where }) =>
        [...settings.values()].filter((r) => matches(r, where)),
      ),
      upsert: jest.fn(async ({ where, create, update }) => {
        const row = settings.get(where.organizationId);
        const next = row
          ? { ...row, ...update }
          : {
              monthlyLimitUsd: new Decimal(5),
              features: [],
              consentAt: null,
              consentProvider: null,
              ...create,
            };
        settings.set(where.organizationId, next);
        return next;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const row = settings.get(where.organizationId);
        if (!row || !matches(row, where)) return { count: 0 };
        settings.set(where.organizationId, { ...row, ...data });
        return { count: 1 };
      }),
    },
    aiUsage: {
      aggregate: jest.fn(async () => ({
        _sum: { costUsd: usage.reduce((s, u) => s.plus(String(u.costUsd)), new Decimal(0)) },
      })),
      create: jest.fn(async ({ data }) => {
        const row = { id: `u${usage.length + 1}`, createdAt: new Date(), ...data };
        usage.push(row);
        return row;
      }),
      findFirst: jest.fn(async ({ where }) => {
        const since = (where.createdAt as { gte?: Date } | undefined)?.gte;
        const rows = usage.filter(
          (u) =>
            u.organizationId === where.organizationId &&
            u.status !== 'RESERVED' &&
            (!where.model || u.model === where.model) &&
            (!since || (u.createdAt as Date) >= since),
        );
        return rows[rows.length - 1] ?? null;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const row = usage.find((u) => u.id === where.id && u.status === where.status);
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      }),
    },
    aiOAuthState: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      create: jest.fn(async ({ data }) => {
        states.push({ id: `s${states.length + 1}`, usedAt: null, ...data });
        return states[states.length - 1];
      }),
      findFirst: jest.fn(async ({ where }) => states.find((s) => matches(s, where)) ?? null),
      updateMany: jest.fn(async ({ where, data }) => {
        const row = states.find((s) => matches(s, where));
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      }),
    },
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(prisma)),
  };
  return { prisma, settings, usage, states };
}

function build(provider = adapter()) {
  const db = memoryPrisma();
  const registry = {
    get: jest.fn(() => provider),
    available: () => ['anthropic'],
  } as unknown as AiProviderRegistry;
  const service = new AiSettingsService(db.prisma as unknown as PrismaService, registry);
  const gateway = new AiGatewayService(db.prisma as unknown as PrismaService, service);
  return { ...db, service, gateway, provider };
}

beforeAll(() => {
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'test-encryption-key-of-at-least-32-chars';
});

describe('AI settings: connect, seal, consent, revoke', () => {
  it('verifies the key first, seals it bound to the organization and never returns it', async () => {
    const { service, settings, provider } = build();
    const { settings: view } = await service.connect(ORG, 'user-1', {
      provider: 'anthropic',
      apiKey: KEY,
    });

    expect(provider.listModels).toHaveBeenCalledWith({ apiKey: KEY }, expect.anything());
    const stored = settings.get(ORG) as { keyCiphertext: string; model: string };
    expect(stored.keyCiphertext).not.toContain(KEY);
    expect(openSecret(stored.keyCiphertext, keyAad(ORG))).toBe(KEY);
    expect(() => openSecret(stored.keyCiphertext, keyAad('org-2'))).toThrow();
    expect(stored.model).toBe('claude-haiku-4-5');
    const body = JSON.stringify(view);
    expect(body).not.toContain(KEY);
    expect(body).not.toContain(stored.keyCiphertext);
    expect(view.keyHint).toBe('sk-…ab12');
  });

  it('refuses a key the provider rejects and stores nothing', async () => {
    const { service, settings } = build(
      adapter({ listModels: jest.fn().mockRejectedValue(new AiProviderError('invalid_key', 401)) }),
    );
    await expect(
      service.connect(ORG, 'u', { provider: 'anthropic', apiKey: KEY }),
    ).rejects.toMatchObject({
      code: 'AI_KEY_INVALID',
    });
    expect(settings.size).toBe(0);
  });

  it('runs features only after consent naming the connected provider; revoke destroys the key', async () => {
    const { service, settings } = build();
    await service.connect(ORG, 'u', { provider: 'anthropic', apiKey: KEY });
    await expect(service.update(ORG, { features: ['documents'] })).rejects.toMatchObject({
      code: 'AI_CONSENT_REQUIRED',
    });
    await expect(service.consent(ORG, 'u', 'openai')).rejects.toMatchObject({
      code: 'AI_CONSENT_REQUIRED',
    });
    await service.consent(ORG, 'u', 'anthropic');
    const view = await service.update(ORG, { features: ['documents', 'summary'] });
    expect(view.activeFeatures).toEqual(['documents', 'summary']);
    expect(await service.organizationsUsing('summary')).toEqual([ORG]);
    expect(await service.organizationsUsing('categorization')).toEqual([]);

    const revoked = await service.revoke(ORG);
    expect(revoked.provider).toBe('none');
    expect(revoked.activeFeatures).toEqual([]);
    expect(settings.get(ORG)?.keyCiphertext).toBeNull();
    expect(await service.organizationsUsing('summary')).toEqual([]);
  });
});

describe('AI gateway: monthly limit reservation', () => {
  const schema = z.object({ ok: z.literal(true) });
  const run = (gateway: AiGatewayService) =>
    gateway.run({
      organizationId: ORG,
      feature: 'documents',
      system: 'x',
      parts: () => [{ type: 'text', text: 'hello' }],
      maxOutputTokens: 100,
      schema,
    });

  async function connected(provider = adapter()) {
    const ctx = build(provider);
    await ctx.service.connect(ORG, 'u', { provider: 'anthropic', apiKey: KEY });
    await ctx.service.consent(ORG, 'u', 'anthropic');
    await ctx.service.update(ORG, { features: ['documents'] });
    return ctx;
  }

  it('reserves the estimate before the call and settles the real cost after', async () => {
    const { gateway, usage, provider } = await connected();
    await expect(run(gateway)).resolves.toMatchObject({
      data: { ok: true },
      provider: 'anthropic',
    });
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(usage).toHaveLength(1);
    // haiku: 100 in × $1/M + 10 out × $5/M
    expect(usage[0]).toMatchObject({
      status: 'SETTLED',
      success: true,
      inputTokens: 100,
      outputTokens: 10,
    });
    expect(new Decimal(String(usage[0].costUsd)).eq('0.00015')).toBe(true);
  });

  it('refuses a call that would cross the limit, without calling the provider', async () => {
    const { gateway, usage, provider, service } = await connected();
    await service.update(ORG, { monthlyLimitUsd: '0.0001' });
    await expect(run(gateway)).rejects.toMatchObject({ code: 'AI_LIMIT_REACHED' });
    expect(provider.complete).not.toHaveBeenCalled();
    expect(usage).toHaveLength(0);
  });

  /** Runs `run` with fake timers so the one-second retry delay passes instantly. */
  async function runWithFakeTimers(gateway: AiGatewayService) {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const pending = run(gateway).then(
        (value) => ({ value, error: undefined as unknown }),
        (error: unknown) => ({ value: undefined, error }),
      );
      await jest.advanceTimersByTimeAsync(1_000);
      return await pending;
    } finally {
      jest.useRealTimers();
    }
  }

  it('reserves each attempt separately: a refused attempt is released, the retry settles', async () => {
    const complete = jest
      .fn()
      .mockRejectedValueOnce(new AiProviderError('rate_limited', 429))
      .mockResolvedValueOnce({
        text: '{"ok":true}',
        inputTokens: 100,
        outputTokens: 10,
        reportedCostUsd: null,
      });
    const { gateway, usage } = await connected(adapter({ complete }));
    const out = await runWithFakeTimers(gateway);
    expect(out.error).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(usage).toHaveLength(2);
    expect(usage[0]).toMatchObject({
      status: 'RELEASED',
      success: false,
      errorCode: 'rate_limited',
    });
    expect(new Decimal(String(usage[0].costUsd)).eq(0)).toBe(true);
    expect(usage[1]).toMatchObject({ status: 'SETTLED', success: true });
  });

  it('retries a refusal for load once, then stops', async () => {
    const complete = jest.fn().mockRejectedValue(new AiProviderError('rate_limited', 429));
    const { gateway, usage } = await connected(adapter({ complete }));
    const out = await runWithFakeTimers(gateway);
    expect(out.error).toMatchObject({ code: 'AI_RATE_LIMITED' });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(usage.map((u) => u.status)).toEqual(['RELEASED', 'RELEASED']);
  });

  it.each([
    ['a dropped connection', new AiProviderError('network')],
    ['an unreadable answer body', new AiProviderError('network', 200)],
    ['a timeout', new AiProviderError('timeout')],
    ['an unusable success answer', new AiProviderError('bad_response', 200)],
    ['a 502 from a gateway', new AiProviderError('provider_down', 502)],
    ['a 504 gateway timeout', new AiProviderError('provider_down', 504)],
  ])('never retries %s and keeps the estimate as spent', async (_case, failure) => {
    const complete = jest.fn().mockRejectedValue(failure);
    const { gateway, usage } = await connected(adapter({ complete }));
    const out = await runWithFakeTimers(gateway);
    expect(out.error).toBeDefined();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ status: 'SETTLED', success: false });
    const cost = new Decimal(String(usage[0].costUsd));
    expect(cost.gt(0)).toBe(true);
    expect(cost.eq(String(usage[0].estimatedCostUsd))).toBe(true);
  });

  it('does nothing for an organization without AI', async () => {
    const { gateway, provider, usage } = build();
    await expect(run(gateway)).rejects.toMatchObject({ code: 'AI_NOT_ENABLED' });
    expect(provider.complete).not.toHaveBeenCalled();
    expect(usage).toHaveLength(0);
  });
});

describe('AI gateway: settings that change after the connection was opened', () => {
  const schema = z.object({ ok: z.literal(true) });
  const run = (gateway: AiGatewayService) =>
    gateway.run({
      organizationId: ORG,
      feature: 'documents',
      system: 'x',
      parts: () => [{ type: 'text', text: 'hello' }],
      maxOutputTokens: 100,
      schema,
    });

  /** A connected organization whose settings `change` right after the gateway opened them. */
  async function changedAfterOpen(change: (service: AiSettingsService) => Promise<unknown>) {
    const ctx = build();
    await ctx.service.connect(ORG, 'u', { provider: 'anthropic', apiKey: KEY });
    await ctx.service.consent(ORG, 'u', 'anthropic');
    await ctx.service.update(ORG, { features: ['documents'] });
    const open = ctx.service.connection.bind(ctx.service);
    jest.spyOn(ctx.service, 'connection').mockImplementation(async (org, feature) => {
      const connection = await open(org, feature);
      await change(ctx.service);
      return connection;
    });
    return ctx;
  }

  it.each([
    ['the key is revoked', (s: AiSettingsService) => s.revoke(ORG)],
    [
      'the key is replaced',
      (s: AiSettingsService) =>
        s.connect(ORG, 'u', { provider: 'anthropic', apiKey: `${KEY}-new` }),
    ],
    ['the feature is turned off', (s: AiSettingsService) => s.update(ORG, { features: [] })],
  ])('sends nothing when %s before the reservation', async (_case, change) => {
    const { gateway, provider, usage } = await changedAfterOpen(change);
    await expect(run(gateway)).rejects.toMatchObject({ code: 'AI_SETTINGS_CHANGED' });
    expect(provider.complete).not.toHaveBeenCalled();
    expect(usage).toHaveLength(0);
  });

  it('applies a lower limit read under the lock', async () => {
    const { gateway, provider, usage } = await changedAfterOpen((s) =>
      s.update(ORG, { monthlyLimitUsd: '0' }),
    );
    await expect(run(gateway)).rejects.toMatchObject({ code: 'AI_LIMIT_REACHED' });
    expect(provider.complete).not.toHaveBeenCalled();
    expect(usage).toHaveLength(0);
  });

  it('revalidates before the retry: a revoke during the first attempt stops it', async () => {
    const holder: { service?: AiSettingsService } = {};
    const complete = jest.fn(async () => {
      await holder.service?.revoke(ORG);
      throw new AiProviderError('rate_limited', 429);
    });
    const ctx = build(adapter({ complete }));
    holder.service = ctx.service;
    await ctx.service.connect(ORG, 'u', { provider: 'anthropic', apiKey: KEY });
    await ctx.service.consent(ORG, 'u', 'anthropic');
    await ctx.service.update(ORG, { features: ['documents'] });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const settled = expect(run(ctx.gateway)).rejects.toMatchObject({
        code: 'AI_SETTINGS_CHANGED',
      });
      await jest.advanceTimersByTimeAsync(1_000);
      await settled;
    } finally {
      jest.useRealTimers();
    }
    expect(complete).toHaveBeenCalledTimes(1);
    expect(ctx.usage).toHaveLength(1);
    expect(ctx.usage[0]).toMatchObject({ status: 'RELEASED' });
  });
});

describe('OpenRouter PKCE', () => {
  const config = {
    get: (k: string) => (k === 'CORS_ORIGIN' ? 'https://app.mizano.test' : undefined),
  } as ConfigService;

  it('starts with S256, a trusted callback and a single-use state bound to org and user', async () => {
    const ctx = build();
    const exchange = jest.fn(async () => new Response(JSON.stringify({ key: KEY })));
    const oauth = new OpenRouterOAuthService(
      ctx.prisma as unknown as PrismaService,
      ctx.service,
      config,
      exchange,
    );

    await expect(oauth.start(ORG, 'u', 'https://evil.test/en/settings/ai')).rejects.toThrow();
    const { authUrl } = await oauth.start(ORG, 'u', 'https://app.mizano.test/ar/settings/ai?x=1');
    const url = new URL(authUrl);
    expect(url.origin + url.pathname).toBe('https://openrouter.ai/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const callback = new URL(url.searchParams.get('callback_url') as string);
    expect(callback.origin + callback.pathname).toBe('https://app.mizano.test/ar/settings/ai');
    const state = callback.searchParams.get('openrouter_state') as string;
    expect(ctx.states[0].stateHash).not.toBe(state);

    await expect(oauth.complete(ORG, 'other-user', state, 'code-1')).rejects.toMatchObject({
      code: 'AI_OAUTH_STATE_INVALID',
    });
    const view = await oauth.complete(ORG, 'u', state, 'code-1');
    expect(view.keySource).toBe('openrouter_oauth');
    const [, init] = exchange.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ code: 'code-1', code_challenge_method: 'S256' });
    expect(sent.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(oauth.complete(ORG, 'u', state, 'code-1')).rejects.toMatchObject({
      code: 'AI_OAUTH_STATE_INVALID',
    });
  });
});

describe('AI connection test: verified only when a real call passes (issue #658)', () => {
  const forbidden = () =>
    adapter({ complete: jest.fn().mockRejectedValue(new AiProviderError('forbidden', 403)) });

  function controllerFor(ctx: ReturnType<typeof build>) {
    return new AiSettingsController(
      ctx.service,
      ctx.gateway,
      {} as unknown as OpenRouterOAuthService,
    );
  }

  it('connecting runs a test call and marks the connection verified when it passes', async () => {
    const ctx = build();
    const controller = controllerFor(ctx);
    const { settings } = await controller.connect(ORG, 'u', { provider: 'anthropic', apiKey: KEY });
    expect(settings.verifiedAt).not.toBeNull();
    expect(settings.lastError).toBeNull();
    expect(ctx.usage[0]).toMatchObject({ feature: 'test', success: true });
  });

  it('a refused test (OpenRouter 403) is not saved as verified and keeps the provider reason', async () => {
    const ctx = build(forbidden());
    const controller = controllerFor(ctx);

    const { settings } = await controller.connect(ORG, 'u', { provider: 'anthropic', apiKey: KEY });

    expect(settings.verifiedAt).toBeNull();
    expect(settings.lastError).toMatchObject({ code: 'AI_FORBIDDEN', feature: 'test' });
    expect(JSON.stringify(settings)).not.toContain(KEY);
    await expect(controller.test(ORG, 'u')).rejects.toMatchObject({ code: 'AI_FORBIDDEN' });
    expect((await ctx.service.view(ORG)).verifiedAt).toBeNull();
  });

  it('Test again clears the error and verifies once the provider accepts', async () => {
    const complete = jest
      .fn()
      .mockRejectedValueOnce(new AiProviderError('no_credit', 402))
      .mockResolvedValue({
        text: '{"ok":true}',
        inputTokens: 5,
        outputTokens: 5,
        reportedCostUsd: null,
      });
    const ctx = build(adapter({ complete }));
    const controller = controllerFor(ctx);
    const { settings } = await controller.connect(ORG, 'u', { provider: 'anthropic', apiKey: KEY });
    expect(settings.lastError?.code).toBe('AI_KEY_NO_CREDIT');

    await expect(controller.test(ORG, 'u')).resolves.toMatchObject({ ok: true });

    const after = await ctx.service.view(ORG);
    expect(after.verifiedAt).not.toBeNull();
    expect(after.lastError).toBeNull();
  });

  it('shows a failed reading call as the last error until the next call passes', async () => {
    const ctx = build(
      adapter({ complete: jest.fn().mockRejectedValue(new AiProviderError('forbidden', 403)) }),
    );
    await ctx.service.connect(ORG, 'u', { provider: 'anthropic', apiKey: KEY });
    await ctx.service.consent(ORG, 'u', 'anthropic');
    await ctx.service.update(ORG, { features: ['documents'] });

    await expect(
      ctx.gateway.run({
        organizationId: ORG,
        feature: 'documents',
        system: 'x',
        parts: () => [{ type: 'text', text: 'hi' }],
        maxOutputTokens: 100,
        schema: z.object({ ok: z.literal(true) }),
      }),
    ).rejects.toBeInstanceOf(AiError);

    expect((await ctx.service.view(ORG)).lastError).toMatchObject({
      code: 'AI_FORBIDDEN',
      feature: 'documents',
    });
  });
});

describe('Choosing a model: saved only after a real call with it passes', () => {
  const MODELS = [
    { id: 'anthropic/claude-3.5-sonnet', name: 'Sonnet', vision: true },
    { id: 'google/gemini-3.8-flash', name: 'Gemini Flash', vision: true },
    { id: 'anthropic/claude-haiku-4-5', name: 'Haiku', vision: true },
    { id: 'meta/text-only', name: 'Text only', vision: false },
  ];
  const ok = { text: '{"ok":true}', inputTokens: 5, outputTokens: 5, reportedCostUsd: null };

  async function connectedController(complete: jest.Mock) {
    const ctx = build(adapter({ listModels: jest.fn().mockResolvedValue(MODELS), complete }));
    const controller = new AiSettingsController(
      ctx.service,
      ctx.gateway,
      {} as unknown as OpenRouterOAuthService,
    );
    await controller.connect(ORG, 'u', { provider: 'anthropic', apiKey: KEY });
    return { ...ctx, controller, complete };
  }

  it('lists recommended cheap document readers first and flags them', async () => {
    const { service } = await connectedController(jest.fn().mockResolvedValue(ok));
    const list = await service.listModels(ORG);
    expect(list.slice(0, 2).map((m) => m.id)).toEqual([
      'anthropic/claude-haiku-4-5',
      'anthropic/claude-3.5-sonnet',
    ]);
    expect(list[0]).toMatchObject({ recommended: true });
    expect(list.find((m) => m.id === 'meta/text-only')?.recommended).toBeUndefined();
  });

  it('tests the chosen model with a real call, then saves it', async () => {
    const complete = jest.fn().mockResolvedValue(ok);
    const { controller, service } = await connectedController(complete);

    const result = await controller.chooseModel(ORG, 'u', { model: 'google/gemini-3.8-flash' });

    expect(result).toMatchObject({ ok: true, settings: { model: 'google/gemini-3.8-flash' } });
    expect(complete).toHaveBeenLastCalledWith(
      expect.anything(),
      'google/gemini-3.8-flash',
      expect.anything(),
      expect.anything(),
    );
    expect((await service.view(ORG)).model).toBe('google/gemini-3.8-flash');
  });

  it('keeps the old model, gives the reason and suggests other picks when the model fails', async () => {
    const complete = jest
      .fn()
      .mockResolvedValueOnce(ok)
      .mockRejectedValueOnce(new AiProviderError('forbidden', 403));
    const { controller, service } = await connectedController(complete);
    const before = (await service.view(ORG)).model;

    const result = await controller.chooseModel(ORG, 'u', { model: 'anthropic/claude-3.5-sonnet' });

    expect(result).toMatchObject({ ok: false, code: 'AI_FORBIDDEN' });
    const view = await service.view(ORG);
    expect(view.model).toBe(before);
    expect(view.verifiedAt).not.toBeNull();
    expect(view.lastError).toBeNull();
    await expect(
      controller.update(ORG, 'u', { model: 'anthropic/claude-3.5-sonnet' }),
    ).rejects.toBeDefined();
    expect((await service.view(ORG)).model).toBe(before);
  });

  it("refuses a model that is not on the key's list without calling the provider", async () => {
    const complete = jest.fn().mockResolvedValue(ok);
    const { controller } = await connectedController(complete);
    complete.mockClear();
    await expect(controller.chooseModel(ORG, 'u', { model: 'made/up' })).rejects.toMatchObject({
      code: 'AI_MODEL_UNAVAILABLE',
    });
    expect(complete).not.toHaveBeenCalled();
  });
});

describe('AI settings permissions', () => {
  function guardFor(
    handler: keyof AiSettingsController,
    permissions: Array<{ module: string; actions: string[] }>,
  ) {
    const prisma = {
      role: { findUnique: jest.fn().mockResolvedValue({ name: 'Viewer', permissions }) },
    } as unknown as PrismaService;
    const guard = new PermissionsGuard(new Reflector(), prisma);
    const context = {
      getHandler: () => AiSettingsController.prototype[handler],
      getClass: () => AiSettingsController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u', roleId: 'r1' } }) }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context);
  }

  it('lets settings.view read but refuses it every change', async () => {
    const viewer = [{ module: 'settings', actions: ['view'] }];
    await expect(guardFor('view', viewer)).resolves.toBe(true);
    for (const write of [
      'connect',
      'update',
      'chooseModel',
      'consent',
      'revoke',
      'test',
      'startOpenRouter',
    ] as const) {
      await expect(guardFor(write, viewer)).rejects.toBeInstanceOf(ForbiddenException);
    }
    await expect(
      guardFor('connect', [{ module: 'settings', actions: ['view', 'edit'] }]),
    ).resolves.toBe(true);
  });
});
