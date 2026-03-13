import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { OllamaInferenceOptions, OllamaInferenceResult } from '../types/ollama-inference.types';

/**
 * Generic Ollama inference gateway.
 *
 * Provides text and vision inference that any AI service can consume.
 * Handles health caching, model availability, JSON parsing, and
 * concurrency limiting so callers only deal with typed results.
 */
@Injectable()
export class OllamaInferenceGateway {
  private readonly logger = new Logger(OllamaInferenceGateway.name);

  private readonly baseUrl: string;
  private readonly defaultTextModel: string;
  private readonly defaultVisionModel: string;
  private readonly defaultTimeoutMs: number;
  private readonly enabled: boolean;
  private readonly maxConcurrent: number;

  // Health cache (30s TTL)
  private lastHealthCheck: { available: boolean; timestamp: number } | null = null;
  private readonly HEALTH_CACHE_TTL = 30_000;

  // Model availability cache (60s TTL per model)
  private modelAvailability = new Map<string, { available: boolean; timestamp: number }>();
  private readonly MODEL_CACHE_TTL = 60_000;

  // Concurrency semaphore
  private activeCalls = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get('OLLAMA_BASE_URL', 'http://localhost:11434');
    this.defaultTextModel = this.configService.get('OLLAMA_TEXT_MODEL', 'qwen2.5:7b');
    this.defaultVisionModel = this.configService.get('OLLAMA_VISION_MODEL', 'minicpm-v:8b');
    this.defaultTimeoutMs = parseInt(this.configService.get('OLLAMA_TIMEOUT_MS', '120000'), 10);
    this.enabled = this.configService.get('OLLAMA_ENABLED', 'true') !== 'false';
    this.maxConcurrent = parseInt(this.configService.get('OLLAMA_MAX_CONCURRENT', '3'), 10);
  }

  // ---------------------------------------------------------------------------
  // Public inference methods
  // ---------------------------------------------------------------------------

  /**
   * Run a text-model inference and parse the result as JSON type T.
   * Returns null when Ollama is unavailable or the response is unparseable.
   */
  async infer<T = Record<string, unknown>>(
    prompt: string,
    options?: OllamaInferenceOptions,
  ): Promise<OllamaInferenceResult<T> | null> {
    const model = options?.model ?? this.defaultTextModel;
    if (!(await this.isAvailable(model))) return null;

    return this.doInfer<T>(prompt, [], model, options);
  }

  /**
   * Run a vision-model inference with one or more base64 images.
   * Returns null when Ollama is unavailable or the response is unparseable.
   */
  async inferWithImages<T = Record<string, unknown>>(
    prompt: string,
    images: string[],
    options?: OllamaInferenceOptions,
  ): Promise<OllamaInferenceResult<T> | null> {
    const model = options?.model ?? this.defaultVisionModel;
    if (!(await this.isAvailable(model))) return null;

    return this.doInfer<T>(prompt, images, model, options);
  }

  // ---------------------------------------------------------------------------
  // Health & availability
  // ---------------------------------------------------------------------------

  /** Check if Ollama server is reachable (30s cache). */
  async isHealthy(): Promise<boolean> {
    if (!this.enabled) {
      this.logger.debug('isHealthy: OLLAMA_ENABLED=false');
      return false;
    }

    if (
      this.lastHealthCheck &&
      Date.now() - this.lastHealthCheck.timestamp < this.HEALTH_CACHE_TTL
    ) {
      this.logger.debug(
        `isHealthy: cached=${this.lastHealthCheck.available}, age=${Date.now() - this.lastHealthCheck.timestamp}ms`,
      );
      return this.lastHealthCheck.available;
    }

    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/api/tags`, { timeout: 5000 }),
      );
      const available = response.status === 200 && Array.isArray(response.data?.models);
      this.lastHealthCheck = { available, timestamp: Date.now() };
      this.logger.debug(
        `isHealthy: fresh check=${available}, models=${response.data?.models?.length ?? 0}`,
      );
      return available;
    } catch (error) {
      this.lastHealthCheck = { available: false, timestamp: Date.now() };
      this.logger.debug(
        `isHealthy: fresh check FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /** Check if a specific model is pulled and available (60s cache). */
  async isModelAvailable(modelName: string): Promise<boolean> {
    if (!this.enabled) return false;

    const cached = this.modelAvailability.get(modelName);
    if (cached && Date.now() - cached.timestamp < this.MODEL_CACHE_TTL) {
      this.logger.debug(
        `isModelAvailable(${modelName}): cached=${cached.available}, age=${Date.now() - cached.timestamp}ms`,
      );
      return cached.available;
    }

    try {
      const response = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/api/tags`, { timeout: 5000 }),
      );
      const models = (response.data?.models as Array<{ name: string }>) || [];
      const available = models.some(
        (m) => m.name === modelName || m.name.startsWith(`${modelName}:`),
      );
      this.modelAvailability.set(modelName, {
        available,
        timestamp: Date.now(),
      });
      this.logger.debug(
        `isModelAvailable(${modelName}): fresh=${available}, pulled=[${models.map((m) => m.name).join(', ')}]`,
      );
      return available;
    } catch (error) {
      this.modelAvailability.set(modelName, {
        available: false,
        timestamp: Date.now(),
      });
      this.logger.debug(
        `isModelAvailable(${modelName}): FAILED: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /** Health + model availability combined check. */
  async isAvailable(model?: string): Promise<boolean> {
    const resolvedModel = model ?? this.defaultTextModel;
    const healthy = await this.isHealthy();
    if (!healthy) {
      this.logger.debug(`isAvailable(${resolvedModel}): BLOCKED by health check`);
      return false;
    }
    const modelOk = await this.isModelAvailable(resolvedModel);
    if (!modelOk) {
      this.logger.debug(`isAvailable(${resolvedModel}): BLOCKED by model check`);
    }
    return modelOk;
  }

  /** Expose the default text model name. */
  get textModel(): string {
    return this.defaultTextModel;
  }

  /** Expose the default vision model name. */
  get visionModel(): string {
    return this.defaultVisionModel;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async doInfer<T>(
    prompt: string,
    images: string[],
    model: string,
    options?: OllamaInferenceOptions,
  ): Promise<OllamaInferenceResult<T> | null> {
    await this.acquireSemaphore();

    try {
      const startTime = Date.now();
      const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

      const messages: Array<Record<string, unknown>> = [];

      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }

      const userMessage: Record<string, unknown> = {
        role: 'user',
        content: prompt,
      };
      if (images.length > 0) {
        userMessage.images = images;
      }
      messages.push(userMessage);

      const response = await lastValueFrom(
        this.httpService.post(
          `${this.baseUrl}/api/chat`,
          {
            model,
            messages,
            stream: false,
            options: {
              temperature: options?.temperature ?? 0.1,
              num_predict: options?.maxTokens ?? 4096,
            },
          },
          { timeout: timeoutMs },
        ),
      );

      const processingTimeMs = Date.now() - startTime;

      // Successful HTTP call proves Ollama is healthy — refresh cache so
      // subsequent requests within the 30s window aren't blocked by a stale
      // false cached from a prior failure (e.g., VRAM overflow from another model).
      this.lastHealthCheck = { available: true, timestamp: Date.now() };

      const rawContent: string = response.data?.message?.content ?? '';
      // Qwen3 models wrap internal reasoning in <think>...</think> — strip it
      let content = this.stripThinkTags(rawContent);

      // Qwen3 models may put reasoning in a separate `thinking` field,
      // leaving `content` empty.  Fall back to extracting JSON from thinking.
      if (!content) {
        const thinkingField: string = response.data?.message?.thinking ?? '';
        if (thinkingField) {
          const salvaged = this.stripThinkTags(thinkingField);
          const salvagedJson = salvaged ? this.parseJsonResponse(salvaged) : null;
          if (salvagedJson) {
            this.logger.warn(
              `Ollama content was empty — salvaged JSON from thinking field (model=${model})`,
            );
            content = salvaged;
          }
        }
      }

      if (!content) {
        const thinkLen = (response.data?.message?.thinking ?? '').length;
        const doneReason = response.data?.done_reason ?? 'unknown';
        this.logger.warn(
          `Ollama returned empty content (model=${model}, rawLen=${rawContent.length}, ` +
            `thinkingLen=${thinkLen}, done_reason=${doneReason}, time=${processingTimeMs}ms)`,
        );
        return null;
      }

      const parsed = this.parseJsonResponse(content);
      if (!parsed) {
        this.logger.warn(
          `Ollama returned unparseable JSON (model=${model}, content=${content.slice(0, 200)})`,
        );
        return null;
      }

      return {
        data: parsed as T,
        processingTimeMs,
        model,
      };
    } catch (error) {
      // If the inference call itself fails, Ollama might be crashing/restarting.
      // Invalidate health cache so the next check does a fresh probe.
      this.lastHealthCheck = null;
      this.logger.warn(
        `Ollama inference failed (model=${model}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      this.releaseSemaphore();
    }
  }

  /**
   * Strip Qwen3-style <think>...</think> reasoning blocks from model output.
   * The think block can appear at the start or be the entire output (when the
   * model exhausts tokens during reasoning).  We keep everything after it.
   */
  private stripThinkTags(content: string): string {
    if (!content.includes('<think>')) return content;
    // Remove all <think>...</think> blocks (possibly multiple, possibly unclosed)
    const stripped = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    // If the model only output an unclosed <think> tag (token budget exhausted during thinking),
    // there's nothing useful left.  Try salvaging anything after the last </think> or <think>.
    if (!stripped && content.includes('<think>')) {
      const afterLastClose = content.split('</think>').pop()?.trim() ?? '';
      if (afterLastClose) return afterLastClose;
      // Unclosed think — nothing after <think>
      const afterOpen = content.split('<think>').pop()?.trim() ?? '';
      // The text inside the think block might contain the JSON if the model forgot to close
      return afterOpen;
    }
    return stripped;
  }

  /**
   * Parse JSON from LLM output with 3 fallback strategies:
   * 1. Direct JSON.parse
   * 2. Extract from markdown code fence
   * 3. Find first { ... } pair
   */
  private parseJsonResponse(content: string): Record<string, unknown> | null {
    // Strategy 1: direct parse
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      // continue
    }

    // Strategy 2: markdown code fence
    const fenceMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1]) as Record<string, unknown>;
      } catch {
        // continue
      }
    }

    // Strategy 3: first { ... } pair
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(content.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
      } catch {
        // give up
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Semaphore for concurrency limiting
  // ---------------------------------------------------------------------------

  private acquireSemaphore(): Promise<void> {
    if (this.activeCalls < this.maxConcurrent) {
      this.activeCalls++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  private releaseSemaphore(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next();
    } else {
      this.activeCalls--;
    }
  }
}
