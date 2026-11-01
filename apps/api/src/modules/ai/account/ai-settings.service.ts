import { Injectable, Logger } from '@nestjs/common';
import { AiSettings, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  integrationsEncryptionConfigured,
  openSecret,
  sealSecret,
  secretHint,
} from '../../../common/utils/secret-box';
import {
  AI_PROVIDERS,
  AiModelInfo,
  AiProviderAdapter,
  AiProviderError,
  AiProviderId,
  isAiProviderId,
} from '../providers/ai-provider';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { AI_FEATURES, AiError, AiErrorCode, AiFeatureKey, aiCodeForFailure } from './ai-features';
import { StoredPrice } from './ai-pricing';

const LIST_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT_USD = '5';

export type AiKeySource = 'api_key' | 'openrouter_oauth';

/** What the browser may see about the connection. Never the key or its ciphertext. */
export interface AiSettingsView {
  provider: AiProviderId | 'none';
  model: string | null;
  keyHint: string | null;
  keySource: string | null;
  features: AiFeatureKey[];
  activeFeatures: AiFeatureKey[];
  monthlyLimitUsd: string;
  spentThisMonthUsd: string;
  consent: { at: string; byId: string | null; provider: string } | null;
  connectedAt: string | null;
  /** Set only while the last connection test succeeded; cleared when a test fails. */
  verifiedAt: string | null;
  /** The newest AI call since connecting when it failed (code → plain text in the web). */
  lastError: { code: AiErrorCode; feature: string; at: string } | null;
  availableProviders: AiProviderId[];
  encryptionConfigured: boolean;
}

/** An opened connection for one call: only the gateway gets this. */
export interface AiConnection {
  provider: AiProviderId;
  adapter: AiProviderAdapter;
  model: string;
  apiKey: string | null;
  price: StoredPrice;
  /** Which settings this connection was opened from (see `connectionFingerprint`). */
  fingerprint: string;
}

type ConnectionFields = Pick<
  AiSettings,
  'provider' | 'model' | 'keyCiphertext' | 'consentProvider' | 'consentAt'
>;

/**
 * Identifies the provider, model, key and consent a connection was opened with. A new key has a
 * new ciphertext (random IV), so rotating, revoking or switching provider changes it.
 */
export function connectionFingerprint(s: ConnectionFields): string {
  return [
    s.provider,
    s.model ?? '',
    s.keyCiphertext ?? '',
    s.consentProvider ?? '',
    s.consentAt?.toISOString() ?? '',
  ].join('|');
}

/** Whether the current (locked) settings still allow a call opened as `connection`. */
export function settingsStillAllow(
  current: AiSettings | null,
  connection: Pick<AiConnection, 'fingerprint'>,
  feature: AiFeatureKey | 'test',
): boolean {
  if (!current || connectionFingerprint(current) !== connection.fingerprint) return false;
  return feature === 'test' || activeFeatures(current).includes(feature);
}

export function keyAad(organizationId: string): string {
  return `ai-key:${organizationId}`;
}

export function startOfUtcMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Features that may run now: provider connected, consent for that provider, feature enabled. */
export function activeFeatures(
  s: Pick<
    AiSettings,
    'provider' | 'features' | 'consentAt' | 'consentProvider' | 'keyCiphertext' | 'model'
  > | null,
): AiFeatureKey[] {
  if (!s || !isAiProviderId(s.provider) || !s.model) return [];
  if (s.provider !== 'ollama' && !s.keyCiphertext) return [];
  if (!s.consentAt || s.consentProvider !== s.provider) return [];
  return AI_FEATURES.filter((f) => s.features.includes(f));
}

/** Newest-looking first by the version numbers in the id ("gemini-3.8-flash" → [3, 8]). */
function newestFirst(ids: string[]): string[] {
  const version = (id: string): number[] =>
    (id.match(/\d+(?:[.-]\d+)*/)?.[0] ?? '')
      .split(/[.-]/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n < 1000);
  return [...ids].sort((a, b) => {
    const va = version(a);
    const vb = version(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const d = (vb[i] ?? 0) - (va[i] ?? 0);
      if (d) return d;
    }
    return a.localeCompare(b);
  });
}

