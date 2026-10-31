import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ZodType, ZodTypeDef } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiPart, AiProviderError } from '../providers/ai-provider';
import { AiError, AiFeatureKey } from './ai-features';
import { costUsd, estimateInputTokens } from './ai-pricing';
import { AiConnection, AiSettingsService, startOfUtcMonth } from './ai-settings.service';

const CALL_TIMEOUT_MS = 60_000;
const OLLAMA_TIMEOUT_MS = 180_000;
const RETRY_DELAY_MS = 1_000;

export interface AiRunInput<T> {
  organizationId: string;
  userId?: string | null;
  feature: AiFeatureKey | 'test';
  system: string;
  /** Builds the user parts for what this provider accepts; null = this input cannot be sent. */
  parts: (accepts: { images: boolean; pdf: boolean }) => AiPart[] | null;
  maxOutputTokens: number;
  /** Validates the answer locally; its input is whatever JSON the model returned. */
  schema: ZodType<T, ZodTypeDef, unknown>;
}

export interface AiRunResult<T> {
  data: T;
  provider: string;
  model: string;
}

/** The first top-level JSON object in a model answer (models sometimes wrap it in prose). */
export function firstJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1)) as unknown;
  } catch {
    return undefined;
  }
}

function toAiError(error: AiProviderError): AiError {
  switch (error.kind) {
    case 'invalid_key':
    case 'forbidden':
      return new AiError('AI_KEY_INVALID', 'The provider refused the key');
    case 'no_credit':
      return new AiError('AI_KEY_NO_CREDIT', 'The provider account has no credit');
    case 'rate_limited':
      return new AiError('AI_RATE_LIMITED', 'The provider is rate limiting this key');
    case 'model_unavailable':
      return new AiError('AI_MODEL_UNAVAILABLE', 'The model is not available');
    case 'timeout':
      return new AiError('AI_TIMEOUT', 'The provider did not answer in time');
    default:
      return new AiError('AI_PROVIDER_ERROR', 'The provider call failed');
  }
}

