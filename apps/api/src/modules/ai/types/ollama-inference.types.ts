/**
 * Options for a single Ollama inference call.
 */
export interface OllamaInferenceOptions {
  /** Override the default text/vision model for this call */
  model?: string;
  /** Sampling temperature (default 0.1) */
  temperature?: number;
  /** Maximum tokens to generate (default 4096) */
  maxTokens?: number;
  /** Override default timeout in milliseconds */
  timeoutMs?: number;
  /** Optional system message prepended to the conversation */
  systemPrompt?: string;
}

/**
 * Result wrapper returned by OllamaInferenceGateway.
 */
export interface OllamaInferenceResult<T> {
  data: T;
  processingTimeMs: number;
  model: string;
}
