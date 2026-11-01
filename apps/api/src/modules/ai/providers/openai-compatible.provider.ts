import { BRAND } from '@mizano/shared-types';
import Decimal from 'decimal.js';
import {
  AiCompletion,
  AiCredential,
  AiModelInfo,
  AiPart,
  AiProviderAdapter,
  AiRequest,
  FetchLike,
} from './ai-provider';
import { asArray, asCount, asRecord, asString, requestJson } from './provider-http';

const OPENAI_BASE = 'https://api.openai.com/v1';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/** Chat models only: no audio, image, embedding, realtime or dated snapshots. */
const OPENAI_EXCLUDE =
  /(audio|realtime|transcribe|tts|image|search|embedding|whisper|dall-e|davinci|babbage|moderation|instruct|codex|-pro\b|deep-research|computer-use|oss)/;
const DATED = /-\d{4}-\d{2}-\d{2}$|-\d{4}$/;

function userContent(parts: AiPart[]): unknown[] {
  return parts.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    if (part.type === 'image') {
      return {
        type: 'image_url',
        image_url: { url: `data:${part.mimeType};base64,${part.data.toString('base64')}` },
      };
    }
    return {
      type: 'file',
      file: {
        filename: 'document.pdf',
        file_data: `data:application/pdf;base64,${part.data.toString('base64')}`,
      },
    };
  });
}

/** USD per token as a string ("0.0000008") → USD per 1M tokens, or undefined when unknown. */
function perMillion(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw || !/^\d+(\.\d+)?(e-?\d+)?$/i.test(raw)) return undefined;
  return new Decimal(raw).times(1_000_000).toDecimalPlaces(6).toFixed();
}

/**
 * OpenAI Chat Completions, and OpenRouter, which speaks the same protocol. Both hosts are fixed;
 * OpenRouter additionally reports the cost of each call and publishes prices per model.
 */
export class OpenAiCompatibleProvider implements AiProviderAdapter {
  readonly acceptsImages = true;
  readonly acceptsPdf = true;

  constructor(
    readonly id: 'openai' | 'openrouter',
    private readonly fetchFn: FetchLike,
  ) {}

  private get base(): string {
    return this.id === 'openai' ? OPENAI_BASE : OPENROUTER_BASE;
  }

  private headers(credential: AiCredential): Record<string, string> {
    const headers: Record<string, string> = { authorization: `Bearer ${credential.apiKey ?? ''}` };
    if (this.id === 'openrouter') headers['x-title'] = BRAND.name.en;
    return headers;
  }

  async listModels(credential: AiCredential, signal: AbortSignal): Promise<AiModelInfo[]> {
    if (this.id === 'openai') {
      const body = await requestJson(
        this.fetchFn,
        `${OPENAI_BASE}/models`,
        { method: 'GET', headers: this.headers(credential) },
        signal,
      );
      return asArray(asRecord(body).data)
        .map((m) => asString(m.id) ?? '')
        .filter(
          (id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !OPENAI_EXCLUDE.test(id) && !DATED.test(id),
        )
        .map((id) => ({ id, name: id }));
    }
    // OpenRouter's model list is public, so prove the key first.
    await requestJson(
      this.fetchFn,
      `${OPENROUTER_BASE}/key`,
      { method: 'GET', headers: this.headers(credential) },
      signal,
    );
    const body = await requestJson(
      this.fetchFn,
      `${OPENROUTER_BASE}/models`,
      { method: 'GET', headers: {} },
      signal,
    );
    return asArray(asRecord(body).data).flatMap((m) => {
      const id = asString(m.id);
      if (!id) return [];
      const pricing = asRecord(m.pricing);
      const input = perMillion(pricing.prompt);
      const output = perMillion(pricing.completion);
      return [
        {
          id,
          name: asString(m.name) ?? id,
          ...(input !== undefined && output !== undefined
            ? { pricePerMtok: [input, output] as [string, string] }
            : {}),
        },
      ];
    });
  }

  async complete(
    credential: AiCredential,
    model: string,
    request: AiRequest,
    signal: AbortSignal,
  ): Promise<AiCompletion> {
    const body = asRecord(
      await requestJson(
        this.fetchFn,
        `${this.base}/chat/completions`,
        {
          method: 'POST',
          headers: this.headers(credential),
          body: {
            model,
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: userContent(request.parts) },
            ],
            ...(this.id === 'openai'
              ? { max_completion_tokens: request.maxOutputTokens }
              : { max_tokens: request.maxOutputTokens, usage: { include: true } }),
            ...(request.json ? { response_format: { type: 'json_object' } } : {}),
          },
        },
        signal,
      ),
    );
    const usage = asRecord(body.usage);
    const cost = usage.cost;
    return {
      text: asString(asRecord(asArray(body.choices)[0]?.message).content) ?? '',
      inputTokens: asCount(usage.prompt_tokens),
      outputTokens: asCount(usage.completion_tokens),
      reportedCostUsd:
        typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? String(cost) : null,
    };
  }
}