/** A fast, inexpensive model that reads images; the admin can choose another. */
export function recommendedModel(provider: AiProviderId, models: AiModelInfo[]): string | null {
  const ids = models.map((m) => m.id);
  const pick = (re: RegExp, not?: RegExp): string | undefined =>
    newestFirst(ids.filter((id) => re.test(id) && !(not && not.test(id))))[0];
  switch (provider) {
    case 'anthropic':
      return pick(/haiku/) ?? pick(/sonnet/) ?? ids[0] ?? null;
    case 'openai':
      return pick(/^gpt-[\d.]+-mini$/) ?? pick(/mini/, /nano/) ?? pick(/^gpt-/) ?? ids[0] ?? null;
    case 'gemini':
      return ids.includes('gemini-flash-latest')
        ? 'gemini-flash-latest'
        : (pick(/flash/, /lite|preview|exp|latest/) ?? pick(/flash/) ?? ids[0] ?? null);
    case 'openrouter':
      return (
        pick(/^google\/gemini-[\d.]+-flash$/) ??
        pick(/^anthropic\/claude-.*haiku/) ??
        pick(/^openai\/gpt-[\d.]+-mini$/) ??
        ids[0] ??
        null
      );
    default:
      return ids[0] ?? null;
  }
}

/**
 * Cheap models that read documents well, best first: a few ids, never forced on anyone. Only
 * models that read images (when the provider says so) are offered.
 */
export function recommendedModels(provider: AiProviderId, models: AiModelInfo[]): string[] {
  const usable = models.filter((m) => m.vision !== false);
  const ids = usable.map((m) => m.id);
  const pick = (re: RegExp, not?: RegExp): string | undefined =>
    newestFirst(ids.filter((id) => re.test(id) && !(not && not.test(id))))[0];
  let picks: Array<string | undefined>;
  switch (provider) {
    case 'openrouter':
      picks = [
        pick(/^google\/gemini-[\d.]+-flash$/),
        pick(/^anthropic\/claude-.*haiku/),
        pick(/^openai\/gpt-[\d.]+-mini$/),
      ];
      break;
    case 'anthropic':
      picks = [pick(/haiku/), pick(/sonnet/)];
      break;
    case 'openai':
      picks = [pick(/^gpt-[\d.]+-mini$/), pick(/mini/, /nano/)];
      break;
    case 'gemini':
      picks = [pick(/flash/, /lite|preview|exp|latest/), pick(/flash-lite/)];
      break;
    default:
      picks = [];
  }
  const found = [...new Set(picks.filter((id): id is string => !!id))];
  const fallback = recommendedModel(provider, models);
  return found.length > 0 ? found : fallback ? [fallback] : [];
}

/** The provider's list with recommended picks first and flagged. */
export function withRecommendations(provider: AiProviderId, models: AiModelInfo[]): AiModelInfo[] {
  const top = recommendedModels(provider, models);
  const flagged = models.map((m) => (top.includes(m.id) ? { ...m, recommended: true } : m));
  return [
    ...top.flatMap((id) => flagged.filter((m) => m.id === id)),
    ...flagged.filter((m) => !m.recommended),
  ];
}

function failureCode(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof AiProviderError) {
    switch (error.kind) {
      case 'invalid_key':
        return new AiError('AI_KEY_INVALID', 'The provider refused this key');
      case 'forbidden':
        return new AiError('AI_FORBIDDEN', 'The provider refused the request');
      case 'no_credit':
        return new AiError('AI_KEY_NO_CREDIT', 'The provider account has no credit');
      case 'rate_limited':
        return new AiError('AI_RATE_LIMITED', 'The provider is rate limiting this key');
      case 'model_unavailable':
        return new AiError('AI_MODEL_UNAVAILABLE', 'The model is not available for this key');
      case 'timeout':
        return new AiError('AI_TIMEOUT', 'The provider did not answer in time');
      default:
        return new AiError('AI_PROVIDER_ERROR', 'The provider could not be reached');
    }
  }
  return new AiError('AI_PROVIDER_ERROR', 'The provider could not be reached');
}

/**
 * The organization's own AI account: connect (key verified before it is saved), choose model,
 * limit and features, consent, revoke. Every query is scoped by organization; the key is sealed
 * with the organization bound as additional data and never leaves this service except to the
 * gateway for a call.
 */
@Injectable()
export class AiSettingsService {
  private readonly logger = new Logger(AiSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AiProviderRegistry,
  ) {}

  private row(organizationId: string): Promise<AiSettings | null> {
    return this.prisma.aiSettings.findUnique({ where: { organizationId } });
  }

  private adapter(provider: AiProviderId): AiProviderAdapter {
    const adapter = this.registry.get(provider);
    if (!adapter)
      throw new AiError('AI_NOT_CONFIGURED', `${provider} is not available on this server`);
    return adapter;
  }

