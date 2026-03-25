/**
 * Priority levels for Ollama inference requests.
 * Lower number = higher priority.
 */
export enum OllamaInferencePriority {
  /** User is actively waiting (document intake, chatbot) */
  CRITICAL = 0,
  /** User-initiated but can tolerate slight delay (narratives, categorization) */
  NORMAL = 1,
  /** Background/cron jobs */
  LOW = 2,
}

/**
 * Options for a single Ollama inference call.
 */
export interface OllamaInferenceOptions {
  /** Override the default text/vision model for this call */
  model?: string;
  /** Sampling temperature (default 0.1) */
  temperature?: number;
  /** Maximum tokens to generate (default 8192) */
  maxTokens?: number;
  /** Override context window size (default from OLLAMA_NUM_CTX env) */
  numCtx?: number;
  /** Override default timeout in milliseconds */
  timeoutMs?: number;
  /** Optional system message prepended to the conversation */
  systemPrompt?: string;
  /** Request priority — higher priority requests are served first (default NORMAL) */
  priority?: OllamaInferencePriority;
  /** If true, do not enforce JSON format (used for free-text streaming) */
  rawText?: boolean;
}

/**
 * Result wrapper returned by OllamaInferenceGateway.
 */
export interface OllamaInferenceResult<T> {
  data: T;
  processingTimeMs: number;
  model: string;
}

/**
 * A single chunk emitted during streaming inference.
 */
export interface OllamaStreamChunk {
  /** The token fragment */
  token: string;
  /** Whether this is the final chunk */
  done: boolean;
  /** Accumulated full content so far (only on final chunk) */
  fullContent?: string;
}
