/**
 * The provider port: what Mizano needs from any AI provider an organization connects with its
 * own account. Adapters live next to this file; none of them takes a URL from a caller.
 */
export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter', 'ollama'] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDERS as readonly string[]).includes(value);
}

/** One piece of the user message. Images and PDFs are sent only to adapters that accept them. */
export type AiPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: Buffer }
  | { type: 'pdf'; data: Buffer };

export interface AiRequest {
  system: string;
  parts: AiPart[];
  maxOutputTokens: number;
  /** Ask for exactly one JSON object (provider JSON mode where it exists). */
  json: boolean;
}

export interface AiCompletion {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /** USD the provider reported for this call (OpenRouter), as a decimal string. */
  reportedCostUsd: string | null;
}

export interface AiModelInfo {
  id: string;
  name: string;
  /** USD per 1M tokens [input, output] when the provider publishes prices (OpenRouter). */
  pricePerMtok?: [string, string];
}

/** The organization's secret for the provider; Ollama needs none. */
export interface AiCredential {
  apiKey: string | null;
}

export interface AiProviderAdapter {
  readonly id: AiProviderId;
  readonly acceptsImages: boolean;
  readonly acceptsPdf: boolean;
  /** Lists the models this credential can use: the free way to prove a key works. */
  listModels(credential: AiCredential, signal: AbortSignal): Promise<AiModelInfo[]>;
  complete(
    credential: AiCredential,
    model: string,
    request: AiRequest,
    signal: AbortSignal,
  ): Promise<AiCompletion>;
}

/** `fetch` as the adapters use it; tests inject a fake one. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
export const AI_FETCH = Symbol('AI_FETCH');

export type AiFailureKind =
  | 'invalid_key'
  | 'no_credit'
  | 'rate_limited'
  | 'forbidden'
  | 'model_unavailable'
  | 'provider_down'
  | 'network'
  | 'timeout'
  | 'bad_response';

/** A provider call failed. Carries a kind and a status, never the provider's text. */
export class AiProviderError extends Error {
  constructor(
    readonly kind: AiFailureKind,
    readonly status?: number,
  ) {
    super(`AI provider failure: ${kind}${status ? ` (${status})` : ''}`);
    this.name = 'AiProviderError';
  }

  /**
   * The outcome is unknown, so the provider may have charged: the request may have been sent
   * (network failure, timeout, a body that could not be read), a success answer was unusable, or a
   * server/gateway error (500, 502, 504…) that doesn't say whether generation ran. Only a 4xx
   * answer, a redirect, a refusal before sending, or a definite "not now" refusal costs nothing.
   */
  get possiblyBilled(): boolean {
    if (this.kind === 'network' || this.kind === 'timeout') return true;
    if (this.kind === 'provider_down') return !this.definiteRefusal;
    return (
      this.kind === 'bad_response' &&
      this.status !== undefined &&
      this.status >= 200 &&
      this.status < 300
    );
  }

  /**
   * Worth one more attempt only when the provider clearly refused before doing any work: 429 (rate
   * limited), 503 (unavailable) or Anthropic's 529 (overloaded). Ambiguous 5xx are never retried.
   */
  get retryable(): boolean {
    return this.status !== undefined && (this.kind === 'rate_limited' || this.definiteRefusal);
  }

  private get definiteRefusal(): boolean {
    return this.kind === 'provider_down' && (this.status === 503 || this.status === 529);
  }
}