/**
 * Every AI call goes through here: the feature must be active for the organization, the
 * estimated cost is reserved under the monthly limit before the call, the answer is validated
 * locally, and the usage row is settled with the real tokens afterwards. Logs carry metadata
 * only: never prompts, answers, document values or keys.
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSettingsService,
  ) {}

  async run<T>(input: AiRunInput<T>): Promise<AiRunResult<T>> {
    const connection = await this.settings.connection(input.organizationId, input.feature);
    const parts = input.parts({
      images: connection.adapter.acceptsImages,
      pdf: connection.adapter.acceptsPdf,
    });
    if (!parts || parts.length === 0) {
      throw new AiError('AI_INPUT_UNSUPPORTED', 'The connected provider cannot read this input');
    }
    const estimatedInput = estimateInputTokens(input.system, parts);
    const estimate = costUsd(
      connection.provider,
      connection.model,
      connection.price,
      estimatedInput,
      input.maxOutputTokens,
    );
    const usageId = await this.reserve(input, connection, estimate);
    const started = Date.now();
    const timeoutMs = connection.provider === 'ollama' ? OLLAMA_TIMEOUT_MS : CALL_TIMEOUT_MS;

    let completion;
    try {
      completion = await this.callWithOneRetry(connection, input, parts, timeoutMs);
    } catch (error) {
      const failure = error instanceof AiProviderError ? error : new AiProviderError('network');
      // An error answer is not billed; a timeout or a dropped connection may have been.
      const billable = failure.kind === 'timeout' || failure.kind === 'network';
      await this.settle(usageId, {
        status: billable ? 'SETTLED' : 'RELEASED',
        success: false,
        errorCode: failure.kind,
        cost: billable ? estimate : new Decimal(0),
      });
      this.logLine(input, connection, started, `failed:${failure.kind}`);
      throw toAiError(failure);
    }

    const inputTokens = completion.inputTokens ?? estimatedInput;
    const outputTokens = completion.outputTokens ?? input.maxOutputTokens;
    const cost =
      completion.reportedCostUsd !== null
        ? new Decimal(completion.reportedCostUsd).toDecimalPlaces(6, Decimal.ROUND_UP)
        : costUsd(
            connection.provider,
            connection.model,
            connection.price,
            inputTokens,
            outputTokens,
          );
    const parsed = input.schema.safeParse(firstJsonObject(completion.text));
    await this.settle(usageId, {
      status: 'SETTLED',
      success: parsed.success,
      errorCode: parsed.success ? null : 'invalid_output',
      cost,
      inputTokens,
      outputTokens,
    });
    this.logLine(input, connection, started, parsed.success ? 'ok' : 'invalid_output', {
      inputTokens,
      outputTokens,
    });
    if (!parsed.success) {
      throw new AiError('AI_INVALID_OUTPUT', 'The AI answer did not match the expected shape');
    }
    return { data: parsed.data, provider: connection.provider, model: connection.model };
  }

  /**
   * Locks the organization's settings row, so concurrent calls see each other's reservations,
   * and refuses a call whose estimate would cross the monthly limit.
   */
  private async reserve<T>(
    input: AiRunInput<T>,
    connection: AiConnection,
    estimate: Decimal,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ai_settings" WHERE "organizationId" = ${input.organizationId} FOR UPDATE`;
      const sum = await tx.aiUsage.aggregate({
        where: { organizationId: input.organizationId, createdAt: { gte: startOfUtcMonth() } },
        _sum: { costUsd: true },
      });
      const spent = new Decimal(sum._sum.costUsd?.toString() ?? '0');
      if (spent.plus(estimate).gt(connection.monthlyLimitUsd)) {
        throw new AiError('AI_LIMIT_REACHED', 'This call would cross the monthly AI limit');
      }
      const row = await tx.aiUsage.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId ?? null,
          feature: input.feature,
          provider: connection.provider,
          model: connection.model,
          status: 'RESERVED',
          estimatedCostUsd: estimate.toFixed(6),
          costUsd: estimate.toFixed(6),
        },
        select: { id: true },
      });
      return row.id;
    });
  }

  private async callWithOneRetry<T>(
    connection: AiConnection,
    input: AiRunInput<T>,
    parts: AiPart[],
    timeoutMs: number,
  ) {
    const attempt = () =>
      connection.adapter.complete(
        { apiKey: connection.apiKey },
        connection.model,
        { system: input.system, parts, maxOutputTokens: input.maxOutputTokens, json: true },
        AbortSignal.timeout(timeoutMs),
      );
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof AiProviderError) || !error.transient) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return attempt();
    }
  }

  private async settle(
    id: string,
    outcome: {
      status: 'SETTLED' | 'RELEASED';
      success: boolean;
      errorCode: string | null;
      cost: Decimal;
      inputTokens?: number;
      outputTokens?: number;
    },
  ): Promise<void> {
    await this.prisma.aiUsage.updateMany({
      where: { id, status: 'RESERVED' },
      data: {
        status: outcome.status,
        success: outcome.success,
        errorCode: outcome.errorCode,
        costUsd: outcome.cost.toFixed(6),
        inputTokens: outcome.inputTokens ?? null,
        outputTokens: outcome.outputTokens ?? null,
        settledAt: new Date(),
      },
    });
  }

  private logLine<T>(
    input: AiRunInput<T>,
    connection: AiConnection,
    started: number,
    outcome: string,
    tokens?: { inputTokens: number; outputTokens: number },
  ): void {
    this.logger.log(
      `AI call org=${input.organizationId} feature=${input.feature} provider=${connection.provider} ` +
        `model=${connection.model} outcome=${outcome} ms=${Date.now() - started}` +
        (tokens ? ` in=${tokens.inputTokens} out=${tokens.outputTokens}` : ''),
    );
  }
}
