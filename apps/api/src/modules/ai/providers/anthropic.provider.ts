import {
  AiCompletion,
  AiCredential,
  AiModelInfo,
  AiProviderAdapter,
  AiRequest,
  FetchLike,
} from './ai-provider';
import { asArray, asCount, asRecord, asString, requestJson } from './provider-http';

const BASE = 'https://api.anthropic.com/v1';

/** Claude through the Messages API with the organization's own key. */
export class AnthropicProvider implements AiProviderAdapter {
  readonly id = 'anthropic' as const;
  readonly acceptsImages = true;
  readonly acceptsPdf = true;

  constructor(private readonly fetchFn: FetchLike) {}

  private headers(credential: AiCredential): Record<string, string> {
    return { 'x-api-key': credential.apiKey ?? '', 'anthropic-version': '2023-06-01' };
  }

  async listModels(credential: AiCredential, signal: AbortSignal): Promise<AiModelInfo[]> {
    const body = await requestJson(
      this.fetchFn,
      `${BASE}/models?limit=1000`,
      { method: 'GET', headers: this.headers(credential) },
      signal,
    );
    return asArray(asRecord(body).data)
      .map((m) => ({ id: asString(m.id) ?? '', name: asString(m.display_name) ?? '' }))
      .filter((m) => m.id.startsWith('claude'))
      .map((m) => ({ id: m.id, name: m.name || m.id, vision: true }));
  }

  async complete(
    credential: AiCredential,
    model: string,
    request: AiRequest,
    signal: AbortSignal,
  ): Promise<AiCompletion> {
    const content = request.parts.map((part) => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      if (part.type === 'image') {
        return {
          type: 'image',
          source: { type: 'base64', media_type: part.mimeType, data: part.data.toString('base64') },
        };
      }
      return {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: part.data.toString('base64'),
        },
      };
    });
    const body = asRecord(
      await requestJson(
        this.fetchFn,
        `${BASE}/messages`,
        {
          method: 'POST',
          headers: this.headers(credential),
          body: {
            model,
            max_tokens: request.maxOutputTokens,
            system: request.system,
            messages: [{ role: 'user', content }],
          },
        },
        signal,
      ),
    );
    const usage = asRecord(body.usage);
    return {
      text: asArray(body.content)
        .filter((c) => c.type === 'text')
        .map((c) => asString(c.text) ?? '')
        .join(''),
      inputTokens: asCount(usage.input_tokens),
      outputTokens: asCount(usage.output_tokens),
      reportedCostUsd: null,
    };
  }
}
