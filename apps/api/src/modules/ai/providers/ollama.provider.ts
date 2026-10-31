import { AiCompletion, AiModelInfo, AiProviderAdapter, AiRequest, FetchLike } from './ai-provider';
import { asArray, asCount, asRecord, asString, requestJson } from './provider-http';

/**
 * The self-hosted Ollama base URL the server operator set (`AI_OLLAMA_BASE_URL`), or null when
 * it is unset or invalid. Organizations never supply this URL: they can only choose Ollama when
 * the operator configured it, so it is not an SSRF vector for tenants.
 */
export function ollamaBaseUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return url.toString().replace(/\/+$/, '');
}

/** A self-hosted Ollama server (Pi or LAN). No key, no PDFs; images need a vision model. */
export class OllamaProvider implements AiProviderAdapter {
  readonly id = 'ollama' as const;
  readonly acceptsImages = true;
  readonly acceptsPdf = false;

  constructor(
    private readonly fetchFn: FetchLike,
    private readonly baseUrl: string,
  ) {}

  async listModels(_credential: unknown, signal: AbortSignal): Promise<AiModelInfo[]> {
    const body = await requestJson(
      this.fetchFn,
      `${this.baseUrl}/api/tags`,
      { method: 'GET', headers: {} },
      signal,
    );
    return asArray(asRecord(body).models)
      .map((m) => asString(m.name) ?? '')
      .filter(Boolean)
      .map((id) => ({ id, name: id }));
  }

  async complete(
    _credential: unknown,
    model: string,
    request: AiRequest,
    signal: AbortSignal,
  ): Promise<AiCompletion> {
    const text = request.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])).join('\n\n');
    const images = request.parts.flatMap((p) =>
      p.type === 'image' ? [p.data.toString('base64')] : [],
    );
    const body = asRecord(
      await requestJson(
        this.fetchFn,
        `${this.baseUrl}/api/chat`,
        {
          method: 'POST',
          headers: {},
          body: {
            model,
            stream: false,
            ...(request.json ? { format: 'json' } : {}),
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: text, ...(images.length ? { images } : {}) },
            ],
            options: { num_predict: request.maxOutputTokens },
          },
        },
        signal,
      ),
    );
    return {
      text: asString(asRecord(body.message).content) ?? '',
      inputTokens: asCount(body.prompt_eval_count),
      outputTokens: asCount(body.eval_count),
      reportedCostUsd: '0',
    };
  }
}