  private openKey(s: AiSettings): string | null {
    if (s.provider === 'ollama') return null;
    if (!s.keyCiphertext) throw new AiError('AI_NOT_ENABLED', 'No AI key is connected');
    return openSecret(s.keyCiphertext, keyAad(s.organizationId));
  }

  async spentThisMonth(organizationId: string): Promise<Decimal> {
    const sum = await this.prisma.aiUsage.aggregate({
      where: { organizationId, createdAt: { gte: startOfUtcMonth() } },
      _sum: { costUsd: true },
    });
    return new Decimal(sum._sum.costUsd?.toString() ?? '0');
  }

  /** The newest finished AI call since the key was connected, when it failed. */
  private async lastError(
    organizationId: string,
    since: Date | null | undefined,
    model: string | null,
  ): Promise<AiSettingsView['lastError']> {
    const last = await this.prisma.aiUsage.findFirst({
      where: {
        organizationId,
        // A refused trial of another model is not the saved model's error.
        ...(model ? { model } : {}),
        status: { not: 'RESERVED' },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { success: true, errorCode: true, feature: true, createdAt: true },
    });
    if (!last || last.success) return null;
    return {
      code: aiCodeForFailure(last.errorCode),
      feature: last.feature,
      at: last.createdAt.toISOString(),
    };
  }

  /**
   * Records the outcome of a connection test: a passing test marks the connection verified, a
   * failing one clears it, so a refused connection never shows as verified.
   */
  async markVerified(organizationId: string, ok: boolean): Promise<void> {
    await this.prisma.aiSettings.updateMany({
      where: { organizationId },
      data: { verifiedAt: ok ? new Date() : null },
    });
  }

  async view(organizationId: string): Promise<AiSettingsView> {
    const [s, spent] = await Promise.all([
      this.row(organizationId),
      this.spentThisMonth(organizationId),
    ]);
    const lastError = s ? await this.lastError(organizationId, s.connectedAt, s.model) : null;
    const provider = s && isAiProviderId(s.provider) ? s.provider : 'none';
    return {
      provider,
      model: s?.model ?? null,
      keyHint: s?.keyHint ?? null,
      keySource: s?.keySource ?? null,
      features: (s?.features ?? []).filter((f): f is AiFeatureKey =>
        (AI_FEATURES as readonly string[]).includes(f),
      ),
      activeFeatures: activeFeatures(s),
      monthlyLimitUsd: new Decimal(s?.monthlyLimitUsd.toString() ?? DEFAULT_LIMIT_USD).toFixed(2),
      spentThisMonthUsd: spent.toFixed(4),
      consent:
        s?.consentAt && s.consentProvider
          ? { at: s.consentAt.toISOString(), byId: s.consentById, provider: s.consentProvider }
          : null,
      connectedAt: s?.connectedAt?.toISOString() ?? null,
      verifiedAt: s?.verifiedAt?.toISOString() ?? null,
      lastError,
      availableProviders: this.registry.available(),
      encryptionConfigured: integrationsEncryptionConfigured(),
    };
  }

  /** Active features only, for screens that show or hide AI buttons. */
  async features(organizationId: string): Promise<{ activeFeatures: AiFeatureKey[] }> {
    return { activeFeatures: activeFeatures(await this.row(organizationId)) };
  }

  /**
   * Organizations that may run `feature` now, for schedulers: one indexed query, so an
   * organization without AI costs a scheduled job nothing.
   */
  async organizationsUsing(feature: AiFeatureKey): Promise<string[]> {
    const rows = await this.prisma.aiSettings.findMany({
      where: {
        provider: { in: [...AI_PROVIDERS] },
        features: { has: feature },
        consentAt: { not: null },
      },
      select: {
        organizationId: true,
        provider: true,
        features: true,
        consentAt: true,
        consentProvider: true,
        keyCiphertext: true,
        model: true,
      },
    });
    return rows.filter((r) => activeFeatures(r).includes(feature)).map((r) => r.organizationId);
  }

  /** For the gateway: the opened connection when `feature` may run, else a typed refusal. */
  async connection(
    organizationId: string,
    feature: AiFeatureKey | 'test',
    trial?: { model: string; price: StoredPrice },
  ): Promise<AiConnection> {
    const s = await this.row(organizationId);
    if (!s || !isAiProviderId(s.provider) || !s.model) {
      throw new AiError('AI_NOT_ENABLED', 'AI is not connected for this organization');
    }
    if (feature !== 'test' && !activeFeatures(s).includes(feature)) {
      throw new AiError('AI_NOT_ENABLED', `The AI feature ${feature} is off`);
    }
    return {
      provider: s.provider,
      adapter: this.adapter(s.provider),
      model: trial?.model ?? s.model,
      apiKey: this.openKey(s),
      price: trial
        ? trial.price
        : s.priceInPerMtok !== null && s.priceOutPerMtok !== null
          ? [s.priceInPerMtok.toString(), s.priceOutPerMtok.toString()]
          : null,
      fingerprint: connectionFingerprint(s),
    };
  }

  private async fetchModels(provider: AiProviderId, apiKey: string | null): Promise<AiModelInfo[]> {
    try {
      return await this.adapter(provider).listModels(
        { apiKey },
        AbortSignal.timeout(LIST_TIMEOUT_MS),
      );
    } catch (error) {
      this.logger.warn(
        `AI model list failed: provider=${provider} reason=${error instanceof AiProviderError ? error.kind : 'error'}`,
      );
      throw failureCode(error);
    }
  }

  private priceOf(
    models: AiModelInfo[],
    model: string,
  ): { priceInPerMtok: string | null; priceOutPerMtok: string | null } {
    const price = models.find((m) => m.id === model)?.pricePerMtok;
    return { priceInPerMtok: price?.[0] ?? null, priceOutPerMtok: price?.[1] ?? null };
  }

  /**
   * Checks the key by listing the provider's models, then saves it sealed (not yet verified). A different
   * provider than before clears consent and features: consent names one provider.
   */
  async connect(
    organizationId: string,
    userId: string,
    input: { provider: AiProviderId; apiKey?: string; model?: string },
    keySource: AiKeySource = 'api_key',
  ): Promise<{ settings: AiSettingsView; models: AiModelInfo[] }> {
    const apiKey = input.provider === 'ollama' ? null : (input.apiKey?.trim() ?? '');
    if (apiKey === '') throw new AiError('AI_KEY_INVALID', 'An API key is required');
    if (apiKey !== null && !integrationsEncryptionConfigured()) {
      throw new AiError('AI_NOT_CONFIGURED', 'INTEGRATIONS_ENCRYPTION_KEY is not set on the API');
    }
    const models = await this.fetchModels(input.provider, apiKey);
    const model =
      input.model && models.some((m) => m.id === input.model)
        ? input.model
        : recommendedModel(input.provider, models);
    if (!model) throw new AiError('AI_MODEL_UNAVAILABLE', 'This key has no usable model');

    const before = await this.row(organizationId);
    const sameProvider = before?.provider === input.provider;
    const now = new Date();
    const data = {
      provider: input.provider,
      model,
      keyCiphertext: apiKey === null ? null : sealSecret(apiKey, keyAad(organizationId)),
      keyHint: apiKey === null ? null : secretHint(apiKey),
      keySource: apiKey === null ? null : keySource,
      ...this.priceOf(models, model),
      connectedAt: now,
      connectedById: userId,
      // Listing models proves the key exists, not that a call works: a test call verifies it.
      verifiedAt: null,
      ...(sameProvider
        ? {}
        : { features: [], consentAt: null, consentById: null, consentProvider: null }),
    } satisfies Prisma.AiSettingsUncheckedUpdateInput;
    await this.prisma.aiSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    });
    this.logger.log(
      `AI connected: org=${organizationId} provider=${input.provider} source=${keySource}`,
    );
    return { settings: await this.view(organizationId), models };
  }

  async listModels(organizationId: string): Promise<AiModelInfo[]> {
    const s = await this.row(organizationId);
    if (!s || !isAiProviderId(s.provider))
      throw new AiError('AI_NOT_ENABLED', 'AI is not connected');
    return withRecommendations(s.provider, await this.fetchModels(s.provider, this.openKey(s)));
  }

  /**
   * What a model change needs before it may be saved: the model is on the provider's list for
   * this key; `next` are the other recommended picks to suggest when it fails.
   */
  async planModelChange(
    organizationId: string,
    model: string,
  ): Promise<{ price: StoredPrice; next: AiModelInfo[] }> {
    const s = await this.row(organizationId);
    if (!s || !isAiProviderId(s.provider))
      throw new AiError('AI_NOT_ENABLED', 'AI is not connected');
    const models = await this.fetchModels(s.provider, this.openKey(s));
    const chosen = models.find((m) => m.id === model);
    if (!chosen)
      throw new AiError('AI_MODEL_UNAVAILABLE', 'The model is not available for this key');
    const next = withRecommendations(s.provider, models).filter(
      (m) => m.recommended && m.id !== model && m.id !== s.model,
    );
    return { price: chosen.pricePerMtok ?? null, next };
  }

  /** Saves a model that passed a test call, and marks the connection verified. */
  async saveTestedModel(
    organizationId: string,
    model: string,
    price: StoredPrice,
  ): Promise<AiSettingsView> {
    await this.prisma.aiSettings.updateMany({
      where: { organizationId },
      data: {
        model,
        priceInPerMtok: price ? String(price[0]) : null,
        priceOutPerMtok: price ? String(price[1]) : null,
        verifiedAt: new Date(),
      },
    });
    return this.view(organizationId);
  }

  async update(
    organizationId: string,
    input: { model?: string; monthlyLimitUsd?: string; features?: AiFeatureKey[] },
  ): Promise<AiSettingsView> {
    const s = await this.row(organizationId);
    if (!s || !isAiProviderId(s.provider))
      throw new AiError('AI_NOT_ENABLED', 'AI is not connected');
    const data: Prisma.AiSettingsUpdateInput = {};
    if (input.model !== undefined && input.model !== s.model) {
      const models = await this.fetchModels(s.provider, this.openKey(s));
      if (!models.some((m) => m.id === input.model)) {
        throw new AiError('AI_MODEL_UNAVAILABLE', 'The model is not available for this key');
      }
      Object.assign(data, { model: input.model, ...this.priceOf(models, input.model) });
    }
    if (input.monthlyLimitUsd !== undefined) {
      data.monthlyLimitUsd = new Decimal(input.monthlyLimitUsd).toFixed(2);
    }
    if (input.features !== undefined) {
      if (input.features.length > 0 && (!s.consentAt || s.consentProvider !== s.provider)) {
        throw new AiError('AI_CONSENT_REQUIRED', 'An admin must consent before AI features run');
      }
      data.features = [...new Set(input.features)];
    }
    await this.prisma.aiSettings.updateMany({ where: { organizationId }, data });
    return this.view(organizationId);
  }

  /** Records that an admin accepted sending data to the connected provider. */
  async consent(
    organizationId: string,
    userId: string,
    provider: AiProviderId,
  ): Promise<AiSettingsView> {
    const { count } = await this.prisma.aiSettings.updateMany({
      where: { organizationId, provider },
      data: { consentAt: new Date(), consentById: userId, consentProvider: provider },
    });
    if (count === 0) {
      throw new AiError('AI_CONSENT_REQUIRED', 'Consent must name the connected provider');
    }
    return this.view(organizationId);
  }

  /** Disconnects: the ciphertext is destroyed, features and consent are cleared. */
  async revoke(organizationId: string): Promise<AiSettingsView> {
    await this.prisma.aiSettings.updateMany({
      where: { organizationId },
      data: {
        provider: 'none',
        model: null,
        keyCiphertext: null,
        keyHint: null,
        keySource: null,
        priceInPerMtok: null,
        priceOutPerMtok: null,
        features: [],
        consentAt: null,
        consentById: null,
        consentProvider: null,
        verifiedAt: null,
      },
    });
    this.logger.log(`AI disconnected: org=${organizationId}`);
    return this.view(organizationId);
  }

  async usage(organizationId: string) {
    const since = startOfUtcMonth();
    const [byFeature, recent] = await Promise.all([
      this.prisma.aiUsage.groupBy({
        by: ['feature'],
        where: { organizationId, createdAt: { gte: since } },
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
        _count: { _all: true },
      }),
      this.prisma.aiUsage.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          feature: true,
          provider: true,
          model: true,
          status: true,
          success: true,
          errorCode: true,
          inputTokens: true,
          outputTokens: true,
          costUsd: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      since: since.toISOString(),
      byFeature: byFeature.map((f) => ({
        feature: f.feature,
        calls: f._count._all,
        inputTokens: f._sum.inputTokens ?? 0,
        outputTokens: f._sum.outputTokens ?? 0,
        costUsd: new Decimal(f._sum.costUsd?.toString() ?? '0').toFixed(4),
      })),
      recent: recent.map((r) => ({ ...r, costUsd: new Decimal(r.costUsd.toString()).toFixed(6) })),
    };
  }
}
